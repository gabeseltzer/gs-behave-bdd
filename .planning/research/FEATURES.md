# Feature Landscape: execute_steps IDE Support (v1.6.0)

**Domain:** VS Code extension — IDE support for behave's `context.execute_steps("...")` in Python files
**Researched:** 2026-07-15 (behave 1.3.3 bundled source + IDE ecosystem survey)
**Confidence:** HIGH (semantics read directly from `bundled/libs/behave/`; ecosystem claims sourced)

## Prior art — nobody does this

- **PyCharm / JetBrains**: BDD intelligence is feature-file → step-def only. Generic language injection exists, but there is no built-in behave rule injecting Gherkin into `execute_steps` strings. [Feature spotlight](https://blog.jetbrains.com/pycharm/2014/09/feature-spotlight-behavior-driven-development-in-pycharm/)
- **Cucumber ecosystem**: nested steps were *deprecated* in cucumber-js ([#11](https://github.com/cucumber/cucumber-js/issues/11)) and cucumber-ruby ([#1362](https://github.com/cucumber/cucumber-ruby/issues/1362)) — so no tooling ever emerged there. behave is the outlier: `execute_steps` is a documented first-class API ([tutorial 8](https://behave.github.io/behave.example/tutorials/tutorial08.html)).
- **VS Code extensions** (official Cucumber, cucumberautocomplete, behave-vsc, pytest-bdd): all operate on `.feature` files only. None validate or navigate execute_steps.

**Conclusion: genuine differentiator, unserved across all ecosystems.**

## Table stakes (all in v1.6.0)

| Feature | UX convention |
|---|---|
| Undefined-step diagnostic | **Warning** severity (matches existing `step-not-found`; def might exist via re/cfparse matchers the extension can't see) |
| Invalid-content diagnostic | **Error** severity (behave ParserError at runtime is a guaranteed failure) — user-confirmed in scope |
| Go-to-definition | F12/ctrl+click with `originSelectionRange` = the step-text span |
| Reference counting | Step-def CodeLens + StepReferences tree + native references include call sites (behave-vsc Alt+F12 two-way model) |

## Scope decisions (user-confirmed)

- **Scan anywhere execute_steps is validly callable**: every `.py` the extension enumerates (the `allPyFiles` set — all `.py` under features roots / steps search roots), not just `steps/` files. `.py` outside watched roots = documented limitation.
- **Strictness**: flag invalid content lines (`@tag`, `Scenario:`, junk) in addition to undefined steps.

## Deferred (v2 candidates)

- Quick-fix to scaffold a missing step definition (PyCharm Alt+Enter model)
- Hover / autocomplete inside execute_steps strings
- CodeLens title distinguishing sources ("3 references (1 in steps)")

## Anti-features

- Validating f-strings / dynamic strings — false positives erode trust; skip must emit *nothing*
- Non-English keyword validation — the invoking feature's `# language:` is unknowable from the .py file
