import { readFile } from "node:fs/promises";

import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";

import { SaveCompatError, errorMessage } from "./errors.js";
import type { Diagnostic, JsonValue, LoadedConfig } from "./types.js";

export class SchemaRegistry {
  private readonly ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });

  private readonly validators = new Map<string, ValidateFunction>();

  constructor(private readonly config: LoadedConfig) {}

  async validate(version: string, data: JsonValue, file?: string): Promise<Diagnostic[]> {
    const validator = await this.validatorFor(version);
    const valid = validator(data);
    if (valid) {
      return [];
    }
    return (validator.errors ?? []).map((error) => toDiagnostic(version, error, file));
  }

  private async validatorFor(version: string): Promise<ValidateFunction> {
    const cached = this.validators.get(version);
    if (cached !== undefined) {
      return cached;
    }
    const schemaPath = this.config.schemas[version];
    if (schemaPath === undefined) {
      throw new SaveCompatError(
        "SCHEMA_MISSING",
        `No JSON Schema is configured for save version ${version}.`,
      );
    }

    let schema: unknown;
    try {
      schema = JSON.parse(await readFile(schemaPath, "utf8")) as unknown;
    } catch (error) {
      throw new SaveCompatError(
        "SCHEMA_LOAD_FAILED",
        `Could not load schema ${schemaPath}: ${errorMessage(error)}`,
        schemaPath,
      );
    }

    try {
      const validator = this.ajv.compile(schema as AnySchema);
      this.validators.set(version, validator);
      return validator;
    } catch (error) {
      throw new SaveCompatError(
        "SCHEMA_COMPILE_FAILED",
        `Could not compile schema ${schemaPath}: ${errorMessage(error)}`,
        schemaPath,
      );
    }
  }
}

function toDiagnostic(version: string, error: ErrorObject, file?: string): Diagnostic {
  const missing =
    error.keyword === "required" && typeof error.params.missingProperty === "string"
      ? `/${escapePointer(error.params.missingProperty)}`
      : "";
  const path = `${error.instancePath}${missing}` || "";
  return {
    severity: "error",
    code: "SCHEMA_VALIDATION_FAILED",
    message: `v${version} ${path || "/"} ${error.message ?? "is invalid"}`,
    ...(path === "" ? {} : { path }),
    ...(file === undefined ? {} : { file }),
  };
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
