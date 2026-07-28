import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeJsonAtomic } from "../src/file-output.js";

describe("safe file output", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "savecompat-output-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes formatted JSON without overwriting by default", async () => {
    const output = path.join(directory, "migrated.json");
    await writeJsonAtomic(output, { version: 2 });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual({ version: 2 });
    await expect(writeJsonAtomic(output, { version: 3 })).rejects.toThrow(/Could not write/);
  });

  it("creates a backup before in-place replacement", async () => {
    const input = path.join(directory, "save.json");
    await writeFile(input, '{"version":1}\n');
    const result = await writeJsonAtomic(
      input,
      { version: 2 },
      {
        force: true,
        backupSource: input,
      },
    );
    expect(result.backupPath).toBeDefined();
    if (result.backupPath === undefined) {
      throw new Error("Expected an in-place backup path.");
    }
    expect(await readFile(result.backupPath, "utf8")).toBe('{"version":1}\n');
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ version: 2 });
  });
});
