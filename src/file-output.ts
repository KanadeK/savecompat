import { constants } from "node:fs";
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { SaveCompatError, errorMessage } from "./errors.js";
import type { JsonValue } from "./types.js";

export interface WriteOptions {
  force?: boolean;
  backupSource?: string;
}

export async function writeJsonAtomic(
  outputPath: string,
  value: JsonValue,
  options: WriteOptions = {},
): Promise<{ outputPath: string; backupPath?: string }> {
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });

  let backupPath: string | undefined;
  if (options.backupSource !== undefined) {
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    backupPath = `${options.backupSource}.${stamp}.bak`;
    await copyFile(options.backupSource, backupPath, constants.COPYFILE_EXCL);
  }

  const temporary = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    if (options.force !== true && options.backupSource === undefined) {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await copyIntoPlaceWithoutOverwrite(temporary, resolved);
    } else {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await rename(temporary, resolved);
    }
  } catch (error) {
    await rm(temporary, { force: true });
    throw new SaveCompatError(
      "WRITE_FAILED",
      `Could not write ${resolved}: ${errorMessage(error)}`,
      resolved,
    );
  }

  return {
    outputPath: resolved,
    ...(backupPath === undefined ? {} : { backupPath }),
  };
}

async function copyIntoPlaceWithoutOverwrite(temporary: string, output: string): Promise<void> {
  try {
    await copyFile(temporary, output, constants.COPYFILE_EXCL);
  } finally {
    await rm(temporary, { force: true });
  }
}
