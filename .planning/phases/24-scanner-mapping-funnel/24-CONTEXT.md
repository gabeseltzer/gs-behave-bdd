# Phase 24: Scanner + Mapping Funnel - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Derived from user-approved implementation plan (plan-mode approval 2026-07-15; smart discuss found no open grey areas — all substantive decisions were made and approved there)

<domain>
## Phase Boundary

Execute_steps call sites are discovered across every `.py` file the extension already enumerates (the `allPyFiles` set), and those call sites are unioned into the step-mapping data so reference counting (CodeLens, StepReferences tree, native find-references) falls out with zero consumer-side changes. Requirements: REFS-01..04. Diagnostics (Phase 25) and go-to-definition (Phase 26) build on this phase's scanner and mapping foundation — this phase must also export the lookup/matching helpers they need (`getExecuteStepsCallStepAtLine`, `getStepFileStepForExecuteStep`, `matchExecuteStepsContent`, invalid-content records from the scanner).

</domain>

<decisions>
## Implementation Decisions

### Scanner (user-approved plan)
- New module `src/parsers/executeStepsParser.ts`; pure `scanExecuteSteps(content)` + cached `parseExecuteStepsFileContent(featuresUri, content, fileUri, caller)` with module-level per-line Map (sibling convention of featureParser/stepsParser)
- `ExecuteStepsCallStep` structurally identical to `FeatureFileStep` (`key, uri, fileName, range, text, textWithoutType, stepType`) plus `isAmbiguousType` (leading And/But) and `hasFormatPlaceholders`
- Call-site regex `/\bexecute_steps\s*\(\s*(?:textwrap\s*\.\s*dedent\s*\(\s*)?([fFuUrRbB]{0,2})("""|'''|"|')/g` then line-oriented scan to closing delimiter (CRLF-safe; ranges from untrimmed physical columns)
- Supported literals: triple-quoted (both kinds), single-line with exactly one step (no `\n` escapes), `u/U/r/R` prefixes, `.format(...)`/`%` suffix (mark `hasFormatPlaceholders`), `textwrap.dedent(...)` unwrap
- Skip SILENTLY (emit nothing): f-strings, `b` prefix, non-literal args, `\n`-escaped single-line, `+` concatenation after literal, unterminated strings
- behave 1.3.3 line semantics: blanks skipped, per-line strip, full-line `#` comments skipped (inline `#` = step text), docstring/table lines skipped (attach to preceding step), And/But/`*` inherit previous type, leading And/But → `isAmbiguousType=true` (never an error), leading `*` → given
- New keyword regex `/^(Given|When|Then|And|But|\*)\s+(.*)/i` in `gherkinPatterns.ts` (existing `featureFileStepRe` lacks `*`)
- Scanner also emits invalid-content line records (non-blank/non-comment/non-table/non-docstring lines matching no keyword) for Phase 25's Error diagnostics

### Data model & mappings (user-approved plan)
- Parallel module-level `executeStepsMappings: StepMapping[]` in `stepMappings.ts` (reuse `StepMapping` class via structural typing) — NOT rows in the flat `stepMappings` table (would inflate `getStepMappings()` WkspParseCounts assertions and duplicate per-root)
- Union point: `getStepMappingsForStepsFileFunction` (`stepMappings.ts:33`) — single funnel for all three reference consumers
- `rebuildExecuteStepsMappings(featuresUri)` runs per-WORKSPACE (after the per-root `rebuildStepMappings` loop, `fileParser.ts:608-610` and `:809-811` before `onStepMappingsRebuilt` fires); refactor `_getFilteredSteps` step-def half into shared `_getCompiledStepDefs`
- Ambiguous-type (leading And/But) steps: try given/when/then buckets in order (each falls back to `step` bucket); no match → no mapping
- Also add `getStepFileStepForExecuteStep(fileUri, lineNo)`, `deleteExecuteStepsMappings(featuresUri)`, `matchExecuteStepsContent(featuresUri, content)` (live-text matching for Phase 25)
- `rebuildExecuteStepsMappings` calls `refreshStepReferencesView()`; NOT `retriggerSemanticHighlighting()` (gherkin-only)

### Parse-cycle wiring (user-approved plan)
- `_parseStepsFiles` (`fileParser.ts:201`): scan all of `allPyFiles` (user-confirmed scope: "anywhere it would be valid to call the method" — helper modules, environment.py included), independent of behave subprocess success
- Debounced python reparse body: rescan the edited file for any watched `.py` (not just `isStepsFile`), then rebuild exec mappings before `onStepMappingsRebuilt` fires
- Feature-file reparse branch untouched; `WkspParseCounts` untouched (zero-behavior-change guarantee, REFS-04)

### Claude's Discretion
- Exact cache-key formats, diagLog message wording, helper naming, test file organization details — follow sibling-module conventions (stepsParser/featureParser)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_getStepFileStepMatch` (`stepMappings.ts:119`) — matching engine; exact-then-params, `step`-bucket fallback, longest-key tie-break; accepts `FeatureFileStep`-shaped input (structural typing)
- `featureParser.ts:210-214` — And/But type-inheritance logic to replicate
- `gherkinPatterns.ts` — `textBlockDelimiterRe`, `tableRowRe` reusable for embedded docstring/table skipping
- `getContentFromFilesystem` / `getLines` (`common.ts:860`, splits `\r\n|\r|\n`) for CRLF-safe line handling
- Unit-test templates: `test/unit/parsers/stepsParser.test.ts`, `test/unit/parsers/stepMappingRegexCache.test.ts` (exercises real stepMappings module)

### Established Patterns
- Module-level Map caches with per-file clear loops (`stepsParser.ts:121-124`) and workspace-level delete fns (`stepsParser.ts:44`)
- `diagLog` timing lines on rebuild (`stepMappings.ts:90-91`)
- Handlers try/catch + `config.logger.showError`; helpers throw

### Integration Points
- `fileParser.ts:220` (`allPyFiles` → scan), `:608-610` + `:809-812` (rebuild placement), `onStepMappingsRebuilt` (`fileParser.ts:53`, wired `extension.ts:428`)
- Reference consumers (no changes needed): `codeLensProvider.ts:88-90`, `findStepReferencesHandler.ts:18-43`, `stepReferenceProvider.ts:33-54`, `stepReferencesView.ts` (consumes `.text/.uri/.range/.fileName` only)
- Full research: `.planning/research/` (ARCHITECTURE.md data-flow diagram, PITFALLS.md P1-P10); approved plan: `~/.claude/plans/parsed-honking-walrus.md`

</code_context>

<specifics>
## Specific Ideas

- Unit tests for the scanner ship IN THIS PHASE (per roadmap: TEST-01 delivered incrementally 24-26, confirmed in 27)
- Exit criteria: CodeLens counts / StepReferences tree / native references include call sites; all existing unit + integration tests green (REFS-04 zero-behavior-change proof)
- Regression guard test: `getStepMappings(featuresUri)` must exclude execute_steps rows

</specifics>

<deferred>
## Deferred Ideas

- Quick-fix scaffold, hover, autocomplete, CodeLens source-split title, imported step libraries outside watched roots — all recorded in REQUIREMENTS.md Future/Out of Scope

</deferred>
