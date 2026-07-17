# Architecture Research: execute_steps IDE Support (v1.6.0)

**Researched:** 2026-07-15
**Confidence:** HIGH (every integration point verified against working tree file:line)

## Existing seams (reuse, don't rebuild)

- **Matching engine**: `_getStepFileStepMatch` (`src/parsers/stepMappings.ts:119`) — exact-then-params matching with `step`-bucket fallback and longest-key tie-break. Exactly mirrors behave's registry semantics (`step_registry.py:180-193`: resolved-type bucket + universal `step` bucket always appended).
- **Reference funnel**: `getStepMappingsForStepsFileFunction` (`stepMappings.ts:33`) — the single function all three reference consumers call: CodeLens (`codeLensProvider.ts:88`), StepReferences tree (`findStepReferencesHandler.ts:20`), native ReferenceProvider (`stepReferenceProvider.ts:35/49`).
- **Diagnostics pattern**: `stepDiagnostics.ts` filter-preserve-set by diagnostic `code` on the shared `config.diagnostics` collection.
- **Parse cycle**: `.py` edits → 500ms debounce (`fileParser.ts:721`) → reload step defs → `rebuildStepMappings` per features root (`fileParser.ts:608-610`, `:809-811`) → `onStepMappingsRebuilt` (`extension.ts:428`).
- **File enumeration**: `allPyFiles` (`fileParser.ts:206-217`) = all `.py` under each features root / steps search root, deduped — the scan set.
- **Gherkin regexes**: `gherkinPatterns.ts` (`featureFileStepRe` lacks `*` and requires trailing space — new keyword regex needed).

## New components

| Component | Responsibility |
|---|---|
| `src/parsers/executeStepsParser.ts` | Scanner producing `ExecuteStepsCallStep` (structurally identical to `FeatureFileStep` + `isAmbiguousType`, `hasFormatPlaceholders`) + invalid-content records; module-level per-line cache keyed by featuresUri |
| `src/parsers/stepMappings.ts` (extend) | Parallel `executeStepsMappings: StepMapping[]` unioned into the reference funnel; `rebuildExecuteStepsMappings(featuresUri)` (per-workspace, NOT per-root); `getStepFileStepForExecuteStep`; `matchExecuteStepsContent` for live-document diagnostics |
| `src/handlers/executeStepsDiagnostics.ts` | Codes `execute-steps-step-not-found` (Warning) / `execute-steps-invalid-content` (Error); wired at the 4 existing trigger sites in extension.ts (:840, :860, :1016, :428) |
| `src/handlers/executeStepsDefinitionProvider.ts` | Python-scoped DefinitionProvider; `range.contains(position)` gate; composes with Pylance |

## Key decision: parallel mappings array over flat-table rows

Call-site rows in the flat `stepMappings` table would (a) inflate `getStepMappings()` counts asserted by integration `WkspParseCounts`, and (b) risk per-root duplication because `rebuildStepMappings` runs once per features root while step defs (and call sites) are workspace-level. The parallel array + one-line union in `getStepMappingsForStepsFileFunction` delivers the identical feature surface with zero consumer changes and zero-behavior-change **by construction** when no execute_steps exist.

## Data flow

```
.py file content ──scanExecuteSteps──▶ ExecuteStepsCallStep cache (per featuresUri)
                                            │ rebuildExecuteStepsMappings (per workspace, after step-def load)
                                            ▼
                                   executeStepsMappings ──union──▶ getStepMappingsForStepsFileFunction
                                            │                       ├─ CodeLens ref count
   live document text ──matchExecuteStepsContent (fresh scan,       ├─ StepReferences tree
   never debounce-stale) ──▶ diagnostics                            └─ native find-references
                                            └──▶ getStepFileStepForExecuteStep ──▶ DefinitionProvider
```

## Build order

1. Scanner + mapping funnel (reference counting lands here as a side effect)
2. Validation diagnostics
3. Go-to-definition (parallel-safe with 2)
4. Integration fixture (`example-projects/execute-steps/`) + suite + docs
