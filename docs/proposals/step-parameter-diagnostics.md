# Proposal: step parameter diagnostics

Status: **implemented** (phases 1–3, plus argument and Examples-cell hovers) on `gabes/step-param-diagnostics` (off `gabe-dev`).

Terminology follows behave and `CONTEXT.md`: a **parameter** is the `{name:type}` field in a step definition,
an **argument** is the feature file text that fills it (`behave.model_type.Argument`).

## Goal

Show a diagnostic in a `.feature` file, quickly, when a feature file step's argument doesn't
fit its parameter's type, including custom types registered with
`register_type`:

```gherkin
Given I have many cukes          # @given("I have {count:d} cukes")  → "many" is not a d
And I paint it purple            # register_type(Color=...) with pattern "red|green|blue"
```

## What behave actually does (confirmed against bundled behave 1.3.3 / parse 1.22.1)

| Situation | behave outcome | Detectable in TS? |
|---|---|---|
| Text doesn't match the parameter's regex (`{n:d}` vs `many`; `{c:Color}` with a `pattern`) | **Undefined step** — `find_match` returns `None` | Yes, with the real regex |
| Regex matches but the converter raises (custom type with **no** `pattern` → `.+?`, or converter rejects) | `MatchWithError` → step **errors** at run time (`StepParseError`); also *shadows* any later definition that would have matched | No — only by running the converter in Python |
| `{x:UnknownType}` in the definition | Definition is **silently dropped** (BAD-STEP-DEFINITION printed), so its steps look undefined | Python-side only |

Other facts the design depends on:

- Matching is a full match on the step's name only (no docstring/table), candidates are the step
  type's definitions then `@step` ones, **first registered wins**.
- parse in behave 1.3 is case-sensitive + `DOTALL`; behave 1.2.6 was case-insensitive.
- A custom type's regex is `converter.pattern` (set by `@parse.with_pattern`), else `.+?`.
  `TypeBuilder.make_enum/make_choice` set it; cfparse `{x:T+}` builds list patterns.
- `--dry-run` runs converters but does **not** report conversion errors — no free lunch there.

## What the extension does today

- Every `{…}` in a step definition is collapsed to `.*`
  (`src/parsers/stepsParserBehaveAdapter.ts` `convertPatternToTextAsRe`, and the AST path in
  `src/parsers/stepsParser.ts`). So `Given I have many cukes` *maps* to `{count:d}` and gets no
  diagnostic, while behave calls it undefined.
- `discover.py` already loads the real registry and already sends each definition's compiled
  regex (`regex_pattern` → `BehaveStepDefinition.regex`). **Nothing in TS reads it.**
- Ambiguity is resolved by "exact first, then longest key", not behave's registration order.
- `re`-matcher definitions go through the same escaping, so `I have (\d+) cukes` is turned
  into a regex that requires literal parentheses — these steps appear to be broken today too
  (needs a test to confirm).

## Proposal: two tiers

### Tier 1 — regex check in TS (keystroke speed)

1. **Python emits structured parameter info** per definition, alongside the existing fields:
   ```jsonc
   { "matcher": "parse",                       // parse | cfparse | re | re0 | cucumber_expressions
     "regex_pattern": "I have (?P<count>…) cukes",
     "regex_flags": ["DOTALL"],                // from the compiled re, so 1.2.6 vs 1.3 is right
     "params": [{ "name": "count", "type": "d", "regex": "[-+ ]?…", "hasPattern": true }] }
   ```
   For parse/cfparse, walk the parser's fields and read each converter's `pattern`
   (`hasPattern: false` when it fell back to `.+?`).
2. **TS translates once per definition** (`(?P<n>` → `(?<n>`, `(?P=n)` → `\k<n>`, `\A`/`\Z` →
   `^`/`$`, flags → `s`/`i`/`u`). Anything it can't translate safely, or that fails
   `new RegExp`, marks the definition **unverifiable** — no strict diagnostics for it, ever.
   Never guess.
3. **Validate** (on the existing `validateStepDefinitions` triggers): for each feature file step
   that the *loose* mapping matched, test the *strict* regex. If strict fails, locate the
   offending value (loose regex with one capture per parameter gives the spans; test each span
   against that parameter's own regex) and put the diagnostic **on the value**, not the line:
   > `"many"` doesn't match parameter `{count:d}` (integer) — behave will treat this step as undefined.

   Code `step-argument-mismatch`, severity Warning (same as `step-not-found`, since behave's
   outcome is the same), with related information pointing at the definition.
4. **Keep the loose mapping for navigation in phase 1.** F12 / hover on a mismatched step should
   still jump to the definition — that's exactly where the user needs to go to see the expected
   type. (Phase 3 revisits mapping.)

### Tier 2 — converter check in Python (on save, debounced)

Catches the case Tier 1 can't: custom types without a `pattern`, and converters that reject
values their pattern admits.

- New `discover.py` mode: given the workspace's distinct concrete step texts (after Outline
  expansion), call `registry.find_match(step)` and report `MatchWithError.stored_error`
  (type + message) per text, plus which definition behave picked.
- Diagnostic `step-argument-conversion-error`, severity **Error** (behave will error the step),
  message includes the converter's exception text.
- Trigger: feature file save + after step discovery, debounced; cache results by
  `(definition key, step text)` so re-saves only send new texts.
- Behind a setting (default on, but easy to disable) because it **runs user converter code** —
  the step modules are already exec'd during discovery, but converters themselves haven't been.

### Scenario Outlines

behave substitutes `<placeholder>` by plain string replacement before matching. So validate each
Examples row's substituted text, and put the diagnostic on the **Examples cell** that supplied
the bad value (falling back to the step if the value came from literal step text). Steps with
unresolved `<…>` are skipped.

## Phasing

1. **Tier 1 for parse/cfparse** with value-level ranges, unverifiable fallback, Outline expansion.
   Unit tests driven by a fixture matrix whose expected results are generated by running the
   real parse library (guards against Python/JS regex drift).
2. **Tier 2** converter validation + BAD-STEP-DEFINITION reporting in the steps file.
3. **Switch mapping to the real regex + registration order**, so navigation, references and
   duplicate detection agree with behave (and `re` steps start working). This is a behaviour
   change to every existing feature, so it's its own step with its own release note.

## Risks / why this could be a bad idea

- **False positives from regex dialect drift.** The biggest risk: a wrong "undefined" squiggle
  costs more trust than a missing one. Mitigation: translate conservatively, mark anything odd
  unverifiable, cross-check against Python in tests. Specific trap: Python's `\w` is Unicode,
  JS's isn't even with `u` — `{name:w}` with `café` would false-positive. Rewrite `\w` →
  `[\p{L}\p{N}_]` under `u`, or mark unverifiable.
- **Most custom types may have no `pattern`.** If so, Tier 1 adds little for custom types
  specifically (it still catches all built-in `d`/`f`/`w` mistakes), and the real value is Tier 2.
  Worth sampling a real Formlabs suite before investing.
- **Stubbed imports.** discover.py stubs missing imports; a converter from a stubbed module has a
  garbage `pattern`. Any `regex_pattern` carrying the stub marker → unverifiable.
- **AST-recovered definitions** (files that failed to load) have no real regex → unverifiable.
- **Tier 2 cost**: a Python spawn per batch (hundreds of ms to seconds). Fine on save, not per
  keystroke. A long-lived Python worker would fix that but is a much bigger change — out of scope.
- **`{f}` surprises are real behave behaviour, not bugs.** `{x:f}` rejects `3`; enum types are
  case-sensitive under behave 1.3. The diagnostic will be right, but users will be surprised —
  the message should say *why* (show the expected pattern/type name).

## Prior art

None of the tools found validate parameter *types* separately from "undefined":

- **Cucumber VS Code extension / language service** — undefined-step diagnostics only; doesn't
  read behave's `register_type`, never runs converters.
- **pytest-bdd-language-server** — closest model: marks steps using `cfparse` + `extra_types` as
  **"unverifiable"** rather than guessing. Same principle as Tier 1's fallback.
- **PyCharm Pro** — "Undefined step reference" only; known to misfire with custom matchers.
- **Upstream jimasp/behave-vsc** — same `.*` collapse as here.

So this would be a genuine differentiator, which is also why there's no reference implementation
to copy.

## Features that fall out of this cheaply

- **Hover on a parameter value**: parameter name, type, expected pattern; with Tier 2, the
  converted value (`"5" → 5 (int)`).
- **Completion for enum/choice types**: when a parameter's pattern is a plain alternation
  (`red|green|blue`, `make_enum`, `make_choice`), offer the choices; quick fix "did you mean
  `green`?" on a mismatch.
- **Semantic highlighting of values** using real spans (compare `executeStepsParamHighlighter.ts`).
- **Report dropped definitions** (`{x:Colr}` typo) as an error in the steps file — today they
  vanish silently and every step using them looks undefined.
- **Shadowing warning**: when a `MatchWithError` from an earlier definition hides a later one
  that would have matched.
- **Step stub quick fix (issues #2/#3)**: when the step is a parameter mismatch, don't offer to
  generate a new definition — offer to fix the value instead. Same for `execute_steps` call
  sites, which share the matcher.

## Decisions

1. Both diagnostics are **Errors**: `step-argument-mismatch` (behave reports the step undefined)
   and `step-argument-conversion-error` (behave errors the step).
2. The Python check is **on by default**, behind `gs-behave-bdd.checkStepArgumentsWithPython`.
   It only spawns for steps that need it (custom or datetime types, or steps an unverifiable
   definition could match), so projects without custom types never start a process for it.
3. The feature-side term is behave's: **argument** (added to `CONTEXT.md`).

## As built

- `src/python/step_params.py`: `describe_matcher()` (per-definition `param_check` in discovery
  output) and `check_steps()` (`discover.py --check-steps`, texts on stdin).
- `src/parsers/stepArguments.ts`: Python→JS regex translation and `checkStepText()` (behave's
  candidate order, first match wins). `stepArgumentStore.ts` compiles per discovery and memoizes;
  `stepArgumentPythonCheck.ts` batches, caches and runs the behave check; `outlineExamples.ts`
  expands Scenario Outlines.
- `src/handlers/stepArgumentDiagnostics.ts` runs from `validateStepDefinitions`;
  `stepArgumentHover.ts` adds the argument hover.
- `test/unit/parsers/stepArgumentsBehaveParity.test.ts` runs real behave over a corpus and
  asserts the TypeScript verdict never contradicts it.
- Phase 3: `_getStepFileStepMatch` asks the argument check first and uses the definition behave
  matches (or, on a mismatch, the one the step was written for), falling back to wildcard
  matching for Scenario Outline steps and anything undetermined. Each behave definition is linked
  to its `StepFileStep` (`getStepFileStepForBehaveDefinition`). Duplicate detection needed no
  change: it already compares behave's exact decorator text, not wildcard keys.
- Follow-ups: parameter highlighting (feature files and `execute_steps`) uses the argument
  spans behave would pass (`getStepArgumentSpans` - parse parameters, regex capture groups), and
  `execute_steps()` call sites get the same argument diagnostics via `diagnoseStepArguments`.
- Deviation from the plan: definitions that share a wildcard pattern (e.g. `order {a:d} x` and
  `order {b} x`) collide in the step mapping's key, so the argument check keeps its own ordered
  list of every definition instead of reading the step mapping.
