# Milestones

## v1.0 Auto-Discover Behave Projects (Shipped: 2026-04-16)

**Phases completed:** 3 phases, 6 plans, 11 tasks

**Key accomplishments:**

- Stateless `configParser.ts` module with hand-rolled INI parser and smol-toml TOML parser, reading all 5 behave config formats in priority order and resolving feature paths as `vscode.Uri`
- 12-test Mocha suite covering all 5 behave config formats, path resolution, edge cases, multi-path, and priority order — status: checkpoint pending human verification
- One-liner:
- Discovery results surfaced via output channel log (source, config file, features directory), fire-and-forget warning notification with Open Config File/Open Settings buttons, and Problems panel diagnostics — with package.json descriptions reframed as override-only
- example-projects/config-only/

---
