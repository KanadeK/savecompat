import path from "node:path";

import { checkFixtures } from "../src/check.js";
import { doctorConfig, loadConfig, readJsonFile } from "../src/config.js";
import { migrateSave, planMigrations } from "../src/migrate.js";

const root = path.resolve(import.meta.dirname, "..");
const configPath = path.join(root, "examples/space-trader/savecompat.config.json");

describe("Space Trader end-to-end corpus", () => {
  it("passes the configuration doctor", async () => {
    const config = await loadConfig(configPath);
    const result = await doctorConfig(config);
    expect(result).toMatchObject({
      passed: true,
      fixtureCount: 4,
      migrationCount: 2,
      schemaVersions: ["1", "2", "3"],
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("migrates every historical fixture to v3", async () => {
    const config = await loadConfig(configPath);
    const report = await checkFixtures(config);
    expect(report.summary).toMatchObject({
      total: 4,
      passed: 4,
      failed: 0,
      migrated: 3,
      unchanged: 1,
    });
    expect(report.files.every((file) => file.targetVersion === "3")).toBe(true);
  });

  it("performs real chained transformations", async () => {
    const config = await loadConfig(configPath);
    const input = await readJsonFile(
      path.join(root, "examples/space-trader/saves/captain-v1.json"),
    );
    const result = await migrateSave(input, config);
    expect(result.passed).toBe(true);
    expect(result.applied.map((step) => `${step.from}->${step.to}`)).toEqual(["1->2", "2->3"]);
    expect(result.output).toMatchObject({
      saveVersion: "3",
      player: {
        id: "player-captain",
        name: "Mara",
      },
      progression: {
        level: 12,
        experience: 4820,
      },
      wallet: {
        credits: 9250,
      },
      achievements: ["first-jump"],
      settings: {
        difficulty: "standard",
        autosave: true,
      },
      metadata: {
        format: "space-trader",
      },
    });
    expect(result.preservation.every((rule) => rule.passed)).toBe(true);
  });

  it("rejects source saves that fail their declared schema", async () => {
    const config = await loadConfig(configPath);
    const result = await migrateSave(
      {
        saveVersion: "1",
        player: { id: "broken", name: "Broken", level: 1, xp: -9 },
        inventory: [],
        coins: 0,
        world: { seed: 1, sector: "Test" },
      },
      config,
    );
    expect(result.passed).toBe(false);
    expect(result.diagnostics.some((item) => item.code === "SCHEMA_VALIDATION_FAILED")).toBe(true);
    expect(result.applied).toEqual([]);
  });

  it("detects loss of a preserved value", async () => {
    const config = await loadConfig(configPath);
    const current = await readJsonFile(
      path.join(root, "examples/space-trader/saves/current-v3.json"),
    );
    config.preserve = [
      {
        label: "Intentionally wrong path",
        fromVersion: "3",
        from: "/player/id",
        to: "/player/name",
      },
    ];
    const result = await migrateSave(current, config);
    expect(result.passed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("PRESERVATION_FAILED");
  });

  it("reports an unknown save version as a migration gap", async () => {
    const config = await loadConfig(configPath);
    config.validateSource = false;
    const result = await migrateSave({ saveVersion: "99" }, config);
    expect(result.passed).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MIGRATION_GAP");
  });

  it("rejects ambiguous outgoing migration edges", () => {
    expect(() =>
      planMigrations("1", "2", [
        {
          from: "1",
          to: "2",
          file: "a.json",
          document: { operations: [] },
        },
        {
          from: "1",
          to: "3",
          file: "b.json",
          document: { operations: [] },
        },
      ]),
    ).toThrow(/multiple outgoing migrations/);
  });
});
