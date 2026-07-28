# Contributing

Thanks for helping games preserve player progress.

## Setup

```bash
git clone https://github.com/KanadeK/savecompat.git
cd savecompat
npm ci
npm run check
```

Use Node.js 20 or newer. The project is ESM TypeScript and uses Vitest, ESLint, Prettier, Ajv, and
tsup.

## Before opening a pull request

1. Start from an issue for substantial DSL or config changes.
2. Keep the deterministic core independent of game engines and networks.
3. Add a regression test for every behavior change.
4. Update `docs/MIGRATION_DSL.md` when an operation changes.
5. Add or update an anonymized example fixture when user-visible behavior changes.
6. Run `npm run release:check`.
7. Describe the player-progress risk the change prevents or introduces.

## Commits

Use concise Conventional Commits:

```text
feat: add keyed object-map migration
fix: preserve zero-valued enum mappings
docs: explain pre-schema imports
test: cover duplicate entity IDs
```

## Adding a migration operation

An operation is not complete until it has:

- a typed shape in `src/types.ts`;
- validation in `src/config.ts`;
- deterministic execution and explicit errors in `src/operations.ts`;
- success, no-op, missing-path, and invalid-value tests;
- documentation and a JSON example;
- a clear answer for conflicts, optional paths, arrays, and data loss.

Avoid operations that execute arbitrary code, read the environment, or depend on time/randomness.

## Fixtures

Never contribute commercial game saves without permission. Synthetic fixtures are preferred. If a
real save is necessary, remove player/account identity, chat, purchase data, tokens, and proprietary
content.

## Pull request review

Review prioritizes:

1. no silent player-data loss;
2. deterministic results;
3. backward-compatible config behavior;
4. actionable diagnostics;
5. test and documentation completeness.

See [Code of Conduct](CODE_OF_CONDUCT.md) and [Security](SECURITY.md).
