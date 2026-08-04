---
phase: 260730-vlg
plan: 01
status: complete
date: 2026-07-30
requirements: [vlg-A, vlg-B, vlg-C, vlg-D]
files_modified:
  - src/logger.ts
  - src/settings.ts
  - src/common.ts
  - src/configuration.ts
  - src/extension.ts
  - src/testWorkspaceConfig.ts
  - src/handlers/providerHelpers.ts
  - src/handlers/gotoStepHandler.ts
  - src/parsers/fileParser.ts
  - src/parsers/behaveLoader.ts
  - src/python/discover.py
  - package.json
  - README.md
  - test/unit/vscode.mock.ts
  - test/unit/settings/verboseLogging.test.ts
  - test/unit/settings/fatalToast.test.ts
  - test/unit/settings/multiPathPrecedence.test.ts
  - test/unit/settings/projectUriDerivation.test.ts
  - test/unit/settings/logSettingsPlural.test.ts
files_added:
  - src/handlers/diagnosticReportHandler.ts
  - test/unit/handlers/verboseDiagnostics.test.ts
  - test/unit/parsers/stepSearchFailureLogging.test.ts
  - test/unit/discovery/discoveryRejectionLogging.test.ts
  - .planning/codebase/LOGGING.md
test_count_before: 1080
test_count_after: 1118
---

# 260730-vlg — Verbose Diagnostic Logging Summary

A user of the extension reported that it "isn't working" — specifically that ctrl+click on a
step in a `.feature` file didn't navigate to the Python step definition — and there was no way
to find out why. This task made every silent give-up path explain itself, gave `verboseLogging`
real teeth, and added a single-file diagnostic artifact a user can send to a maintainer.

The durable design rules extracted from this work live in
[.planning/codebase/LOGGING.md](../../codebase/LOGGING.md).

## Requirements

| ID | Requirement |
| --- | --- |
| vlg-A | A user can turn on one setting and learn *why* step navigation / discovery gave up |
| vlg-B | A user can produce one artifact containing everything a maintainer needs |
| vlg-C | Asking a user to enable diagnostics must not ask them to leak secrets |
| vlg-D | Setup-stage failures (discovery, step-definition search) must not be silent |

## Starting position

`xRay` and `verboseLogging` both already existed, which is why this was worth checking first:

- **`xRay`** produced rich `diagLog()` output, but only to the **DevTools console** — not
  somewhere an ordinary user will find or copy.
- **`verboseLogging`** existed with a promising description but was wired to exactly *one*
  behaviour: un-redacting env var presets in the settings dump. No other code read it.

## What changed

### Sub-fix A — `logVerbose` + un-silencing step navigation (commit `a8a0eda`)

- `src/logger.ts`: added `logVerbose(text, wkspUri?)`, gated on `verboseLogging`, writing to the
  **output channel** (not just the console). Added `verboseLoggingEnabled()`, which swallows a
  throwing `globalSettings` getter so a logging call can never be what surfaces a broken config.
- `src/handlers/providerHelpers.ts`: all five bare `return undefined` branches now log a reason.
  Added `logStepResolutionContext()`, which diagnoses the actual cause — feature file outside
  every configured features path / zero step definitions loaded / definitions present but no
  pattern matched. Returns `""` when verbose is off so callers pay nothing.
- `src/handlers/gotoStepHandler.ts`: same treatment for the command (F12 / context-menu) path.
- `src/parsers/fileParser.ts`: verbose logging of searched paths, `.py`/step-file counts,
  interpreter, cwd, step dirs passed to behave, and the discovery outcome (failed files, stubbed
  modules, duplicates). Loud `>>> NO step files found` when the steps folder isn't where we looked.
- New `src/handlers/diagnosticReportHandler.ts` + `gs-behave-bdd.diagnosticReport` command.

### Sub-fix B — split the secrets flag; report to a file (commit `0f31993`)

- New **`gs-behave-bdd.logEnvVarPresetContents`** (window scope, default false) took over the
  "dump full preset contents" behaviour from `verboseLogging` (vlg-C). The old coupling meant
  *"turn on verboseLogging and send me the log"* was also an instruction to leak secrets.
- The report command writes a **timestamped `.log` file** and opens it, instead of copying to the
  clipboard — the report now embeds the session log, which is far too large to paste. Toast
  offers `Copy Path` / `Reveal in Explorer`. It is opened in the editor deliberately, so the user
  can review and redact before attaching it anywhere.
- `Logger` gained a transcript of everything it writes, because vscode exposes **no** API to read
  an `OutputChannel` back.

### Sub-fix C — unbounded session log, streamed to disk (commit `628a086`)

The transcript from B was capped at 5000 lines and held in memory. Removing the cap alone would
have been worse than keeping it: an unbounded `string[]` plus `join()` plus embedding in the
report string costs several times the log size in the extension host, and a long behave run emits
megabytes through `logInfoNoLF`.

- `Logger` now streams every line to `<temp>/gs-behave-bdd-logs/session-<stamp>-<pid>.log` via an
  appending `WriteStream`. Nothing is dropped or truncated; memory stays flat.
- The report is assembled **file-to-file** (summary written, session log appended by stream pipe),
  so peak memory doesn't scale with log size on the read side either.
- Write failures **latch**, so a read-only/full temp dir degrades to "no capture" instead of
  raising once per logged line.
- Deliberately **not** under `config.extensionTempFilesUri`: `cleanExtensionTempDirectory()` wipes
  that folder on activation without awaiting, so a log written there could be deleted mid-session.
- Sessions older than 7 days are pruned when a new log opens; the running session is never touched.
- **Bug found by the new tests:** the log filename is second-resolution, so two `Logger`
  instances constructed in the same second opened the *same* file in append mode and interleaved.
  Benign in production (one `Logger`) but wrong; now sequence-suffixed.

### Sub-fix D — un-silencing the setup stage (commit `2d69445`)

The user's follow-up suspicion — that initial setup, not ctrl+click, was failing — was correct.
`getUrisOfWkspFoldersWithFeatures()` rejected a workspace folder through ~5 branches with **zero
output**, and a rejected folder gets no test items, no step parsing and no navigation.

- `src/common.ts`: each rejection records a specific reason (`projectPath` missing on disk, every
  config `paths` entry missing, no config file *and* no `features/` folder, …), logged together
  after the scan. When **nothing** is accepted, that is stated **unconditionally** (not gated on
  `verboseLogging`) since the extension is otherwise inert with no explanation anywhere.
- `src/parsers/fileParser.ts`: the `_errored` flag no longer suppresses the *log* of a second
  workspace's parse failure — only the duplicate popup. The fatal-settings guard (previously
  commented "silently no-op here") now leaves a standing record. Both step-search failure paths —
  the loud environmental catch and the deliberately-quiet code-shaped one — log the environment
  they ran in plus the consequence.
- `src/parsers/behaveLoader.ts`: reports the exact reproducible command and **both** streams on
  non-zero exit (`discover.py` can fail after writing partial JSON), and names the interpreter
  with a `Python: Select Interpreter` hint on `ENOENT`.
- `src/python/discover.py`: added a catch-all `except Exception` emitting structured JSON with
  traceback + `sys.executable` + `sys.path`, so an unanticipated exception type is diagnosable
  rather than surfacing as "exited with code 1".
- **Bug introduced and caught:** embedding the command line in spawn errors broke the
  `isBehaveNotInstalledError` text heuristic — the `discover.py` path itself contains the
  substring `behave`, so every `ImportError` matched, re-spawning the bundled fallback and
  hanging (surfaced as three test timeouts). Classification now comes from stderr alone, carried
  on a new `PythonSpawnError.behaveNotInstalled` rather than re-derived from the message. This
  became LOGGING.md Rule 10.
- Also backed out a `discoveryDepth` read in the rejection message — design decision D-11 forbids
  re-reading it at lookup time, guarded by a structural test in `projectList.test.ts`.

## Commits

| SHA       | Title                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| `a8a0eda` | feat(logging): verbose diagnostics + copyable diagnostic report                         |
| `0f31993` | refactor(logging): split env var preset logging out of verboseLogging; write report to a file |
| `628a086` | feat(logging): make the session log unbounded, streamed to disk                          |
| `2d69445` | fix(logging): surface the setup/step-search failures that were silent                    |

## Tests

- **Before:** 1080 passing
- **After:** 1118 passing, 0 failing
- **Net new tests:** 38
  - `test/unit/handlers/verboseDiagnostics.test.ts` — verbose gating, `verboseLoggingEnabled()`
    not throwing on broken settings, the five step-resolution diagnoses, session-log capture and
    prefixing, unbounded retention (20,000 lines, first *and* last survive), graceful degradation
    when the log can't be opened, prune sweep, report filename legality on Windows, and the
    handler writing summary + appended log and opening it.
  - `test/unit/parsers/stepSearchFailureLogging.test.ts` — reproducible command reported, stdout
    included, `ENOENT` interpreter hint, and **both** fallback branches (the `ImportError`
    regression *and* that a genuinely missing behave still falls back).
  - `test/unit/discovery/discoveryRejectionLogging.test.ts` — per-folder rejection reasons, the
    unconditional "nothing found" message, and that it is *not* emitted when a folder is accepted.
  - Existing settings tests repointed at `logEnvVarPresetContents`, plus one asserting
    `verboseLogging: true` alone does **not** enable preset-content logging.
- `npx eslint src --ext ts` — clean (exit 0)
- `npx webpack --mode production` — compiles
- `ruff check src/python/discover.py` — clean

## Not done / follow-ups

- **Not exercised in a live extension host.** Every path is covered by unit tests (the session-log
  and file-append paths against real `fs`), but no change here has been confirmed by an actual
  click in vscode. Worth a manual pass before release.
- `xRay` was left exactly as-is. It remains the DevTools-console flag; `verboseLogging` is now the
  one to ask users for. A future task could fold `xRay` into `verboseLogging` and drop a setting.
- The `logInfoNoLF` behave-output stream is captured line-by-line into the session log as
  individual `capture()` calls, so a streamed chunk that isn't newline-terminated gets its own
  line in the session log. Cosmetic only; the report is still faithful.
- README gained a "Start here: get a diagnostic report" troubleshooting section with the
  three-counts symptom table. `.planning/codebase/CONVENTIONS.md` §Logging now points at
  LOGGING.md.

## Self-Check: PASSED

- All listed files present; `LOGGING.md` and the three new test files added.
- Commits `a8a0eda`, `0f31993`, `628a086`, `2d69445` verified via `git log --oneline`.
- `npm run test:unit` → 1118 passing, 0 failing.
- `npx eslint src --ext ts` → clean; `ruff check` → clean; webpack → compiles.
