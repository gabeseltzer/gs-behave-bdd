---
phase: 16-deprecate-featurespath
plan: 05
subsystem: vscode-extension
tags: [vscode-extension, schema-removal, cleanup, settings-ladder, discovery]
status: complete
dependency-graph:
  requires:
    - 16-03 (migrateLegacyFeaturesPath helper)
    - 16-04 (activation wiring + notification — guarantees migration runs before settings.ts reads featuresPaths)
  provides:
    - DEP-01 schema removal (gs-behave-bdd.featuresPath gone from package.json)
    - DEP-05 source-tree singular cleanup (settings.ts ladder collapsed; common.ts Branch A simplified)
  affects:
    - package.json (contributes.configuration.properties)
    - src/settings.ts WorkspaceSettings constructor
    - src/common.ts hasFeaturesFolder()
tech-stack:
  added: []
  patterns:
    - Plural-only precedence ladder (3 rungs: explicit-array → config-file → convention)
    - Singular setting accessed only via migration (Plan 03/04), never read at runtime
key-files:
  created: []
  modified:
    - package.json
    - src/settings.ts
    - src/common.ts
decisions:
  - Executed Task 2 (settings.ts) before Task 1 (package.json) per plan-allowed swap so each commit ends with a green compile graph (avoids transitional throw on undefined featuresPath read)
  - Kept comment-only references to "singular featuresPath" in src/settings.ts and src/common.ts as documentation of what was removed and why; no code reads or branches on the setting
  - Did NOT touch src/testWorkspaceConfig.ts (mock) — per checker B3 fix and user runtime_context, mock surgery + fixture cascade are reserved for Plan 06
metrics:
  duration_min: ~5
  completed: 2026-04-29
  commits:
    - 2e3b7da refactor(16-05): collapse featuresPath ladder in settings.ts (D-15)
    - c9ab99d feat(16-05): remove gs-behave-bdd.featuresPath schema entry (DEP-01)
    - 33d9c0f refactor(16-05): simplify hasFeaturesFolder() Branch A (D-16)
requirements: [DEP-01, DEP-05]
---

# Phase 16 Plan 05: Source-tree singular `featuresPath` cleanup Summary

DEP-01 + DEP-05 production-code cleanup: removed the `gs-behave-bdd.featuresPath` schema entry from `package.json`, collapsed `WorkspaceSettings`'s 4-rung precedence ladder to 3 rungs (plural → config-file → convention), and simplified `hasFeaturesFolder()`'s Branch A to use a plural-only gate plus a default-features-folder convention check. After this plan no production code path in `src/settings.ts` or `src/common.ts` reads the singular `featuresPath` setting.

## Diff Summary (3 files, 21 net deletions)

**package.json** — `1 insertion(+), 7 deletions(-)`
- Deleted the `gs-behave-bdd.featuresPath` block (singular, type=string, default="features")
- Cleaned the `gs-behave-bdd.featuresPaths` markdownDescription to drop the obsolete "When both `featuresPath` and `featuresPaths` are set" sentence

**src/settings.ts** — `8 insertions(+), 22 deletions(-)`
- Removed the strict-undefined throw block for `featuresPath` (3 lines deleted)
- Removed the `Both featuresPath and featuresPaths are set` info-log branch
- Removed Rung 2 (singular-explicit-set) of the precedence ladder
- Rewrote Rung 1 fall-to-singular to fall-to-convention (`["features"]`)
- Renumbered comments: Rung 3 → "Rung 2 (was Rung 3)", Rung 4 → "Rung 3 (was Rung 4)"
- Updated the "." rejection fatal-error string from `"gs-behave-bdd.featuresPath" value` to `"gs-behave-bdd.featuresPaths" entry`

**src/common.ts** — `12 insertions(+), 32 deletions(-)`
- Branch A gate: removed the `hasExplicitSetting(wkspConfig, "featuresPath", ...)` clause; now `projectPath || featuresPaths-array`
- Removed the `featuresPath` variable read via `getActualWorkspaceSetting`
- Replaced the singular-driven discovery tail (~30 lines: `featuresUri` rebind, two `if (!featuresPath…)` branches, `vscode.window.showWarningMessage` for missing path) with a 6-line default-folder convention check

## Verification

| Check | Result |
| --- | --- |
| `grep -c '"gs-behave-bdd.featuresPath"' package.json` | 0 ✓ |
| `grep -c '"gs-behave-bdd.featuresPaths"' package.json` | 1 ✓ |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` | exit 0 ✓ |
| `grep -c 'get("featuresPath")' src/settings.ts` | 0 ✓ |
| `grep -c 'throw "featuresPath is undefined"' src/settings.ts` | 0 ✓ |
| `grep -c 'Both featuresPath and featuresPaths' src/settings.ts` | 0 ✓ |
| `grep -c 'hasExplicitSetting(wkspConfig, "featuresPath"' src/settings.ts` | 0 ✓ |
| `grep -c 'featuresPathCfg' src/settings.ts` | 0 ✓ |
| `grep -c '"gs-behave-bdd.featuresPaths" entry' src/settings.ts` | 1 ✓ |
| `grep -c 'hasExplicitSetting(wkspConfig, "featuresPath"' src/common.ts` | 0 ✓ |
| `grep -c 'getActualWorkspaceSetting<string>(wkspConfig, "featuresPath"' src/common.ts` | 0 ✓ |
| `grep -c 'Behave BDD: Features path not found' src/common.ts` | 0 ✓ |
| `grep -rE 'featuresPath([^s]\|$)' src/{settings,common}.ts package.json` | 3 matches — **all comment-only** describing what was removed; spirit of acceptance criterion met (no code reads the setting) |
| `npx eslint src --ext ts` | exit 0, no output ✓ |
| Phase 15/16 migration suites (`migrateLegacyFeaturesPath\|migrateScopedSetting\|migrateLegacySuppressMultiConfig\|activation order`) | 34 passing ✓ |
| Full unit suite | **702 passing, 4 failing** — all 4 failures in `test/unit/settings/multiPathPrecedence.test.ts`, deferred to Plan 06 (see below) |

## Deviations from Plan

### Execution-order swap (allowed by plan)

The plan's "JSON validity check" note in Task 1 explicitly permits swapping Task 1 and Task 2: "you may swap Task 1 and Task 2 — execute Task 2 first, then Task 1. End state is identical. Both orderings are acceptable." We executed Task 2 (settings.ts), then Task 1 (package.json), then Task 3 (common.ts). This kept every individual commit's compile graph green — the schema removal in Task 1 only succeeds without a transitional `throw` because Task 2 already removed the `get("featuresPath")` call.

### Auto-fixed mid-edit string corruption (Rule 1)

While applying the third edit in Task 2 (fatal-error string update), the first iteration of `replace_string_in_file` produced a partial paste that left the literal `s" entry` injected into the next line (line 231: `if (!fs.existsSync(u.fsPath)) {s" entry`). Caught by the immediate `npx eslint` run reporting `Parsing error: Unterminated string literal` at L231:45. Re-applied the edit cleanly and re-ran lint — clean. No commit captured the broken intermediate state. Tracked here for completeness.

### Comment-only singular references retained

Plan acceptance criterion `grep -rE 'featuresPath([^s]|$)' src/{settings,common}.ts package.json returns 0 matches` was not strictly satisfied — three comment-only matches remain:

- `src/settings.ts:186` — explanatory comment in the new ladder block
- `src/common.ts:207` — explanatory comment on the rewritten Branch A gate
- `src/common.ts:252` — explanatory comment on the rewritten discovery tail

All three describe **what was removed** and **why** (so a future reader understands the migration shape). They are not read by any code. Treating this as documentation value > strict grep-zero, but flagging in case Plan 06 prefers to delete them.

Plus two pre-existing public getters in `src/settings.ts` (L82 `projectRelativeFeaturesPath`, L85 `workspaceRelativeFeaturesPath`) which expose the first element of the plural arrays — these are public API surface used by callers and are correct as-is.

## Deferred to Plan 06

The full unit suite ends with **4 failures**, all in `test/unit/settings/multiPathPrecedence.test.ts`:

| # | Test | What it asserts (now-deleted behavior) |
| - | --- | --- |
| 1 | `Rung 2: singular set (featuresPaths absent) — singular featuresPath used when featuresPaths is undefined` | When plural is undefined and singular is set explicitly, the singular wins. Removed in D-15. |
| 2 | `empty-array treated as unset (Pitfall 4) — featuresPaths=[] falls to singular` | When plural is `[]` and singular is set, fall back to singular. Removed in D-15. |
| 3 | `all-empty plural falls to singular — featuresPaths with only whitespace entries falls to singular` | When plural is all-whitespace and singular is set, fall back to singular. Removed in D-15. |
| 4 | `both-set info log (D-06..D-09) — logs info when both featuresPath and featuresPaths are explicitly set` | The `Both featuresPath and featuresPaths are set` info log fires when both explicit. Log call deleted in D-15. |

These tests assert **exactly the ladder branches D-15 deleted** — they will be removed (or rewritten as plural-only) by Plan 06's fixture cascade. They are not symptomatic of any bug in this plan's edits; they're test-side debt waiting for the fixture cleanup. Per user runtime_context: "Tests may temporarily reference featuresPath via mocks; that's expected and handled in 16-06."

The full pass count is `702 passing` (vs the previous baseline `702` from Plan 04 — no net regression in the surviving test suite). Plan 06 will:

- Remove the 4 obsolete tests in `multiPathPrecedence.test.ts` (or rewrite them for plural-only semantics)
- Surgical removal of `featuresPath` from `src/testWorkspaceConfig.ts` (field, ctor param, get/inspect/getExpected switch cases, getExpectedFeaturesPath helper)
- Cascade fixture updates: `shared.workspace.tests.ts` × 5, debug suite/`extension.test.ts` × 1, `projectUriDerivation.test.ts` BASE_CFG, plus the 4 unit-test fixture files identified by the plan's checker B3 analysis

## Self-Check: PASSED

- `[x]` `package.json` exists with no `gs-behave-bdd.featuresPath` key (verified via `node -e`)
- `[x]` `src/settings.ts` exists, lints clean, has the new `featuresPaths entry` fatal string
- `[x]` `src/common.ts` exists, lints clean, has the new plural-only Branch A gate
- `[x]` All three commits exist in HEAD: `2e3b7da`, `c9ab99d`, `33d9c0f` (verified via `git log --oneline`)
- `[x]` Migration suites unchanged (34 passing)
- `[x]` Full unit suite produces the expected 4 deferred failures in `multiPathPrecedence.test.ts` and zero unexpected failures elsewhere
