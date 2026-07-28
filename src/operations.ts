import { SaveCompatError } from "./errors.js";
import {
  deepClone,
  deepEqual,
  getAtPointer,
  isObject,
  removeAtPointer,
  setAtPointer,
} from "./json-pointer.js";
import type { JsonPrimitive, JsonValue, MigrationOperation, OperationTrace } from "./types.js";

export function applyOperations(
  document: JsonValue,
  operations: MigrationOperation[],
): OperationTrace[] {
  const traces: OperationTrace[] = [];
  for (const operation of operations) {
    traces.push(...applyOperation(document, operation));
  }
  return traces;
}

function applyOperation(document: JsonValue, operation: MigrationOperation): OperationTrace[] {
  switch (operation.op) {
    case "set-default":
      return [applySetDefault(document, operation)];
    case "set":
      return [applySet(document, operation)];
    case "rename":
      return [applyMove(document, operation, true)];
    case "copy":
      return [applyMove(document, operation, false)];
    case "delete":
      return [applyDelete(document, operation)];
    case "coerce":
      return [applyCoerce(document, operation)];
    case "clamp":
      return [applyClamp(document, operation)];
    case "map-enum":
      return [applyMapEnum(document, operation)];
    case "ensure-array":
      return [applyEnsureArray(document, operation)];
    case "map-items":
      return applyMapItems(document, operation);
    default:
      throw new SaveCompatError(
        "UNKNOWN_OPERATION",
        `Unknown migration operation: ${JSON.stringify(operation)}`,
      );
  }
}

function applySetDefault(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "set-default" }>,
): OperationTrace {
  const current = getAtPointer(document, operation.path);
  if (current.exists) {
    return trace(operation, false, "kept existing value");
  }
  setAtPointer(document, operation.path, operation.value);
  return trace(operation, true, "set missing default");
}

function applySet(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "set" }>,
): OperationTrace {
  const current = getAtPointer(document, operation.path);
  if (current.exists && current.value !== undefined && deepEqual(current.value, operation.value)) {
    return trace(operation, false, "value already matched");
  }
  setAtPointer(document, operation.path, operation.value);
  return trace(operation, true, current.exists ? "replaced value" : "set value");
}

function applyMove(
  document: JsonValue,
  operation:
    Extract<MigrationOperation, { op: "rename" }> | Extract<MigrationOperation, { op: "copy" }>,
  removeSource: boolean,
): OperationTrace {
  const source = getAtPointer(document, operation.from);
  if (!source.exists || source.value === undefined) {
    if (operation.optional === true) {
      return trace(operation, false, "source was absent (optional)");
    }
    throw new SaveCompatError(
      "MISSING_SOURCE",
      `Source path does not exist: ${operation.from}`,
      operation.from,
    );
  }

  if (operation.from === operation.path) {
    return trace(operation, false, "source and target are identical");
  }
  if (removeSource && operation.path.startsWith(`${operation.from}/`)) {
    throw new SaveCompatError(
      "INVALID_MOVE",
      `Cannot move ${operation.from} into its own descendant ${operation.path}.`,
      operation.path,
    );
  }

  const target = getAtPointer(document, operation.path);
  if (target.exists) {
    const policy = operation.onConflict ?? "error";
    if (policy === "keep-target") {
      if (removeSource) {
        removeAtPointer(document, operation.from);
      }
      return trace(operation, removeSource, "kept target value");
    }
    if (policy === "error") {
      throw new SaveCompatError(
        "TARGET_CONFLICT",
        `Target path already exists: ${operation.path}`,
        operation.path,
      );
    }
  }

  setAtPointer(document, operation.path, source.value);
  if (removeSource) {
    removeAtPointer(document, operation.from);
  }
  return trace(operation, true, removeSource ? "renamed value" : "copied value");
}

function applyDelete(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "delete" }>,
): OperationTrace {
  const removed = removeAtPointer(document, operation.path);
  if (!removed && operation.optional !== true) {
    throw new SaveCompatError(
      "MISSING_DELETE_TARGET",
      `Delete target does not exist: ${operation.path}`,
      operation.path,
    );
  }
  return trace(operation, removed, removed ? "deleted value" : "target was absent (optional)");
}

function applyCoerce(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "coerce" }>,
): OperationTrace {
  const current = requireValue(document, operation.path, operation.optional === true);
  if (current === undefined) {
    return trace(operation, false, "target was absent (optional)");
  }
  const coerced = coerce(current, operation.to, operation.path);
  if (deepEqual(current, coerced)) {
    return trace(operation, false, `already ${operation.to}`);
  }
  setAtPointer(document, operation.path, coerced);
  return trace(operation, true, `coerced to ${operation.to}`);
}

function applyClamp(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "clamp" }>,
): OperationTrace {
  const current = requireValue(document, operation.path, operation.optional === true);
  if (current === undefined) {
    return trace(operation, false, "target was absent (optional)");
  }
  if (typeof current !== "number" || !Number.isFinite(current)) {
    throw new SaveCompatError(
      "CLAMP_NON_NUMBER",
      `Clamp target must be a finite number: ${operation.path}`,
      operation.path,
    );
  }
  if (operation.min === undefined && operation.max === undefined) {
    throw new SaveCompatError(
      "EMPTY_CLAMP",
      `Clamp operation needs min, max, or both: ${operation.path}`,
      operation.path,
    );
  }
  let next = current;
  if (operation.min !== undefined) {
    next = Math.max(operation.min, next);
  }
  if (operation.max !== undefined) {
    next = Math.min(operation.max, next);
  }
  if (next === current) {
    return trace(operation, false, "value already within range");
  }
  setAtPointer(document, operation.path, next);
  return trace(operation, true, `clamped ${current} to ${next}`);
}

function applyMapEnum(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "map-enum" }>,
): OperationTrace {
  const current = requireValue(document, operation.path, operation.optional === true);
  if (current === undefined) {
    return trace(operation, false, "target was absent (optional)");
  }
  if (current !== null && typeof current === "object") {
    throw new SaveCompatError(
      "ENUM_NON_PRIMITIVE",
      `Enum target must be a primitive: ${operation.path}`,
      operation.path,
    );
  }
  const mapped = operation.values[String(current)];
  if (mapped === undefined) {
    if (operation.passthrough === true) {
      return trace(operation, false, "value passed through");
    }
    throw new SaveCompatError(
      "UNKNOWN_ENUM_VALUE",
      `No enum mapping for ${JSON.stringify(current)} at ${operation.path}`,
      operation.path,
    );
  }
  if (deepEqual(current, mapped)) {
    return trace(operation, false, "mapped value was unchanged");
  }
  setAtPointer(document, operation.path, mapped);
  return trace(operation, true, `mapped ${JSON.stringify(current)} to ${JSON.stringify(mapped)}`);
}

function applyEnsureArray(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "ensure-array" }>,
): OperationTrace {
  const current = getAtPointer(document, operation.path);
  if (!current.exists) {
    setAtPointer(document, operation.path, []);
    return trace(operation, true, "created empty array");
  }
  if (Array.isArray(current.value)) {
    return trace(operation, false, "value already an array");
  }
  if (operation.mode === "empty") {
    setAtPointer(document, operation.path, []);
    return trace(operation, true, "replaced value with empty array");
  }
  if (current.value === undefined) {
    throw new SaveCompatError(
      "MISSING_ARRAY_TARGET",
      `Array target does not exist: ${operation.path}`,
      operation.path,
    );
  }
  setAtPointer(document, operation.path, [current.value]);
  return trace(operation, true, "wrapped value in array");
}

function applyMapItems(
  document: JsonValue,
  operation: Extract<MigrationOperation, { op: "map-items" }>,
): OperationTrace[] {
  const current = requireValue(document, operation.path, operation.optional === true);
  if (current === undefined) {
    return [trace(operation, false, "target was absent (optional)")];
  }
  if (!Array.isArray(current)) {
    throw new SaveCompatError(
      "MAP_ITEMS_NON_ARRAY",
      `map-items target must be an array: ${operation.path}`,
      operation.path,
    );
  }

  const traces: OperationTrace[] = [];
  current.forEach((item, index) => {
    if (!Array.isArray(item) && !isObject(item)) {
      throw new SaveCompatError(
        "MAP_ITEM_NON_CONTAINER",
        `Item ${index} at ${operation.path} is not an object or array`,
        `${operation.path}/${index}`,
      );
    }
    const itemTraces = applyOperations(item, operation.operations);
    for (const itemTrace of itemTraces) {
      traces.push({
        ...itemTrace,
        path: `${operation.path}/${index}${itemTrace.path}`,
        message: `item ${index}: ${itemTrace.message}`,
      });
    }
  });
  if (traces.length === 0) {
    traces.push(trace(operation, false, "array was empty"));
  }
  return traces;
}

function coerce(
  value: JsonValue,
  target: Extract<MigrationOperation, { op: "coerce" }>["to"],
  path: string,
): JsonPrimitive {
  switch (target) {
    case "string":
      if (typeof value === "object") {
        break;
      }
      return String(value);
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      break;
    }
    case "integer": {
      if (typeof value === "number" && Number.isInteger(value)) {
        return value;
      }
      if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
        const parsed = Number(value);
        if (Number.isSafeInteger(parsed)) {
          return parsed;
        }
      }
      break;
    }
    case "boolean":
      if (typeof value === "boolean") {
        return value;
      }
      if (value === 1 || (typeof value === "string" && /^(true|1)$/i.test(value.trim()))) {
        return true;
      }
      if (value === 0 || (typeof value === "string" && /^(false|0)$/i.test(value.trim()))) {
        return false;
      }
      break;
  }

  throw new SaveCompatError(
    "COERCE_FAILED",
    `Cannot coerce ${JSON.stringify(value)} to ${target} at ${path}`,
    path,
  );
}

function requireValue(document: JsonValue, path: string, optional: boolean): JsonValue | undefined {
  const lookup = getAtPointer(document, path);
  if (lookup.exists) {
    return lookup.value;
  }
  if (optional) {
    return undefined;
  }
  throw new SaveCompatError("MISSING_TARGET", `Target path does not exist: ${path}`, path);
}

function trace(operation: MigrationOperation, changed: boolean, message: string): OperationTrace {
  const path = "path" in operation ? operation.path : "";
  return {
    operation: operation.op,
    path,
    changed,
    message,
  };
}

export function cloneOperationValue(value: JsonValue): JsonValue {
  return deepClone(value);
}
