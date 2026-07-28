import { applyOperations } from "../src/operations.js";
import type { JsonValue, MigrationOperation } from "../src/types.js";

function apply(document: JsonValue, operations: MigrationOperation[]): JsonValue {
  applyOperations(document, operations);
  return document;
}

describe("migration operations", () => {
  it("sets defaults without overwriting existing progress", () => {
    const document: JsonValue = { level: 9 };
    apply(document, [
      { op: "set-default", path: "/level", value: 1 },
      { op: "set-default", path: "/difficulty", value: "normal" },
    ]);
    expect(document).toEqual({ level: 9, difficulty: "normal" });
  });

  it("sets explicit values", () => {
    expect(apply({ mode: "old" }, [{ op: "set", path: "/mode", value: "new" }])).toEqual({
      mode: "new",
    });
  });

  it("renames and copies values", () => {
    const document: JsonValue = { old: { xp: 12 } };
    apply(document, [
      { op: "copy", from: "/old/xp", path: "/snapshot/xp" },
      { op: "rename", from: "/old/xp", path: "/progress/xp" },
    ]);
    expect(document).toEqual({
      old: {},
      snapshot: { xp: 12 },
      progress: { xp: 12 },
    });
  });

  it("honors keep-target conflict policy", () => {
    const document: JsonValue = { old: 1, current: 2 };
    apply(document, [
      {
        op: "rename",
        from: "/old",
        path: "/current",
        onConflict: "keep-target",
      },
    ]);
    expect(document).toEqual({ current: 2 });
  });

  it("rejects a target conflict by default", () => {
    expect(() =>
      apply({ old: 1, current: 2 }, [{ op: "rename", from: "/old", path: "/current" }]),
    ).toThrow(/already exists/);
  });

  it("supports optional missing paths", () => {
    const document: JsonValue = {};
    const traces = applyOperations(document, [
      { op: "delete", path: "/legacy", optional: true },
      { op: "coerce", path: "/missing", to: "number", optional: true },
    ]);
    expect(traces.every((trace) => !trace.changed)).toBe(true);
  });

  it("coerces common serialized primitive values", () => {
    const document: JsonValue = {
      count: "42",
      ratio: "1.5",
      enabled: "true",
      label: 99,
    };
    apply(document, [
      { op: "coerce", path: "/count", to: "integer" },
      { op: "coerce", path: "/ratio", to: "number" },
      { op: "coerce", path: "/enabled", to: "boolean" },
      { op: "coerce", path: "/label", to: "string" },
    ]);
    expect(document).toEqual({
      count: 42,
      ratio: 1.5,
      enabled: true,
      label: "99",
    });
  });

  it("rejects unsafe coercion", () => {
    expect(() =>
      apply({ count: "many" }, [{ op: "coerce", path: "/count", to: "integer" }]),
    ).toThrow(/Cannot coerce/);
  });

  it("clamps finite numbers", () => {
    const document: JsonValue = { health: 140, debt: -5 };
    apply(document, [
      { op: "clamp", path: "/health", min: 0, max: 100 },
      { op: "clamp", path: "/debt", min: 0 },
    ]);
    expect(document).toEqual({ health: 100, debt: 0 });
  });

  it("maps enum values and supports passthrough", () => {
    const document: JsonValue = { difficulty: "normal", locale: "eo" };
    apply(document, [
      {
        op: "map-enum",
        path: "/difficulty",
        values: { normal: "standard" },
      },
      {
        op: "map-enum",
        path: "/locale",
        values: { en: "en-US" },
        passthrough: true,
      },
    ]);
    expect(document).toEqual({ difficulty: "standard", locale: "eo" });
  });

  it("normalizes scalar values into arrays", () => {
    const document: JsonValue = { tags: "founder" };
    apply(document, [{ op: "ensure-array", path: "/tags" }]);
    expect(document).toEqual({ tags: ["founder"] });
  });

  it("applies nested operations to each array item", () => {
    const document: JsonValue = {
      inventory: [
        { id: "a", qty: "2" },
        { id: "b", qty: "5" },
      ],
    };
    const traces = applyOperations(document, [
      {
        op: "map-items",
        path: "/inventory",
        operations: [
          { op: "coerce", path: "/qty", to: "integer" },
          { op: "rename", from: "/qty", path: "/quantity" },
        ],
      },
    ]);
    expect(document).toEqual({
      inventory: [
        { id: "a", quantity: 2 },
        { id: "b", quantity: 5 },
      ],
    });
    expect(traces.some((trace) => trace.path === "/inventory/0/qty")).toBe(true);
  });
});
