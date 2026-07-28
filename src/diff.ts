import { deepEqual, isObject, joinPointer } from "./json-pointer.js";
import type { DiffChange, JsonObject, JsonValue } from "./types.js";

export interface DiffOptions {
  ignore?: string[];
  arrayKeys?: Record<string, string>;
}

export function semanticDiff(
  before: JsonValue,
  after: JsonValue,
  options: DiffOptions = {},
): DiffChange[] {
  const changes: DiffChange[] = [];
  walk(before, after, "", "", options, changes);
  return changes;
}

function walk(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  displayPath: string,
  structuralPath: string,
  options: DiffOptions,
  changes: DiffChange[],
): void {
  if (isIgnored(structuralPath, options.ignore ?? [])) {
    return;
  }
  if (before === undefined) {
    if (after !== undefined) {
      changes.push({ kind: "added", path: displayPath || "/", after });
    }
    return;
  }
  if (after === undefined) {
    changes.push({ kind: "removed", path: displayPath || "/", before });
    return;
  }
  if (deepEqual(before, after)) {
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    walkArrays(before, after, displayPath, structuralPath, options, changes);
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      walk(
        before[key],
        after[key],
        joinPointer(displayPath, key),
        joinPointer(structuralPath, key),
        options,
        changes,
      );
    }
    return;
  }
  changes.push({ kind: "changed", path: displayPath || "/", before, after });
}

function walkArrays(
  before: JsonValue[],
  after: JsonValue[],
  displayPath: string,
  structuralPath: string,
  options: DiffOptions,
  changes: DiffChange[],
): void {
  const keyName = options.arrayKeys?.[structuralPath];
  if (keyName !== undefined) {
    const beforeMap = keyedItems(before, keyName);
    const afterMap = keyedItems(after, keyName);
    if (beforeMap !== null && afterMap !== null) {
      const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
      for (const key of [...keys].sort()) {
        walk(
          beforeMap.get(key),
          afterMap.get(key),
          `${displayPath}[${keyName}=${key}]`,
          structuralPath,
          options,
          changes,
        );
      }
      return;
    }
  }

  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    walk(
      before[index],
      after[index],
      joinPointer(displayPath, String(index)),
      joinPointer(structuralPath, String(index)),
      options,
      changes,
    );
  }
}

function keyedItems(items: JsonValue[], keyName: string): Map<string, JsonObject> | null {
  const result = new Map<string, JsonObject>();
  for (const item of items) {
    if (!isObject(item)) {
      return null;
    }
    const key = item[keyName];
    if (typeof key !== "string" && typeof key !== "number" && typeof key !== "boolean") {
      return null;
    }
    const normalized = String(key);
    if (result.has(normalized)) {
      return null;
    }
    result.set(normalized, item);
  }
  return result;
}

function isIgnored(path: string, ignored: string[]): boolean {
  return ignored.some((candidate) => path === candidate || path.startsWith(`${candidate}/`));
}
