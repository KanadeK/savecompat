import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { SaveCompatError, errorMessage } from "./errors.js";

interface ScaffoldFile {
  path: string;
  content: string;
}

const files: ScaffoldFile[] = [
  {
    path: "savecompat.config.json",
    content: `${JSON.stringify(
      {
        latestVersion: "2",
        versionPath: "/saveVersion",
        fixtures: ["saves/**/*.json"],
        schemas: {
          "1": "schemas/v1.schema.json",
          "2": "schemas/v2.schema.json",
        },
        migrations: [
          {
            from: "1",
            to: "2",
            file: "migrations/1-to-2.json",
          },
        ],
        preserve: [
          {
            label: "Player identity",
            fromVersion: ["1", "2"],
            from: "/player/id",
            to: "/player/id",
          },
        ],
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "schemas/v1.schema.json",
    content: `${JSON.stringify(
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        required: ["saveVersion", "player"],
        additionalProperties: true,
        properties: {
          saveVersion: { const: "1" },
          player: {
            type: "object",
            required: ["id", "level"],
            properties: {
              id: { type: "string", minLength: 1 },
              level: { type: "integer", minimum: 1 },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "schemas/v2.schema.json",
    content: `${JSON.stringify(
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        required: ["saveVersion", "player", "progress"],
        additionalProperties: true,
        properties: {
          saveVersion: { const: "2" },
          player: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string", minLength: 1 } },
          },
          progress: {
            type: "object",
            required: ["level"],
            properties: { level: { type: "integer", minimum: 1 } },
          },
        },
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "migrations/1-to-2.json",
    content: `${JSON.stringify(
      {
        description: "Move player level into the progress object.",
        operations: [
          {
            op: "rename",
            from: "/player/level",
            path: "/progress/level",
          },
        ],
      },
      null,
      2,
    )}\n`,
  },
  {
    path: "saves/player-one.v1.json",
    content: `${JSON.stringify(
      {
        saveVersion: "1",
        player: {
          id: "player-one",
          level: 7,
        },
      },
      null,
      2,
    )}\n`,
  },
];

export async function scaffoldProject(targetDirectory: string, force = false): Promise<string[]> {
  const root = path.resolve(targetDirectory);
  const written: string[] = [];
  for (const file of files) {
    const output = path.join(root, file.path);
    await mkdir(path.dirname(output), { recursive: true });
    try {
      await writeFile(output, file.content, {
        encoding: "utf8",
        flag: force ? "w" : "wx",
      });
      written.push(output);
    } catch (error) {
      throw new SaveCompatError(
        "SCAFFOLD_WRITE_FAILED",
        `Could not create ${output}: ${errorMessage(error)}${force ? "" : " (use --force to replace SaveCompat scaffold files)"}`,
        output,
      );
    }
  }
  return written;
}
