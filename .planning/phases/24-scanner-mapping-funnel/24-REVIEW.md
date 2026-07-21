---
phase: 24-scanner-mapping-funnel
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/parsers/executeStepsParser.ts
  - src/parsers/gherkinPatterns.ts
  - src/parsers/stepMappings.ts
  - src/parsers/fileParser.ts
  - test/unit/parsers/executeStepsParser.test.ts
  - test/unit/parsers/executeStepsMappings.test.ts
findings:
  critical: 2
  warning: 8
  info: 3
  total: 13
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-16
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 24 adds an execute_steps() call-site scanner (`executeStepsParser.ts`), a parallel mapping array unioned into `getStepMappingsForStepsFileFunction` (`stepMappings.ts`), and parse-cycle wiring (`fileParser.ts`). The regexes are ReDoS-safe (linear, no nested quantifiers), the parallel-array design correctly preserves `WkspParseCounts` (REFS-04), and the per-workspace rebuild placement in `fileParser.ts` is consistent with where step definitions are keyed (`wkspSettings.featuresUri`).

However, the scanner's stated core invariant — "zero false positives: anything that isn't a recognisable literal form is skipped SILENTLY" — is violated in two common real-world cases (commented-out code, implicit adjacent-string concatenation), and the ambiguous-type handling contradicts the bundled behave 1.3.3 parser's actual semantics (verified against `bundled/libs/behave/parser.py:846-883`). There are also cache-lifecycle defects (prefix-collision in the featuresUri filter), a new unguarded filesystem read that can abort an entire workspace parse, and several test assertions that are vacuous (they cannot fail).

## Critical Issues

### CR-01: Scanner matches execute_steps() inside comments and enclosing string literals — false-positive call steps

**File:** `src/parsers/executeStepsParser.ts:42,203-253`
**Issue:** `callSiteRe` is run over raw file content with no awareness of Python comments or enclosing strings. A commented-out call:

```python
# context.execute_steps("Given a thing")
```

or an example inside a function/module docstring:

```python
def helper(context):
    """Example: context.execute_steps("Given something")"""
```

produces real `ExecuteStepsCallStep` records, which then flow into `executeStepsMappings` and surface as phantom entries in `getStepMappingsForStepsFileFunction` (find-references / CodeLens counts), and will become false Phase-25 diagnostics. Commented-out code is ubiquitous, so this directly breaks the zero-false-positive guarantee the module header claims (lines 3-6). There is no test covering commented-out call sites.
**Fix:** Minimal, safe heuristic in the `while` loop of `scanExecuteSteps`: skip a match when a `#` appears between the start of the match's physical line and `match.index` (skipping is always safe under the skip-on-uncertainty policy). Also advance `callSiteRe.lastIndex` to `afterDelimIndex` after processing each accepted call site so the scanner never rescans inside a literal body it already consumed:

```ts
const matchLineIdx = lineIndexFromOffset(lineStarts, match.index);
const beforeMatch = content.slice(lineStarts[matchLineIdx], match.index);
if (beforeMatch.includes('#'))
  continue; // likely commented-out: skip silently
...
callSiteRe.lastIndex = afterDelimIndex; // don't rescan the literal body
```

Docstring-enclosed examples need a lightweight string-aware pre-pass to fully eliminate; at minimum add tests documenting the current limitation.

### CR-02: Any tail other than `+` is treated as static — implicit adjacent-string concatenation emits truncated step text

**File:** `src/parsers/executeStepsParser.ts:244-250`
**Issue:** The dynamic-content check is a blacklist (`tail.startsWith('+')`), so every other suffix is treated as a static literal. Python's implicit adjacent-string concatenation — the standard PEP8 way to wrap long strings — is emitted with truncated text:

```python
context.execute_steps('Given a thing '
                      'with more text')
```

The scanner emits a call step with text `Given a thing` (runtime text is `Given a thing with more text`), which can falsely match a different step definition or produce a false "no matching step" result. The same hole admits `.replace(...)`, `.join(...)` (when the separator has no `\n` escape), `.strip()`, and stray second arguments — all dynamic or text-mutating, all currently emitted as static.
**Fix:** Invert to a whitelist. Only accept tails that are empty, `.format(...)`, or `% ...`; skip everything else:

```ts
const hasFormatPlaceholders = /^\.format\s*\(/.test(tail) || tail.startsWith('%');
if (tail !== '' && !hasFormatPlaceholders)
  continue; // any other suffix (concatenation, method call, extra args): dynamic, skip silently
```

Add tests: adjacent-string concatenation (same line and wrapped), `.join(`, `.replace(`.

## Warnings

### WR-01: findCallTail stops at textwrap.dedent's closing paren — `+` / `.format` / `%` after the wrapper are invisible

**File:** `src/parsers/executeStepsParser.ts:84-98,244-250`
**Issue:** For `execute_steps(textwrap.dedent("""...""") + x)` or `...dedent("""...""").format(x)`, the character after the closing delimiter is dedent's `)`. `findCallTail` breaks immediately at depth 0 and returns `""`, so the `+` concatenation skip never fires (false-positive call steps from a dynamic string) and `hasFormatPlaceholders` is wrongly `false`. The existing test only covers plain `dedent(...)` with no suffix.
**Fix:** When the dedent wrapper was matched (`match[0]` contains `dedent`), scan past one additional `)` before collecting the tail — e.g. start `findCallTail` at `afterDelimIndex`, and if the trimmed tail is empty and a wrapper was present, re-run from one char past the wrapper's closing paren. Combine with the CR-02 whitelist so unexpected tails skip.

### WR-02: Ambiguous leading And/But/* handling contradicts behave 1.3.3's actual parser semantics

**File:** `src/parsers/executeStepsParser.ts:150-158`, `src/parsers/stepMappings.ts:142-159`
**Issue:** The comment at executeStepsParser.ts:152 claims a leading And/But is "never an error". The bundled behave (`bundled/libs/behave/parser.py:864-871`) raises `ParserError("AND-STEP REQUIRES: An previous Given/When/Then step.")` when there is no prior step and no background — which is exactly the execute_steps case. So a leading `And`/`But` in an execute_steps literal is a guaranteed runtime crash, yet the scanner emits a mapped call step (a reference to code that cannot execute) and Phase 25 will present it as healthy. Separately, for a leading `*`, behave's `parse_step` (parser.py:847-877) resolves `*` with no `last_step_type` to **given** deterministically (the `"given"` keyword list is checked first); the funnel's given→when→then bucket loop in `_matchExecuteStepsCallStep` can match a `@when`/`@then` definition that behave's registry would never resolve — a false-positive mapping.
**Fix:** In `scanBody`, treat a leading `And`/`But` as an invalid line (push to `invalidLines`, matching behave's ParserError), and resolve a leading `*` to `stepType = "given"` (non-ambiguous, matching parser.py). This removes the need for `isAmbiguousType` and the bucket loop entirely; if `isAmbiguousType` is kept for other reasons, restrict the bucket loop to `["given"]`.

### WR-03: Escape sequences and line continuations in non-raw literals are emitted verbatim — step text diverges from runtime text

**File:** `src/parsers/executeStepsParser.ts:104-181,235-237`
**Issue:** Step text is taken from raw source, never unescaped. For non-raw literals: `"Given a \"quoted\" thing"` emits text containing `\"` (runtime: `"`), `"""Given a\tthing"""` emits literal backslash-t (runtime: tab) — mappings silently fail to match valid steps. Worse, a backslash line-continuation inside a triple-quoted literal:

```python
context.execute_steps("""
    Given a thing \
    that continues
""")
```

is one runtime step, but the scanner emits a call step with a trailing `\` plus an `ExecuteStepsInvalidLine` for `that continues` — a false Phase-25 Error on valid code. The `\n` skip at line 236 only covers single-line literals.
**Fix:** Apply the skip-on-uncertainty policy: for non-raw literals (no `r` in prefix), skip the call site silently if the body contains any backslash (`if (!/[rR]/.test(prefix) && body.includes('\\')) continue;` for both single-line and triple-quoted bodies). Raw-prefixed literals can keep the current behavior since their source text equals runtime text.

### WR-04: featuresUri prefix filter matches sibling roots — cross-workspace cache contamination and deletion

**File:** `src/parsers/executeStepsParser.ts:282-295`
**Issue:** `getExecuteStepsCallSteps`/`deleteExecuteStepsCallSteps` filter with `key.startsWith(uriId(featuresUri))`. If one features root URI is a string prefix of another (e.g. multi-root `.../features` and `.../features2`), workspace A's `deleteExecuteStepsCallSteps` (fileParser.ts:225) deletes workspace B's call-step cache — and since workspaces parse in parallel, A's delete can race B's populate, leaving B with missing references until its next parse. `getExecuteStepsCallSteps(A)` likewise returns B's call steps, so `rebuildExecuteStepsMappings(A)` stores B's call sites under A's featuresUri. The sibling parsers share this latent pattern, but here the key format (`featuresUri + sepr + ...`) makes the fix one line.
**Fix:**

```ts
const featuresUriMatchString = uriId(featuresUri) + sepr;
```

in both functions (and consider the same hardening in the sibling parsers as follow-up).

### WR-05: New unguarded filesystem reads in the exec-scan loop can abort the entire workspace parse

**File:** `src/parsers/fileParser.ts:228-233`
**Issue:** The new execute_steps scan loop calls `getContentFromFilesystem(pyFile)` outside the `try` block that begins at line 240. `getContentFromFilesystem` throws when `readFile` fails (common.ts:666-671) — e.g. a .py file deleted or renamed between `findFiles` and the read (branch switch, build clean). The throw propagates to `parseFilesForWorkspace`'s catch, which cancels and disposes **all** workspaces' parses (fileParser.ts:674-678) and shows an error dialog — a whole-extension failure caused by one transient file, contradicting the scanner's own "never throws" design intent stated at lines 222-224.
**Fix:** Wrap the per-file read and skip on failure:

```ts
for (const pyFile of allPyFiles) {
  if (cancelToken.isCancellationRequested)
    break;
  try {
    const pyContent = await getContentFromFilesystem(pyFile);
    execCallSitesFound += parseExecuteStepsFileContent(wkspSettings.featuresUri, pyContent, pyFile, caller);
  }
  catch {
    diagLog(`${caller}: could not read ${pyFile.path} for execute_steps scan, skipping`);
  }
}
```

### WR-06: Per-workspace debounce drops the exec rescan of an earlier-edited file

**File:** `src/parsers/fileParser.ts:738-846` (rescan at 830)
**Issue:** `_debouncePythonReparse` is keyed per workspace and captures `fileUri`/`content` at schedule time. Rapid edits to file A then file B in the same workspace cancel A's timer; only B's timer fires. For step definitions this is fine (the behave subprocess reloads everything from disk), but the execute_steps rescan at line 830 only rescans the **latest** `fileUri` — A's edited execute_steps call sites are silently stale in the cache (wrong ranges/text after the edit) until the next full workspace parse. This gap is introduced by this phase; the pre-existing debounce design was safe only because all previous per-file work was disk-global.
**Fix:** Accumulate pending files per workspace instead of replacing them — e.g. keep a `Map<wkspKey, Map<fileUriId, {uri, content}>>`; on timer fire, run `parseExecuteStepsFileContent` for every pending file, then clear the set.

### WR-07: matchExecuteStepsContent has no fileUri parameter — emitted call steps carry the features-folder URI

**File:** `src/parsers/stepMappings.ts:203-211`
**Issue:** The live-text matcher passes `featuresUri` as `scanExecuteSteps`'s `fileUri` parameter (line 205). Every returned `ExecuteStepsCallStep` therefore has `uri` = the features **directory**, `fileName` = e.g. `"features"`, and a key built from the wrong URI. Any Phase-25 consumer that reads `callStep.uri` (jump-to-location, diagnostics collection keyed by document URI) will misbehave. Currently only exercised by tests, but the API is defective as designed.
**Fix:** Add the document URI to the signature and pass it through:

```ts
export function matchExecuteStepsContent(featuresUri: vscode.Uri, fileUri: vscode.Uri, content: string): ... {
  ...
  const { callSteps } = scanExecuteSteps(content, fileUri);
```

### WR-08: Key mapping-funnel tests are vacuous — the union and REFS-04 assertions cannot fail

**File:** `test/unit/parsers/executeStepsMappings.test.ts:76-155,255-270`
**Issue:**
- The "union" test (line 76) never calls `getStepMappingsForStepsFileFunction` with data; it only asserts `_getStepFileStepMatch` primitives and defers the union claim to "the rebuild suite below".
- The rebuild suite (line 116) rebuilds against **empty** caches: `processed === 0`, `unionResult.length === 0`, and the REFS-04 guard `flatMappings.every(...)` runs on an empty array — vacuously true. The same vacuous `.every`-on-empty pattern repeats at lines 257-269.
- The union edit at stepMappings.ts:46 — the single behavioral change this phase makes to an existing function — is therefore never actually verified: a regression that dropped `.concat(executeStepsMappings...)` would pass every test.
The seams to do this properly are exported: `parseExecuteStepsFileContent` can register a call step for a `featuresUri`, and `rebuildExecuteStepsMappings` + `getStepMappingsForStepsFileFunction` complete the round trip (step defs can be seeded via `storeBehaveStepDefinitions` or by asserting `processed === 1` with zero matches at minimum).
**Fix:** Register at least one call step through `parseExecuteStepsFileContent`, seed one matching step definition, then assert `getStepMappingsForStepsFileFunction(stepFileUri, fnLine)` returns both the feature-file mapping and the exec mapping, and that `getStepMappings` returns a **non-empty** array containing no `ExecuteStepsCallStep` rows.

## Info

### IN-01: Cache key collapses multiple call sites on one physical line; ExecuteStepsCallStep.key inconsistent with cache key

**File:** `src/parsers/executeStepsParser.ts:167,274`
**Issue:** The cache key is `featuresUri + sepr + fileUri + sepr + line`; two `execute_steps("Given a"); context.execute_steps("Given b")` calls on one line silently overwrite each other in the Map. Also, `ExecuteStepsCallStep.key` (line 167: `fileUri + sepr + line`) differs from the cache key (line 274), so `.key` is not usable for cache lookups.
**Fix:** Append the start column to both keys, and construct the cache key from `callStep.key` to keep them consistent.

### IN-02: Triple-quote close search ignores escaped quotes

**File:** `src/parsers/executeStepsParser.ts:222`
**Issue:** `content.indexOf(delim, openEndIndex)` finds `"""` inside `\"""` (escaped quote + `""`), closing the literal one character early per Python semantics and mis-scanning the remainder. Rare in practice; the WR-03 backslash skip would also eliminate it for non-raw literals.
**Fix:** Covered by WR-03's skip-on-backslash for non-raw literals; otherwise scan for an unescaped delimiter as `findUnescapedQuote` does.

### IN-03: invalidLines discarded on the persisted path; ambiguous bucket order untested

**File:** `src/parsers/executeStepsParser.ts:272`, `src/parsers/stepMappings.ts:149`
**Issue:** `parseExecuteStepsFileContent` destructures only `{ callSteps }`, dropping `ExecuteStepsInvalidLine` records — Phase 25 must use the non-persisted `matchExecuteStepsContent` path or the class is dead weight. Separately, the given→when→then bucket **order** in `_matchExecuteStepsCallStep` has no test (the function is unexported and the tests re-implement per-bucket calls), so an order regression would be invisible. (Note WR-02 may remove the bucket loop entirely.)
**Fix:** Document the intended Phase-25 consumption path for invalid lines; if the bucket loop survives WR-02, export or test-seed `_matchExecuteStepsCallStep` with a step text registered under two buckets and assert which wins.

---

_Reviewed: 2026-07-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
