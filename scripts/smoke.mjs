import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist/cli.js");
const exampleConfig = path.join(root, "examples/space-trader/savecompat.config.json");
const captain = path.join(root, "examples/space-trader/saves/captain-v1.json");
const current = path.join(root, "examples/space-trader/saves/current-v3.json");
const temporary = await mkdtemp(path.join(os.tmpdir(), "savecompat-smoke-"));

try {
  run(["--version"], { expect: "0.1.0" });
  run(["doctor", "--config", exampleConfig], { expect: "PASS" });
  run(["check", "--config", exampleConfig, "--quiet"], {
    expect: "4/4 fixtures",
  });

  const migrated = run(["migrate", captain, "--config", exampleConfig, "--stdout"], {
    silent: true,
  });
  const parsed = JSON.parse(migrated);
  if (
    parsed.saveVersion !== "3" ||
    parsed.player?.id !== "player-captain" ||
    parsed.progression?.experience !== 4820
  ) {
    throw new Error("migrate --stdout did not return the expected v3 save.");
  }

  run(["diff", current, current], { expect: "no semantic changes" });

  const scaffold = path.join(temporary, "project");
  run(["init", scaffold], { expect: "created 5 files" });
  run(["doctor", "--config", path.join(scaffold, "savecompat.config.json")], {
    expect: "PASS",
  });
  run(["check", "--config", path.join(scaffold, "savecompat.config.json")], {
    expect: "1/1 fixtures",
  });

  process.stdout.write("Smoke test passed: CLI, corpus, stdout, diff, and scaffold.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): savecompat ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
    );
  }
  if (options.expect && !result.stdout.includes(options.expect)) {
    throw new Error(
      `Expected output ${JSON.stringify(options.expect)} from savecompat ${args.join(" ")}\n${result.stdout}`,
    );
  }
  if (!options.silent) {
    process.stdout.write(result.stdout);
  }
  return result.stdout;
}
