import { access, readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import { SaveCompatError, errorMessage } from "./errors.js";
import { parsePointer } from "./json-pointer.js";
import type {
  Diagnostic,
  DoctorResult,
  JsonValue,
  LoadedConfig,
  LoadedMigration,
  MigrationDocument,
  MigrationOperation,
  MigrationReference,
  PreserveRule,
  SaveCompatConfig,
} from "./types.js";

const defaultConfigName = "savecompat.config.json";

export async function loadConfig(
  requestedPath: string | undefined,
  cwd = process.cwd(),
): Promise<LoadedConfig> {
  const configPath = path.resolve(cwd, requestedPath ?? defaultConfigName);
  const raw = await readJsonFile(configPath);
  if (!isRecord(raw)) {
    throw new SaveCompatError("INVALID_CONFIG", "Config root must be a JSON object.", configPath);
  }

  const parsed = parseConfig(raw, configPath);
  const baseDir = path.dirname(configPath);
  const schemas = Object.fromEntries(
    Object.entries(parsed.schemas).map(([version, file]) => [version, path.resolve(baseDir, file)]),
  );
  const migrations = parsed.migrations.map((migration) => ({
    ...migration,
    file: path.resolve(baseDir, migration.file),
  }));

  return {
    ...parsed,
    configPath,
    baseDir,
    versionPath: parsed.versionPath ?? "/saveVersion",
    schemas,
    migrations,
    preserve: parsed.preserve ?? [],
    arrayKeys: parsed.arrayKeys ?? {},
    validateSource: parsed.validateSource ?? true,
  };
}

export async function loadMigrations(config: LoadedConfig): Promise<LoadedMigration[]> {
  return Promise.all(
    config.migrations.map(async (reference) => {
      const raw = await readJsonFile(reference.file);
      const document = parseMigrationDocument(raw, reference);
      return {
        ...reference,
        document,
      };
    }),
  );
}

export async function discoverFixtures(
  config: LoadedConfig,
  patterns = config.fixtures,
): Promise<string[]> {
  const absolutePatterns = patterns.map((pattern) =>
    path.isAbsolute(pattern) ? pattern : path.resolve(config.baseDir, pattern),
  );
  const matches = await fg(absolutePatterns, {
    absolute: true,
    onlyFiles: true,
    unique: true,
    dot: false,
    followSymbolicLinks: false,
  });
  return matches.sort((left, right) => left.localeCompare(right));
}

export async function doctorConfig(config: LoadedConfig): Promise<DoctorResult> {
  const diagnostics: Diagnostic[] = [];
  let migrations: LoadedMigration[] = [];
  let fixtures: string[] = [];

  validatePointers(config, diagnostics);

  for (const [version, schemaPath] of Object.entries(config.schemas)) {
    try {
      const schema = await readJsonFile(schemaPath);
      if (!isRecord(schema)) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_SCHEMA",
          message: `Schema for version ${version} must be a JSON object.`,
          file: schemaPath,
        });
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "SCHEMA_READ_FAILED",
        message: errorMessage(error),
        file: schemaPath,
      });
    }
  }

  if (!(config.latestVersion in config.schemas)) {
    diagnostics.push({
      severity: "error",
      code: "LATEST_SCHEMA_MISSING",
      message: `No schema is configured for latestVersion ${config.latestVersion}.`,
    });
  }

  try {
    migrations = await loadMigrations(config);
    validateMigrationGraph(config, migrations, diagnostics);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "MIGRATION_READ_FAILED",
      message: errorMessage(error),
    });
  }

  try {
    fixtures = await discoverFixtures(config);
    if (fixtures.length === 0) {
      diagnostics.push({
        severity: "error",
        code: "NO_FIXTURES",
        message: `Fixture patterns matched no files: ${config.fixtures.join(", ")}`,
      });
    }
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "FIXTURE_DISCOVERY_FAILED",
      message: errorMessage(error),
    });
  }

  return {
    passed: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
    fixtureCount: fixtures.length,
    schemaVersions: Object.keys(config.schemas).sort(compareVersions),
    migrationCount: migrations.length,
  };
}

export async function readJsonFile(filePath: string): Promise<JsonValue> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new SaveCompatError("FILE_READ_FAILED", `${filePath}: ${errorMessage(error)}`, filePath);
  }

  try {
    return JSON.parse(source) as JsonValue;
  } catch (error) {
    throw new SaveCompatError("INVALID_JSON", `${filePath}: ${errorMessage(error)}`, filePath);
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseConfig(raw: Record<string, unknown>, configPath: string): SaveCompatConfig {
  const latestVersion = requireString(raw, "latestVersion", configPath);
  const fixtures = requireStringArray(raw, "fixtures", configPath);
  const schemas = requireStringMap(raw, "schemas", configPath);
  const migrations = parseMigrationReferences(raw.migrations, configPath);
  const versionPath = optionalString(raw, "versionPath", configPath);
  const preserve = parsePreserveRules(raw.preserve, configPath);
  const arrayKeys = optionalStringMap(raw, "arrayKeys", configPath);
  const validateSource = optionalBoolean(raw, "validateSource", configPath);

  return {
    latestVersion,
    fixtures,
    schemas,
    migrations,
    ...(versionPath === undefined ? {} : { versionPath }),
    ...(preserve === undefined ? {} : { preserve }),
    ...(arrayKeys === undefined ? {} : { arrayKeys }),
    ...(validateSource === undefined ? {} : { validateSource }),
  };
}

function parseMigrationReferences(value: unknown, configPath: string): MigrationReference[] {
  if (!Array.isArray(value)) {
    invalidConfig(configPath, '"migrations" must be an array.');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      invalidConfig(configPath, `migrations[${index}] must be an object.`);
    }
    return {
      from: requireString(entry, "from", configPath, `migrations[${index}]`),
      to: requireString(entry, "to", configPath, `migrations[${index}]`),
      file: requireString(entry, "file", configPath, `migrations[${index}]`),
    };
  });
}

function parsePreserveRules(value: unknown, configPath: string): PreserveRule[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    invalidConfig(configPath, '"preserve" must be an array.');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      invalidConfig(configPath, `preserve[${index}] must be an object.`);
    }
    const fromVersionValue = entry.fromVersion;
    let fromVersion: string | string[] | undefined;
    if (typeof fromVersionValue === "string") {
      fromVersion = fromVersionValue;
    } else if (
      Array.isArray(fromVersionValue) &&
      fromVersionValue.every((item) => typeof item === "string")
    ) {
      fromVersion = fromVersionValue;
    } else if (fromVersionValue !== undefined) {
      invalidConfig(configPath, `preserve[${index}].fromVersion must be a string or string array.`);
    }
    const required = entry.required;
    if (required !== undefined && typeof required !== "boolean") {
      invalidConfig(configPath, `preserve[${index}].required must be a boolean.`);
    }
    return {
      label: requireString(entry, "label", configPath, `preserve[${index}]`),
      from: requireString(entry, "from", configPath, `preserve[${index}]`),
      to: requireString(entry, "to", configPath, `preserve[${index}]`),
      ...(fromVersion === undefined ? {} : { fromVersion }),
      ...(required === undefined ? {} : { required }),
    };
  });
}

function parseMigrationDocument(raw: JsonValue, reference: MigrationReference): MigrationDocument {
  if (!isRecord(raw) || !Array.isArray(raw.operations)) {
    throw new SaveCompatError(
      "INVALID_MIGRATION",
      `Migration ${reference.from} -> ${reference.to} must contain an operations array.`,
      reference.file,
    );
  }
  const description = raw.description;
  if (description !== undefined && typeof description !== "string") {
    throw new SaveCompatError(
      "INVALID_MIGRATION",
      `Migration description must be a string: ${reference.file}`,
      reference.file,
    );
  }

  const operations = raw.operations.map((operation, index) => {
    if (!isRecord(operation) || typeof operation.op !== "string") {
      throw new SaveCompatError(
        "INVALID_OPERATION",
        `Operation ${index} in ${reference.file} must be an object with an op string.`,
        reference.file,
      );
    }
    return operation as unknown as MigrationOperation;
  });

  return {
    operations,
    ...(description === undefined ? {} : { description }),
  };
}

function validatePointers(config: LoadedConfig, diagnostics: Diagnostic[]): void {
  const pointers = [
    { label: "versionPath", pointer: config.versionPath },
    ...Object.entries(config.arrayKeys).map(([pointer]) => ({ label: "arrayKeys", pointer })),
    ...config.preserve.flatMap((rule) => [
      { label: `preserve "${rule.label}" source`, pointer: rule.from },
      { label: `preserve "${rule.label}" target`, pointer: rule.to },
    ]),
  ];
  for (const entry of pointers) {
    try {
      parsePointer(entry.pointer);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_POINTER",
        message: `${entry.label}: ${errorMessage(error)}`,
        path: entry.pointer,
      });
    }
  }
}

function validateMigrationGraph(
  config: LoadedConfig,
  migrations: LoadedMigration[],
  diagnostics: Diagnostic[],
): void {
  const bySource = new Map<string, LoadedMigration>();
  for (const migration of migrations) {
    if (!(migration.to in config.schemas)) {
      diagnostics.push({
        severity: "error",
        code: "MIGRATION_TARGET_SCHEMA_MISSING",
        message: `Migration ${migration.from} -> ${migration.to} has no target schema.`,
        file: migration.file,
      });
    }
    const existing = bySource.get(migration.from);
    if (existing !== undefined) {
      diagnostics.push({
        severity: "error",
        code: "AMBIGUOUS_MIGRATION",
        message: `Version ${migration.from} has multiple outgoing migrations.`,
        file: migration.file,
      });
    } else {
      bySource.set(migration.from, migration);
    }
    validateOperations(migration.document.operations, migration.file, diagnostics);
  }

  for (const version of Object.keys(config.schemas)) {
    if (version === config.latestVersion) {
      continue;
    }
    const seen = new Set<string>();
    let current = version;
    while (current !== config.latestVersion) {
      if (seen.has(current)) {
        diagnostics.push({
          severity: "error",
          code: "MIGRATION_CYCLE",
          message: `Migration cycle detected while planning from version ${version}.`,
        });
        break;
      }
      seen.add(current);
      const next = bySource.get(current);
      if (next === undefined) {
        diagnostics.push({
          severity: "error",
          code: "MIGRATION_GAP",
          message: `No migration path from version ${version}; stopped at ${current}.`,
        });
        break;
      }
      current = next.to;
    }
  }
}

function validateOperations(
  operations: MigrationOperation[],
  file: string,
  diagnostics: Diagnostic[],
  prefix = "operations",
): void {
  const known = new Set([
    "set-default",
    "set",
    "rename",
    "copy",
    "delete",
    "coerce",
    "clamp",
    "map-enum",
    "ensure-array",
    "map-items",
  ]);
  operations.forEach((operation, index) => {
    const location = `${prefix}[${index}]`;
    if (!known.has(operation.op)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_OPERATION",
        message: `${location} uses unknown operation "${operation.op}".`,
        file,
      });
      return;
    }
    if (operation.optional !== undefined && typeof operation.optional !== "boolean") {
      diagnostics.push({
        severity: "error",
        code: "INVALID_OPTIONAL_FLAG",
        message: `${location}.optional must be a boolean.`,
        file,
      });
    }
    if (!("path" in operation) || typeof operation.path !== "string") {
      diagnostics.push({
        severity: "error",
        code: "MISSING_OPERATION_PATH",
        message: `${location} must have a string path.`,
        file,
      });
      return;
    }
    try {
      parsePointer(operation.path);
      if ("from" in operation) {
        if (typeof operation.from !== "string") {
          throw new SaveCompatError(
            "INVALID_OPERATION_POINTER",
            `${location}.from must be a string.`,
          );
        }
        parsePointer(operation.from);
      }
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "INVALID_OPERATION_POINTER",
        message: `${location}: ${errorMessage(error)}`,
        file,
      });
    }

    switch (operation.op) {
      case "set-default":
      case "set":
        if (!Object.hasOwn(operation, "value")) {
          diagnostics.push({
            severity: "error",
            code: "MISSING_OPERATION_VALUE",
            message: `${location}.value is required.`,
            file,
          });
        }
        break;
      case "rename":
      case "copy":
        if (
          operation.onConflict !== undefined &&
          !["error", "keep-target", "overwrite"].includes(operation.onConflict)
        ) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_CONFLICT_POLICY",
            message: `${location}.onConflict is invalid.`,
            file,
          });
        }
        break;
      case "coerce":
        if (!["string", "number", "integer", "boolean"].includes(operation.to)) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_COERCE_TARGET",
            message: `${location}.to is invalid.`,
            file,
          });
        }
        break;
      case "clamp":
        if (
          (operation.min !== undefined &&
            (typeof operation.min !== "number" || !Number.isFinite(operation.min))) ||
          (operation.max !== undefined &&
            (typeof operation.max !== "number" || !Number.isFinite(operation.max))) ||
          (operation.min === undefined && operation.max === undefined)
        ) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_CLAMP",
            message: `${location} needs finite numeric min, max, or both.`,
            file,
          });
        } else if (
          operation.min !== undefined &&
          operation.max !== undefined &&
          operation.min > operation.max
        ) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_CLAMP_RANGE",
            message: `${location}.min cannot exceed max.`,
            file,
          });
        }
        break;
      case "map-enum":
        if (
          !isRecord(operation.values) ||
          (operation.passthrough !== undefined && typeof operation.passthrough !== "boolean")
        ) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_ENUM_MAP",
            message: `${location}.values must be an object and passthrough must be a boolean.`,
            file,
          });
        }
        break;
      case "ensure-array":
        if (operation.mode !== undefined && !["wrap", "empty"].includes(operation.mode)) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_ARRAY_MODE",
            message: `${location}.mode must be "wrap" or "empty".`,
            file,
          });
        }
        break;
      case "map-items":
        if (!Array.isArray(operation.operations)) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_MAP_ITEMS",
            message: `${location}.operations must be an array.`,
            file,
          });
        } else {
          validateOperations(operation.operations, file, diagnostics, `${location}.operations`);
        }
        break;
      case "delete":
        break;
    }
  });
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    invalidConfig(
      configPath,
      `${prefix === undefined ? "" : `${prefix}.`}${key} must be a string.`,
    );
  }
  return value;
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
): string | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    invalidConfig(configPath, `${key} must be a string.`);
  }
  return value;
}

function optionalBoolean(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
): boolean | undefined {
  const value = object[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    invalidConfig(configPath, `${key} must be a boolean.`);
  }
  return value;
}

function requireStringArray(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
): string[] {
  const value = object[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string")
  ) {
    invalidConfig(configPath, `${key} must be a non-empty string array.`);
  }
  return value;
}

function requireStringMap(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
): Record<string, string> {
  const value = object[key];
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === "string")) {
    invalidConfig(configPath, `${key} must be an object whose values are strings.`);
  }
  return value as Record<string, string>;
}

function optionalStringMap(
  object: Record<string, unknown>,
  key: string,
  configPath: string,
): Record<string, string> | undefined {
  if (object[key] === undefined) {
    return undefined;
  }
  return requireStringMap(object, key, configPath);
}

function invalidConfig(configPath: string, message: string): never {
  throw new SaveCompatError("INVALID_CONFIG", `${configPath}: ${message}`, configPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareVersions(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}
