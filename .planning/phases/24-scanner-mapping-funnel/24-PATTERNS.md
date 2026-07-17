# Phase 24: Scanner + Mapping Funnel - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 7 (3 new, 4 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `src/parsers/executeStepsParser.ts` | parser (module-level cache) | transform (regex/line scan → cached objects) | `src/parsers/stepsParser.ts` (cache/delete shape) + `src/parsers/featureParser.ts` (And/But/type-inheritance line-scan logic) | exact (structural) |
| `src/parsers/gherkinPatterns.ts` (extend) | utility (shared regex constants) | transform | itself (net-new export alongside `stepRe`/`featureFileStepRe`) | exact |
| `src/parsers/stepMappings.ts` (extend) | service (matching/union funnel) | CRUD (build/read/delete in-memory table) | itself (`rebuildStepMappings`, `_getFilteredSteps`, `getStepMappingsForStepsFileFunction`) | exact |
| `src/parsers/fileParser.ts` (extend) | orchestrator/controller | event-driven (parse-cycle orchestration) | itself (`_parseStepsFiles`, two `rebuildStepMappings` loop call sites) | exact |
| `test/unit/parsers/executeStepsParser.test.ts` | test | transform (pure-function unit tests) | `test/unit/parsers/stepsParser.test.ts` | exact |
| `test/unit/parsers/executeStepsMappings.test.ts` | test | CRUD (state-mutation unit tests) | `test/unit/parsers/stepMappingRegexCache.test.ts` (+ `stepMappings.ts` for the functions under test) | exact |

## Pattern Assignments

### `src/parsers/executeStepsParser.ts` (parser, transform)

**Analogs:** `src/parsers/stepsParser.ts` (module structure/cache), `src/parsers/featureParser.ts` (line-scan/type-inheritance)

**Imports pattern** — copy from `stepsParser.ts:1-3`:
```typescript
import * as vscode from 'vscode';
import { uriId, isStepsFile, sepr, basename, afterFirstSepr, getLines } from '../common';
import { diagLog } from '../logger';
```
Note: `executeStepsParser.ts` will need `textBlockDelimiterRe`/`tableRowRe` from `./gherkinPatterns` (per RESEARCH.md "Don't Hand-Roll") and the new `*`-aware keyword regex added to `gherkinPatterns.ts` in this same phase — add that import once the new export lands.

**Module-level cache + class shape** (`stepsParser.ts:11, 17-26`):
```typescript
const stepFileSteps = new Map<string, StepFileStep>();

export class StepFileStep {
  public functionDefinitionRange: vscode.Range = new vscode.Range(0, 0, 0, 0);
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly stepType: string,
    public readonly textAsRe: string
  ) { }
}
```
`ExecuteStepsCallStep` must mirror `FeatureFileStep`'s constructor shape instead (per 24-CONTEXT.md: `key, uri, fileName, range, text, textWithoutType, stepType` + `isAmbiguousType`, `hasFormatPlaceholders`) — copy the **class shape convention** (readonly constructor params, no methods) from `featureParser.ts:23-33`:
```typescript
export class FeatureFileStep {
  constructor(
    public readonly key: string,
    public readonly uri: vscode.Uri,
    public readonly fileName: string,
    public readonly range: vscode.Range,
    public readonly text: string,
    public readonly textWithoutType: string,
    public readonly stepType: string,
  ) { }
}
```

**Get/delete-by-featuresUri-prefix pattern** (`stepsParser.ts:29-36, 44-48`, also `featureParser.ts:35-38, 57-69`):
```typescript
export function getStepFileSteps(featuresUri: vscode.Uri, removeFileUriPrefix = true): [string, StepFileStep][] {
  const featuresUriMatchString = uriId(featuresUri);
  let steps = [...stepFileSteps].filter(([k,]) => k.startsWith(featuresUriMatchString));
  if (!removeFileUriPrefix)
    return steps;
  steps = [...new Map([...steps].map(([k, v]) => [afterFirstSepr(k), v]))];
  return steps;
}

export function deleteStepFileSteps(featuresUri: vscode.Uri) {
  const wkspStepFileSteps = getStepFileSteps(featuresUri, false);
  for (const [key,] of wkspStepFileSteps) {
    stepFileSteps.delete(key);
  }
}
```
Apply this shape to `getExecuteStepsCallSteps(featuresUri)` / `deleteExecuteStepsCallSteps(featuresUri)`. Key convention: `${uriId(featuresUri)}${sepr}${uriId(fileUri)}${sepr}${lineNo}` (mirrors `featureFileSteps`' `${uriId(uri)}${sepr}${lineNo}` key at `featureParser.ts:184`/`217`, extended with the per-line Map keyed by fileUri+line per 24-CONTEXT.md's "module-level per-line Map").

**Clear-on-reparse loop** (`featureParser.ts:120-124`, also `stepsParser.ts:121-124`):
```typescript
const fileUriMatchString = uriId(uri);
for (const [key, featureFileStep] of featureFileSteps) {
  if (uriId(featureFileStep.uri) === fileUriMatchString)
    featureFileSteps.delete(key);
}
```
`parseExecuteStepsFileContent(featuresUri, content, fileUri, caller)` should clear all existing `ExecuteStepsCallStep`s for `fileUri` the same way, before rescanning.

**Line-scan loop, indent capture, text-block/table skip, And/But type-inheritance** (`featureParser.ts:133-221`, this is the core pattern to replicate — NOT import, per RESEARCH.md Pattern 2):
```typescript
let lastStepType = "given";
let insideStepTextBlock = false;
...
for (let lineNo = 0; lineNo < lines.length; lineNo++) {
  const indent = lines[lineNo].match(/^\s*/);
  const indentSize = indent && indent[0] ? indent[0].length : 0;
  const line = lines[lineNo].trim();
  if (line === '' || line.startsWith("#")) continue;

  const textBlockMatch = textBlockDelimiterRe.exec(line);
  if (textBlockMatch) { insideStepTextBlock = !insideStepTextBlock; continue; }
  if (insideStepTextBlock) continue;

  const tableRowMatch = tableRowRe.exec(line);
  if (tableRowMatch) continue;

  const step = featureFileStepRe.exec(line);
  if (step) {
    const text = step[0].trim();
    const matchText = step[2].trim();
    let stepType = step[1].trim().toLowerCase();
    if (stepType === "and" || stepType === "but")
      stepType = lastStepType;
    else
      lastStepType = stepType;
    const range = new vscode.Range(new vscode.Position(lineNo, indentSize), new vscode.Position(lineNo, indentSize + step[0].length));
    ...
  }
}
```
For the execute_steps scanner: swap `featureFileStepRe` for the new `*`-aware regex (`gherkinPatterns.ts` net-new export), add `isAmbiguousType = true` whenever `stepType === "and" || stepType === "but" || stepType === "*"` and there was no prior `lastStepType` set within this call (per 24-CONTEXT.md Pitfall 2/PITFALLS P2), and emit an invalid-content record instead of `continue`-skipping silently when a non-blank/non-comment/non-table/non-docstring line matches no keyword (24-CONTEXT.md line 25).

**CRLF-safe line split** (`common.ts:860-862`, already used at `stepsParser.ts:131`, `featureParser.ts:104`):
```typescript
export function getLines(text: string) {
  return text.split(/\r\n|\r|\n/);
}
```
Use `getLines(content)` directly — do not hand-roll splitting.

**diagLog timing convention** (`stepsParser.ts:205`, `featureParser.ts` caller pattern):
```typescript
diagLog(`${caller}: parsed ${fileSteps} steps from ${stepFileUri.path}`);
```
Mirror this exactly for `parseExecuteStepsFileContent`'s end-of-function log line.

---

### `src/parsers/gherkinPatterns.ts` (utility, transform — extend)

**Analog:** itself; current full file already read (43 lines)

**Existing patterns to model the new export on** (`gherkinPatterns.ts:10-11`):
```typescript
export const stepRe = /^\s*(Given|When|Then|And|But|\*)(.*)$/i;
export const featureFileStepRe = /^\s*(Given |When |Then |And |But )(.*)/i;
```
Add net-new export exactly as locked in `24-CONTEXT.md`/RESEARCH.md Pitfall 5 — do NOT modify `featureFileStepRe` or `stepRe`:
```typescript
export const executeStepsKeywordRe = /^(Given|When|Then|And|But|\*)\s+(.*)/i;
```
(Name at planner's discretion per CONTEXT.md "Claude's Discretion" — follow existing `xxxRe` naming convention.) Reuse existing `textBlockDelimiterRe` (`:15`) and `tableRowRe` (`:16`) for docstring/table-row skipping inside the scanner — do not write new regexes for these (RESEARCH.md "Don't Hand-Roll" table).

---

### `src/parsers/stepMappings.ts` (service, CRUD — extend)

**Analog:** itself (full 191-line file already read)

**Imports pattern** (`stepMappings.ts:1-9`):
```typescript
import * as vscode from 'vscode';
import { getWorkspaceUriForFile, sepr, urisMatch } from '../common';
import { parser } from '../extension';
import { diagLog, DiagLogType } from '../logger';
import { getStepFileSteps, parseRepWildcard, StepFileStep } from './stepsParser';
import { FeatureFileStep, getFeatureFileSteps } from './featureParser';
import { refreshStepReferencesView } from '../handlers/findStepReferencesHandler';
import { performance } from 'perf_hooks';
import { retriggerSemanticHighlighting } from '../handlers/semHighlightProvider';
```
Add `import { ExecuteStepsCallStep, getExecuteStepsCallSteps } from './executeStepsParser';` — do NOT import `retriggerSemanticHighlighting` usage into the new exec rebuild path (per 24-CONTEXT.md: exec rebuild calls `refreshStepReferencesView()` only, NOT `retriggerSemanticHighlighting()`, since exec call sites live in `.py` files with no gherkin semantic highlighting).

**Parallel array + class reuse** (`stepMappings.ts:12, 14-23`):
```typescript
let stepMappings: StepMapping[] = [];

export class StepMapping {
  constructor(
    public readonly featuresUri: vscode.Uri,
    public readonly stepFileStep: StepFileStep,
    public readonly featureFileStep: FeatureFileStep,
  ) {
  }
}
```
Add `let executeStepsMappings: StepMapping[] = [];` as a **separate** module-level array (never pushed into `stepMappings`) — `StepMapping` class itself needs NO change; `ExecuteStepsCallStep` satisfies the `featureFileStep: FeatureFileStep` param via structural typing (RESEARCH.md Pattern 3) since only `.uri/.range/.fileName/.text/.textWithoutType/.stepType` are read downstream.

**Union point to extend — the single edit that delivers REFS-01/02/03** (`stepMappings.ts:33-37`, current state):
```typescript
export function getStepMappingsForStepsFileFunction(stepsFileUri: vscode.Uri, lineNo: number): StepMapping[] {
  return stepMappings.filter(sm =>
    sm.stepFileStep && urisMatch(sm.stepFileStep.uri, stepsFileUri) &&
    sm.stepFileStep.functionDefinitionRange.start.line === lineNo);
}
```
Change to `.concat()` the same predicate applied to `executeStepsMappings`.

**Unchanged-by-design guard function** (`stepMappings.ts:40-42`) — regression test target for REFS-04/Pitfall 4:
```typescript
export function getStepMappings(featuresUri: vscode.Uri): StepMapping[] {
  return stepMappings.filter(sm => urisMatch(sm.featuresUri, featuresUri));
}
```
Never modify this function to read `executeStepsMappings`.

**Delete pattern to mirror for `deleteExecuteStepsMappings`** (`stepMappings.ts:45-47`):
```typescript
export function deleteStepMappings(featuresUri: vscode.Uri) {
  stepMappings = stepMappings.filter(sm => !urisMatch(sm.featuresUri, featuresUri));
}
```

**Rebuild function shape to mirror for `rebuildExecuteStepsMappings`** (`stepMappings.ts:61-94`, this is the full pattern: delete-then-rebuild, filtered-steps fetch, match loop, refresh call, diagLog timing):
```typescript
export function rebuildStepMappings(featuresUri: vscode.Uri, stepDefsUri?: vscode.Uri): number {
  const start = performance.now();
  deleteStepMappings(featuresUri);
  const { featureFileSteps, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes } = _getFilteredSteps(featuresUri, stepDefsUri ?? featuresUri);
  let processed = 0;
  let exactMatchCount = 0;
  let paramsMatchCount = 0;
  const matchLoopStart = performance.now();
  for (const [, featureFileStep] of featureFileSteps) {
    const stepFileStep = _getStepFileStepMatch(featureFileStep, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes);
    if (stepFileStep) {
      stepMappings.push(new StepMapping(featuresUri, stepFileStep, featureFileStep));
      if (stepFileStep.textAsRe.includes(parseRepWildcard)) paramsMatchCount++; else exactMatchCount++;
    }
    processed++;
  }
  const matchLoopTime = Math.round(performance.now() - matchLoopStart);
  retriggerSemanticHighlighting();
  refreshStepReferencesView();
  diagLog(`rebuilding step mappings for ${featuresUri.path} took ${Math.round(performance.now() - start)}ms ` +
    `(matching loop: ${matchLoopTime}ms, ${processed} steps processed, ${exactMatchCount} exact matches, ${paramsMatchCount} params matches)`);
  return processed;
}
```
For `rebuildExecuteStepsMappings(featuresUri)`: same shape, drop `retriggerSemanticHighlighting()` call (per 24-CONTEXT.md), source objects from `getExecuteStepsCallSteps(featuresUri)` instead of `getFeatureFileSteps`, and — per 24-CONTEXT.md's ambiguous-type handling — when `executeStepsCallStep.isAmbiguousType` is true, try given/when/then buckets in order (each falling back to `step`) rather than a single `stepType` lookup; no match across all buckets → no mapping (silently, matching `_getStepFileStepMatch`'s `return null` convention at `stepMappings.ts:189`).

**Shared step-def filtering to extract** (`stepMappings.ts:97-114`, `_getFilteredSteps`) — per 24-CONTEXT.md: "refactor `_getFilteredSteps` step-def half into shared `_getCompiledStepDefs`":
```typescript
function _getFilteredSteps(featureStepsUri: vscode.Uri, stepDefsUri: vscode.Uri) {
  const featureFileSteps = getFeatureFileSteps(featureStepsUri);
  const wkspStepFileSteps = getStepFileSteps(stepDefsUri);
  const exactSteps = new Map(wkspStepFileSteps.filter(([k,]) => !k.includes(parseRepWildcard)));
  const paramsSteps = new Map(wkspStepFileSteps.filter(([k,]) => k.includes(parseRepWildcard)));
  const compiledExactRegexes = new Map<string, RegExp>();
  for (const [key] of exactSteps) { compiledExactRegexes.set(key, new RegExp(key)); }
  const compiledParamsRegexes = new Map<string, RegExp>();
  for (const [key] of paramsSteps) { compiledParamsRegexes.set(key, new RegExp(key)); }
  return { featureFileSteps, exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes };
}
```
Extract the `wkspStepFileSteps`→`exactSteps`/`paramsSteps`→compiled-regex-map portion (lines 99-111) into `_getCompiledStepDefs(stepDefsUri)` returning `{ exactSteps, paramsSteps, compiledExactRegexes, compiledParamsRegexes }`; `_getFilteredSteps` calls it and adds `featureFileSteps`; `rebuildExecuteStepsMappings` calls `_getCompiledStepDefs` directly (it has no `featureFileSteps` equivalent to fetch).

**Matcher reused unmodified** (`stepMappings.ts:119-190`, `_getStepFileStepMatch`) — pass `ExecuteStepsCallStep` objects directly via structural typing per RESEARCH.md Pattern 3; zero changes to this function's signature or body.

**New lookup helpers to add** (mirror `getStepFileStepForFeatureFileStep`, `stepMappings.ts:26-30`):
```typescript
export function getStepFileStepForFeatureFileStep(featureFileUri: vscode.Uri, lineNo: number): StepFileStep | undefined {
  const stepMappingForFeatureFileStep = stepMappings.find(sm =>
    sm.featureFileStep && urisMatch(sm.featureFileStep.uri, featureFileUri) && sm.featureFileStep.range.start.line === lineNo);
  return stepMappingForFeatureFileStep?.stepFileStep;
}
```
Model `getStepFileStepForExecuteStep(fileUri, lineNo)` on this exactly, reading from `executeStepsMappings` instead. `matchExecuteStepsContent(featuresUri, content)` (live-text matching, no caching, for Phase 25) should call `scanExecuteSteps(content)` then run each result through `_getStepFileStepMatch` using `_getCompiledStepDefs(featuresUri)` — same matching path, no persistence.

---

### `src/parsers/fileParser.ts` (orchestrator, event-driven — extend)

**Analog:** itself

**`_parseStepsFiles` — where `allPyFiles` becomes available** (`fileParser.ts:201-220`, verbatim, current state):
```typescript
private _parseStepsFiles = async (wkspSettings: WorkspaceSettings, cancelToken: vscode.CancellationToken,
  caller: string): Promise<number> => {

  const findFilesStart = performance.now();
  let allPyFiles: vscode.Uri[] = [];
  for (let i = 0; i < wkspSettings.featuresUris.length; i++) {
    const featUri = wkspSettings.featuresUris[i];
    const stepsUri = wkspSettings.stepsSearchUris[i];
    const searchInFeatures = stepsUri.path.startsWith(featUri.path);
    const searchUri = searchInFeatures ? featUri : stepsUri;
    const pyFiles = await findFiles(searchUri, undefined, ".py", cancelToken);
    allPyFiles.push(...pyFiles);
  }
  const seenPy = new Set<string>();
  allPyFiles = allPyFiles.filter(f => { const id = uriId(f); if (seenPy.has(id)) return false; seenPy.add(id); return true; });
  diagLog(`${caller}: _parseStepsFiles findFiles took ${Math.round(performance.now() - findFilesStart)}ms, found ${allPyFiles.length} .py files`);

  const stepFiles = allPyFiles.filter(uri => isStepsFile(uri));
  ...
```
Per 24-CONTEXT.md: scan **all** of `allPyFiles` (not just `stepFiles`) for `execute_steps(...)` calls here, independent of the behave subprocess try/catch below it (line 222 `try {`) — call `parseExecuteStepsFileContent` per file, reading content the same way this function already reads content for other `.py` files (check surrounding lines ~228-260 not yet excerpted here for the exact `getContentFromFilesystem` call site the planner should follow — same file, same function, a few lines below).

**Initial full-parse rebuild-loop insertion point** (`fileParser.ts:607-612`, verbatim, current state):
```typescript
const updateMappingsStart = performance.now();
for (const root of wkspSettings.featuresUris) {
  mappingsCount += rebuildStepMappings(root, wkspSettings.featuresUri);
}
buildMappingsTime = performance.now() - updateMappingsStart;
diagLog(`${callName}: stepmappings built`);
```
Insert `rebuildExecuteStepsMappings(wkspSettings.featuresUri);` immediately after this loop closes (once per workspace, NOT inside the `for (const root ...)` loop — Pitfall 3).

**Debounced python-reparse rebuild-loop insertion point** (`fileParser.ts:809-812`, verbatim, current state):
```typescript
for (const root of wkspSettings.featuresUris) {
  rebuildStepMappings(root, wkspSettings.featuresUri);
}
this.onStepMappingsRebuilt?.(wkspSettings.featuresUri);
```
Insert `rebuildExecuteStepsMappings(wkspSettings.featuresUri);` between the loop and the `onStepMappingsRebuilt?.(...)` call — this is the debounced single-file reparse path; per 24-CONTEXT.md, first rescan the edited `.py` file for exec call sites (any watched `.py`, not just `isStepsFile`) before this rebuild call.

**diagLog timing convention used throughout this file** — `` `${caller}: ...` `` / `` `${callName}: ...` `` string prefix; follow exactly for any new diagLog lines added around the exec scan/rebuild insertions.

---

### `test/unit/parsers/executeStepsParser.test.ts` (test, transform)

**Analog:** `test/unit/parsers/stepsParser.test.ts` (full file read, 297 lines)

**Suite/import structure** (`stepsParser.test.ts:1-8`):
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { stepFileDecoratorPattern, parseStepsFileContent, getStepFileSteps, deleteStepFileSteps, ... } from '../../../src/parsers/stepsParser';
import { uriId, sepr } from '../../../src/common';

suite('stepsParser', () => {
  suite('stepFileDecoratorPattern', () => { ... });
  suite('parseStepsFileContent', () => { ... });
  suite('deleteStepFileSteps cleanup', () => { ... });
});
```
Mirror: top-level `suite('executeStepsParser', ...)` with nested `suite()` blocks per concern (regex matching, `scanExecuteSteps` pure-function edge cases, `parseExecuteStepsFileContent` caching, delete/cleanup).

**Per-test-unique-URI isolation, NOT global reset hooks** (`stepsParser.test.ts:272-293`, Pitfall 6 — follow exactly):
```typescript
test('should actually remove step definitions from the step file steps map', () => {
  const featuresUri = vscode.Uri.file('c:/workspace-delete-test/features');
  const stepFileUri = vscode.Uri.file('c:/workspace-delete-test/features/steps/steps.py');
  deleteStepFileSteps(featuresUri); // clean up first
  const reKey = `${uriId(featuresUri)}${sepr}^given${sepr}there is a calculator$`;
  const step = new StepFileStep(reKey, stepFileUri, 'steps.py', 'given', 'there is a calculator');
  storeStepFileStep(featuresUri, step);
  const stepsBeforeDelete = getStepFileSteps(featuresUri);
  assert.strictEqual(stepsBeforeDelete.length, 1, ...);
  deleteStepFileSteps(featuresUri);
  const stepsAfterDelete = getStepFileSteps(featuresUri);
  assert.strictEqual(stepsAfterDelete.length, 0, ...);
});
```
Give each new test its own distinguishing path segment (e.g. `c:/execute-steps-test-N/...`); call `deleteExecuteStepsCallSteps(featuresUri)` explicitly at the top of any test needing a clean slate.

**Error-path assertion convention** (`stepsParser.test.ts:176-184`):
```typescript
try {
  await parseStepsFileContent(featuresUri, stepContent, nonStepsUri, 'test', false);
  assert.fail('Should have thrown an error for non-steps-file URI');
} catch (e) {
  assert.ok(e instanceof Error, 'Should throw an Error');
  assert.match((e as Error).message, /is not a steps file/, 'Error message should indicate not a steps file');
}
```
Not directly applicable to `scanExecuteSteps` (pure function, no throws per the "skip silently" design) but useful if `parseExecuteStepsFileContent` needs an analogous guard.

---

### `test/unit/parsers/executeStepsMappings.test.ts` (test, CRUD)

**Analog:** `test/unit/parsers/stepMappingRegexCache.test.ts` (full file read, 139 lines) + `src/parsers/stepMappings.ts` (functions under test)

**Suite/helper-function structure** (`stepMappingRegexCache.test.ts:1-58`):
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { sepr } from '../../../src/common';
import { StepFileStep, parseRepWildcard } from '../../../src/parsers/stepsParser';
import { _getStepFileStepMatch } from '../../../src/parsers/stepMappings';
import { FeatureFileStep } from '../../../src/parsers/featureParser';

suite('stepMappingRegexCache', () => {
  function makeStepFileStep(stepType: string, textAsRe: string): StepFileStep { ... }
  function makeFeatureFileStep(stepType: string, textWithoutType: string): FeatureFileStep { ... }
  function buildMaps(stepFileSteps: StepFileStep[]): { ... } { ... }

  suite('_getStepFileStepMatch with cached regexes', () => {
    test('exact match is found when step text matches exactly', () => { ... });
    ...
  });
});
```
Mirror this exact shape for the new suite: local `makeExecuteStepsCallStep(...)` factory (parallel to `makeFeatureFileStep`), reuse `buildMaps` verbatim (it already builds the generic `exactSteps`/`paramsSteps`/compiled-regex maps consumed by `_getStepFileStepMatch`), and add nested `suite()` blocks for: `rebuildExecuteStepsMappings`, the union behavior inside `getStepMappingsForStepsFileFunction`, `getStepFileStepForExecuteStep`, `deleteExecuteStepsMappings`, `matchExecuteStepsContent`.

**Required regression guard test** (per 24-CONTEXT.md Specific Ideas / RESEARCH.md Pitfall 4 / REFS-04) — new test, no direct analog line but modeled on the `assert.strictEqual(..., 0, ...)` pattern above:
```typescript
test('getStepMappings excludes execute_steps rows', () => {
  const featuresUri = vscode.Uri.file('c:/execute-steps-regression-test/features');
  // ... rebuild both stepMappings and executeStepsMappings for this featuresUri ...
  const mappings = getStepMappings(featuresUri);
  assert.ok(mappings.every(m => /* m.featureFileStep is not an ExecuteStepsCallStep */), 'getStepMappings must not include execute_steps mappings');
});
```

---

## Shared Patterns

### Module-level cache + URI-prefix-keyed get/delete
**Source:** `src/parsers/stepsParser.ts:11, 29-57`; `src/parsers/featureParser.ts:10-11, 35-69`
**Apply to:** `executeStepsParser.ts`'s new per-line Map, and the `executeStepsMappings` array in `stepMappings.ts`
```typescript
const someMap = new Map<string, T>();
export function getSomething(featuresUri: vscode.Uri) {
  const featuresUriMatchString = uriId(featuresUri);
  return [...someMap].filter(([k,]) => k.startsWith(featuresUriMatchString));
}
export function deleteSomething(featuresUri: vscode.Uri) {
  for (const [key,] of getSomething(featuresUri)) someMap.delete(key);
}
```

### diagLog timing convention on every parse/rebuild function
**Source:** `src/parsers/stepsParser.ts:205`; `src/parsers/stepMappings.ts:90-91`
**Apply to:** `parseExecuteStepsFileContent`, `rebuildExecuteStepsMappings`
```typescript
diagLog(`${caller}: parsed ${fileSteps} steps from ${stepFileUri.path}`);
// or, with performance.now() timing:
diagLog(`rebuilding step mappings for ${featuresUri.path} took ${Math.round(performance.now() - start)}ms (...)`);
```

### CRLF-safe line splitting — never hand-roll
**Source:** `src/common.ts:860-862`
**Apply to:** `executeStepsParser.ts`'s `scanExecuteSteps(content)`
```typescript
export function getLines(text: string) {
  return text.split(/\r\n|\r|\n/);
}
```

### And/But/`*` type inheritance (replicate, don't import)
**Source:** `src/parsers/featureParser.ts:210-214`
**Apply to:** `scanExecuteSteps`'s per-line loop
```typescript
let stepType = step[1].trim().toLowerCase();
if (stepType === "and" || stepType === "but")
  stepType = lastStepType;
else
  lastStepType = stepType;
```
Extend with `isAmbiguousType` flag when no `lastStepType` exists yet in this call (see per-file Pitfall 2 note above).

### Matching engine reuse via structural typing (no modification needed)
**Source:** `src/parsers/stepMappings.ts:119-190` (`_getStepFileStepMatch`)
**Apply to:** `rebuildExecuteStepsMappings`, `matchExecuteStepsContent` — pass `ExecuteStepsCallStep` objects directly wherever a `FeatureFileStep` parameter is expected; only `.textWithoutType`/`.stepType` are read.

### Error handling / try-catch convention
**Source:** CLAUDE.md / AI_INSTRUCTIONS.md project conventions (helpers throw, handlers catch)
**Apply to:** New helper functions in `executeStepsParser.ts`/`stepMappings.ts` should throw on genuine invariant violations (mirroring `stepsParser.ts:112-113`'s `throw new Error(...)` for precondition checks) and never catch internally — no new handler-layer code is introduced in this phase (`fileParser.ts`'s existing try/catch at `:224` and `:800-807` already wraps the insertion points).

## No Analog Found

None — every file in scope has a strong, directly-verified analog already read in full during this mapping pass (`stepsParser.ts`, `featureParser.ts`, `stepMappings.ts`, `gherkinPatterns.ts`, `fileParser.ts`, `stepsParser.test.ts`, `stepMappingRegexCache.test.ts`).

## Metadata

**Analog search scope:** `src/parsers/*.ts`, `test/unit/parsers/*.test.ts`, `src/common.ts` (targeted helper lookups)
**Files scanned:** 8 (7 full reads + 1 targeted grep in `common.ts`)
**Pattern extraction date:** 2026-07-16
