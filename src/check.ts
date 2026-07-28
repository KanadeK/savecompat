import path from "node:path";
import { performance } from "node:perf_hooks";

import { discoverFixtures, readJsonFile } from "./config.js";
import { errorMessage } from "./errors.js";
import { migrateSave } from "./migrate.js";
import type { CheckReport, FileCheckResult, LoadedConfig } from "./types.js";
import { VERSION } from "./version.js";

export async function checkFixtures(
  config: LoadedConfig,
  patterns?: string[],
): Promise<CheckReport> {
  const started = performance.now();
  const files = await discoverFixtures(config, patterns ?? config.fixtures);
  const results = await Promise.all(files.map((file) => checkOne(file, config)));
  const durationMs = rounded(performance.now() - started);
  const passed = results.filter((result) => result.passed).length;
  const migrated = results.filter((result) => result.applied.length > 0).length;

  return {
    tool: "savecompat",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    configPath: config.configPath,
    latestVersion: config.latestVersion,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      migrated,
      unchanged: results.length - migrated,
      durationMs,
    },
    files: results,
  };
}

async function checkOne(file: string, config: LoadedConfig): Promise<FileCheckResult> {
  const started = performance.now();
  try {
    const input = await readJsonFile(file);
    const result = await migrateSave(input, config, file);
    return {
      ...result,
      file: displayPath(file, config.baseDir),
      durationMs: rounded(performance.now() - started),
    };
  } catch (error) {
    return {
      file: displayPath(file, config.baseDir),
      durationMs: rounded(performance.now() - started),
      passed: false,
      sourceVersion: null,
      targetVersion: config.latestVersion,
      output: null,
      applied: [],
      preservation: [],
      changes: [],
      diagnostics: [
        {
          severity: "error",
          code: "FIXTURE_READ_FAILED",
          message: errorMessage(error),
          file,
        },
      ],
    };
  }
}

function displayPath(file: string, baseDir: string): string {
  const relative = path.relative(baseDir, file);
  return relative.startsWith("..") ? file : relative.split(path.sep).join("/");
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
