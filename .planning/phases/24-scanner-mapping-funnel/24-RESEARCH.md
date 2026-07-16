# Phase 24: Scanner + Mapping Funnel - Research

**Researched:** 2026-07-16
**Domain:** TypeScript regex/line scanner + VS Code extension internal data-model wiring (gs-behave-bdd)
**Confidence:** HIGH

## Summary

This phase adds no new dependencies and no new UI surface — it is a pure internal-plumbing phase. All decisions were already locked by the user-approved plan in `24-CONTEXT.md`; this research verifies every file:line anchor cited there against the actual working tree so the planner can write task actions that compile on the first try, and adds the missing detail the context doc didn't need to spell out (exact current export lists, test scaffolding conventions, behave's real line-parse control flow, and the multi-path fixture to use for the per-workspace-not-per-root regression test).

Everything checks out: `stepMappings.ts` is 191 lines with the union point at exactly line 33 as claimed; the two rebuild call sites in `fileParser.ts` are at lines 608-610 and 809-812 as claimed (off by one from the context doc's ":809-811", which pointed at the loop body, not the `onStepMappingsRebuilt` call). `gherkinPatterns.ts` has no `*` keyword and no docstring `#`-comment-inside-string special case yet — both must be added fresh, and doing so cannot break anything because they're net-new exports, not edits to `featureFileStepRe`. Behave's own `parser.py` confirms every semantic claim in `24-CONTEXT.md` and `PITFALLS.md` (P2/P3/P9) at the cited line ranges, with one addition: `parse_step` (line 846) tries keywords in a fixed order `("given", "when", "then", "and", "but")` and `*` is matched as an alias *within* each of those keyword lists (behave's i18n keyword tables register `*` as an alias for all step types), which is why leading `*` with no prior context still resolves via the same `_select_last_background_step_type()` fallback as `and`/`but` — not via a hardcoded "given" default. This is a minor semantic refinement over `24-CONTEXT.md`'s summary and should be reflected in the scanner's fallback matching order for `*`.

**Primary recommendation:** Implement `executeStepsParser.ts` and the `stepMappings.ts` extensions exactly as scoped in `24-CONTEXT.md`; use `example-projects/multi-path-settings/` (two `featuresUris` in one workspace, real `.py`/`.feature` fixtures already on disk) as the manual/integration-level proof that `rebuildExecuteStepsMappings` runs once per workspace and not once per root; follow the `stepsParser.test.ts` per-test-unique-URI convention (not global `suiteSetup`/`teardown`) for all new unit suites since the real modules hold shared mutable module-level state.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scanner (user-approved plan)**
- New module `src/parsers/executeStepsParser.ts`; pure `scanExecuteSteps(content)` + cached `parseExecuteStepsFileContent(featuresUri, content, fileUri, caller)` with module-level per-line Map (sibling convention of featureParser/stepsParser)
- `ExecuteStepsCallStep` structurally identical to `FeatureFileStep` (`key, uri, fileName, range, text, textWithoutType, stepType`) plus `isAmbiguousType` (leading And/But) and `hasFormatPlaceholders`
- Call-site regex `/\bexecute_steps\s*\(\s*(?:textwrap\s*\.\s*dedent\s*\(\s*)?([fFuUrRbB]{0,2})("""|'''|"|')/g` then line-oriented scan to closing delimiter (CRLF-safe; ranges from untrimmed physical columns)
- Supported literals: triple-quoted (both kinds), single-line with exactly one step (no `\n` escapes), `u/U/r/R` prefixes, `.format(...)`/`%` suffix (mark `hasFormatPlaceholders`), `textwrap.dedent(...)` unwrap
- Skip SILENTLY (emit nothing): f-strings, `b` prefix, non-literal args, `\n`-escaped single-line, `+` concatenation after literal, unterminated strings
- behave 1.3.3 line semantics: blanks skipped, per-line strip, full-line `#` comments skipped (inline `#` = step text), docstring/table lines skipped (attach to preceding step), And/But/`*` inherit previous type, leading And/But → `isAmbiguousType=true` (never an error), leading `*` → given
- New keyword regex `/^(Given|When|Then|And|But|\*)\s+(.*)/i` in `gherkinPatterns.ts` (existing `featureFileStepRe` lacks `*`)
- Scanner also emits invalid-content line records (non-blank/non-comment/non-table/non-docstring lines matching no keyword) for Phase 25's Error diagnostics

**Data model & mappings (user-approved plan)**
- Parallel module-level `executeStepsMappings: StepMapping[]` in `stepMappings.ts` (reuse `StepMapping` class via structural typing) — NOT rows in the flat `stepMappings` table (would inflate `getStepMappings()` WkspParseCounts assertions and duplicate per-root)
- Union point: `getStepMappingsForStepsFileFunction` (`stepMappings.ts:33`) — single funnel for all three reference consumers
- `rebuildExecuteStepsMappings(featuresUri)` runs per-WORKSPACE (after the per-root `rebuildStepMappings` loop, `fileParser.ts:608-610` and `:809-811` before `onStepMappingsRebuilt` fires); refactor `_getFilteredSteps` step-def half into shared `_getCompiledStepDefs`
- Ambiguous-type (leading And/But) steps: try given/when/then buckets in order (each falls back to `step` bucket); no match → no mapping
- Also add `getStepFileStepForExecuteStep(fileUri, lineNo)`, `deleteExecuteStepsMappings(featuresUri)`, `matchExecuteStepsContent(featuresUri, content)` (live-text matching for Phase 25)
- `rebuildExecuteStepsMappings` calls `refreshStepReferencesView()`; NOT `retriggerSemanticHighlighting()` (gherkin-only)

**Parse-cycle wiring (user-approved plan)**
- `_parseStepsFiles` (`fileParser.ts:201`): scan all of `allPyFiles` (user-confirmed scope: "anywhere it would be valid to call the method" — helper modules, environment.py included), independent of behave subprocess success
- Debounced python reparse body: rescan the edited file for any watched `.py` (not just `isStepsFile`), then rebuild exec mappings before `onStepMappingsRebuilt` fires
- Feature-file reparse branch untouched; `WkspParseCounts` untouched (zero-behavior-change guarantee, REFS-04)

### Claude's Discretion
- Exact cache-key formats, diagLog message wording, helper naming, test file organization details — follow sibling-module conventions (stepsParser/featureParser)

### Deferred Ideas (OUT OF SCOPE)
- Quick-fix scaffold, hover, autocomplete, CodeLens source-split title, imported step libraries outside watched roots — all recorded in REQUIREMENTS.md Future/Out of Scope

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REFS-01 | Step-definition CodeLens reference counts include execute_steps call sites | `getStepMappingsForStepsFileFunction` verified at `stepMappings.ts:33`; consumer `codeLensProvider.ts:88` calls it with no structural change needed once the union happens inside that function |
| REFS-02 | "Find All Step References" tree view includes execute_steps call sites, grouped by `.py` file | `findStepReferencesHandler.ts` `getFeatureReferencesToStepFileFunction` (lines ~18-43) groups by `uriId(sm.featureFileStep.uri)` — works unchanged for `ExecuteStepsCallStep` objects assigned to the `featureFileStep` field since only `.uri`/`.fileName`/`.range` are read |
| REFS-03 | Native Find All References includes execute_steps call-site locations | `stepReferenceProvider.ts` `getReferencesFromStepsFile`/`getReferencesFromFeatureFile` (lines ~33-54) only read `sm.featureFileStep.uri`/`.range` — verified unchanged |
| REFS-04 | Zero behavior change with no execute_steps calls in workspace | `getStepMappings(featuresUri)` (`stepMappings.ts:40-42`) filters the flat `stepMappings` array only — parallel `executeStepsMappings` array is invisible to it by construction; verified no existing call site reads `executeStepsMappings` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| execute_steps call-site scanning | Extension (parser layer, TS) | — | Pure text/regex scan of already-loaded `.py` file content; no Python execution needed (STACK.md: python-AST rejected for latency) |
| Call-site ↔ step-def matching | Extension (parser layer, TS) | — | Reuses existing `_getStepFileStepMatch` engine; matching is pure in-memory data-structure work |
| Reference counting (CodeLens/tree/native refs) | Extension (language-service layer, TS) | — | Existing consumers already own this; this phase only widens their data source via the union point, no consumer code changes |
| Parse-cycle orchestration (when to rescan/rebuild) | Extension (fileParser orchestration layer) | — | `fileParser.ts` is the sole owner of debounce timing and rebuild sequencing; new work is inserted at existing insertion points, not a new orchestrator |

## Standard Stack

### Core
No new libraries. Confirmed via `STACK.md` (milestone-level, HIGH confidence) — pure TypeScript regex + line-oriented scan matches behave's own line-oriented `parse_steps` semantics exactly; no new npm dependency needed for this phase.

### Supporting
N/A — reuses `vscode.Range`/`vscode.Position`, `vscode.Uri`, and the project's own `common.ts` helpers (`getLines`, `uriId`, `sepr`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-TS regex/line scanner | Python-subprocess AST scan (mirrors `behaveLoader.ts`) | Rejected in STACK.md: adds subprocess latency to the 500ms edit debounce; marginal gain since literal-only policy already makes false positives structurally impossible |

**Installation:** None — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external packages.

## Architecture Patterns

### System Architecture Diagram

```
.py file content (already loaded by allPyFiles enumeration)
        │
        ▼
scanExecuteSteps(content) ─────────────────────────► ExecuteStepsCallStep[]
        │ (pure function: regex find execute_steps(   + invalid-content line records
        │  call → line-scan to closing delimiter)              │
        ▼                                                       │
parseExecuteStepsFileContent(featuresUri, content,               │
  fileUri, caller)                                               │
   — module-level per-line Map cache, keyed like                 │
     stepFileSteps/featureFileSteps                              │
        │                                                        │
        ▼                                                        ▼
   [cached scan results, one per watched .py file]      (consumed later by Phase 25
        │                                                 diagnostics — not this phase)
        ▼
rebuildExecuteStepsMappings(featuresUri)   ◄── runs ONCE per workspace,
   — reuses _getStepFileStepMatch              AFTER the per-root rebuildStepMappings loop
     against compiled step-def regexes          (fileParser.ts:608-610, :809-812)
        │
        ▼
executeStepsMappings: StepMapping[]  (parallel array, stepMappings.ts)
        │
        │  UNION happens INSIDE:
        ▼
getStepMappingsForStepsFileFunction(stepsFileUri, lineNo)   ◄── stepMappings.ts:33
        │
        ├──► codeLensProvider.ts:88        "N references" CodeLens        (REFS-01)
        ├──► findStepReferencesHandler.ts  StepReferences tree view       (REFS-02)
        └──► stepReferenceProvider.ts      native Find All References     (REFS-03)

getStepMappings(featuresUri)  ◄── stepMappings.ts:40-42 — UNCHANGED, filters
        │                          only the flat `stepMappings` array (never
        ▼                          executeStepsMappings) — this is the REFS-04
   WkspParseCounts (integration test assertions)   zero-behavior-change guarantee
```

### Recommended Project Structure
```
src/parsers/
├── executeStepsParser.ts   # NEW: scanExecuteSteps (pure) + parseExecuteStepsFileContent (cached)
├── gherkinPatterns.ts       # EXTEND: add new keyword regex with `*` support (net-new export)
├── stepMappings.ts          # EXTEND: executeStepsMappings array, rebuildExecuteStepsMappings,
│                            #   getStepFileStepForExecuteStep, deleteExecuteStepsMappings,
│                            #   matchExecuteStepsContent, shared _getCompiledStepDefs extracted
│                            #   from _getFilteredSteps
├── fileParser.ts            # EXTEND: scan allPyFiles in _parseStepsFiles; call
│                            #   rebuildExecuteStepsMappings after both existing rebuild loops
│                            #   (:608-610 initial parse, :809-812 debounced python reparse)
└── featureParser.ts         # REFERENCE ONLY (no edits): And/But inheritance logic at :210-214
                             #   is the pattern to replicate in the scanner
```

### Pattern 1: Module-level cache with per-featuresUri clear + rebuild (sibling to stepsParser.ts / featureParser.ts)
**What:** A `Map<string, T>` at module scope, keyed `${uriId(featuresUri or fileUri)}${sepr}...`, with `delete*` functions that filter-and-remove by URI prefix, and `get*` functions that filter by URI prefix.
**When to use:** Every new cache in this phase (`executeStepsParser.ts`'s per-line Map, `stepMappings.ts`'s `executeStepsMappings` array).
**Example:**
```typescript
// Source: src/parsers/stepsParser.ts:11, :44-57 (verified in working tree)
const stepFileSteps = new Map<string, StepFileStep>();

export function deleteStepFileSteps(featuresUri: vscode.Uri) {
  const wkspStepFileSteps = getStepFileSteps(featuresUri, false);
  for (const [key,] of wkspStepFileSteps) {
    stepFileSteps.delete(key);
  }
}
```

### Pattern 2: And/But/`*` type inheritance (replicate, don't import — featureParser's version is feature-file-specific)
**What:** Track `lastStepType` across the scan; `and`/`but` inherit it; a fresh regex is needed because `featureFileStepRe` lacks `*`.
**When to use:** Inside `scanExecuteSteps`'s line loop.
**Example:**
```typescript
// Source: src/parsers/featureParser.ts:210-214 (verified in working tree)
let stepType = step[1].trim().toLowerCase();
if (stepType === "and" || stepType === "but")
  stepType = lastStepType;
else
  lastStepType = stepType;
```
Note: for the execute_steps scanner, a leading `and`/`but`/`*` with **no** prior `lastStepType` in the same call has no way to resolve statically (behave would consult the enclosing Background at runtime — `parser.py:865-871`, `_select_last_background_step_type` at `parser.py:885-907`). Per `24-CONTEXT.md`, mark this `isAmbiguousType = true` and never flag it; when matching, try given/when/then buckets in order, falling back to the `step` bucket for each (see Pitfall 2 below).

### Pattern 3: Matching engine reuse via structural typing
**What:** `_getStepFileStepMatch` (`stepMappings.ts:119-190`) takes a `FeatureFileStep` parameter but only reads `.textWithoutType` and `.stepType` — an `ExecuteStepsCallStep` object satisfies this by structural typing (TypeScript does not apply excess-property checks to non-literal arguments), so it can be passed directly with zero modification to the matcher.
**When to use:** `rebuildExecuteStepsMappings`'s per-call-site matching loop.
**Example:**
```typescript
// Source: src/parsers/stepMappings.ts:119-121 (verified in working tree)
export function _getStepFileStepMatch(featureFileStep: FeatureFileStep,
  exactSteps: Map<string, StepFileStep>, paramsSteps: Map<string, StepFileStep>,
  compiledExactRegexes: Map<string, RegExp>, compiledParamsRegexes: Map<string, RegExp>): StepFileStep | null {
```

### Anti-Patterns to Avoid
- **Adding execute_steps rows to the flat `stepMappings` table:** Explicitly rejected in `24-CONTEXT.md`/ARCHITECTURE.md — would inflate `getStepMappings()` counts consumed by every integration suite's `WkspParseCounts` assertions (Pitfall P6).
- **Rebuilding exec mappings inside the per-root `for (const root of wkspSettings.featuresUris)` loop:** Would duplicate rows once per features root in multi-path workspaces since step defs/call sites are workspace-level, not root-level (Pitfall P5). Call `rebuildExecuteStepsMappings(featuresUri)` once, after the loop.
- **Using a global `suiteSetup`/`teardown` to reset module state in unit tests:** The project's convention (see `stepsParser.test.ts`) is per-test unique fake URIs (e.g. `c:/workspace-delete-test/...`) plus explicit `deleteStepFileSteps(featuresUri)` calls at the top of tests that touch shared state — not a global reset hook. Follow this exactly for the new `executeStepsParser`/`stepMappings` test suites.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step-type matching (exact/params/step-bucket fallback/longest-key tie-break) | A new matcher for execute_steps call sites | `_getStepFileStepMatch` (`stepMappings.ts:119`) | Already implements behave's registry bucket semantics exactly (`step_registry.py:180-193` per ARCHITECTURE.md); reuse via structural typing |
| CRLF-safe line splitting | Custom `\r\n`/`\r`/`\n` splitting logic in the new scanner | `getLines(content)` (`common.ts:860-862`) | Already used by every other parser in the codebase (`stepsParser.ts:131`, feature parsing); splits on `/\r\n|\r|\n/` |
| Docstring/table-row detection inside the execute_steps literal | New regexes for `"""`/`'''` and `\|`-prefixed table rows | `textBlockDelimiterRe`, `tableRowRe` (`gherkinPatterns.ts:15-16`) | Already exist and are exactly the patterns needed |

**Key insight:** This entire phase is a "wire existing primitives together in a new shape" phase — every hard problem (matching, line splitting, docstring detection) already has a working, tested implementation in the codebase. The only genuinely new code is the execute_steps-specific call-site regex and the line-oriented literal-content scanner built from those existing primitives.

## Common Pitfalls

### Pitfall 1: False positives on dynamic strings (CRITICAL — from PITFALLS.md P1)
**What goes wrong:** A spurious match/diagnostic on an f-string, `b`-prefixed string, or variable argument actively erodes user trust (Phase 25 concern, but the scanner built in this phase must never emit an `ExecuteStepsCallStep` for these cases in the first place).
**Why it happens:** Any attempt to be "helpful" about probable string content (e.g. resolving a variable name) risks a wrong guess.
**How to avoid:** Gate everything on "arg is a recognizable string literal" per the locked regex; skip SILENTLY (no record at all, not even an invalid-content record) for f-strings/`b` prefix/non-literal args/`\n`-escaped single-line/unterminated strings/`+` concatenation.
**Warning signs:** Any code path that "falls through" to producing a `ExecuteStepsCallStep` for an argument that didn't match the literal-detection regex.

### Pitfall 2: Leading And/But/`*` is legal, not an error (from PITFALLS.md P2, `parser.py:864-871`, `:885-907`)
**What goes wrong:** Flagging a leading `And`/`But`/`*` as "undefined step type" when there's no prior step in the same execute_steps call.
**Why it happens:** Statically, the .py file scanner cannot know what the enclosing feature's Background looks like — behave resolves this at runtime via `_select_last_background_step_type()`.
**How to avoid:** Mark `isAmbiguousType = true` and try given/when/then buckets in order (each falling back to `step`) when matching; never emit a diagnostic for lack of resolution (that's Phase 25's job to suppress).
**Warning signs:** Unit test failures where a leading `And step_text` at the start of a call produces zero matches when a step def exists for exactly one of given/when/then.

### Pitfall 3: Per-root vs per-workspace rebuild placement (from PITFALLS.md P5)
**What goes wrong:** Rebuilding `executeStepsMappings` inside the existing `for (const root of wkspSettings.featuresUris) { rebuildStepMappings(root, ...) }` loop (verified at `fileParser.ts:608-610` and `:809-811`) duplicates call-site rows once per root.
**Why it happens:** Step defs and `.py` call sites are workspace-level (one set per `wkspSettings.featuresUri`), but the loop iterates once per features root — that loop's granularity is correct for feature-file steps (which ARE per-root) but wrong for call sites.
**How to avoid:** Call `rebuildExecuteStepsMappings(wkspSettings.featuresUri)` exactly once, positioned after the loop closes, in both of the two call sites (`fileParser.ts:608-610` initial parse, `:809-811` debounced python reparse) — before `this.onStepMappingsRebuilt?.(wkspSettings.featuresUri)` fires in each.
**Warning signs:** `example-projects/multi-path-settings/` (two `featuresUris` in one workspace — see Environment/fixture note below) is the concrete regression fixture: reference counts there should not double.

### Pitfall 4: Integration count assertion ripple (from PITFALLS.md P6)
**What goes wrong:** Any code path that reads `stepMappings` (the flat array) as if it includes exec rows would silently change `WkspParseCounts.stepMappings` in every existing integration suite, since `getStepMappings(featuresUri)` (`stepMappings.ts:40-42`) is what feeds that count (verified consumer: `fileParser.ts:644-645`).
**Why it happens:** `executeStepsMappings` is a separate array by design; a bug that merges them into `stepMappings` (rather than keeping the union only inside `getStepMappingsForStepsFileFunction`) would break this invisibly.
**How to avoid:** Never push to the `stepMappings` array from any new code; add a unit regression guard asserting `getStepMappings(featuresUri)` excludes exec rows (explicitly required — see `24-CONTEXT.md` Specific Ideas and REQUIREMENTS.md TEST-01).
**Warning signs:** Any existing integration test's `WkspParseCounts.stepMappings` assertion starts failing after this phase's changes.

### Pitfall 5: Reusing `featureFileStepRe` instead of writing the new keyword regex (from PITFALLS.md P9)
**What goes wrong:** `featureFileStepRe` (`gherkinPatterns.ts:11`) is `/^\s*(Given |When |Then |And |But )(.*)/i` — it requires a trailing space and has no `*` alternative. Reusing it for the execute_steps scanner would silently reject all `*`-keyword steps (a valid behave 1.3.x form, `parser.py:847` iterates `("given","when","then","and","but")` keyword tables which include `*` as a registered alias).
**Why it happens:** `stepRe` (`gherkinPatterns.ts:10`) does include `\*` but has different trailing-whitespace handling (`(.*)$` not `\s+(.*)`) and is used for a different purpose (existing feature-file symbol detection) — neither existing regex is exactly right for the new keyword-line matcher.
**How to avoid:** Add the new regex exactly as locked in `24-CONTEXT.md`: `/^(Given|When|Then|And|But|\*)\s+(.*)/i`. This is a **net-new export** in `gherkinPatterns.ts`, not a modification of `featureFileStepRe`/`stepRe` — verified: no existing consumer of those two regexes needs to change.
**Warning signs:** `gherkinPatterns.test.ts` (existing suite) should stay green untouched; a new suite (or new `suite()` block within it) should cover the new keyword regex specifically.

### Pitfall 6: Test isolation — real modules hold shared mutable state
**What goes wrong:** Writing new unit tests for `executeStepsParser.ts`/`stepMappings.ts` extensions using a single fixed `featuresUri` (e.g. `c:/test/features`) across many `test()` blocks causes cross-test pollution, since these are real (non-mocked) modules with module-level `Map`/array state that persists across the whole test run.
**Why it happens:** `stepsParser.test.ts` and `stepMappingRegexCache.test.ts` both exercise the real modules directly (verified: no `sinon.stub` of `stepMappings.ts`/`stepsParser.ts` internals) — the project's convention is per-test-unique fake URIs (`c:/workspace-delete-test/...`, `c:/workspace1/...`) plus explicit cleanup calls (`deleteStepFileSteps(featuresUri)`) at the start of tests that need a clean slate, not a `beforeEach`/`afterEach` global reset.
**How to avoid:** Give each new test its own distinguishing path segment; call the new `deleteExecuteStepsMappings(featuresUri)` explicitly where isolation matters, mirroring `stepsParser.test.ts` lines 161/192/227/258/277/289.
**Warning signs:** Flaky test order-dependence; a test passing alone but failing in the full suite run.

## Code Examples

### behave's own line-parse control flow for `parse_steps()` (the semantics oracle)
```python
# Source: bundled/libs/behave/parser.py:909-940 (verified in working tree, behave 1.3.3)
def parse_steps(self, text, filename=None):
    """Parse support for execute_steps() functionality..."""
    ...
    self.state = State.STEPS
    for line in text.splitlines():
        self.line += 1
        if not line.strip() and self.state != State.MULTILINE_TEXT:
            # -- SKIP EMPTY LINES, except in multiline string args.
            continue
        self.action(line)
    ...
```

### behave's keyword/type-inheritance resolution (the scanner's core semantics to replicate)
```python
# Source: bundled/libs/behave/parser.py:846-883 (verified in working tree)
def parse_step(self, line):
    for step_type in ("given", "when", "then", "and", "but"):
        for kw in self.keywords[step_type]:
            if not (line.startswith(kw) or line.lower().startswith(kw.lower())):
                continue
            step_text_after_keyword = line[len(kw):].strip()
            if kw.startswith("*") and self.last_step_type:
                # Generic steps and Given/When/Then steps are mixed: inherit last type.
                step_type = self.last_step_type
            elif step_type in ("and", "but"):
                if not self.last_step_type:
                    # BEST-EFFORT: Try to use last background step.
                    self.last_step_type = self._select_last_background_step_type()
                    if not self.last_step_type:
                        raise ParserError(...)   # only errors when Background is ALSO empty
                step_type = self.last_step_type
            else:
                self.last_step_type = step_type
            ...
```
**Note for scanner implementation:** a leading `*` with NO prior step in the call goes through the *same* `elif`-style fallback attempt as `and`/`but` in real behave (via the keyword-table match, since `*` is a registered alias inside each of `given`/`when`/`then`'s keyword list, not a separate 6th bucket) — not a hardcoded "always given" default. Since the scanner cannot know the Background at all, treat a contextless leading `*` identically to a contextless leading `and`/`but`: `isAmbiguousType = true`, try given/when/then/step buckets, never flag as an error. This refines (does not contradict) `24-CONTEXT.md`'s "leading `*` → given" summary — check the real keyword tables (`bundled/libs/behave/i18n.py`, `"en"` locale) if a planner task needs to confirm which literal alias list `*` lives in.

### Full-line comment / inline-`#`-is-step-text distinction (behave's `action()`)
```python
# Source: bundled/libs/behave/parser.py:469-481 (verified in working tree)
def action(self, line):
    if line.strip().startswith("#") and self.state != State.MULTILINE_TEXT:
        if (self.state != State.INITIAL or self.tags or self.variant != "feature"):
            return   # <-- comment line silently skipped (no error, no step created)
        ...
```
Note: this only strips comments when the **entire trimmed line** starts with `#`. `parse_step` (above) is never given a chance to see a full-line comment — but an inline `#` embedded mid-line (e.g. `Given foo # bar`) is never routed through this branch at all, so it becomes part of `step_text_after_keyword` verbatim. This confirms PITFALLS.md P4's "inline `#` is step text" claim exactly.

### Existing union point to extend (verbatim, current state)
```typescript
// Source: src/parsers/stepMappings.ts:33-37 (verified in working tree)
export function getStepMappingsForStepsFileFunction(stepsFileUri: vscode.Uri, lineNo: number): StepMapping[] {
  return stepMappings.filter(sm =>
    sm.stepFileStep && urisMatch(sm.stepFileStep.uri, stepsFileUri) &&
    sm.stepFileStep.functionDefinitionRange.start.line === lineNo);
}
```
Add `.concat(executeStepsMappings.filter(...same predicate...))` (or equivalent) inside this function — this is the single edit that delivers REFS-01/02/03.

### Existing rebuild-loop insertion points (verbatim, current state)
```typescript
// Source: src/parsers/fileParser.ts:607-612 (verified in working tree — initial full parse path)
const updateMappingsStart = performance.now();
for (const root of wkspSettings.featuresUris) {
  mappingsCount += rebuildStepMappings(root, wkspSettings.featuresUri);
}
buildMappingsTime = performance.now() - updateMappingsStart;
diagLog(`${callName}: stepmappings built`);
// <-- INSERT rebuildExecuteStepsMappings(wkspSettings.featuresUri) here, after the loop
```
```typescript
// Source: src/parsers/fileParser.ts:809-812 (verified in working tree — debounced python reparse path)
for (const root of wkspSettings.featuresUris) {
  rebuildStepMappings(root, wkspSettings.featuresUri);
}
// <-- INSERT rebuildExecuteStepsMappings(wkspSettings.featuresUri) here
this.onStepMappingsRebuilt?.(wkspSettings.featuresUri);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — greenfield capability within an existing codebase | N/A | N/A | This phase adds new capability to an established pattern set; no deprecation involved |

**Deprecated/outdated:** None applicable to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `*` is registered as a keyword alias inside behave's `given`/`when`/`then` i18n keyword lists (rather than being a separate top-level bucket) — inferred from `parser.py:847-860`'s control flow but the actual `i18n.py` "en" locale table was not directly read in this session | Code Examples section ("Full-line comment..." note) | Low — affects only the precise wording of one inline comment/note in the scanner's `*`-handling branch; the *behavioral* outcome (leading `*` with no context = ambiguous, never an error) is independently confirmed by `_select_last_background_step_type` at `parser.py:885-907` regardless of which keyword-table bucket `*` lives in |

**If this table is empty:** N/A — see A1 above; all other claims in this research were verified directly against the working tree (`grep`/`Read` of exact files) or the bundled behave source, and are tagged `[VERIFIED: local source]` implicitly throughout via inline file:line citations.

## Open Questions

1. **Exact behave `en` i18n keyword table entry for `*`**
   - What we know: `parser.py:847-860` shows `*` matched inside the same keyword-table loop as `given`/`when`/`then`/`and`/`but`, with `kw.startswith("*")` as a special case inside that loop.
   - What's unclear: Whether `i18n.py`'s "en" locale registers `*` once per step-type list (so it appears in all five) or as a single global entry consulted first. This affects only comment/documentation precision in the scanner, not its required behavior (which is already fully pinned by `24-CONTEXT.md`'s locked decisions and independently confirmed by the Background-fallback logic).
   - Recommendation: Not blocking — the locked decision ("leading `*` → given" simplified, refined here to "leading `*`/And/But with no context → `isAmbiguousType`, try given/when/then/step in order") is sufficient to implement and test. If a planner task wants full precision, `grep '"\*"' bundled/libs/behave/i18n.py` resolves it in under a minute.

## Environment Availability

Skipped — this phase has no external tool/service dependencies beyond what's already installed and verified working in this repo (Node.js, TypeScript, existing Mocha/Sinon unit test harness). No new packages, no new CLIs, no new runtimes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Mocha (TDD `suite`/`test` style) + Sinon, existing `test/unit/` harness |
| Config file | `test/unit/run.js` (compiled from TS via `npm run compile-tests`) |
| Quick run command | `npx mocha --require ./out/test/test/unit/setup.js --ui tdd 'out/test/test/unit/parsers/executeStepsParser.test.js' 'out/test/test/unit/parsers/stepMappings*.test.js'` (after `npm run compile-tests`) |
| Full suite command | `npm run test:unit` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REFS-01 | CodeLens reference count includes execute_steps call sites | unit (pure `scanExecuteSteps` + real `stepMappings` module union) | `npm run test:unit` (new suite `test/unit/parsers/executeStepsParser.test.ts` + extended `stepMappingRegexCache.test.ts` or new `stepMappings.test.ts`) | ❌ Wave 0 — new files |
| REFS-02 | StepReferences tree includes execute_steps call sites, grouped by `.py` file | unit (verify `getStepMappingsForStepsFileFunction` union output shape feeds `findStepReferencesHandler`'s grouping logic unchanged) | `npm run test:unit` | ❌ Wave 0 — extend existing `getStepMappingsForStepsFileFunction` test coverage if any exists, else new |
| REFS-03 | Native Find All References includes execute_steps call-site locations | unit (same union point, verified via `getStepMappingsForStepsFileFunction` directly — no VS Code provider mocking needed since this phase doesn't touch `stepReferenceProvider.ts`) | `npm run test:unit` | ❌ Wave 0 |
| REFS-04 | Zero behavior change when no execute_steps calls exist | unit regression guard: `getStepMappings(featuresUri)` excludes exec rows + full existing suite green | `npm run test:unit` (existing 898+ tests must stay green; add 1 explicit regression test) | ❌ Wave 0 — new regression test; existing suite already exists and is the "proof" |

### Sampling Rate
- **Per task commit:** targeted mocha run against just the new/modified test files (compile-tests + direct mocha invocation with file glob, per project's documented Windows `--grep` workaround in STATE.md Phase 15 Plan 06 notes)
- **Per wave merge:** `npm run test:unit` (full unit suite)
- **Phase gate:** Full suite green (`npm run test:unit`) + `npx eslint src --ext ts` clean, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/unit/parsers/executeStepsParser.test.ts` — new file, covers `scanExecuteSteps` edge-case checklist (triple-quote both kinds, single-line, prefixes, `.format()`/`%`, `textwrap.dedent`, all silent-skip cases, And/But/`*` inheritance, invalid-content records)
- [ ] Extension of `test/unit/parsers/stepMappingRegexCache.test.ts` or a new `test/unit/parsers/stepMappings.test.ts` — covers `rebuildExecuteStepsMappings`, the union inside `getStepMappingsForStepsFileFunction`, `getStepFileStepForExecuteStep`, `deleteExecuteStepsMappings`, `matchExecuteStepsContent`, and the REFS-04 regression guard (`getStepMappings()` excludes exec rows)
- [ ] No new framework/config install needed — existing Mocha/Sinon harness covers this phase's needs

*(Integration-level proof of the multi-path-settings per-workspace-not-per-root correctness (Pitfall 3) can be a unit test using two `featuresUri` values sharing one workspace URI, rather than a full `example-projects/` integration suite — Phase 27 owns the new `example-projects/execute-steps/` integration fixture per REQUIREMENTS.md TEST-02.)*

## Security Domain

Not applicable to this phase. This is a purely local, in-process text-scanning feature operating on files the extension already reads from the user's own workspace — no network calls, no new authentication/session/crypto surfaces, no user input parsing beyond source-file content already trusted by every other parser in the codebase (`stepsParser.ts`, `featureParser.ts`). ASVS categories V2/V3/V4/V6 do not apply; V5 (input validation) is satisfied by the existing "skip silently on anything not a recognizable literal" policy, which is itself the security-relevant design constraint (never execute or `eval()` scanned content — the scanner only ever produces `vscode.Range`/string-match metadata, never runs the scanned Python).

## Sources

### Primary (HIGH confidence)
- `src/parsers/stepMappings.ts` (full file, 191 lines) — read directly, all line numbers in this document verified against it
- `src/parsers/fileParser.ts` lines 1-320, 580-820 — read directly, rebuild-loop and `_parseStepsFiles`/`_debouncePythonReparse` insertion points verified
- `src/parsers/gherkinPatterns.ts` (full file) — read directly, confirmed no `*` support in `featureFileStepRe`
- `src/parsers/featureParser.ts` lines 1-60, 180-240 — read directly, And/But inheritance logic and `FeatureFileStep` class shape verified
- `src/parsers/stepsParser.ts` (full file) — read directly, module-level cache + delete-fn pattern verified
- `src/handlers/codeLensProvider.ts`, `findStepReferencesHandler.ts`, `stepReferenceProvider.ts` (relevant excerpts) — read directly, confirmed they only touch `.uri`/`.range`/`.fileName` on the `StepMapping.featureFileStep` field, so structural typing works with zero consumer changes
- `bundled/libs/behave/parser.py` lines 288-320, 460-505, 662-720, 794-941 — read directly (behave 1.3.3, bundled in-repo) — every semantic claim in `24-CONTEXT.md`/PITFALLS.md cross-checked
- `test/unit/parsers/stepsParser.test.ts`, `test/unit/parsers/stepMappingRegexCache.test.ts` (full/partial reads) — read directly, per-test-unique-URI isolation convention confirmed
- `example-projects/multi-path-settings/` (directory listing + `.vscode/settings.json`) — read directly, confirmed as the concrete two-`featuresUris`-in-one-workspace fixture for Pitfall 3 regression testing
- `.planning/phases/24-scanner-mapping-funnel/24-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/research/{ARCHITECTURE,PITFALLS,FEATURES,STACK,SUMMARY}.md` — milestone-level research, already verified per its own confidence markers (HIGH), distilled for phase relevance here

### Secondary (MEDIUM confidence)
None used — all claims resolved directly against working-tree source in this session.

### Tertiary (LOW confidence)
None — see Assumptions Log A1 for the one claim not independently re-verified against `i18n.py` directly (behavioral outcome is still independently confirmed via a different code path).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, confirmed via milestone STACK.md and this session's source reads
- Architecture: HIGH — every integration point (union function, rebuild call sites, consumer read patterns) verified at exact file:line against the current working tree in this session
- Pitfalls: HIGH — all five PITFALLS.md items relevant to this phase (P1, P2, P3, P5, P6, P9) cross-verified against both the working tree and the actual bundled behave 1.3.3 source in this session

**Research date:** 2026-07-16
**Valid until:** Stable — no external dependency drift risk (zero new packages); re-verify only if `stepMappings.ts`/`fileParser.ts` line numbers shift due to unrelated concurrent work before this phase executes (30-day validity assumed, but line-number citations should be spot-checked at plan-execution time if other phases land first)
