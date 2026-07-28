import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Command, Option } from "commander";
import pc from "picocolors";

import { checkFixtures } from "./check.js";
import { doctorConfig, loadConfig, readJsonFile } from "./config.js";
import { semanticDiff } from "./diff.js";
import { SaveCompatError, errorMessage } from "./errors.js";
import { writeJsonAtomic } from "./file-output.js";
import { migrateSave } from "./migrate.js";
import { renderHtmlReport } from "./report.js";
import { scaffoldProject } from "./scaffold.js";
import type { CheckReport, Diagnostic, DiffChange } from "./types.js";
import { VERSION } from "./version.js";

interface GlobalOptions {
  config?: string;
}

interface CheckOptions {
  report?: string;
  json?: boolean;
  quiet?: boolean;
}

interface MigrateOptions {
  out?: string;
  inPlace?: boolean;
  stdout?: boolean;
  force?: boolean;
  json?: boolean;
}

interface DiffOptions {
  ignore?: string[];
  json?: boolean;
}

export function createProgram(): Command {
  const program = new Command()
    .name("savecompat")
    .description("Prove that old game saves still migrate safely before you ship.")
    .version(VERSION)
    .option("-c, --config <file>", "path to savecompat.config.json")
    .showHelpAfterError();

  program
    .command("doctor")
    .description("validate configuration, schemas, migration graph, and fixture discovery")
    .action(async (_options: unknown, command: Command) => {
      const config = await configFor(command);
      const result = await doctorConfig(config);
      writeLine(`${result.passed ? pc.green("PASS") : pc.red("FAIL")} configuration doctor`);
      writeLine(
        `${result.fixtureCount} fixtures · ${result.schemaVersions.length} schemas · ${result.migrationCount} migrations`,
      );
      printDiagnostics(result.diagnostics);
      if (!result.passed) {
        process.exitCode = 1;
      }
    });

  program
    .command("check")
    .description("migrate and validate the configured old-save corpus")
    .argument("[patterns...]", "fixture glob patterns that override config")
    .option("-r, --report <file>", "write a self-contained HTML report")
    .option("--json", "print the machine-readable report")
    .option("-q, --quiet", "only print failures and the final summary")
    .action(async (patterns: string[], options: CheckOptions, command: Command) => {
      const config = await configFor(command);
      const report = await checkFixtures(config, patterns.length === 0 ? undefined : patterns);
      if (options.report !== undefined) {
        const output = path.resolve(options.report);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, renderHtmlReport(report), "utf8");
      }

      if (options.json === true) {
        writeLine(JSON.stringify(report, null, 2));
      } else {
        printCheckReport(report, options.quiet === true);
        if (options.report !== undefined) {
          writeLine(`${pc.dim("report")} ${path.resolve(options.report)}`);
        }
      }
      if (report.summary.failed > 0 || report.summary.total === 0) {
        process.exitCode = 1;
      }
    });

  program
    .command("migrate")
    .description("preview or safely write one migrated save")
    .argument("<file>", "JSON save file")
    .option("-o, --out <file>", "write to a new file")
    .option("--in-place", "replace the input after creating a timestamped .bak copy")
    .option("--stdout", "write only the migrated JSON to stdout")
    .option("--force", "allow --out to replace an existing file")
    .option("--json", "print a machine-readable migration result")
    .action(async (file: string, options: MigrateOptions, command: Command) => {
      if (options.out !== undefined && options.inPlace === true) {
        throw new SaveCompatError(
          "CONFLICTING_OUTPUT",
          "Use either --out or --in-place, not both.",
        );
      }
      if (options.stdout === true && (options.out !== undefined || options.inPlace === true)) {
        throw new SaveCompatError(
          "CONFLICTING_OUTPUT",
          "--stdout cannot be combined with --out or --in-place.",
        );
      }

      const config = await configFor(command);
      const inputPath = path.resolve(file);
      const input = await readJsonFile(inputPath);
      const result = await migrateSave(input, config, inputPath);

      if (options.stdout === true) {
        if (!result.passed) {
          printDiagnostics(result.diagnostics, true);
          process.exitCode = 1;
          return;
        }
        writeLine(JSON.stringify(result.output, null, 2));
        return;
      }
      if (options.json === true) {
        writeLine(JSON.stringify(result, null, 2));
      } else {
        printMigrationResult(file, result);
      }
      if (!result.passed) {
        process.exitCode = 1;
        return;
      }

      if (options.inPlace === true) {
        const written = await writeJsonAtomic(inputPath, result.output, {
          force: true,
          backupSource: inputPath,
        });
        writeLine(`${pc.green("wrote")} ${written.outputPath}`);
        if (written.backupPath !== undefined) {
          writeLine(`${pc.dim("backup")} ${written.backupPath}`);
        }
      } else if (options.out !== undefined) {
        const written = await writeJsonAtomic(options.out, result.output, {
          force: options.force === true,
        });
        writeLine(`${pc.green("wrote")} ${written.outputPath}`);
      } else if (options.json !== true) {
        writeLine(pc.dim("preview only; use --out, --in-place, or --stdout to write"));
      }
    });

  program
    .command("diff")
    .description("show a semantic JSON save diff")
    .argument("<before>", "older or baseline save")
    .argument("<after>", "newer or candidate save")
    .addOption(
      new Option("-i, --ignore <pointer>", "ignore a JSON Pointer and its children").argParser(
        collect,
      ),
    )
    .option("--json", "print machine-readable changes")
    .action(
      async (beforeFile: string, afterFile: string, options: DiffOptions, command: Command) => {
        const globals = command.optsWithGlobals<GlobalOptions>();
        const config =
          globals.config === undefined
            ? undefined
            : await loadConfig(globals.config, process.cwd());
        const [before, after] = await Promise.all([
          readJsonFile(path.resolve(beforeFile)),
          readJsonFile(path.resolve(afterFile)),
        ]);
        const changes = semanticDiff(before, after, {
          ignore: options.ignore ?? [],
          arrayKeys: config?.arrayKeys ?? {},
        });
        if (options.json === true) {
          writeLine(JSON.stringify(changes, null, 2));
        } else {
          printDiff(changes);
        }
      },
    );

  program
    .command("init")
    .description("create a small, passing v1→v2 SaveCompat example")
    .argument("[directory]", "target directory", ".")
    .option("--force", "replace files owned by the scaffold")
    .action(async (directory: string, options: { force?: boolean }) => {
      const written = await scaffoldProject(directory, options.force === true);
      writeLine(`${pc.green("created")} ${written.length} files in ${path.resolve(directory)}`);
      writeLine(pc.dim("next: savecompat doctor && savecompat check"));
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    writeError(`${pc.red("error")} ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

async function configFor(command: Command) {
  const options = command.optsWithGlobals<GlobalOptions>();
  return loadConfig(options.config, process.cwd());
}

function printCheckReport(report: CheckReport, quiet: boolean): void {
  for (const file of report.files) {
    if (quiet && file.passed) {
      continue;
    }
    const status = file.passed ? pc.green("PASS") : pc.red("FAIL");
    const version = `${file.sourceVersion ?? "?"}→${file.targetVersion}`;
    writeLine(`${status} ${file.file} ${pc.dim(`v${version} · ${file.durationMs}ms`)}`);
    if (!file.passed) {
      printDiagnostics(file.diagnostics);
    }
  }
  const summary = report.summary;
  const status = summary.failed === 0 && summary.total > 0 ? pc.green("PASS") : pc.red("FAIL");
  writeLine(
    `${status} ${summary.passed}/${summary.total} fixtures · ${summary.migrated} migrated · ${summary.durationMs}ms`,
  );
}

function printMigrationResult(file: string, result: Awaited<ReturnType<typeof migrateSave>>): void {
  const status = result.passed ? pc.green("PASS") : pc.red("FAIL");
  writeLine(
    `${status} ${file} v${result.sourceVersion ?? "?"}→${result.targetVersion} · ${result.applied.length} step(s) · ${result.changes.length} change(s)`,
  );
  printDiagnostics(result.diagnostics);
  if (result.passed) {
    printDiff(result.changes.slice(0, 30));
    if (result.changes.length > 30) {
      writeLine(pc.dim(`… ${result.changes.length - 30} more changes`));
    }
  }
}

function printDiff(changes: DiffChange[]): void {
  if (changes.length === 0) {
    writeLine(pc.dim("no semantic changes"));
    return;
  }
  for (const change of changes) {
    const symbol =
      change.kind === "added"
        ? pc.green("+")
        : change.kind === "removed"
          ? pc.red("-")
          : pc.yellow("~");
    writeLine(`${symbol} ${change.path}`);
  }
}

function printDiagnostics(diagnostics: Diagnostic[], stderr = false): void {
  for (const diagnostic of diagnostics) {
    const line = `  ${diagnostic.severity === "error" ? pc.red("error") : pc.yellow(diagnostic.severity)} ${diagnostic.code}: ${diagnostic.message}`;
    if (stderr) {
      writeError(line);
    } else {
      writeLine(line);
    }
  }
}

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function writeLine(value: string): void {
  process.stdout.write(`${value}\n`);
}

function writeError(value: string): void {
  process.stderr.write(`${value}\n`);
}

const executable =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (executable) {
  void main();
}
