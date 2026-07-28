# Roadmap

## 0.2

- Typed preservation comparators, such as numeric-string equality and monotonic progress.
- `doctor --json` for editor integrations.
- SARIF output for inline CI annotations.
- Include/exclude fixture metadata and expected-failure corrupt-save cases.

## 0.3

- Adapter API for compressed or containerized saves without coupling the core to an engine.
- Official Godot JSON/resource adapter example.
- Official Unity JSON wrapper example.
- Migration coverage view showing which versions and operations each fixture exercises.

## 1.0 criteria

- Stable config and DSL schemas with documented deprecation rules.
- Windows, macOS, and Linux release verification.
- Large-corpus streaming and bounded concurrency.
- External security review of pointer mutation and file replacement.
- At least two real open-source games using SaveCompat in CI.

## Non-goals

- Player cheating or unlock editors.
- Automatic discovery/backup of installed game saves.
- Remote execution of arbitrary migration scripts.
- Proprietary format reverse engineering inside the core package.
