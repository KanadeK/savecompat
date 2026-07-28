# Opportunity research

Research date: 2026-07-28.

## Question

Is there room for a small open-source game tool that prevents save-format regressions without
duplicating established backup utilities, one-game editors, or engine frameworks?

## Evidence reviewed

- [Ludusavi](https://github.com/mtkennerly/ludusavi) is a mature cross-platform backup and restore
  utility covering thousands of games. It locates and protects player files; it does not validate a
  developer's version-to-version data model in CI.
- [UnrealSaveDumper](https://github.com/GMatrixGames/UnrealSaveDumper) inspects Unreal Engine
  `.sav` metadata and selected payloads. It is valuable but engine- and format-specific.
- [Roblox Data Stores Batch Processor CLI](https://github.com/Roblox/data-stores-batch-processor-cli)
  performs live bulk operations against Roblox data stores. Its scope is production datastore
  processing, not a local engine-agnostic fixture matrix.
- A [Godot save-system proposal](https://github.com/godotengine/godot-proposals/issues/12722)
  explicitly calls for format migration, post-migration validation, backups, logging, comparison,
  corruption simulation, and tests. This is evidence that save evolution remains a real developer
  concern rather than a solved UI problem.
- Public game repositories commonly implement migrations inside each game. For example,
  [NanoBotsIdle](https://github.com/deadronos/NanoBotsIdle) documents its own TypeScript migration
  chain and fixture tests. This validates the workflow but also shows the repeated project-local
  engineering SaveCompat can package.

GitHub repository searches were run for combinations of `game save migration compatibility`,
`game save schema migration tool`, `save compatibility testing`, and candidate project names. The
exact `savecompat` repository and npm package names were unclaimed at research time.

## Competitive boundary

| Category             | Typical strength                   | SaveCompat boundary                                                                         |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Save backup/restore  | Finds and protects player files    | Does not locate installed games; proves developer migration correctness                     |
| Per-game save editor | Understands one proprietary format | Uses developer-owned JSON schemas and stays game-agnostic                                   |
| Engine save plugin   | Integrates deeply with one runtime | Runs beside Godot, Unity, custom engines, or server games                                   |
| Database migrator    | Evolves tables or documents        | Adds game-specific corpus, progress preservation, entity-array diff, and HTML evidence      |
| Generic JSON Patch   | Standard primitive transformations | Adds version graph, safe defaults, coercion, per-item mapping, validation, and CI reporting |

## Chosen gap

No reviewed project combined all of these in one maintained, engine-agnostic CLI:

1. a repository-owned corpus of real old saves;
2. deterministic, reviewable migration documents;
3. source and per-step JSON Schema validation;
4. explicit preservation assertions for player progress;
5. stable game-entity diffs;
6. non-destructive migration output; and
7. a single-file report suitable for CI artifacts and GitHub Pages.

The claim is deliberately narrow: this research does not assert that no similar private or
unindexed tool exists.

## Why it can attract attention

- The one-line value is easy to demonstrate: “stop updates from eating player progress.”
- The live report and broken-fixture examples can be understood without installing a game engine.
- It serves both indie developers and engine/tool authors.
- JSON-first scope keeps the first release small while leaving adapter space for Godot resources,
  Unity JSON wrappers, SQLite exports, compressed containers, and custom decoders.
- CI failure evidence is naturally shareable in issues and pull requests.

## Deliberate non-goals

- Competing with Ludusavi on player backups.
- Reverse engineering proprietary or encrypted saves.
- Editing commercial game progress for cheating.
- Providing a visual shell without a tested migration engine.
- Executing arbitrary migration scripts downloaded from a repository.
