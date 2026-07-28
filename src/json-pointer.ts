import { isDeepStrictEqual } from "node:util";

import { SaveCompatError } from "./errors.js";
import type { JsonObject, JsonValue } from "./types.js";

export interface PointerLookup {
  exists: boolean;
  value: JsonValue | undefined;
}

const unsafeSegments = new Set(["__proto__", "prototype", "constructor"]);

export function parsePointer(pointer: string): string[] {
  if (pointer === "") {
    return [];
  }
  if (!pointer.startsWith("/")) {
    throw new SaveCompatError(
      "INVALID_POINTER",
      `JSON Pointer must be empty or start with "/": ${pointer}`,
      pointer,
    );
  }

  return pointer
    .slice(1)
    .split("/")
    .map((segment) => {
      const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
      if (unsafeSegments.has(decoded)) {
        throw new SaveCompatError(
          "UNSAFE_POINTER",
          `Unsafe JSON Pointer segment is not allowed: ${decoded}`,
          pointer,
        );
      }
      return decoded;
    });
}

export function encodePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function joinPointer(base: string, segment: string): string {
  const suffix = `/${encodePointerSegment(segment)}`;
  return base === "" ? suffix : `${base}${suffix}`;
}

export function getAtPointer(root: JsonValue, pointer: string): PointerLookup {
  const segments = parsePointer(pointer);
  let current: JsonValue = root;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = arrayIndex(segment, current.length, false);
      if (index === null || index >= current.length) {
        return { exists: false, value: undefined };
      }
      const next = current[index];
      if (next === undefined) {
        return { exists: false, value: undefined };
      }
      current = next;
      continue;
    }

    if (!isObject(current) || !Object.hasOwn(current, segment)) {
      return { exists: false, value: undefined };
    }
    const next = current[segment];
    if (next === undefined) {
      return { exists: false, value: undefined };
    }
    current = next;
  }

  return { exists: true, value: current };
}

export function setAtPointer(root: JsonValue, pointer: string, value: JsonValue): void {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new SaveCompatError(
      "ROOT_WRITE_UNSUPPORTED",
      "Operations cannot replace the document root.",
      pointer,
    );
  }

  let current: JsonValue = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (segment === undefined || nextSegment === undefined) {
      throw new SaveCompatError("INVALID_POINTER", `Invalid JSON Pointer: ${pointer}`, pointer);
    }

    if (Array.isArray(current)) {
      const itemIndex = arrayIndex(segment, current.length, true);
      if (itemIndex === null) {
        throw new SaveCompatError(
          "INVALID_ARRAY_INDEX",
          `Invalid array index "${segment}" in ${pointer}`,
          pointer,
        );
      }
      if (itemIndex > current.length) {
        throw new SaveCompatError(
          "ARRAY_INDEX_GAP",
          `Array index ${itemIndex} creates a gap in ${pointer}`,
          pointer,
        );
      }
      if (itemIndex === current.length) {
        current.push(isArraySegment(nextSegment) ? [] : {});
      }
      const next = current[itemIndex];
      if (!isContainer(next)) {
        throw new SaveCompatError(
          "NON_CONTAINER_PATH",
          `Cannot descend through non-container at "${segment}" in ${pointer}`,
          pointer,
        );
      }
      current = next;
      continue;
    }

    if (!isObject(current)) {
      throw new SaveCompatError(
        "NON_CONTAINER_PATH",
        `Cannot descend through non-container in ${pointer}`,
        pointer,
      );
    }

    const existing = current[segment];
    if (existing === undefined) {
      const created: JsonValue = isArraySegment(nextSegment) ? [] : {};
      current[segment] = created;
      current = created;
    } else if (isContainer(existing)) {
      current = existing;
    } else {
      throw new SaveCompatError(
        "NON_CONTAINER_PATH",
        `Cannot descend through non-container at "${segment}" in ${pointer}`,
        pointer,
      );
    }
  }

  const finalSegment = segments.at(-1);
  if (finalSegment === undefined) {
    throw new SaveCompatError("INVALID_POINTER", `Invalid JSON Pointer: ${pointer}`, pointer);
  }

  if (Array.isArray(current)) {
    const index = arrayIndex(finalSegment, current.length, true);
    if (index === null || index > current.length) {
      throw new SaveCompatError(
        "INVALID_ARRAY_INDEX",
        `Invalid array index "${finalSegment}" in ${pointer}`,
        pointer,
      );
    }
    if (index === current.length) {
      current.push(deepClone(value));
    } else {
      current[index] = deepClone(value);
    }
    return;
  }

  if (!isObject(current)) {
    throw new SaveCompatError(
      "NON_CONTAINER_PATH",
      `Cannot write into non-container in ${pointer}`,
      pointer,
    );
  }
  current[finalSegment] = deepClone(value);
}

export function removeAtPointer(root: JsonValue, pointer: string): boolean {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new SaveCompatError(
      "ROOT_DELETE_UNSUPPORTED",
      "Operations cannot delete the document root.",
      pointer,
    );
  }

  const parentPointer =
    segments.length === 1 ? "" : `/${segments.slice(0, -1).map(encodePointerSegment).join("/")}`;
  const parent = getAtPointer(root, parentPointer);
  const finalSegment = segments.at(-1);
  if (!parent.exists || finalSegment === undefined) {
    return false;
  }

  if (Array.isArray(parent.value)) {
    const index = arrayIndex(finalSegment, parent.value.length, false);
    if (index === null || index >= parent.value.length) {
      return false;
    }
    parent.value.splice(index, 1);
    return true;
  }

  if (!isObject(parent.value) || !Object.hasOwn(parent.value, finalSegment)) {
    return false;
  }
  return Reflect.deleteProperty(parent.value, finalSegment);
}

export function deepClone<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

export function deepEqual(left: JsonValue, right: JsonValue): boolean {
  return isDeepStrictEqual(left, right);
}

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isContainer(value: JsonValue | undefined): value is JsonObject | JsonValue[] {
  return Array.isArray(value) || isObject(value);
}

function isArraySegment(segment: string): boolean {
  return segment === "-" || /^(0|[1-9]\d*)$/.test(segment);
}

function arrayIndex(segment: string, length: number, allowAppend: boolean): number | null {
  if (allowAppend && segment === "-") {
    return length;
  }
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    return null;
  }
  const index = Number(segment);
  return Number.isSafeInteger(index) ? index : null;
}
