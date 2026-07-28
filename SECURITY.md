# Security policy

## Supported versions

| Version          | Supported |
| ---------------- | --------- |
| 0.1.x            | Yes       |
| Earlier previews | No        |

## Reporting a vulnerability

Please use GitHub's private **Security → Report a vulnerability** flow. Do not open a public issue
for a vulnerability that could expose save data, overwrite files unexpectedly, execute code, or
bypass JSON Pointer safety.

Include:

- affected SaveCompat version and operating system;
- the smallest synthetic config, migration, and save that reproduce the issue;
- expected and actual behavior;
- whether a write flag was used; and
- any evidence of data exposure or loss.

Maintainers should acknowledge a report within seven days and avoid publishing identifying save
data in the eventual advisory.

## Data handling

SaveCompat runs locally and performs no telemetry or network requests. It may still process
sensitive game data supplied by the user.

- Anonymize player IDs, account IDs, display names, chat, and purchase records before committing
  fixtures.
- Prefer synthetic or consented saves.
- Never place secrets in migration documents, schemas, reports, or CI artifacts.
- Treat generated HTML and JSON reports as sensitive if their fixtures were sensitive.
- Limit CI artifact retention when using private player data.

## Write safety

`migrate` previews by default. `--out` refuses to overwrite unless `--force` is explicit.
`--in-place` creates a timestamped sibling backup before replacing through an atomic rename.

These controls reduce risk but are not a substitute for the game's own backups and test environment.
Never run a new migration for the first time against the only copy of a production save.

## Untrusted input

Migration JSON is data, not executable code. JSON Pointer segments associated with JavaScript
prototype pollution are rejected. Report text is HTML-escaped. Remote JSON Schema references are not
fetched by SaveCompat.

Denial-of-service through extremely large or deeply nested JSON is not yet specially mitigated; use
normal filesystem and CI limits when processing untrusted uploads.
