# Project Research Summary

**Project:** gs-behave-bdd v1.6.0 execute_steps IDE Support
**Domain:** VS Code extension — IDE support for behave's `context.execute_steps("...")` in Python files
**Researched:** 2026-07-15
**Confidence:** HIGH — behave semantics read directly from the bundled 1.3.3 source (`bundled/libs/behave/`); every codebase integration point verified at file:line; ecosystem claims sourced.

## Headline findings

1. **Unserved differentiator.** No IDE tool in any ecosystem (PyCharm, behave-vsc, official Cucumber extension, cucumberautocomplete, pytest-bdd) validates or navigates execute_steps strings. Cucumber ecosystems deprecated nested steps entirely; behave's `execute_steps` is a first-class documented API.
2. **No new dependencies.** Pure-TS line-oriented scanner matches behave's own line-oriented `parse_steps` semantics; existing matching engine (`_getStepFileStepMatch`) already implements behave's registry bucket semantics (resolved type + universal `step` bucket).
3. **One-line delivery of reference counting.** All three reference consumers (CodeLens, StepReferences tree, native provider) funnel through `getStepMappingsForStepsFileFunction` — a parallel `executeStepsMappings` array unioned there lands the feature with zero consumer changes.

## Stack additions

None (see STACK.md — Python-AST subprocess scanning explicitly rejected).

## Feature table stakes

- Undefined-step diagnostic (Warning) + invalid-content diagnostic (Error) — user confirmed strict mode
- F12 go-to-definition from embedded step lines (python-scoped DefinitionProvider, composes with Pylance)
- Call sites in CodeLens counts and all find-references surfaces
- Scan scope: every `.py` the extension enumerates (`allPyFiles`) — user confirmed "anywhere it would be valid to call the method"

## Watch out for (top pitfalls — full list in PITFALLS.md)

- **P1 False positives are the cardinal sin**: f-strings/non-literal args must be skipped with NOTHING emitted.
- **P2/P3 behave type-inheritance semantics**: leading And/But is legal (Background inheritance — never flag); And/But/`*` inherit previous step type and it affects which decorator buckets match.
- **P5/P6 rebuild placement**: exec mappings rebuild per-workspace (not per features root) and stay out of the flat `stepMappings` table, or integration count assertions ripple everywhere.
- **P7 debounce staleness**: diagnostics must rescan live document text, not the 500ms-debounced cache.

## Suggested build order (→ roadmap phases)

1. **Scanner + mapping funnel** — `executeStepsParser.ts`, stepMappings extensions, fileParser wiring (reference counting lands here)
2. **Validation diagnostics** — `executeStepsDiagnostics.ts` + 4 extension.ts trigger sites
3. **Go-to-definition** — `executeStepsDefinitionProvider.ts` (parallel-safe with 2)
4. **Integration fixture + suite + docs** — `example-projects/execute-steps/`, new integration suite, README/AI_INSTRUCTIONS/CHANGELOG

Full details: FEATURES.md, ARCHITECTURE.md, PITFALLS.md, STACK.md (prior-milestone research archived as `*-v1.2.0.md` / `*-v1.3.0.md`).
