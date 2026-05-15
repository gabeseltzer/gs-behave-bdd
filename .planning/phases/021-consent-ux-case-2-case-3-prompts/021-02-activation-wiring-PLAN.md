---
phase: 021-consent-ux-case-2-case-3-prompts
plan: 02
type: execute
wave: 2
depends_on: ["021-01"]
files_modified:
  - src/extension.ts
autonomous: true
requirements:
  - CONSENT-01

must_haves:
  truths:
    - "Activation no longer awaits user-facing prompts — runConsentFlow is fire-and-forget"
    - "evaluateAllMigrations is called with an onCaseHit hook that collects case 2 / case 3 hits into a ConsentHit[]"
    - "After the evaluator returns, readMigrationMode is read once per workspace and passed to runConsentFlow"
    - "The defense-in-depth try/catch around evaluateAllMigrations + reloadSettings is preserved"
  artifacts:
    - path: "src/extension.ts"
      provides: "Activation-time wiring of consent flow"
      contains: "runConsentFlow"
  key_links:
    - from: "src/extension.ts"
      to: "src/migrations/index.ts"
      via: "import { evaluateAllMigrations, runConsentFlow, readMigrationMode }"
      pattern: "from ['\"]\\./migrations['\"]"
    - from: "src/extension.ts evaluator call"
      to: "ConsentHit collector"
      via: "onCaseHit hook arrow function"
      pattern: "onCaseHit"
---

> **Shell portability note:** The grep-based acceptance criteria below assume Git Bash. PowerShell users can run the equivalent `Select-String` commands. The `<automated>` verify lines (eslint + tsc + unit tests) are the authoritative cross-shell check; the grep assertions are advisory pre-flight signals.

<objective>
Replace the bare `await evaluateAllMigrations(wkspUri)` call at `src/extension.ts:~338` with the collect-then-prompt pattern from D-A3.4. After evaluation, fire `runConsentFlow(wkspUri, hits, mode)` without awaiting so the rest of activation isn't gated on user interaction. This is a small surgical edit — one call site, ~10 lines of code change.

Purpose: this is the single integration point between the Phase 19 evaluator seam and the Phase 21 consent orchestrator. Without this wiring, the orchestrator from Plan 01 is dead code.

Output:
- `src/extension.ts` modified at the single migration call site.

Invariants preserved:
- The surrounding `Promise.all(getUrisOfWkspFoldersWithFeatures().map(...))` parallelism stays (D-A3.4 / Phase 20 B-03).
- The try/catch and `config.reloadSettings(wkspUri)` stay (D-A3.4).
- No other file is touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md
@src/extension.ts

<interfaces>
<!-- Public surface from Plan 01 (021-01) — already landed in src/migrations/index.ts -->
```typescript
export { runConsentFlow, readMigrationMode } from './consent';
export type { ConsentHit, MigrationMode } from './consent';
// pre-existing:
export { evaluateAllMigrations } from './evaluator';
export type { MigrationEntry, MigrationScope } from './types';
```

Current code at src/extension.ts:330-346 (verbatim, for reference):
```typescript
    // Phase 20 D-A6.1: evaluator drives every registered migration.
    // Phase 21 will inject a hooks object that wires case 2 / case 3 notifications;
    // Phase 20 ships without hooks so the evaluator runs case-1 silent finishes.
    // B-03: run per-workspace migrations concurrently (parallelism across workspaces).
    // Pitfall 8: reloadSettings is synchronous — do NOT await.
    await Promise.all(
      getUrisOfWkspFoldersWithFeatures().map(async (wkspUri) => {
        try {
          await evaluateAllMigrations(wkspUri);
          config.reloadSettings(wkspUri);
        } catch (e) {
          // Defense-in-depth: evaluator never throws (Phase 19 D-03), but
          // reloadSettings is not contracted to never throw.
          config.logger.logInfo(`Phase 20 migration evaluator error: ${e}`, wkspUri);
        }
      }),
    );
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire collect-then-prompt pattern into the activation migration block</name>
  <files>src/extension.ts</files>

  <read_first>
    - src/extension.ts L1-L50 (existing imports — to see how `evaluateAllMigrations` is currently imported)
    - src/extension.ts L325-L350 (the migration block being modified)
    - src/migrations/index.ts (post-Plan 01 state — must already export runConsentFlow, readMigrationMode, ConsentHit, MigrationMode)
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md § D-A3.4 (exact pseudocode for this wiring)
  </read_first>

  <action>
1. **Update the import.** Find the existing line that imports from `./migrations` (currently imports `evaluateAllMigrations`). Extend it to also import `runConsentFlow`, `readMigrationMode`, and the `ConsentHit` type. Example shape (adapt to existing import grouping — DO NOT duplicate the import statement):

```typescript
import {
  evaluateAllMigrations,
  runConsentFlow,
  readMigrationMode,
  type ConsentHit,
} from './migrations';
```

If the existing import is single-line, convert it to multi-line as above. If `ConsentHit` cannot be a type-only inline import due to surrounding code style, fall back to a separate `import type { ConsentHit } from './migrations';` line.

2. **Replace the migration block body.** Inside the `Promise.all(getUrisOfWkspFoldersWithFeatures().map(async (wkspUri) => { ... }))` arrow, replace the `try { await evaluateAllMigrations(wkspUri); config.reloadSettings(wkspUri); } catch ...` block with the D-A3.4 pattern:

```typescript
  try {
    const hits: ConsentHit[] = [];
    await evaluateAllMigrations(wkspUri, {
      onCaseHit: (mcase, entry, scope) => {
        if (mcase === 2 || mcase === 3) {
          hits.push({ case: mcase, entry, scope });
        }
      },
    });
    config.reloadSettings(wkspUri);
    const mode = readMigrationMode(wkspUri);
    // Fire-and-forget: activation must not block on user prompts (CONSENT-01).
    // runConsentFlow never throws; the outer try/catch is defense-in-depth.
    void runConsentFlow(wkspUri, hits, mode);
  } catch (e) {
    config.logger.logInfo(`Phase 21 migration consent flow error: ${e}`, wkspUri);
  }
```

3. **Update the comment** above the `Promise.all` from `Phase 20 D-A6.1: evaluator drives every registered migration.` to also reference Phase 21:

```typescript
    // Phase 20 D-A6.1: evaluator drives every registered migration.
    // Phase 21 D-A3.4: hooks collect case 2 / case 3 hits, runConsentFlow shows
    // non-blocking prompts (fire-and-forget — does not gate activation).
    // B-03: run per-workspace migrations concurrently (parallelism across workspaces).
    // Pitfall 8: reloadSettings is synchronous — do NOT await.
```

4. **Constraints:**
   - Do NOT change the `Promise.all(...)` shape or the surrounding parallelism.
   - Do NOT remove the outer try/catch — narrow its error message but keep it as defense-in-depth.
   - Do NOT introduce an `await` on `runConsentFlow`. The `void` prefix is intentional and required.
   - Do NOT touch any other line in `src/extension.ts`.

5. After the edit, run `npx eslint src --ext ts` and `npm run test:unit`. Fix any warnings.
  </action>

  <verify>
    <automated>npx eslint src --ext ts && npx tsc --noEmit -p tsconfig.json && npm run test:unit</automated>
  </verify>

  <acceptance_criteria>
    - `grep -c "runConsentFlow" src/extension.ts` returns `1` (the new fire-and-forget call).
    - `grep -c "void runConsentFlow(wkspUri, hits, mode)" src/extension.ts` returns `1`.
    - `grep -c "readMigrationMode" src/extension.ts` returns `1`.
    - `grep -c "ConsentHit" src/extension.ts` ≥ `1` (the typed `hits` array).
    - `grep -c "onCaseHit:" src/extension.ts` returns `1`.
    - `grep -E "if \\(mcase === 2 \\|\\| mcase === 3\\)" src/extension.ts | wc -l` ≥ `1` (D-A3.4 filter present).
    - `grep -c "await runConsentFlow" src/extension.ts` returns `0` (must NOT be awaited — fire-and-forget).
    - `grep -c "Promise.all(" src/extension.ts` returns the same count as before (parallelism preserved).
    - `grep -c "config.reloadSettings(wkspUri)" src/extension.ts` returns `1` (preserved).
    - `git diff src/notifications.ts src/migrations/evaluator.ts | wc -l` returns `0` (those files untouched).
    - `npx eslint src --ext ts` exits 0 with no output.
    - `npx tsc --noEmit -p tsconfig.json` exits 0.
    - `npm run test:unit` exits 0.
  </acceptance_criteria>

  <done>The single migration block at `src/extension.ts:~338` collects hits via the evaluator hook, calls `readMigrationMode` once per workspace, and fires `runConsentFlow` without awaiting. Parallelism and defense-in-depth try/catch are preserved. Lint, typecheck, and unit tests pass.</done>
</task>

</tasks>

<verification>
- The only file modified is `src/extension.ts`.
- The migration call site uses the exact collect-then-prompt shape from D-A3.4.
- `runConsentFlow` is invoked with `void` (no `await`).
- Existing unit suite passes — no regressions to Phase 19/20 evaluator coverage.
</verification>

<success_criteria>
- CONSENT-01 wired: on activation, the evaluator's case 2 / case 3 hits are routed to a non-blocking consent flow.
- Activation latency unchanged (no new `await` blocks the rest of `activate()`).
</success_criteria>

<output>
After completion, create `.planning/phases/021-consent-ux-case-2-case-3-prompts/021-02-activation-wiring-SUMMARY.md`.
</output>
