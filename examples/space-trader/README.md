# Space Trader compatibility corpus

This fictional game demonstrates two sequential save migrations:

- v1 → v2 splits progression from the player record, coerces numeric strings, normalizes inventory stacks, and adds settings.
- v2 → v3 renames progression and wallet fields, maps difficulty labels, and adds format metadata.

The corpus deliberately contains two v1 saves, one v2 save, and one already-current v3 save. Every
fixture must validate against its original schema, reach v3, validate after every migration step, and
preserve player identity, world seed, and experience.

Run it from the repository root:

```bash
npm run build
node dist/cli.js doctor --config examples/space-trader/savecompat.config.json
node dist/cli.js check --config examples/space-trader/savecompat.config.json --report site/index.html
```
