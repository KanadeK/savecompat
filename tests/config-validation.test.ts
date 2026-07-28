import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { doctorConfig, loadConfig } from "../src/config.js";
import { scaffoldProject } from "../src/scaffold.js";

describe("configuration doctor diagnostics", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "savecompat-doctor-"));
    await scaffoldProject(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects malformed operation parameters before a corpus run", async () => {
    await writeFile(
      path.join(directory, "migrations/1-to-2.json"),
      JSON.stringify({
        operations: [
          { op: "clamp", path: "/player/level" },
          { op: "coerce", path: "/player/level", to: "float" },
          { op: "ensure-array", path: "/items", mode: "discard" },
        ],
      }),
    );
    const config = await loadConfig(path.join(directory, "savecompat.config.json"));
    const result = await doctorConfig(config);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["INVALID_CLAMP", "INVALID_COERCE_TARGET", "INVALID_ARRAY_MODE"]),
    );
  });

  it("reports a migration whose target schema is absent", async () => {
    const config = await loadConfig(path.join(directory, "savecompat.config.json"));
    delete config.schemas["2"];
    const result = await doctorConfig(config);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["LATEST_SCHEMA_MISSING", "MIGRATION_TARGET_SCHEMA_MISSING"]),
    );
  });
});
