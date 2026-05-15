---
phase: 22
slug: cleanup-integration-docs
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
audited: 2026-05-12
auditor: gsd-nyquist-auditor
mode: state-B-reconstruct
---

# Phase 22 — Validation Strategy (Cleanup, Integration & Docs)

Retroactive validation reconstruction. Phase 22 delivers a removal (CLEANUP-01),
an integration suite (TEST-07), and two documentation items (DOC-01, DOC-02).
No new runtime behavior is introduced beyond regression fixes surfaced by UAT.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Unit framework** | Mocha 9.2.2 + Sinon 21.0.1 |
| **Integration framework** | @vscode/test-electron 2.5.2 (real VS Code Extension Development Host) |
| **Compile** | `npm run compile-tests` (`tsc -p test/tsconfig.json`) |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:integration` |
| **Estimated runtime — unit** | ~13s (846 tests) |
| **Estimated runtime — integration** | ~7 min (20 suites) |
| **Lint** | `npx eslint src --ext ts` |

---

## Sampling Rate

- **After every task commit:** `npm run test:unit`
- **After every plan wave (test changes touched):** `npm run test:unit` AND targeted integration suite via `node scratch/runOneSuite.js "<suite-name>" <example-project-dir>` (scratch runners are gitignored; see 022-UAT.md for the pattern)
- **Before `/gsd-verify-work` and `/gsd-secure-phase`:** Full integration suite must be green
- **Max feedback latency:** ~15s (unit) / ~7 min (full integration)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------------|-----------|-------------------|--------|
| 22-01 | 01-cleanup | 1 | CLEANUP-01 | `getConfiguration("behave-vsc"` absent from settings/configuration/common/projectList runtime path; `getWithLegacyFallback` deleted; `legacyConfig` parameter removed from cleanup-target signatures; behavioral pin: legacy values are ignored at runtime | static + behavioral | `npm run test:unit -- --grep "phase 022 pins"`, `npm run test:integration` (migration-consent suite Test 0) | ✅ green |
| 22-02 | 02-integration-test | 2 | TEST-07 | Real VS Code Dev Host launches `migration-consent suite`; Test 0 cleanup-pin + Test 1 Case 1 silent + Test 2 Case 2 'Migrate & delete' + Test 3 Case 3 'Overwrite & delete' all pass | integration | `npm run test:integration` | ✅ green (4 passing) |
| 22-03a | 03-docs | 2 | DOC-01 | README has bullet #14 + "Migrating from `behave-vsc`" sub-section with v1.5.0 callout + three case outcomes + migrationMode code block + Recheck Migrations command reference | static (structural) | `npm run test:unit -- --grep "phase 022 pins"` | ✅ green |
| 22-03b | 03-docs | 2 | DOC-02 | `gs-behave-bdd.migrationMode` markdownDescription enumerates all four enum values, the case-3-always-prompt callout, and the Recheck Migrations reference; `gs-behave-bdd.completedMigrations` markdownDescription includes 'migration' token + scope semantics + Recheck Migrations | static (schema) | `npm run test:unit` (covered by `packageJsonSchema.test.ts` + `phase022Pins.test.ts`) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Post-UAT Regression-Fix Coverage

These were not part of original phase 22 requirements; they were surfaced and fixed during `/gsd-verify-work 22` and are covered by existing integration tests (also passing in the full UAT run):

| Fix | Integration coverage | Status |
|-----|---------------------|--------|
| `src/extension.ts` re-scan + rebuildProjectList in `configurationChangedHandler` | `project-switch suite > switch to beta and verify tree rebuilds`; `monorepo-scan suite > discoveryDepth=0 disables subdirectory scanning` | ✅ green |
| `src/migrations/consent.ts` D-18 cache reload restoration | `migrations suite > post-activation cache reflects both migrations` | ✅ green |
| Three `expectedResults.ts` `nodeCount` bumps (config-only / pyproject-config / malformed-config) | The respective suites' own mocha summaries | ✅ green |

---

## Wave 0 Requirements

Existing infrastructure covered every requirement. The audit added one new test file:

- ✅ `test/unit/phase022Pins.test.ts` — 10 structural pins for CLEANUP-01 / DOC-01 / DOC-02 anti-regression. No production code touched.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README prose reads well in GitHub render | DOC-01 | Aesthetics / readability; structural anchors already pinned by automation. Verbatim wording would be fragile. | Open `README.md` on GitHub or in a VS Code preview pane; verify bullet #14 and the "Migrating from `behave-vsc`" sub-section render coherently. |
| Settings UI rendering of `migrationMode` and `completedMigrations` descriptions | DOC-02 | Schema is pinned in `package.json`; how VS Code renders the markdownDescription (line breaks, emphasis, hyphenation) is outside the extension's control. | Open VS Code Settings (Ctrl+,), search for `gs-behave-bdd.migrationMode` and `gs-behave-bdd.completedMigrations`; verify descriptions display all required tokens and read naturally. |
| `Behave BDD: Recheck Migrations` QuickPick UX | TEST-07 / CONSENT-09 | Unit tests cover the handler; integration tests drive the equivalent flow via `evaluateAllMigrations` + `runConsentFlow` directly. The QuickPick rendering itself is best-effort manual. | Open `example-projects/migration-stale` in VS Code (or any workspace with migrations done). Trigger "Behave BDD: Recheck Migrations" from the command palette. Verify QuickPick lists available scopes and the chosen scope's `completedMigrations` is cleared. |

---

## Sign-Off

- [x] All Phase 22 requirements have automated verification (846 unit + 4 integration-suite tests + 19 other integration suites all green)
- [x] No HIGH or MEDIUM gaps from the Nyquist auditor
- [x] Manual-only items are aesthetic / VS-Code-rendering / QuickPick UX — appropriately defaulted to human review
- [x] UAT regression fixes also covered by existing integration suites

**Validation status:** ✅ Nyquist-compliant.
