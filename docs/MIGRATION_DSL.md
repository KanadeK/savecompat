# Migration DSL

Migration documents are ordered JSON operations. They do not execute JavaScript and cannot access
the network, environment, or filesystem.

```json
{
  "description": "Human-readable release note",
  "operations": [{ "op": "set-default", "path": "/settings/autosave", "value": true }]
}
```

SaveCompat applies operations in listed order and then writes the migration reference's `to` value
at the configured `versionPath`. The result must validate against the target version's schema.

## Paths

`path` and `from` use [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901):

- `/player/xp` addresses `save.player.xp`.
- `/inventory/0/id` addresses the first inventory item's `id`.
- `~1` represents `/` inside a key; `~0` represents `~`.
- `-` appends when writing to an array.
- Intermediate objects and arrays are created when that is unambiguous.
- Writes through a scalar and array index gaps fail.
- Root replacement and root deletion are intentionally unsupported.

The segments `__proto__`, `prototype`, and `constructor` are rejected.

## Common fields

Most operations accept:

| Field      | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| `op`       | Operation name                                                     |
| `path`     | Target JSON Pointer                                                |
| `optional` | If `true`, a missing source/target becomes a no-op where supported |

`rename` and `copy` also accept `onConflict`:

- `error` (default): stop if the target already exists;
- `keep-target`: keep the target; `rename` still removes its source;
- `overwrite`: replace the target.

Explicit conflict behavior prevents a migration from silently replacing newer player data.

## `set-default`

Adds a cloned value only when the path does not exist.

```json
{
  "op": "set-default",
  "path": "/settings",
  "value": { "difficulty": "normal", "autosave": true }
}
```

Use this for new fields with safe defaults. It never overwrites an existing value, including
`null`.

## `set`

Creates or replaces a value.

```json
{ "op": "set", "path": "/metadata/format", "value": "v3" }
```

Use this only when replacement is intentional and covered by preservation tests.

## `rename`

Moves a value and removes its old path.

```json
{
  "op": "rename",
  "from": "/player/xp",
  "path": "/progress/experience"
}
```

A missing source or existing target fails unless the operation explicitly permits it.

## `copy`

Copies a value while keeping the source.

```json
{
  "op": "copy",
  "from": "/world/seed",
  "path": "/metadata/originalSeed"
}
```

The copied JSON value is structurally cloned.

## `delete`

Removes a field or array item.

```json
{ "op": "delete", "path": "/debugState", "optional": true }
```

Deleting an absent path fails unless `optional` is true. Treat deletion as data loss: explain it in
the migration description and add preservation rules for adjacent progress.

## `coerce`

Converts conservative serialized primitive forms:

```json
{ "op": "coerce", "path": "/wallet/credits", "to": "integer" }
```

Targets:

| Target    | Accepted input                                          |
| --------- | ------------------------------------------------------- |
| `string`  | non-object primitive                                    |
| `number`  | finite number or non-empty numeric string               |
| `integer` | integer or base-10 integer string                       |
| `boolean` | boolean, `0`, `1`, `"true"`, `"false"`, `"0"`, or `"1"` |

Lossy inputs such as `"2.5"` to integer, `"yes"` to boolean, arrays, and objects fail.

## `clamp`

Bounds a finite number:

```json
{ "op": "clamp", "path": "/health", "min": 0, "max": 100 }
```

At least one of `min` or `max` is required. If legacy values are strings, run `coerce` first.

## `map-enum`

Maps old labels to new labels:

```json
{
  "op": "map-enum",
  "path": "/difficulty",
  "values": {
    "easy": "story",
    "normal": "standard",
    "hard": "veteran"
  }
}
```

Unknown values fail. Set `"passthrough": true` only when the target schema intentionally accepts
unlisted future values.

## `ensure-array`

Normalizes a field into an array:

```json
{ "op": "ensure-array", "path": "/achievements", "mode": "wrap" }
```

- Missing path: creates `[]`.
- Existing array: no-op.
- `wrap` (default): converts a scalar/object to `[value]`.
- `empty`: replaces a non-array value with `[]`; use carefully because it discards data.

## `map-items`

Applies nested operations to each array item. Nested paths are relative to the item:

```json
{
  "op": "map-items",
  "path": "/inventory",
  "operations": [
    { "op": "coerce", "path": "/qty", "to": "integer" },
    { "op": "clamp", "path": "/qty", "min": 0 },
    { "op": "rename", "from": "/qty", "path": "/quantity" }
  ]
}
```

Every item must be an object or array. Operations run item by item, in order. A failure stops the
whole fixture; no file is written.

## Version graph

The config currently requires one unambiguous forward path:

```json
[
  { "from": "1", "to": "2", "file": "migrations/1-to-2.json" },
  { "from": "2", "to": "3", "file": "migrations/2-to-3.json" }
]
```

`doctor` rejects duplicate outgoing edges, cycles, and any schema version that cannot reach
`latestVersion`.

## Review checklist for a migration

1. Add the old and new schemas.
2. Add at least one anonymized fixture from the old version.
3. Add the migration reference and document.
4. Add preservation rules for identity, progression, unlocks, world seed, and paid currency where
   applicable.
5. Run `savecompat migrate fixture.json` and inspect every semantic change.
6. Run `savecompat check --report savecompat-report.html`.
7. Open the report and confirm expected changes.
8. Run the repository's full release acceptance command.
