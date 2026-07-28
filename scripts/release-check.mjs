import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const versionSource = await readFile(path.join(root, "src/version.ts"), "utf8");
const sourceVersion = versionSource.match(/VERSION = "([^"]+)"/)?.[1];

if (packageJson.version !== sourceVersion) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, src/version.ts=${sourceVersion ?? "missing"}`,
  );
}

run("npm", ["run", "check"]);

const packed = run("npm", ["pack", "--dry-run", "--json"], true);
const manifest = JSON.parse(packed);
if (!Array.isArray(manifest) || manifest.length !== 1) {
  throw new Error("npm pack did not return exactly one package manifest.");
}

const files = new Set(manifest[0].files.map((entry) => entry.path));
const required = [
  "dist/cli.js",
  "dist/index.js",
  "dist/index.d.ts",
  "schema/savecompat.config.schema.json",
  "README.md",
  "LICENSE",
];
const missing = required.filter((file) => !files.has(file));
if (missing.length > 0) {
  throw new Error(`Package is missing required files: ${missing.join(", ")}`);
}

const forbidden = [...files].filter(
  (file) =>
    file.startsWith("node_modules/") || file.startsWith("examples/") || file.includes(".env"),
);
if (forbidden.length > 0) {
  throw new Error(`Package contains forbidden files: ${forbidden.join(", ")}`);
}

process.stdout.write(
  `Release check passed for savecompat v${packageJson.version}: ${files.size} packaged files.\n`,
);

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}).\n${result.stdout}\n${result.stderr}`,
    );
  }
  if (!capture) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return result.stdout;
}
