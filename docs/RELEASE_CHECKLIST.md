# Release checklist

## Code and compatibility

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run release:check` passes.
- [ ] The Space Trader corpus reports 4/4 fixtures passing.
- [ ] The HTML report opens without external network requests.
- [ ] `npm pack --dry-run` contains the CLI, library, declarations, config schema, README, and
      license.
- [ ] No real player identifiers, credentials, proprietary saves, or game assets are committed.

## Versioning

- [ ] `package.json`, `src/version.ts`, and `CHANGELOG.md` use the same version.
- [ ] The tag is exactly `v<package version>`.
- [ ] Breaking config or DSL changes receive a major version after 1.0.
- [ ] New operations include unit tests and DSL documentation.

## Repository

- [ ] Default branch is `main`.
- [ ] CI is green on Node 20, 22, and 24.
- [ ] GitHub Pages deployment is green.
- [ ] Topics, description, homepage, and license are visible.
- [ ] Release notes describe behavior, safety boundaries, and known limitations.

## Acceptance commands

```bash
npm ci
npm run release:check
git status --short
git tag --points-at HEAD
```

If any command fails, follow [Troubleshooting](TROUBLESHOOTING.md), fix the failure, and restart the
checklist. Do not create or move the release tag around a failing commit.
