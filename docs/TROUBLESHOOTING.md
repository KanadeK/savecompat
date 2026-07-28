# Troubleshooting and repair flow

Do not bypass a failed compatibility check. Reduce it to one fixture, repair the smallest responsible
layer, and then rerun the full corpus.

## Standard repair loop

```bash
# 1. Verify project wiring.
savecompat doctor --config savecompat.config.json

# 2. Reproduce only the failing save.
savecompat check "test/saves/failing-save.json" \
  --config savecompat.config.json

# 3. Preview the exact partial migration and semantic changes.
savecompat migrate test/saves/failing-save.json \
  --config savecompat.config.json

# 4. After editing the schema, migration, or fixture, rerun the single file.
savecompat check "test/saves/failing-save.json" \
  --config savecompat.config.json

# 5. Rerun the whole corpus and repository acceptance.
savecompat check --config savecompat.config.json \
  --report savecompat-report.html
npm run release:check
```

Repair the migration when shipped data is valid but its transform is wrong. Repair a schema when the
game genuinely shipped a value the schema omitted. Repair a fixture only when it is malformed,
synthetic, or not representative of a shipped save.

## Diagnostic codes

| Code                       | Meaning                                                      | Repair                                                                            |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `INVALID_CONFIG`           | Required config field has the wrong shape                    | Compare against `schema/savecompat.config.schema.json`; run `doctor`              |
| `NO_FIXTURES`              | Fixture globs matched no files                               | Remember globs are relative to the config file; quote shell globs                 |
| `INVALID_JSON`             | Config, schema, migration, or save is not JSON               | Validate commas, quotes, and encoding; reproduce with the named file              |
| `SCHEMA_READ_FAILED`       | A schema path cannot be read                                 | Correct the relative path and filename case                                       |
| `SCHEMA_COMPILE_FAILED`    | JSON Schema itself is invalid                                | Validate the schema dialect and local `$ref` usage                                |
| `LATEST_SCHEMA_MISSING`    | No schema exists for `latestVersion`                         | Add the target schema or correct the version                                      |
| `AMBIGUOUS_MIGRATION`      | A version has two outgoing migrations                        | Keep one deterministic upgrade edge or introduce an explicit intermediate version |
| `MIGRATION_CYCLE`          | The graph returns to a visited version                       | Correct the `from`/`to` chain                                                     |
| `MIGRATION_GAP`            | A shipped version cannot reach the latest                    | Add every missing migration edge and fixture                                      |
| `VERSION_MISSING`          | Save lacks the configured version field                      | Correct `versionPath` or add a pre-version import step outside SaveCompat         |
| `SCHEMA_VALIDATION_FAILED` | Source or intermediate output violates its version schema    | Read the diagnostic path; decide whether schema or operation is wrong             |
| `MISSING_SOURCE`           | `rename`/`copy` source is absent                             | Correct the pointer; use `optional` only when absence is genuinely valid          |
| `TARGET_CONFLICT`          | `rename`/`copy` would overwrite data                         | Pick `keep-target`/`overwrite` deliberately or migrate into a distinct field      |
| `COERCE_FAILED`            | Legacy value cannot be converted safely                      | Add a separate enum mapping or reject the corrupt save; do not silently truncate  |
| `UNKNOWN_ENUM_VALUE`       | A shipped label lacks a mapping                              | Add the real label and a test fixture, or intentionally enable passthrough        |
| `PRESERVATION_FAILED`      | Critical progress changed or disappeared                     | Fix operation order/pointers; never weaken the rule merely to make CI green       |
| `WRITE_FAILED`             | Output exists, permissions fail, or backup cannot be created | Use a new `--out`, add `--force` intentionally, or restore directory access       |

## A source schema rejects a real old save

1. Confirm the file came from the claimed game version.
2. Check `versionPath` and the version field.
3. Compare several saves from that release.
4. If the game really shipped the value, widen only that historical schema.
5. Keep the newest schema strict; the migration should normalize the legacy variation.
6. Add the discovered save shape as an anonymized regression fixture.

Do not set `validateSource: false` as a permanent shortcut. It exists for controlled imports of
pre-schema saves and removes evidence about whether the starting corpus is well-defined.

## A target schema fails after an operation

The diagnostic version identifies the failing step. Run `migrate` on one file and inspect operation
order. Common causes:

- renaming a parent before a child pointer was updated;
- coercing after a target schema already requires a number;
- using `set-default` at a child whose scalar parent blocks traversal;
- forgetting to normalize every item with `map-items`;
- leaving an old field when `additionalProperties` is `false`.

Fix the earliest wrong operation rather than adding a later cleanup that hides it.

## Preservation fails

Preservation compares the untouched original value at `from` with the final migrated value at `to`.
For fields renamed differently by source version, create one rule per source version:

```json
[
  {
    "label": "XP from v1",
    "fromVersion": "1",
    "from": "/player/xp",
    "to": "/progression/experience"
  },
  {
    "label": "XP from v2",
    "fromVersion": "2",
    "from": "/progress/xp",
    "to": "/progression/experience"
  }
]
```

If a value is intentionally converted (for example `"42"` to `42`), preserve a stable neighboring
identity and let the target schema prove the conversion. A future release will support typed
preservation comparators.

## Recovering an in-place migration

`--in-place` creates a sibling backup before replacement:

```text
campaign.json
campaign.json.2026-07-28T01-02-03-000Z.bak
```

If the game rejects the migrated file:

1. stop the game so it cannot rewrite the save;
2. keep the failed migrated file for diagnosis;
3. copy the `.bak` back to the original filename;
4. reproduce with `savecompat migrate` in preview mode;
5. fix and validate the migration before attempting another in-place write.

## Release-check failures

`npm run release:check` is the acceptance command.

| Failing phase          | Smallest rerun                                                                 | Normal fix                                                        |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Formatting             | `npm run format:check`                                                         | Run `npm run format`, review the diff                             |
| ESLint                 | `npm run lint`                                                                 | Fix the named rule; do not disable project-wide without rationale |
| TypeScript             | `npm run typecheck`                                                            | Fix the first type error and rerun                                |
| Unit/integration tests | `npm test -- --run <file>`                                                     | Repair implementation or expectation; add regression coverage     |
| Build                  | `npm run build`                                                                | Fix ESM imports, declarations, or packaging entry points          |
| CLI smoke              | `npm run smoke`                                                                | Run the printed CLI command directly                              |
| Corpus                 | `node dist/cli.js check --config examples/space-trader/savecompat.config.json` | Follow the standard repair loop                                   |
| Package manifest       | `npm run pack:dry`                                                             | Add required files to `files` or correct package metadata         |

After the smallest rerun passes, always rerun `npm run release:check`. A locally generated package or
report from a failed run must not be released.
