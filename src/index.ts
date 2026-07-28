export { checkFixtures } from "./check.js";
export {
  discoverFixtures,
  doctorConfig,
  loadConfig,
  loadMigrations,
  readJsonFile,
} from "./config.js";
export { semanticDiff, type DiffOptions } from "./diff.js";
export { SaveCompatError } from "./errors.js";
export { writeJsonAtomic, type WriteOptions } from "./file-output.js";
export {
  deepClone,
  deepEqual,
  getAtPointer,
  parsePointer,
  removeAtPointer,
  setAtPointer,
} from "./json-pointer.js";
export { migrateSave, planMigrations, readVersion } from "./migrate.js";
export { applyOperations } from "./operations.js";
export { renderHtmlReport } from "./report.js";
export { scaffoldProject } from "./scaffold.js";
export { SchemaRegistry } from "./schema-validator.js";
export type {
  AppliedMigration,
  CheckReport,
  CheckSummary,
  Diagnostic,
  DiagnosticSeverity,
  DiffChange,
  DiffKind,
  DoctorResult,
  FileCheckResult,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  LoadedConfig,
  LoadedMigration,
  MigrationDocument,
  MigrationOperation,
  MigrationReference,
  MigrationResult,
  OperationTrace,
  PreservationResult,
  PreserveRule,
  SaveCompatConfig,
} from "./types.js";
export { VERSION } from "./version.js";
