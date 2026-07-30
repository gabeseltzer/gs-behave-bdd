# Logging & Diagnosability Rules

Established 2026-07-30 (quick task `260730-vlg`). These rules are binding for new code; see
[CONVENTIONS.md](CONVENTIONS.md) §Logging for the plain API reference.

## The problem these rules exist to solve

A user reported "the extension isn't working" — ctrl+click on a step didn't navigate to its
Python definition. There was no way to find out why. The code had:

- five bare `return undefined` branches in the step-navigation path,
- ~5 silent `return false` branches in project discovery, after which the extension does
  **nothing at all** for that folder,
- a parse-error handler that showed the first error and *discarded* the rest,
- rich diagnostics that only ever reached the DevTools console (`xRay`), where no ordinary user
  will find them.

Every one of those is a place where the extension knew exactly what was wrong and said nothing.
That is the failure mode these rules target.

## The two audiences

Logging serves two different people, and conflating them is what produced both the noise and the
silence. Decide which one a given message is for **before** choosing an API.

| Audience | Wants | Gets |
| --- | --- | --- |
| **Everyday user** | To not be bothered. A short, actionable message when something is genuinely broken. | Output channel (`logInfo`), notifications (`showError`/`showWarn`) — kept sparse. |
| **Maintainer debugging a report** | Everything that could possibly be relevant. | `logVerbose` + the session log + `Behave BDD: Save Diagnostic Report`. |

## Rule 1 — Never fail silently

**Every early return, swallowed exception, or "give up" branch on a user-visible feature path
must log why.** If the code knows enough to stop, it knows enough to say why it stopped.

"User-visible feature path" means anything the user could notice not happening: step navigation,
hover, completion, diagnostics, test discovery, test runs, project discovery, step-definition
search.

```typescript
// WRONG - the user sees nothing happen and has no way to find out why
if (!stepFileStep)
  return undefined;

// RIGHT
if (!stepFileStep) {
  config.logger.logVerbose(`step navigation: no step definition mapped to "${lineText}"...`, wkspUri);
  return undefined;
}
```

Corollary: **deduplicating a notification must never deduplicate the log.** Suppress the second
toast; always write the second error. (`fileParser`'s `_errored` flag previously suppressed both,
so in a multi-root workspace the second failure vanished entirely.)

## Rule 2 — Default output stays sparse; verbose gets everything

`verboseLogging` off is the state almost every user is in almost always. Keep it quiet:

- **`logInfo`** — reserve for milestones and real problems: settings dumps, "Searching for step
  definitions…", failures with consequences. Roughly: would a user reading this once, in passing,
  be glad it was there?
- **`logVerbose`** — everything else. Per-line decisions, per-file outcomes, resolved paths,
  counts, why a branch was taken. **There is no such thing as too much detail here.** It is a
  no-op unless the user opted in, so err heavily toward including things.

When adding a verbose message, prefer over-inclusion. The cost of a line nobody reads is zero;
the cost of a missing line is another round-trip with the user.

## Rule 3 — State the consequence, not just the error

An error string alone leaves the user to guess whether it matters. Say what won't work now.

```
Failed to load step definitions: <error>
  No step definitions could be loaded, so step navigation (ctrl+click / F12), hover, and
  missing-step diagnostics will not work for this workspace.
```

This matters most on the **deliberately quiet** paths. Code-shaped step-load errors show no
popup by design (the user is probably mid-edit) — which makes the log the *only* standing record,
so it must carry the full story.

## Rule 4 — Log the environment a failure happened in, not just the failure

For anything involving Python, the filesystem, or config resolution, a bare message is rarely
actionable. Include what the operation actually used: interpreter path, cwd, resolved
features/steps paths, file counts, `importStrategy`, timeout, and the **exact reproducible
command** where one exists.

The most common real cause of step-search failure is an environment mismatch — a different
virtualenv, or a path only the user's shell provides. That is invisible without this.

## Rule 5 — Diagnose, don't just report

Where the code can distinguish causes, it should. Raw facts make the user do the reasoning;
a diagnosis doesn't. The three counts that localise nearly every step-navigation failure:

| Observation | Diagnosis to emit |
| --- | --- |
| 0 feature steps parsed | the configured features path doesn't contain the `.feature` files |
| 0 step definitions loaded | discovery failed, or there's no `steps` folder where we looked |
| both > 0, 0 mappings | step text matches no definition's pattern, or step files failed to load |

Prefix a diagnosis with `>>>` so it stands out when skimming a long log.

## Rule 6 — Notifications are a scarce resource

Adding a toast is a tax on every user, forever. The bar:

- **Toast** only for things that are (a) actionable by the user *now* and (b) block a feature
  they just tried to use. Prefer `WkspError` with `actions` (buttons) over prose.
- **Never** toast something self-resolving — a syntax error in a file being edited belongs in the
  Problems pane and the log.
- Route detail to the output channel and offer `Show Details`; keep the toast to one sentence.
- Anything repeatable per-workspace or per-keystroke must be deduped or suppressible
  (`suppressedNotifications`).

## Rule 7 — Sensitive data needs its own opt-in, never a general one

`logEnvVarPresetContents` exists separately from `verboseLogging` for one reason: *"turn on
verboseLogging and send me the log"* must never also mean *"leak your secrets"*. If a future
setting would log credentials, tokens, or full environments, give it its own flag with its own
warning. Never fold it into a general debug flag.

## Rule 8 — The log must be retrievable as one artifact

vscode gives no API to read an `OutputChannel` back, so anything only written there is
effectively unretrievable — asking a user to select-all an output pane does not work in practice.

- Everything the `Logger` writes is mirrored to a session log at
  `<temp>/gs-behave-bdd-logs/session-<stamp>-<pid>.log`, one per window.
- `Behave BDD: Save Diagnostic Report` writes a summary and appends that log as a single file.
- **The session log is unbounded** — nothing is dropped or truncated. A user asked to send logs
  must get the *whole* session; a truncated log silently hides the very tail that usually matters.

Consequences of unbounded, which any change here must preserve:

- **Stream, don't accumulate.** The log goes to disk via a `WriteStream`. An in-memory array
  would cost several times the log size once joined and embedded in the report.
- **Assemble the report file-to-file.** Never read the session log into a string.
- **Logging must never throw.** Failures to open or write latch a flag so a read-only or full
  temp dir degrades to "no capture" rather than erroring once per logged line.
- **Prune previous sessions, never the current one.** Logs older than 7 days are removed when a
  new one opens.
- Session logs deliberately do **not** live under `config.extensionTempFilesUri` —
  `cleanExtensionTempDirectory()` wipes that folder's contents on activation without awaiting.

## Rule 9 — Keep the hot paths free of I/O

Some functions have hard performance budgets (`getUrisOfWkspFoldersWithFeatures()` < 1ms).
Collect reasons into an array and emit **one** message after the loop rather than logging inline.
`logVerbose` returning early when disabled is what makes this affordable — but building an
expensive *message* is not free, so guard construction too:

```typescript
// logStepResolutionContext() returns "" when verbose is off, so callers pay nothing
if (!verboseLoggingEnabled())
  return "";
```

**Know which paths are hot.** `validateAndGetStepInfo` backs the hover provider as well as
go-to-definition, so it runs on every mouse-rest anywhere in a `.feature` file — including
comments and blank lines, where it takes the "not a step line" branch. Eagerly building a
template literal there costs on every hover even with verbose *off*.

Two techniques, both used there:

- **Build lazily.** Pass a thunk so the string is only constructed when it will be logged.
- **Collapse repeats.** On a path that can fire many times for the same user intent, suppress an
  identical consecutive message (keyed by uri+line). A hover storm over one step becomes one log
  entry and one disk write. This is not just perf — a log drowned in repeats is a *worse*
  diagnostic than a short one, which defeats the purpose of Rule 2.

```typescript
const logNav = (build: () => string) => {
  if (!verboseLoggingEnabled()) return;      // nothing is built when off
  const key = `${docUri.toString()}:${position.line}`;
  const text = build();
  if (key === _lastNavLogKey && text === _lastNavLogText) return;   // collapse repeats
  ...
};
```

## Rule 9a — Bound the disk, never the current log

Rule 8 says the running session's log is unbounded. That makes *housekeeping* the only thing
standing between the user and an unbounded temp folder, so it needs two limits, not one:

- **Age** — sessions older than `SESSION_LOG_RETENTION_DAYS` (7) are deleted.
- **Total size** — if surviving *old* logs still exceed `SESSION_LOG_TOTAL_BYTES_LIMIT` (512MB),
  delete oldest-first until under it. Age alone does not bound disk: several windows running
  large suites can blow the budget well inside the retention window.

The running session's log is excluded from both sweeps (`keepPath`), and housekeeping runs
**deferred off the activation path** (`setTimeout(…, 0)`) — the first `capture()` happens while
`activate()` is running, and a readdir plus a stat per file must not sit in front of startup.

## Rule 10 — Don't re-derive classification from a log message

Log messages are for humans and accrete context — paths, commands, embedded stderr. Control flow
must never sniff them.

This is a real bug we shipped and caught: embedding the reproducible command into a spawn error
broke the "behave is not installed" check, because the `discover.py` path *itself* contains the
substring `behave`. Every `ImportError` then matched, re-spawning the bundled-behave fallback in
a loop. Classify once at the source, from the narrowest input (stderr alone), and carry the
answer on a typed error (`PythonSpawnError.behaveNotInstalled`).

## Rule 11 — Subprocesses report structured failures, with a catch-all

For `discover.py` and anything like it:

- A top-level `except Exception` must emit structured JSON — error, kind, traceback,
  `sys.executable`, `sys.path` — so an unanticipated exception type is diagnosable instead of
  surfacing as "exited with code 1".
- On non-zero exit, the TypeScript side reports **both** streams plus the command. `stdout`
  matters: the script can fail *after* writing partial JSON, and that partial output names the
  stage it reached.

## Testing rules

- A "logs the reason" behaviour is a **testable assertion**, not a nicety. Assert on the
  substring a maintainer would actually search for.
- Test the *diagnosis*, not the phrasing: assert `ZERO step definitions were loaded`, not the
  whole sentence.
- Session-log tests use **real `fs`**. Disk-backed durability under volume is the entire point;
  an `fs` mock would assert nothing. One test writes 20,000 lines and checks the first *and* last
  survive.
- Any code path that constructs a `Logger` in tests must clean up its log file (see the
  `newLogger()` helper in `test/unit/handlers/verboseDiagnostics.test.ts`).

## Checklist for new code

- [ ] Does every early return / swallowed error on a user-visible path log a reason?
- [ ] Is a dedup suppressing the notification only, never the log?
- [ ] Is the message on the right channel — `logInfo` (sparse) vs `logVerbose` (exhaustive)?
- [ ] Does it state the consequence, not just the error?
- [ ] Does it include the environment (paths, interpreter, counts, reproducible command)?
- [ ] Does it diagnose where it can, with a `>>>` prefix?
- [ ] Is a new toast really justified? Is it deduped/suppressible? Does detail go to the channel?
- [ ] Could it log secrets? If so, is it behind its own opt-in?
- [ ] Is expensive message construction guarded by `verboseLoggingEnabled()` (or built lazily)?
- [ ] Is this a hot path (hover, completion, semantic highlight, per-keystroke)? If so, are
      repeats collapsed?
- [ ] Does control flow avoid re-parsing any log message?
