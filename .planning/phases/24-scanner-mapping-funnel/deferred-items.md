# Deferred Items - Phase 24 Scanner + Mapping Funnel

## Plan 01

- **RESOLVED — Pre-existing failing tests were stale build artifacts:** `test/unit/handlers/gherkinStructureDiagnostics.test.ts` (7 failures) had NO source file on this branch — the source lives only on the unmerged `gabes/and-keyword-after-background` branch (commit 51648d0). The failures came from stale compiled artifacts in the gitignored `out/test/` directory left by a prior session on that branch (`compile-tests` never deletes outputs whose sources vanished; the mocha runner globs `out/test/test/unit/**/*.test.js`). Orchestrator deleted the 4 stale files (`out/test/src/handlers/gherkinStructureDiagnostics.js{,.map}`, `out/test/test/unit/handlers/gherkinStructureDiagnostics.test.js{,.map}`) on 2026-07-16; `npm run test:unit` now reports 946 passing, 0 failures. Known repo trap — see release-extension skill's "stale-`out/` build trap" note.
