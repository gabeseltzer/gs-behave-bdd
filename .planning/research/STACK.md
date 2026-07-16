# Technology Stack: execute_steps IDE Support (v1.6.0)

**Researched:** 2026-07-15
**Confidence:** HIGH

## Additions: NONE

The entire feature is implementable with the existing stack:

- **Scanner**: pure TypeScript regex + line-oriented scan (no Python AST needed — behave's own `parse_steps` is line-oriented, so a TS line scanner can match its semantics exactly). No new npm dependency.
- **Matching**: existing `_getStepFileStepMatch` engine (`src/parsers/stepMappings.ts:119`) reused via structural typing.
- **VS Code API**: `registerDefinitionProvider({language: "python"})` composes with Pylance (providers merge; returning `undefined` contributes nothing). Diagnostics via the existing `config.diagnostics` collection (distinct `code` values). CodeLens on python files already shipped.
- **Semantics oracle**: bundled behave 1.3.3 source (`bundled/libs/behave/parser.py`, `runner.py`, `step_registry.py`) — already in-repo, used as the reference for scanner behavior and unit-test expectations.

## Explicitly rejected

- Python-subprocess AST scanning (mirror of `behaveLoader.ts`): correct for f-string/variable detection, but adds subprocess latency to the 500ms edit debounce and complexity for marginal gain — the literal-only policy makes regex scanning sufficient and false-positive-safe.
- New gherkin-parsing dependency: behave's steps-variant grammar is ~6 line rules; a dependency would match behave's real parser *less* exactly than porting the rules.
