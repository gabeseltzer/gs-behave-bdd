# Requirements: v1.6.0 execute_steps IDE Support

**Defined:** 2026-07-15
**Core value:** behave's `context.execute_steps("...")` strings get the same IDE support as feature-file steps — typos surface in the editor, not at runtime.

## v1.6.0 Requirements

### Validation (VALID)

- [x] **VALID-01**: User sees a Warning diagnostic (`execute-steps-step-not-found`) on an embedded step line inside `execute_steps()` that matches no step definition
- [x] **VALID-02**: User sees an Error diagnostic (`execute-steps-invalid-content`) on lines inside the string that are not valid execute_steps content (`@tag`, `Scenario:`, junk — behave ParserError at runtime)
- [x] **VALID-03**: Dynamic strings (f-strings, variable args, concatenation, `\n`-escaped single-line literals, unterminated strings) produce no diagnostics, navigation, or references whatsoever — skip means emit nothing
- [x] **VALID-04**: Diagnostics track the live document while typing (fresh scan of document text, not the 500ms-debounced cache) and clear when the step is fixed, on open, and when step definitions change in other files
- [x] **VALID-05**: `.format(...)`/`%`-formatted literals are supported; placeholder-bearing lines are matched with placeholders as wildcards and never flagged
- [x] **VALID-06**: `And`/`But`/`*` resolve to the previous step's type for matching (behave semantics). *(Superseded during implementation: verified against bundled behave 1.3.3 source — inside `execute_steps`, `parse_steps` resets parser state so there is NO Background inheritance; a leading `And`/`But` is a guaranteed runtime ParserError and is flagged as `execute-steps-invalid-content` (Error). Leading `*` resolves to given.)*
- [x] **VALID-07**: Docstrings, table rows, full-line comments, and blank lines inside the string are never flagged (valid behave content); inline `#` is treated as step text
- [x] **VALID-08**: execute_steps calls are validated in every `.py` the extension enumerates under watched roots (steps files, helper modules, `environment.py`) — not just `steps/` directories

### Navigation (NAV)

- [x] **NAV-01**: User can ctrl+click / F12 an embedded step line inside an `execute_steps` string to jump to the matching step definition's function
- [x] **NAV-02**: The click target (`originSelectionRange`) is exactly the embedded step-text span — not the quotes, indentation, or surrounding code
- [x] **NAV-03**: The provider contributes nothing for positions outside execute_steps step text, leaving Pylance definitions unaffected

### References (REFS)

- [x] **REFS-01**: Step-definition CodeLens reference counts include execute_steps call sites
- [x] **REFS-02**: "Find All Step References" tree view includes execute_steps call sites, grouped by their `.py` file, with working click-through navigation
- [x] **REFS-03**: Native Find All References (from the step def or a feature step) includes execute_steps call-site locations
- [x] **REFS-04**: Zero behavior change when a workspace contains no execute_steps calls — existing mappings counts, diagnostics, and all existing test suites pass unchanged

### Testing & Docs (TEST)

- [x] **TEST-01**: Unit suites cover the scanner edge-case checklist, mapping rebuild/union (including a regression guard that `getStepMappings()` excludes execute_steps rows), diagnostics, and the definition provider
- [x] **TEST-02**: New integration fixture `example-projects/execute-steps/` and integration suite drive `executeDefinitionProvider` / `executeReferenceProvider` / `executeCodeLensProvider` / `languages.getDiagnostics` end-to-end, including a live-edit staleness test
- [x] **TEST-03**: README, AI_INSTRUCTIONS.md, and CHANGELOG document the feature and its known limitations (English keywords only; dynamic strings unsupported; `.py` outside watched roots not scanned)

## Future Requirements (deferred)

All originally-deferred items were delivered post-milestone (2026-07-17), plus parameter
highlighting inside execute_steps strings (editor decorations — a python semantic tokens
provider would displace Pylance's):

- [x] Quick-fix to scaffold a missing step definition from an embedded step (PyCharm Alt+Enter model)
- [x] Hover and autocomplete inside execute_steps strings
- [x] CodeLens title distinguishing reference sources ("3 references (1 in steps)")
- [x] Scanning imported step-library files outside watched roots (on-disk-only changes to them still go stale until the next full parse — they aren't file-watched)
- [x] Parameter highlighting for `{param}` values in embedded steps (`gsBehaveBdd.executeStepsParameter` theme color)

## Out of Scope

- Localized (non-English) gherkin keywords in execute_steps strings — the invoking feature's `# language:` is statically unknowable from the `.py` file; English-only is the safe direction (missed validation, never false positives)
- Validating f-strings / dynamically built strings — guaranteed false-positive source
- `re`/`cfparse` step-matcher modeling — existing extension-wide limitation, inherited consistently (mitigated by Warning severity)

## Traceability

| Requirement | Phase | Status |
|--------------|-------|--------|
| REFS-01 | Phase 24 | Complete |
| REFS-02 | Phase 24 | Complete |
| REFS-03 | Phase 24 | Complete |
| REFS-04 | Phase 24 | Complete |
| VALID-01 | Phase 25 | Complete |
| VALID-02 | Phase 25 | Complete |
| VALID-03 | Phase 25 | Complete |
| VALID-04 | Phase 25 | Complete |
| VALID-05 | Phase 25 | Complete |
| VALID-06 | Phase 25 | Complete |
| VALID-07 | Phase 25 | Complete |
| VALID-08 | Phase 25 | Complete |
| NAV-01 | Phase 26 | Complete |
| NAV-02 | Phase 26 | Complete |
| NAV-03 | Phase 26 | Complete |
| TEST-01 | Phase 27 | Complete |
| TEST-02 | Phase 27 | Complete |
| TEST-03 | Phase 27 | Complete |

Coverage: 18/18 v1.6.0 requirements mapped.
</content>
