import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkFixtures } from "../src/check.js";
import { doctorConfig, loadConfig } from "../src/config.js";
import { scaffoldProject } from "../src/scaffold.js";

describe("project scaffold", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "savecompat-scaffold-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("creates a passing, real migration example", async () => {
    const written = await scaffoldProject(directory);
    expect(written).toHaveLength(5);
    const config = await loadConfig(path.join(directory, "savecompat.config.json"));
    expect((await doctorConfig(config)).passed).toBe(true);
    const report = await checkFixtures(config);
    expect(report.summary).toMatchObject({ total: 1, passed: 1, migrated: 1 });
  });

  it("refuses to replace scaffold files without --force", async () => {
    await scaffoldProject(directory);
    await expect(scaffoldProject(directory)).rejects.toThrow(/--force/);
    await expect(scaffoldProject(directory, true)).resolves.toHaveLength(5);
  });
});
