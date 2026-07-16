# Roadmap: Auto-Discover Behave Projects

## Milestones

- ✅ **1.0.0 Auto-Discover Behave Projects** — Phases 1-3 (shipped 2026-04-16)
- ✅ **1.1.0 Config File Watching** — Phases 4-6 (shipped 2026-04-17)
- ✅ **1.2.0 Multi-Path & Monorepo-Aware Discovery** — Phases 7-11 (shipped 2026-04-22)
- ✅ **1.3.0 Project Switching** — Phases 12-14 (shipped 2026-04-23)
- ✅ **v1.4.0 Deprecate featuresPath & Notification Suppression** — Phases 15-18 (shipped 2026-05-04)
- ✅ **v1.5.0 Migration Consent & `behave-vsc` Cleanup** — Phases 19-23 (shipped 2026-05-15)
- 🚧 **v1.6.0 execute_steps IDE Support** — Phases 24-27 (in progress)
- 📋 **v1.7.0** — TBD (next milestone — duplicate-scenario detection rework)

## Phases

<details>
<summary>✅ 1.0.0 Auto-Discover Behave Projects (Phases 1-3) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Config Parsing (2/2 plans) — completed 2026-04-15
- [x] Phase 2: Integration (2/2 plans) — completed 2026-04-15
- [x] Phase 3: UX & Verification (2/2 plans) — completed 2026-04-16

Archive: [milestones/1.0.0-ROADMAP.md](milestones/1.0.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.1.0 Config File Watching (Phases 4-6) — SHIPPED 2026-04-17</summary>

- [x] Phase 4: Watcher & Run Guard (2/2 plans) — completed 2026-04-16
- [x] Phase 5: Integration Verification (5/5 plans) — completed 2026-04-17
- [x] Phase 6: 1.1.0 Tech Debt & Admin Cleanup (2/2 plans) — completed 2026-04-17

Archive: [milestones/1.1.0-ROADMAP.md](milestones/1.1.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.2.0 Multi-Path & Monorepo-Aware Discovery (Phases 7-11) — SHIPPED 2026-04-22</summary>

- [x] Phase 7: Internal Multi-Path Types (3/3 plans) — completed 2026-04-20
- [x] Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration (3/3 plans) — completed 2026-04-21
- [x] Phase 9: Subdirectory Config Scan (3/3 plans) — completed 2026-04-21
- [x] Phase 10: `featuresPaths` User-Facing Settings Key (1/1 plans) — completed 2026-04-21
- [x] Phase 11: UX Polish + Regression Hardening (3/3 plans) — completed 2026-04-21

Archive: [milestones/1.2.0-ROADMAP.md](milestones/1.2.0-ROADMAP.md)

</details>

<details>
<summary>✅ 1.3.0 Project Switching (Phases 12-14) — SHIPPED 2026-04-23</summary>

- [x] Phase 12: Project List Discovery & Persistence (2/2 plans) — completed 2026-04-23
- [x] Phase 13: Switching UX (Quick-Pick & Status Bar) (2/2 plans) — completed 2026-04-23
- [x] Phase 14: Rebuild, Integration Testing & Documentation (3/3 plans) — completed 2026-04-23

Archive: [milestones/v1.3.0-ROADMAP.md](milestones/v1.3.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.4.0 Deprecate featuresPath & Notification Suppression (Phases 15-18) — SHIPPED 2026-05-04</summary>

- [x] Phase 15: Notification Suppression Infrastructure (6/6 plans) — completed 2026-04-27
- [x] Phase 16: Deprecate featuresPath (6/6 plans) — completed 2026-04-29
- [x] Phase 17: Cross-Cutting Verification (3/3 plans) — completed 2026-04-30
- [x] Phase 18: Tech debt closure — artifact rollups + mock cleanup (2/2 plans) — completed 2026-05-04

Archive: [milestones/v1.4.0-ROADMAP.md](milestones/v1.4.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.5.0 Migration Consent & `behave-vsc` Cleanup (Phases 19-23) — SHIPPED 2026-05-15</summary>

- [x] Phase 19: Migration Foundation (4/4 plans) — completed 2026-05-07
- [x] Phase 20: Migration Registry (5/5 plans) — completed 2026-05-08
- [x] Phase 21: Consent UX (Case 2 & Case 3 Prompts) (3/3 plans) — completed 2026-05-11
- [x] Phase 22: Cleanup, Integration & Docs (3/3 plans) — completed 2026-05-12
- [x] Phase 23: Migrations Panel (Webview) (5/5 plans) — completed 2026-05-14

Archive: [milestones/v1.5.0-ROADMAP.md](milestones/v1.5.0-ROADMAP.md)
Audit: [milestones/v1.5.0-MILESTONE-AUDIT.md](milestones/v1.5.0-MILESTONE-AUDIT.md)

</details>

### 🚧 v1.6.0 execute_steps IDE Support (Phases 24-27) — IN PROGRESS

- [ ] **Phase 24: Scanner + Mapping Funnel** - Discover execute_steps call sites across watched `.py` files and union them into reference-counting mappings
- [ ] **Phase 25: Validation Diagnostics** - Problems-pane diagnostics for invalid/unmatched embedded steps, live-tracking the document
- [ ] **Phase 26: Go-to-Definition** - Ctrl+click/F12 navigation from embedded steps to their step-definition function
- [ ] **Phase 27: Integration Tests, Fixture & Docs** - End-to-end integration suite, dedicated fixture, and user-facing documentation

## Phase Details

### Phase 24: Scanner + Mapping Funnel

**Goal**: Execute_steps call sites are discovered across every `.py` file the extension already watches, and those call sites are unioned into the existing step-mapping data so reference counting "falls out" of the union with zero consumer-side changes.
**Depends on**: Nothing new — builds on existing `fileParser`/`stepMappings` infrastructure from prior milestones (first phase of v1.6.0)
**Requirements**: REFS-01, REFS-02, REFS-03, REFS-04
**Success Criteria** (what must be TRUE):

  1. Step-definition CodeLens reference count includes execute_steps call sites that reference that step
  2. "Find All Step References" tree view lists execute_steps call sites grouped by their containing `.py` file, with working click-through navigation
  3. Native Find All References (invoked from a step definition or a feature step) includes execute_steps call-site locations
  4. A workspace with zero execute_steps calls shows unchanged mapping counts, unchanged diagnostics, and passes every pre-existing test suite unmodified**Plans**: 3 plans

**Wave 1**

- [x] 24-01-PLAN.md — execute_steps call-site scanner (scanExecuteSteps + cached parseExecuteStepsFileContent + keyword regex)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 24-02-PLAN.md — mapping funnel (parallel executeStepsMappings array, rebuild, union point, lookup/live-match helpers, REFS-04 guard)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 24-03-PLAN.md — parse-cycle wiring (scan allPyFiles + per-workspace rebuild in initial-parse and debounced paths)

### Phase 25: Validation Diagnostics

**Goal**: Users see Problems-pane diagnostics for embedded steps that would fail at runtime, with zero false positives on dynamic or unparseable content, updating live as they type.
**Depends on**: Phase 24 (scanner + mapping foundation)
**Requirements**: VALID-01, VALID-02, VALID-03, VALID-04, VALID-05, VALID-06, VALID-07, VALID-08
**Success Criteria** (what must be TRUE):

  1. An embedded step line inside `execute_steps()` that matches no step definition shows a Warning diagnostic (`execute-steps-step-not-found`)
  2. A line inside the execute_steps string that is not valid step content (`@tag`, `Scenario:`, junk) shows an Error diagnostic (`execute-steps-invalid-content`)
  3. Dynamic strings (f-strings, variable args, concatenation, unterminated strings) produce zero diagnostics — skip means emit nothing
  4. Diagnostics track the live document while typing (not the debounced cache), clearing when the step is fixed, on open, and when step definitions change in other files
  5. `.format(...)`/`%`-formatted literals, `And`/`But`/`*` steps (resolved to previous step type, never flagged when inheriting from Background), docstrings, table rows, comments, and blank lines are matched or skipped correctly across every `.py` file the extension enumerates — never falsely flagged

**Plans**: TBD

### Phase 26: Go-to-Definition

**Goal**: Users can jump from an embedded step inside an execute_steps string straight to its Python step-definition function, the same way they already can from feature-file steps.
**Depends on**: Phase 24 (scanner + mapping foundation); parallel-safe with Phase 25
**Requirements**: NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):

  1. Ctrl+click / F12 on an embedded step line inside an execute_steps string jumps to the matching step definition's function
  2. The click target (`originSelectionRange`) is exactly the embedded step-text span — not the quotes, indentation, or surrounding code
  3. Positions outside execute_steps step text produce no provider contribution, leaving Pylance's own Python definitions unaffected

**Plans**: TBD

### Phase 27: Integration Tests, Fixture & Docs

**Goal**: The full execute_steps feature is proven end-to-end in real VS Code and documented for users, closing out the milestone.
**Depends on**: Phase 24, Phase 25, Phase 26
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):

  1. A new `example-projects/execute-steps/` fixture and integration suite drive the definition provider, reference provider, CodeLens provider, and `languages.getDiagnostics` end-to-end, including a live-edit staleness test
  2. Unit-suite coverage across the scanner edge-case checklist, mapping rebuild/union (including a regression guard that `getStepMappings()` excludes execute_steps rows), diagnostics, and the definition provider is complete and passing (shipped incrementally in Phases 24-26; confirmed complete here)
  3. README, AI_INSTRUCTIONS.md, and CHANGELOG document the feature and its known limitations (English keywords only; dynamic strings unsupported; `.py` outside watched roots not scanned)

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 24. Scanner + Mapping Funnel | 1/3 | In Progress|  |
| 25. Validation Diagnostics | 0/? | Not started | - |
| 26. Go-to-Definition | 0/? | Not started | - |
| 27. Integration Tests, Fixture & Docs | 0/? | Not started | - |
