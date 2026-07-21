# Pitfalls Research: execute_steps IDE Support (v1.6.0)

**Researched:** 2026-07-15
**Confidence:** HIGH (behave semantics read from bundled 1.3.3 source; ecosystem pitfalls sourced)

## P1 — False positives on dynamic strings (CRITICAL)

A spurious "step not found" on an f-string or variable arg is actively wrong and erodes trust; a missed navigation is invisible. **Skip must emit NOTHING** (no diagnostic, no nav, no ref).
Skip: f-strings (any `f`/`F` in prefix, incl. `rf`), `b` prefix, non-literal args (variables, `"".join`, concatenation — never match the literal regex by construction), single-line literals containing `\n` escapes, unterminated strings (mid-typing).
Prevention: gate everything on "arg is a recognizable string literal"; per-line placeholder suppression for `.format()`/`%` strings.

## P2 — Leading And/But is legal (behave inherits from Background)

`parser.py:865-871`: a leading `And`/`But` first tries `_select_last_background_step_type()` — only errors if the enclosing feature/rule Background is also empty, which is unknowable statically from the .py file. **Never flag leading And/But**; match against given/when/then buckets in order (each falls back to `step` bucket). Phase must carry `isAmbiguousType` and suppress diagnostics on non-match.

## P3 — Step-type inheritance affects matching correctness

`And` after `When` resolves to `when` and only matches `@when`/`@step` defs (`step_registry.py:183-186`). A validator ignoring inheritance produces both false "undefined" and false "defined". Replicate `featureParser.ts:210-214` logic; leading `*` → `given` (`parser.py:876-877`).

## P4 — Docstrings/tables/comments inside the string are valid content

They attach to the preceding step (`parser.py:678-792`); flagging them = false positives. Full-line `#` comments are skipped by behave; **inline `#` is step text** (no comment stripping — `Given foo # bar` is step name `foo # bar`). Embedded docstring inside the literal necessarily uses the other quote kind — toggle-skip its lines.

## P5 — Per-root vs per-workspace rebuild duplication

`rebuildStepMappings` runs once per features root (`fileParser.ts:608-610`); step defs and call sites are workspace-level. Putting exec mapping rebuild inside that loop duplicates rows in multi-path workspaces. `rebuildExecuteStepsMappings` must sit **after** the loop, keyed by `wkspSettings.featuresUri`.

## P6 — Integration-test count assertions

`getStepMappings(featuresUri)` feeds `WkspParseCounts` assertions across every existing integration suite. Exec rows in the flat table would ripple expectedResults everywhere. Parallel array avoids it; add a unit regression guard that `getStepMappings()` excludes exec rows.

## P7 — Debounce staleness

Diagnostics must rescan the **live document text** (`matchExecuteStepsContent`) — cached call-site line numbers lag the buffer for up to 500ms while typing. Navigation/CodeLens reading the debounced cache is acceptable (same staleness class as existing CodeLens); the `range.contains(position)` gate prevents wrong-line jumps.

## P8 — Existing extension-wide matcher limitation inherited

Step defs registered via `re`/`cfparse` matchers aren't modeled by `textAsRe` (existing limitation, AI_INSTRUCTIONS.md "Step Mappings"). execute_steps validation inherits it identically to feature-file diagnostics — consistent behavior, Warning (not Error) severity for undefined steps is the mitigation.

## P9 — Keyword regex differences

`featureFileStepRe` requires a trailing space and lacks `*`. behave accepts `*` (1.3.x) and keywords case-insensitively (`parser.py:851-852`). New regex `/^(Given|When|Then|And|But|\*)\s+(.*)/i` — do not reuse the feature-file one blindly.

## P10 — Scanner edge cases that corrupt ranges

Step text on the opening-delimiter line (`"""Given x` — column base = char after delimiter); closing delimiter on the last step line (`Then y""")`); CRLF (line-oriented scan is safe; never index into a joined string with `\n` assumptions); `.format(...)` after the closing delimiter (keep steps, mark placeholders) vs `+` concatenation (skip whole call).
