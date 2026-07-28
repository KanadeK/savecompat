export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

interface OperationBase {
  optional?: boolean;
}

export interface SetDefaultOperation extends OperationBase {
  op: "set-default";
  path: string;
  value: JsonValue;
}

export interface SetOperation extends OperationBase {
  op: "set";
  path: string;
  value: JsonValue;
}

export interface RenameOperation extends OperationBase {
  op: "rename";
  from: string;
  path: string;
  onConflict?: "error" | "keep-target" | "overwrite";
}

export interface DeleteOperation extends OperationBase {
  op: "delete";
  path: string;
}

export interface CopyOperation extends OperationBase {
  op: "copy";
  from: string;
  path: string;
  onConflict?: "error" | "keep-target" | "overwrite";
}

export interface CoerceOperation extends OperationBase {
  op: "coerce";
  path: string;
  to: "string" | "number" | "integer" | "boolean";
}

export interface ClampOperation extends OperationBase {
  op: "clamp";
  path: string;
  min?: number;
  max?: number;
}

export interface MapEnumOperation extends OperationBase {
  op: "map-enum";
  path: string;
  values: Record<string, JsonValue>;
  passthrough?: boolean;
}

export interface EnsureArrayOperation extends OperationBase {
  op: "ensure-array";
  path: string;
  mode?: "wrap" | "empty";
}

export interface MapItemsOperation extends OperationBase {
  op: "map-items";
  path: string;
  operations: MigrationOperation[];
}

export type MigrationOperation =
  | SetDefaultOperation
  | SetOperation
  | RenameOperation
  | DeleteOperation
  | CopyOperation
  | CoerceOperation
  | ClampOperation
  | MapEnumOperation
  | EnsureArrayOperation
  | MapItemsOperation;

export interface MigrationDocument {
  description?: string;
  operations: MigrationOperation[];
}

export interface MigrationReference {
  from: string;
  to: string;
  file: string;
}

export interface PreserveRule {
  label: string;
  from: string;
  to: string;
  fromVersion?: string | string[];
  required?: boolean;
}

export interface SaveCompatConfig {
  latestVersion: string;
  versionPath?: string;
  fixtures: string[];
  schemas: Record<string, string>;
  migrations: MigrationReference[];
  preserve?: PreserveRule[];
  arrayKeys?: Record<string, string>;
  validateSource?: boolean;
}

export interface LoadedMigration extends Omit<MigrationReference, "file"> {
  file: string;
  document: MigrationDocument;
}

export interface LoadedConfig extends SaveCompatConfig {
  configPath: string;
  baseDir: string;
  versionPath: string;
  schemas: Record<string, string>;
  migrations: MigrationReference[];
  preserve: PreserveRule[];
  arrayKeys: Record<string, string>;
  validateSource: boolean;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  file?: string;
}

export interface OperationTrace {
  operation: MigrationOperation["op"];
  path: string;
  changed: boolean;
  message: string;
}

export interface AppliedMigration {
  from: string;
  to: string;
  file: string;
  description?: string;
  operations: OperationTrace[];
}

export interface PreservationResult {
  label: string;
  from: string;
  to: string;
  passed: boolean;
  message: string;
}

export type DiffKind = "added" | "removed" | "changed";

export interface DiffChange {
  kind: DiffKind;
  path: string;
  before?: JsonValue;
  after?: JsonValue;
}

export interface MigrationResult {
  passed: boolean;
  sourceVersion: string | null;
  targetVersion: string;
  output: JsonValue;
  applied: AppliedMigration[];
  preservation: PreservationResult[];
  diagnostics: Diagnostic[];
  changes: DiffChange[];
}

export interface FileCheckResult extends MigrationResult {
  file: string;
  durationMs: number;
}

export interface CheckSummary {
  total: number;
  passed: number;
  failed: number;
  migrated: number;
  unchanged: number;
  durationMs: number;
}

export interface CheckReport {
  tool: "savecompat";
  version: string;
  generatedAt: string;
  configPath: string;
  latestVersion: string;
  summary: CheckSummary;
  files: FileCheckResult[];
}

export interface DoctorResult {
  passed: boolean;
  diagnostics: Diagnostic[];
  fixtureCount: number;
  schemaVersions: string[];
  migrationCount: number;
}
