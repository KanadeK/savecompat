import { getAtPointer, parsePointer, removeAtPointer, setAtPointer } from "../src/json-pointer.js";
import type { JsonValue } from "../src/types.js";

describe("JSON Pointer helpers", () => {
  it("parses and unescapes RFC 6901 segments", () => {
    expect(parsePointer("/a~1b/m~0n")).toEqual(["a/b", "m~n"]);
  });

  it("reads nested object and array values", () => {
    const document: JsonValue = { players: [{ id: "p1" }] };
    expect(getAtPointer(document, "/players/0/id")).toEqual({
      exists: true,
      value: "p1",
    });
    expect(getAtPointer(document, "/players/1/id").exists).toBe(false);
  });

  it("creates missing object parents", () => {
    const document: JsonValue = {};
    setAtPointer(document, "/progress/stats/xp", 42);
    expect(document).toEqual({ progress: { stats: { xp: 42 } } });
  });

  it("creates arrays when the next segment is numeric", () => {
    const document: JsonValue = {};
    setAtPointer(document, "/inventory/0/id", "medkit");
    expect(document).toEqual({ inventory: [{ id: "medkit" }] });
  });

  it("appends to arrays with the dash segment", () => {
    const document: JsonValue = { values: [1] };
    setAtPointer(document, "/values/-", 2);
    expect(document).toEqual({ values: [1, 2] });
  });

  it("removes object fields and array items", () => {
    const document: JsonValue = { a: 1, list: ["x", "y"] };
    expect(removeAtPointer(document, "/a")).toBe(true);
    expect(removeAtPointer(document, "/list/0")).toBe(true);
    expect(document).toEqual({ list: ["y"] });
  });

  it("rejects invalid pointers", () => {
    expect(() => parsePointer("players/0")).toThrow(/start with/);
    expect(() => parsePointer("/__proto__/polluted")).toThrow(/Unsafe/);
  });

  it("rejects writes through scalar values", () => {
    const document: JsonValue = { player: "not-an-object" };
    expect(() => setAtPointer(document, "/player/id", "p1")).toThrow(/non-container/);
  });
});
