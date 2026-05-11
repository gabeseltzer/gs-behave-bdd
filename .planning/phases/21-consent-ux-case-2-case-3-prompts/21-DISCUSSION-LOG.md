# Phase 21: Consent UX (Case 2 & Case 3 Prompts) - Discussion Log

**Date:** 2026-05-11
**Mode:** discuss (default)

## Areas Discussed

### Area 1: Notification grouping

**Question:** How should multiple case-2/case-3 hits be presented? A user with seeded `behave-vsc.*` settings could trip many hits at once (up to 17 entries × 3 scopes ≈ 51).

**Options:**
1. One notification per hit (Recommended) — Simplest. Each entry×scope produces its own notification. Trusts VS Code's native notification stack to queue them. Matches v1.4.0 precedent (one notification per migrate call). Risk: noisy for users with many legacy settings.
2. Group by entry, one notification per entry — Per migration entry, show one notification that covers all scopes it hits. User picks once, action applies to every scope where the entry hit case 2/3. Less spammy but harder to express scope-by-scope choice.
3. Single summary notification with 'Review migrations' action — One notification: 'N legacy settings detected.' Action opens a quick-pick or output-channel walk-through. Quietest UX but adds a second layer of UI (the walk-through) to design.

**User chose:** Group by entry, one notification per entry.

**Follow-up Q:** When a single entry hits case 2 at one scope and case 3 at another, how should grouping work?

**User chose:** Split: one notification per (entry, case). The action applies to every grouped scope of the same case.

### Area 2: Button labels

**Question:** VS Code notification buttons are constrained in width. The REQUIREMENTS spec uses plain-English labels but we may need to trim. How do you want buttons handled?

**Options:**
1. Use REQUIREMENTS labels verbatim — Most explicit; may wrap or look crowded.
2. Shorter buttons, full action in the message body (Recommended) — Notification message describes the situation; buttons are short.
3. Two-step UI: notification → quick-pick — Roomy for the case 3 four-action set; one extra click.

**User chose:** Shorter buttons, full action in the message body. Case 2 buttons: `Migrate & delete` / `Migrate & keep` / `Don't migrate`. Case 3 buttons: `Overwrite & delete` / `Overwrite & keep` / `Keep canonical` / `Keep both`.

### Area 3: Hook integration

**Question:** The evaluator's `onCaseHit` hook is currently fire-and-forget (returns void). Case 2/3 need to wait for the user's choice and then mark Finished. How should the prompt/action flow integrate?

**Options:**
1. Collect-then-prompt (Recommended) — `evaluateAllMigrations` runs first with a hook that just collects `{case, entry, scope}` tuples. Afterwards a separate orchestrator walks the collected hits and shows prompts.
2. Await inside the hook — Pass an async onCaseHit that awaits the notification choice before returning.
3. Queue + drainer pattern — Hook enqueues; worker drains. Likely overkill.

**User chose:** Collect-then-prompt.

**Follow-up Q:** When a grouped notification covers multiple scopes for one entry (same case), does the chosen action apply to all those scopes uniformly?

**User chose:** Yes — one choice applies to every grouped scope.

### Area 4: Misc decisions (multi-select)

**Options offered:**
- Log each action taken to the output channel
- Translate ConfigurationTarget to friendly scope names in messages
- Suppress case-2 prompts when `migrationMode` is `skip`
- New module `src/migrations/consent.ts` holds the prompts/actions dispatcher

**User chose:** (no selections recorded — defaults applied per the question's "(Defaults shown if you skip)" semantics: all four items adopted as documented in CONTEXT.md D-A4, D-A6, D-A8.)

## Deferred Ideas

- Bulk "apply to all" action across many entries — out of scope; revisit if users report notification volume issues.
- Per-entry `migrationMode` overrides — already deferred out of v1.5.0 in REQUIREMENTS.md.
- Removing the `behave-vsc.*` silent-fallback reads — that's CLEANUP-01, scoped to Phase 22.
- Integration test in real VS Code — TEST-07 lives in Phase 22; Phase 21 is unit-only.
- Schema validation of migrated values — deferred from Phase 20; would be a future hardening pass.
- Localization of notification copy — extension is English-only today.

## Claude's Discretion

- Exact notification copy wording (D-A2.4) — message body content can be iterated by the planner; button labels are pinned by tests.
- Internal helper signatures (`readMigrationMode`, `formatCase2Message`, `runOverwriteAtScope`, etc.) — naming/shape decided at plan time.
- Sort order for grouped notifications — locked to `entry.id` then case ascending for determinism.
- Module-internal type exports vs re-exports through `src/migrations/index.ts` — handled by the planner alongside test imports.
