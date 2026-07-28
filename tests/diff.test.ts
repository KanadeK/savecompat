import { semanticDiff } from "../src/diff.js";

describe("semanticDiff", () => {
  it("reports added, removed, and changed paths", () => {
    const changes = semanticDiff(
      { keep: 1, remove: true, nested: { value: 2 } },
      { keep: 1, add: true, nested: { value: 3 } },
    );
    expect(changes).toEqual([
      { kind: "added", path: "/add", after: true },
      { kind: "changed", path: "/nested/value", before: 2, after: 3 },
      { kind: "removed", path: "/remove", before: true },
    ]);
  });

  it("matches reordered array items by stable game ID", () => {
    const changes = semanticDiff(
      {
        inventory: [
          { id: "potion", quantity: 2 },
          { id: "key", quantity: 1 },
        ],
      },
      {
        inventory: [
          { id: "key", quantity: 1 },
          { id: "potion", quantity: 3 },
        ],
      },
      { arrayKeys: { "/inventory": "id" } },
    );
    expect(changes).toEqual([
      {
        kind: "changed",
        path: "/inventory[id=potion]/quantity",
        before: 2,
        after: 3,
      },
    ]);
  });

  it("ignores volatile paths and descendants", () => {
    const changes = semanticDiff(
      { metadata: { timestamp: 1 }, level: 2 },
      { metadata: { timestamp: 2 }, level: 3 },
      { ignore: ["/metadata"] },
    );
    expect(changes).toEqual([{ kind: "changed", path: "/level", before: 2, after: 3 }]);
  });

  it("falls back to array positions when IDs are duplicated", () => {
    const changes = semanticDiff(
      {
        inventory: [
          { id: "same", qty: 1 },
          { id: "same", qty: 2 },
        ],
      },
      {
        inventory: [
          { id: "same", qty: 1 },
          { id: "same", qty: 3 },
        ],
      },
      { arrayKeys: { "/inventory": "id" } },
    );
    expect(changes[0]?.path).toBe("/inventory/1/qty");
  });
});
