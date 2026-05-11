---
phase: 019-migration-foundation
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - src/discovery/projectList.ts
  - src/extension.ts
  - src/common.ts
  - test/unit/common.test.ts
autonomous: true
requirements: [CLEANUP-02, TEST-06]
must_haves:
  truths:
    - "Changing any of `discoveryDepth`, `discoveryStopOnFirstHit`, `projectPath`, `projectPaths`, `featuresPath`, `featuresPaths` triggers `clearScanResultCache()` AND invalidates `activeProjectCache` (D-09)."
    - "The new invalidation logic lives inside the existing `configurationChangedHandler` flow at `src/extension.ts:1104` — no new top-level subscription (D-10)."
    - "The read-time `discoveryDepth` re-read at `src/common.ts:367` is removed (D-11); the comment block around L353-L360 explaining the v1.4.0 tech debt is removed."
    - "A unit test pins the new behavior: with the invalidation hook in place, lowering `discoveryDepth` after activation correctly causes the next discovery cycle to re-evaluate active-project gating without the read-time re-read (TEST-06)."
  artifacts:
    - path: "src/discovery/projectList.ts"
      provides: "Public `clearActiveProjectCache(): void` helper"
      exports: ["clearActiveProjectCache"]
    - path: "src/extension.ts"
      provides: "Extended `needsRescan` branch in `configurationChangedHandler` covering all scan-shaping keys (D-09) and calling `clearActiveProjectCache()` alongside `clearScanResultCache()`"
      pattern: "clearActiveProjectCache"
    - path: "src/common.ts"
      provides: "Simplified active-project block — no read-time discoveryDepth re-read"
      pattern: "currentDiscoveryDepth"  # NEGATED in acceptance — should be 0 hits after this plan
    - path: "test/unit/common.test.ts"
      provides: "TEST-06 regression bar — pins the post-invalidation behavior"
  key_links:
    - from: "src/extension.ts configurationChangedHandler"
      to: "src/discovery/projectList.ts clearActiveProjectCache"
      via: "import + invocation when needsRescan triggers (D-10)"
      pattern: "clearActiveProjectCache\\(\\)"
---

<objective>
Close the v1.4.0 `activeProjectCache` invalidation tech debt (CLEANUP-02). Add a `clearActiveProjectCache()` public helper to `src/discovery/projectList.ts`, broaden the existing `configurationChangedHandler` rescan branch in `src/extension.ts:1104` to cover *all* scan-shaping keys per D-09 (`discoveryDepth`, `discoveryStopOnFirstHit`, `projectPath`, `projectPaths`, `featuresPath`, `featuresPaths`), and remove the read-time `discoveryDepth` re-read in `src/common.ts:367` plus the L353-L360 tech-debt comment block (D-11). Pin the new behavior with a unit test (TEST-06).

This plan is independent of the migration work in Plans 01-03 and runs in parallel with them in Wave 1.

Purpose: Closes CLEANUP-02 and TEST-06.
Output: Three modified source files, one new public export, one removed comment block, one removed `cfg.get<number>("discoveryDepth")` call site, and at least one new unit test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/019-migration-foundation/019-CONTEXT.md
@CLAUDE.md
@AI_INSTRUCTIONS.md

<interfaces>
<!-- Existing scan-cache infra and the configurationChangedHandler flow we extend. -->

From src/discovery/configScanner.ts (line 45):
```typescript
export function clearScanResultCache(): void { scanResultCache.clear(); }
```

From src/discovery/projectList.ts (existing exports — read lines 1-30 and 75-100 for context):
```typescript
const activeProjectCache = new Map<string, ProjectEntry | undefined>();
export function getActiveProject(wkspUri: vscode.Uri): ProjectEntry | undefined;
export function setActiveProject(wkspUri: vscode.Uri, entry: ProjectEntry): void;
// (this plan adds: export function clearActiveProjectCache(): void)
```

From src/extension.ts lines 1019-1025 (the existing rescan branch we extend per D-10):
```typescript
const needsRescan = forceFullRefresh || (event && (event.affectsConfiguration('gs-behave-bdd.discoveryDepth') ||
    event.affectsConfiguration('gs-behave-bdd.discoveryStopOnFirstHit') ||
    event.affectsConfiguration('gs-behave-bdd.projectPath')));
if (needsRescan) {
  clearScanResultCache();
}
```

From src/common.ts lines 353-368 (the read-time re-read that D-11 removes):
```typescript
// Phase 17 fix: also gate on currentDiscoveryDepth so a stale activeProject
// (cached at activation depth) does not resurrect a subdir config when the user
// later lowers discoveryDepth below where the active project lives.
// Note: this is a deliberate read-time check, not a cache-invalidation hook —
// activeProjectCache outlives the settings that influence its keys, and a proper
// clearScanResultCache()-paired invalidation is tracked as v1.4.0 follow-up tech debt
// (see .planning/v1.4.0-MILESTONE-AUDIT.md tech_debt list).
if (!isManualProjectPathMode(folder.uri)) {
  const activeProject = getActiveProject(folder.uri);
  // N-04: this getConfiguration call is on the <1ms hot path; cost is one
  // scope-chain walk per workspace folder per cache miss. For 10+ root
  // workspaces with frequent invalidation this could matter. Documented
  // as v1.4.0 tech debt — out of scope here, but flagged for awareness.
  const currentDiscoveryDepth = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri).get<number>("discoveryDepth") ?? 3;
  if (activeProject && activeProject.depth <= currentDiscoveryDepth) {
    // ...
  }
}
```

After D-11 the block becomes simply: `if (activeProject) { ... }`. The depth gate is removed because the invalidation hook in `configurationChangedHandler` now wipes `activeProjectCache` (so `getActiveProject` returns undefined after a relevant settings change, triggering recompute on the next call). The N-04 perf comment also goes away with the call site.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add clearActiveProjectCache export and broaden the configurationChangedHandler rescan branch</name>
  <read_first>
    - C:\code\gs-behave-bdd\src\discovery\projectList.ts (full file — verify nothing else iterates `activeProjectCache` outside the helpers; the simplest implementation is `activeProjectCache.clear()`)
    - C:\code\gs-behave-bdd\src\extension.ts lines 1010-1080 (the full `configurationChangedHandler` body — confirm where `needsRescan` is computed and where `clearScanResultCache()` is called; the new `clearActiveProjectCache()` call goes immediately after)
    - C:\code\gs-behave-bdd\src\extension.ts top imports (lines 1-50) — find where `clearScanResultCache` is imported from `./discovery/configScanner`; add `clearActiveProjectCache` from `./discovery/projectList` alongside the existing import (or extend it if both are imported from the same barrel)
    - C:\code\gs-behave-bdd\.planning\phases\019-migration-foundation\019-CONTEXT.md (D-09 full key list; D-10 same-handler placement; D-11 read-time-reread removal)
  </read_first>
  <files>src/discovery/projectList.ts, src/extension.ts</files>
  <behavior>
    - Behavior 6.1: After this task, `import { clearActiveProjectCache } from './discovery/projectList'` resolves; calling it from any module empties the underlying `activeProjectCache` Map.
    - Behavior 6.2: After this task, the `needsRescan` predicate inside `configurationChangedHandler` returns `true` for changes to ANY of: `gs-behave-bdd.discoveryDepth`, `gs-behave-bdd.discoveryStopOnFirstHit`, `gs-behave-bdd.projectPath`, `gs-behave-bdd.projectPaths`, `gs-behave-bdd.featuresPath`, `gs-behave-bdd.featuresPaths`.
    - Behavior 6.3: When `needsRescan` is true, BOTH `clearScanResultCache()` AND `clearActiveProjectCache()` are called.
    - These are static-shape changes; Task 2 adds the regression unit test that proves the behavior end-to-end.
  </behavior>
  <action>
    **File 1 — `src/discovery/projectList.ts`**: Add a public helper just below the existing `setActiveProject` definition (around line 90). Keep the existing internal `activeProjectCache` declaration unchanged.
    ```typescript
    /**
     * Phase 19 / CLEANUP-02: drop all cached active-project entries so the next
     * discovery cycle recomputes them fresh. Called from configurationChangedHandler
     * when a scan-shaping setting changes (D-09, D-10).
     *
     * Replaces the v1.4.0 read-time discoveryDepth re-read in src/common.ts.
     */
    export function clearActiveProjectCache(): void {
      activeProjectCache.clear();
    }
    ```
    Verify nothing else in this file iterates `activeProjectCache` in a way that requires preserving keys — `getActiveProject` returns undefined on a cleared cache, which is exactly the post-D-11 behavior `src/common.ts` will rely on.

    **File 2 — `src/extension.ts`**: Two edits.

    Edit 2a — top imports: extend the existing import from `'./discovery/projectList'` to include `clearActiveProjectCache`. (The current file imports `getActiveProject`, `setActiveProject`, `getProjectList` from there based on the activate() return object — confirm the exact import line and add the new symbol.)

    Edit 2b — broaden the `needsRescan` predicate at lines 1020-1025 per D-09 and add the `clearActiveProjectCache()` call per D-10:
    ```typescript
    // Phase 19 D-09 / CLEANUP-02: any change to scan-shaping settings invalidates
    // BOTH the scan-result cache AND the active-project cache. Replaces the v1.4.0
    // read-time discoveryDepth re-read in src/common.ts (CLEANUP-02 / D-11).
    const needsRescan = forceFullRefresh || (event && (
      event.affectsConfiguration('gs-behave-bdd.discoveryDepth') ||
      event.affectsConfiguration('gs-behave-bdd.discoveryStopOnFirstHit') ||
      event.affectsConfiguration('gs-behave-bdd.projectPath') ||
      event.affectsConfiguration('gs-behave-bdd.projectPaths') ||
      event.affectsConfiguration('gs-behave-bdd.featuresPath') ||
      event.affectsConfiguration('gs-behave-bdd.featuresPaths')
    ));
    if (needsRescan) {
      clearScanResultCache();
      clearActiveProjectCache();
    }
    ```

    Per D-10, do NOT add a new `vscode.workspace.onDidChangeConfiguration` subscription — the existing handler at L1104 already covers this entry point.
  </action>
  <verify>
    <automated>npx tsc -p . --noEmit && npx eslint src --ext ts</automated>
  </verify>
  <acceptance_criteria>
    - Grep `^export function clearActiveProjectCache` in `src/discovery/projectList.ts` returns exactly 1 hit.
    - Grep `clearActiveProjectCache\(\)` in `src/extension.ts` returns exactly 1 hit (excluding comments — verify with `grep -v '^\s*//' src/extension.ts | grep -c "clearActiveProjectCache()"` returning 1).
    - Grep `affectsConfiguration\('gs-behave-bdd\.featuresPaths'\)` in `src/extension.ts` returns exactly 1 hit (proves D-09 broadening landed).
    - `npx tsc -p . --noEmit` succeeds.
    - `npx eslint src --ext ts` exits 0.
    - `npm run test:unit` reports 0 NEW failures (the existing v1.4.0 read-time gate at `src/common.ts:367` remains in place after this task; Task 2 removes it together with its test obligations).
    - `npx webpack` succeeds.
  </acceptance_criteria>
  <done>The new helper exists, the rescan branch covers all 6 keys per D-09, and the handler invokes both cache clears.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Remove the read-time discoveryDepth re-read in common.ts and add the TEST-06 regression bar</name>
  <read_first>
    - C:\code\gs-behave-bdd\src\common.ts lines 340-400 (full active-project block — understand the surrounding control flow before deleting; the `if (activeProject && activeProject.depth <= currentDiscoveryDepth)` check becomes `if (activeProject)`. Verify the inner branch still type-checks and that `activeProject.depth` is no longer referenced after the change.)
    - C:\code\gs-behave-bdd\test\unit\common.test.ts (read at least the file structure / first 100 lines to find the existing describe block for `hasFeaturesFolder`; add the new TEST-06 test there or in an adjacent describe block)
    - C:\code\gs-behave-bdd\.planning\phases\019-migration-foundation\019-CONTEXT.md (D-11 — comment block at L355-L360 should be deleted, not just truncated)
  </read_first>
  <files>src/common.ts, test/unit/common.test.ts</files>
  <behavior>
    Test 7.1 (TEST-06 regression bar): Given an active project cached at depth 5 and `discoveryDepth = 3`, the post-D-11 code path no longer reads `discoveryDepth` at lookup time. Instead, simulating a configuration-change event for `gs-behave-bdd.discoveryDepth` calls `clearActiveProjectCache()`, after which `getActiveProject(wkspUri)` returns undefined and the active-project subdir branch in `hasFeaturesFolder` is skipped. The test pins this end-to-end behavior — i.e. asserts both:
      (a) The static shape: `src/common.ts` no longer contains the literal `currentDiscoveryDepth` AND no longer calls `cfg.get<number>("discoveryDepth")` inside the active-project block (use a structural source-text assertion as the primary check, since fully simulating the configuration-change event flow in a unit test is brittle and overlaps with integration coverage in Phase 22 TEST-07).
      (b) Behavioral: with `activeProjectCache` populated and `clearActiveProjectCache()` called, the next `getActiveProject(wkspUri)` call returns `undefined` (this part lives in `test/unit/common.test.ts` or an existing `projectList`-focused test file — choose whichever is closer to existing coverage).
    Test 7.2: Calling `clearActiveProjectCache()` when the cache is already empty is a safe no-op (idempotency).
  </behavior>
  <action>
    **File 1 — `src/common.ts`**: Delete the comment block at L353-L360 (the v1.4.0 tech-debt note) AND the `const currentDiscoveryDepth = ... .get<number>("discoveryDepth") ?? 3;` line (currently L367) AND the N-04 perf comment block (L363-L366) that sits with it. Update the surrounding `if` from:
    ```typescript
    if (activeProject && activeProject.depth <= currentDiscoveryDepth) {
    ```
    to:
    ```typescript
    if (activeProject) {
    ```

    Replace the deleted comment block with a single-line marker that the v1.4.0 debt is closed:
    ```typescript
    // Phase 19 / CLEANUP-02: activeProjectCache is now invalidated proactively
    // by configurationChangedHandler when scan-shaping settings change (D-09).
    // The v1.4.0 read-time discoveryDepth re-read is gone.
    ```

    Confirm the rest of the inner branch (lines 369+) still references `activeProject.dirUri` and not `activeProject.depth`. If `activeProject.depth` is referenced anywhere downstream of the deleted gate, leave a `// CLEANUP-02 NOTE:` flag and stop — surface as a planning-time finding for re-scope.

    **File 2 — `test/unit/common.test.ts`** (or `test/unit/projectList.test.ts` if it exists; check during execution): add Test 7.1 + 7.2.

    For 7.1(a) — structural source-text check: read `src/common.ts` and assert it does NOT contain `currentDiscoveryDepth` AND does NOT contain `get<number>("discoveryDepth")` (the latter check should be scoped to the active-project block; the rest of the file may legitimately read discoveryDepth elsewhere — verify with grep before writing the assertion).

    For 7.1(b) and 7.2 — behavioral check on `clearActiveProjectCache()`: import the helper directly, populate via `setActiveProject`, call `clearActiveProjectCache`, assert `getActiveProject` returns undefined; call `clearActiveProjectCache` again, assert it doesn't throw.

    Per D-11, this task formally closes the v1.4.0 carry-forward tech debt. Update `.planning/STATE.md` `## v1.4.0 Carry-Forward Tech Debt` section to mark `activeProjectCache` invalidation pattern as **resolved by Phase 19 Plan 04** (single-line edit, NOT a new section). This STATE.md edit is part of this task's Done criteria.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "clearActiveProjectCache|CLEANUP-02|TEST-06"</automated>
  </verify>
  <acceptance_criteria>
    - Grep `currentDiscoveryDepth` in `src/common.ts` returns 0 hits.
    - Grep `get<number>\("discoveryDepth"\)` in `src/common.ts` returns 0 hits (or, if other unrelated call sites exist outside the active-project block, exactly the count that existed BEFORE this plan minus 1 — confirm and document).
    - Grep `Phase 19 / CLEANUP-02` in `src/common.ts` returns exactly 1 hit (the replacement marker comment).
    - Tests 7.1 and 7.2 pass; full unit suite reports 0 failures.
    - `npx eslint src --ext ts` exits 0.
    - `npx webpack` succeeds.
    - `.planning/STATE.md` `## v1.4.0 Carry-Forward Tech Debt` section reflects the resolution.
  </acceptance_criteria>
  <done>The read-time `discoveryDepth` re-read is gone, the active-project block is simplified to `if (activeProject)`, the v1.4.0 tech-debt comment is replaced with a CLEANUP-02 closure marker, the regression bar passes, and STATE.md is updated.</done>
</task>

</tasks>

<verification>
- `npm run test:unit` reports 0 failures with ≥2 new tests for `clearActiveProjectCache` + the structural CLEANUP-02 closure assertion.
- `npx eslint src --ext ts` exits 0.
- `npx webpack` succeeds.
- `grep -c 'currentDiscoveryDepth' src/common.ts` returns 0.
- `grep -c 'clearActiveProjectCache' src/extension.ts` (excluding comments) returns 1.
</verification>

<success_criteria>
Phase 19 success criterion #5 satisfied: changing `discoveryDepth` (or any of the broader scan-shaping keys per D-09) invalidates `activeProjectCache` via `clearScanResultCache()` + `clearActiveProjectCache()`, replacing the v1.4.0 read-time re-read in `src/common.ts:347`. A unit test pins the new behavior. The v1.4.0 carry-forward tech debt is officially closed.
</success_criteria>

<output>
After completion, create `.planning/phases/019-migration-foundation/019-04-SUMMARY.md` summarising the file changes, the broadened scan-shaping key list (D-09), the test count delta, and the STATE.md tech-debt closure note.
</output>
