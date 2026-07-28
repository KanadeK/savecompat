import { SaveCompatError, errorMessage } from "./errors.js";
import { semanticDiff } from "./diff.js";
import { loadMigrations } from "./config.js";
import { applyOperations } from "./operations.js";
import { deepClone, deepEqual, getAtPointer, setAtPointer } from "./json-pointer.js";
import { SchemaRegistry } from "./schema-validator.js";
import type {
  AppliedMigration,
  Diagnostic,
  JsonValue,
  LoadedConfig,
  LoadedMigration,
  MigrationResult,
  PreservationResult,
  PreserveRule,
} from "./types.js";

export async function migrateSave(
  input: JsonValue,
  config: LoadedConfig,
  file?: string,
): Promise<MigrationResult> {
  const original = deepClone(input);
  const output = deepClone(input);
  const diagnostics: Diagnostic[] = [];
  const applied: AppliedMigration[] = [];
  const preservation: PreservationResult[] = [];
  let sourceVersion: string | null = null;

  try {
    sourceVersion = readVersion(output, config.versionPath);
    const registry = new SchemaRegistry(config);

    if (config.validateSource) {
      const sourceDiagnostics = await registry.validate(sourceVersion, output, file);
      diagnostics.push(...sourceDiagnostics);
      if (sourceDiagnostics.length > 0) {
        return finish(false);
      }
    }

    const migrations = await loadMigrations(config);
    const plan = planMigrations(sourceVersion, config.latestVersion, migrations);
    for (const migration of plan) {
      const operations = applyOperations(output, migration.document.operations);
      setAtPointer(output, config.versionPath, migration.to);
      applied.push({
        from: migration.from,
        to: migration.to,
        file: migration.file,
        ...(migration.document.description === undefined
          ? {}
          : { description: migration.document.description }),
        operations,
      });

      const targetDiagnostics = await registry.validate(migration.to, output, file);
      diagnostics.push(...targetDiagnostics);
      if (targetDiagnostics.length > 0) {
        return finish(false);
      }
    }

    if (readVersion(output, config.versionPath) !== config.latestVersion) {
      throw new SaveCompatError(
        "WRONG_TARGET_VERSION",
        `Migration ended at ${readVersion(output, config.versionPath)}, expected ${config.latestVersion}.`,
        config.versionPath,
      );
    }

    for (const rule of config.preserve) {
      if (!appliesToVersion(rule, sourceVersion)) {
        continue;
      }
      const result = checkPreservation(rule, original, output);
      preservation.push(result);
      if (!result.passed) {
        diagnostics.push({
          severity: "error",
          code: "PRESERVATION_FAILED",
          message: `${rule.label}: ${result.message}`,
          path: rule.to,
          ...(file === undefined ? {} : { file }),
        });
      }
    }

    const secondPlan = planMigrations(config.latestVersion, config.latestVersion, migrations);
    if (secondPlan.length !== 0 || !deepEqual(output, deepClone(output))) {
      diagnostics.push({
        severity: "error",
        code: "NON_IDEMPOTENT",
        message: "Migrating an already-current save was not idempotent.",
        ...(file === undefined ? {} : { file }),
      });
    }

    return finish(diagnostics.every((diagnostic) => diagnostic.severity !== "error"));
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: error instanceof SaveCompatError ? error.code : "MIGRATION_FAILED",
      message: errorMessage(error),
      ...(error instanceof SaveCompatError && error.path !== undefined ? { path: error.path } : {}),
      ...(file === undefined ? {} : { file }),
    });
    return finish(false);
  }

  function finish(passed: boolean): MigrationResult {
    return {
      passed,
      sourceVersion,
      targetVersion: config.latestVersion,
      output,
      applied,
      preservation,
      diagnostics,
      changes: semanticDiff(original, output, { arrayKeys: config.arrayKeys }),
    };
  }
}

export function planMigrations(
  sourceVersion: string,
  targetVersion: string,
  migrations: LoadedMigration[],
): LoadedMigration[] {
  const bySource = new Map(migrations.map((migration) => [migration.from, migration]));
  const plan: LoadedMigration[] = [];
  const seen = new Set<string>();
  let current = sourceVersion;

  while (current !== targetVersion) {
    if (seen.has(current)) {
      throw new SaveCompatError(
        "MIGRATION_CYCLE",
        `Migration cycle detected from version ${sourceVersion}.`,
      );
    }
    seen.add(current);
    const migration = bySource.get(current);
    if (migration === undefined) {
      throw new SaveCompatError(
        "MIGRATION_GAP",
        `No migration path from version ${sourceVersion}; stopped at ${current}.`,
      );
    }
    plan.push(migration);
    current = migration.to;
  }
  return plan;
}

export function readVersion(document: JsonValue, versionPath: string): string {
  const lookup = getAtPointer(document, versionPath);
  if (!lookup.exists || lookup.value === undefined) {
    throw new SaveCompatError(
      "VERSION_MISSING",
      `Save version is missing at ${versionPath}.`,
      versionPath,
    );
  }
  if (typeof lookup.value !== "string" && typeof lookup.value !== "number") {
    throw new SaveCompatError(
      "VERSION_INVALID",
      `Save version at ${versionPath} must be a string or number.`,
      versionPath,
    );
  }
  return String(lookup.value);
}

function checkPreservation(
  rule: PreserveRule,
  before: JsonValue,
  after: JsonValue,
): PreservationResult {
  const source = getAtPointer(before, rule.from);
  const target = getAtPointer(after, rule.to);
  const required = rule.required ?? true;

  if (!source.exists || source.value === undefined) {
    return {
      label: rule.label,
      from: rule.from,
      to: rule.to,
      passed: !required,
      message: required ? `source path ${rule.from} was missing` : "optional source was absent",
    };
  }
  if (!target.exists || target.value === undefined) {
    return {
      label: rule.label,
      from: rule.from,
      to: rule.to,
      passed: false,
      message: `target path ${rule.to} was missing`,
    };
  }
  const passed = deepEqual(source.value, target.value);
  return {
    label: rule.label,
    from: rule.from,
    to: rule.to,
    passed,
    message: passed ? "value preserved" : "value changed during migration",
  };
}

function appliesToVersion(rule: PreserveRule, version: string): boolean {
  if (rule.fromVersion === undefined) {
    return true;
  }
  return Array.isArray(rule.fromVersion)
    ? rule.fromVersion.includes(version)
    : rule.fromVersion === version;
}
