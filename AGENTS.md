# Repository instructions

## Invariants

- Never make `migrate` write by default.
- Keep migrations deterministic and free of network, clock, randomness, environment, and arbitrary
  code execution.
- Validate the source and every intermediate target schema.
- Do not weaken a preservation rule merely to make a fixture pass.
- Preserve JSON Pointer prototype-pollution guards and HTML escaping.
- In-place writes must create a backup before replacement.

## Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run smoke
npm run release:check
```

The final acceptance command is `npm run release:check`.

## Changes

- Use `apply_patch` for source and documentation edits.
- Add tests and DSL docs with every migration-operation change.
- Keep example saves synthetic or anonymized.
- Use Conventional Commits.
