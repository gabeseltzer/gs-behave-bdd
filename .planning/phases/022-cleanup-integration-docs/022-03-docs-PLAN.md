---
phase: 022-cleanup-integration-docs
plan: 03
type: execute
wave: 2
depends_on: ["022-01"]
files_modified:
  - README.md
  - package.json
autonomous: true
requirements:
  - DOC-01
  - DOC-02

must_haves:
  truths:
    - "README's 'New in this fork' list gains a new numbered bullet (#14) titled around the theme of migrating from behave-vsc"
    - "Underneath that bullet, a focused sub-section explains the consent UX, migrationMode, completedMigrations, and the Recheck Migrations command"
    - "The sub-section contains a prominent v1.5.0 callout that silent behave-vsc.* fallback reads are removed"
    - "package.json descriptions for gs-behave-bdd.migrationMode and gs-behave-bdd.completedMigrations are self-contained 1-2 sentences each and match the README copy in meaning"
    - "No links from package.json descriptions into README (Settings UI renders them awkwardly)"
  artifacts:
    - path: "README.md"
      provides: "DOC-01 — new bullet #14 + sub-section in 'New in this fork'"
      contains: "Migration from"
    - path: "package.json"
      provides: "DOC-02 — clean Settings UI descriptions for migrationMode + completedMigrations"
      contains: "gs-behave-bdd.migrationMode"
  key_links:
    - from: "README.md 'New in this fork' bullet #14"
      to: "Recheck Migrations command + migrationMode + completedMigrations + v1.5.0 callout"
      via: "Markdown sub-section directly under the bullet"
      pattern: "Recheck Migrations"
---

<objective>
Document v1.5.0's user-facing behavior change so readers of README and users of the Settings UI both have an accurate picture of the consent flow + the removal of silent fallback reads.

**DOC-01 — README:**
- Add bullet #14 in the "New in this fork" numbered list at `README.md:30` (currently ends at bullet #13). Title around the theme of *"Migration from `behave-vsc`"* with 1-2 sentences of summary.
- Underneath that bullet, add a focused Markdown sub-section that covers:
  - **v1.5.0 callout** (prominent — use a `>` blockquote or bold note): silent `behave-vsc.*` fallback reads are removed in v1.5.0. Users who picked `skip` / *Don't migrate* keep the legacy values in `settings.json` but the extension no longer reads them. They must either copy values manually or run *Behave BDD: Recheck Migrations* to re-prompt.
  - **`migrationMode` setting** — the four values (`prompt` / `migrate-and-delete` / `migrate-and-keep` / `skip`) and what each does for case 2 hits. Note that case 3 (both legacy and canonical set at the same scope) always prompts regardless of this setting.
  - **`completedMigrations` setting** — what it stores (array of migration IDs marked Finished at this scope), why it's per-scope (Global / Workspace / WorkspaceFolder are independent), and when a user would want to clear it (after picking `skip` and changing their mind — preferable to use the recheck command rather than editing by hand).
  - **`Behave BDD: Recheck Migrations` command** — how to invoke it from the command palette; what it does (clears `completedMigrations` for writeable scopes and re-runs the scan).
- Tone: terse, practical, matches the existing fork-additions list. Include code-block examples where they sharpen the explanation (e.g. a settings.json snippet showing the `migrationMode` enum).

**DOC-02 — package.json:**
- Rewrite the `markdownDescription` for `gs-behave-bdd.migrationMode` (currently package.json:118) — keep it 1-2 sentences, self-contained, no links into README. Must convey: this is the default strategy for case-2 prompts; lists the four values; mentions that case 3 always prompts regardless.
- Rewrite the `markdownDescription` for `gs-behave-bdd.completedMigrations` (currently package.json:127) — 1-2 sentences, self-contained. Must convey: stores migration IDs marked Finished; per-scope (mention the word `scope`); mention the recheck command as the way to clear and re-prompt.
- The two descriptions should match the README copy in *meaning* (consistent semantics) but NOT verbatim (Settings UI users get the gist; README readers get the migration narrative).

Purpose: lower README churn than a new top-level section, and gives Settings UI users coherent inline help. Per D-C4 this is the discoverability tradeoff the user accepted.

Output:
- `README.md` modified: one new bullet + one new Markdown sub-section.
- `package.json` modified: two `markdownDescription` strings rewritten.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/022-cleanup-integration-docs/022-CONTEXT.md
@README.md
@package.json

<interfaces>
Current state (BEFORE this plan):

`README.md` — "New in this fork" list ends at bullet 13 (line 30):
```markdown
13. **Per-notification suppression.** Click "Don't Show Again" on any suppressible notification and it stays dismissed for that workspace folder. Backed by the `gs-behave-bdd.suppressedNotifications` array setting — visible in Settings UI, editable by hand, and scoped per workspace folder.

### Old from the original extension
```

`package.json` current descriptions (lines 114-129):
```json
"gs-behave-bdd.migrationMode": {
  "scope": "resource",
  "type": "string",
  "enum": ["prompt", "migrate-and-delete", "migrate-and-keep", "skip"],
  "markdownDescription": "Default strategy for case 2 migration prompts (legacy setting present, canonical setting absent at the same scope). `prompt` (default) shows a notification with three actions. `migrate-and-delete` silently copies the legacy value into the canonical key and removes the legacy key. `migrate-and-keep` silently copies the legacy value into the canonical key and leaves the legacy key in place. `skip` silently marks the migration as Finished without copying. Case 3 (both legacy and canonical set) always prompts regardless of this setting. Run *Behave BDD: Recheck Migrations* from the command palette to re-evaluate.",
  "default": "prompt"
},
"gs-behave-bdd.completedMigrations": {
  "scope": "resource",
  "type": "array",
  "items": { "type": "string" },
  "markdownDescription": "List of migration IDs that have been finished at this scope. Edited automatically by the extension after each migration is evaluated. Each VS Code scope (Global / Workspace / Workspace Folder) maintains its own array — a new workspace folder starts empty and is automatically scanned on first activation. Run *Behave BDD: Recheck Migrations* from the command palette to clear this list and re-prompt.",
  "default": []
}
```

The Phase 19 descriptions are already fairly close to the DOC-02 requirements; tighten them to be more obviously 1-2 sentences (rather than the current ~5 sentences for `migrationMode`) and ensure no `[link](README)` references creep in.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: README — add bullet #14 + 'Migration from behave-vsc' sub-section to 'New in this fork'</name>
  <files>README.md</files>
  <read_first>
    - README.md (full file — confirm the structure of the "New in this fork" list and the section break to "Old from the original extension")
    - .planning/phases/022-cleanup-integration-docs/022-CONTEXT.md (D-C4 — README requirements + tone)
    - .planning/phases/021-consent-ux-case-2-case-3-prompts/021-CONTEXT.md (consent flow semantics — D-A1..D-A9, useful when explaining the actions)
    - .planning/REQUIREMENTS.md (lines 26-37 for canonical consent UX spec; line 52 for CLEANUP-01 callout language)
  </read_first>
  <action>
    Edit `README.md` to insert immediately AFTER bullet 13 (currently the last item before `### Old from the original extension`) and BEFORE the `### Old from the original extension` heading:

    Use this exact structure (you may refine prose for clarity but keep the section headings, bolded callout, and code blocks):

    ```markdown
    14. **Migration from `behave-vsc`.** This fork now reads settings only from its own `gs-behave-bdd.*` namespace. On activation it scans your existing `behave-vsc.*` settings and offers per-scope consent prompts to migrate them forward. The new `gs-behave-bdd.migrationMode` and `gs-behave-bdd.completedMigrations` settings, plus the *Behave BDD: Recheck Migrations* command, give you control over when and how the migration runs.

    #### Migrating from `behave-vsc`

    > **v1.5.0 behavior change.** Silent fallback reads of `behave-vsc.*` settings are removed. The extension only reads its own `gs-behave-bdd.*` keys at runtime. If you pick *Don't migrate* / `skip`, your legacy values stay in `settings.json` but the extension stops honoring them — copy them across manually or run *Behave BDD: Recheck Migrations* to be re-prompted.

    On activation, the extension scans each unfinished migration against every VS Code scope (Global / Workspace / Workspace Folder). Three outcomes are possible per scope:

    - **Neither legacy nor canonical set:** silently marked Finished. No prompt, no writes.
    - **Legacy set, canonical not set:** the *case 2* prompt (controlled by `migrationMode`). Three actions: *Migrate & delete*, *Migrate & keep*, *Don't migrate*.
    - **Both legacy and canonical set:** the *case 3* prompt (always shown, regardless of `migrationMode`). Four actions: *Overwrite & delete*, *Overwrite & keep*, *Keep canonical*, *Keep both*.

    **`gs-behave-bdd.migrationMode`** controls case 2 only. Values:

    - `prompt` (default) — show the case 2 prompt and let the user choose.
    - `migrate-and-delete` — silently copy legacy → canonical, then clear the legacy key.
    - `migrate-and-keep` — silently copy legacy → canonical, leave the legacy key alone.
    - `skip` — silently mark Finished without copying.

    Case 3 ignores this setting and always prompts.

    ```json
    {
      "gs-behave-bdd.migrationMode": "migrate-and-delete"
    }
    ```

    **`gs-behave-bdd.completedMigrations`** is an array of migration IDs that have been finished at the current scope. Each VS Code scope (Global / Workspace / Workspace Folder) keeps its own array, so opening a new workspace folder starts with an empty list and triggers a fresh scan. The extension updates this array automatically; you rarely need to edit it by hand.

    **`Behave BDD: Recheck Migrations`** (command palette) is the supported way to re-trigger the scan. It clears `completedMigrations` for the scopes you can write to and re-runs the evaluator — useful if you previously picked `skip` and changed your mind, or if you pasted `behave-vsc.*` settings into a workspace that has already been migrated.
    ```

    Then leave the `### Old from the original extension` heading exactly where it is.

    Tone notes: match the existing terse practical fork-list style. Code blocks are welcome where they sharpen the point. Do not introduce new top-level sections; keep this all under "New in this fork".
  </action>
  <verify>
    <automated>node -e "const t = require('fs').readFileSync('README.md','utf8'); for (const s of ['migrationMode','completedMigrations','Recheck Migrations','v1.5.0','Migrate & delete','Overwrite & delete']) { if (!t.includes(s)) { console.error('MISSING',s); process.exit(1); } } console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "migrationMode" README.md` returns at least 2.
    - `grep -c "completedMigrations" README.md` returns at least 2.
    - `grep -c "Recheck Migrations" README.md` returns at least 1.
    - `grep -c "v1.5.0" README.md` returns at least 1.
    - `grep -c "Migrate & delete" README.md` returns at least 1.
    - `grep -c "Overwrite & delete" README.md` returns at least 1.
    - `grep -n "^14\." README.md` returns at least one match (the new numbered bullet).
    - `grep -n "### Old from the original extension" README.md` still returns a match (heading preserved).
  </acceptance_criteria>
  <done>
    The "New in this fork" list contains 14 numbered bullets, the new sub-section follows directly underneath, and the v1.5.0 cleanup callout is visually prominent.
  </done>
</task>

<task type="auto">
  <name>Task 2: package.json — tighten markdownDescription for migrationMode + completedMigrations to 1-2 sentences each, self-contained</name>
  <files>package.json</files>
  <read_first>
    - package.json (lines 110-145 for context around both settings)
    - .planning/phases/022-cleanup-integration-docs/022-CONTEXT.md (D-C4 — DOC-02 self-contained, no README links, meaning-match-not-verbatim)
  </read_first>
  <action>
    In `package.json`, rewrite the two `markdownDescription` strings:

    1. `gs-behave-bdd.migrationMode` (~L118) — replace the current ~5-sentence description with a tight 1-2 sentence version. Suggested copy (the executor may refine for clarity, but it must hit all four enum values, mention case 3 always prompts, and reference the Recheck Migrations command):

       ```
       Default strategy for migrating legacy `behave-vsc.*` settings when only the legacy key is set (case 2): `prompt` (default) asks per scope, `migrate-and-delete` / `migrate-and-keep` apply silently, `skip` finishes without copying. Case 3 (both legacy and canonical set) always prompts regardless; run *Behave BDD: Recheck Migrations* to re-evaluate.
       ```

    2. `gs-behave-bdd.completedMigrations` (~L127) — replace with a tight 1-2 sentence version. The copy MUST include the word `scope` (or `Scope`) to convey the per-scope semantics. Suggested copy:

       ```
       Migration IDs marked Finished at this scope. Each VS Code scope (Global / Workspace / Workspace Folder) maintains its own array; run *Behave BDD: Recheck Migrations* to clear and re-prompt.
       ```

    Constraints:
    - Neither description may contain a Markdown link to README or any other URL.
    - Both must be valid JSON string content (escape internal backticks if needed — package.json already uses backticks fine; do not introduce a stray unescaped quote).
    - The schema's `type`, `enum`, `scope`, `default` fields are NOT changed.
    - The `completedMigrations` description MUST contain a case-insensitive match for the word `scope` (the verify script asserts this).
  </action>
  <verify>
    <automated>node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); const mm = p.contributes.configuration.properties['gs-behave-bdd.migrationMode']; const cm = p.contributes.configuration.properties['gs-behave-bdd.completedMigrations']; for (const tok of ['prompt','migrate-and-delete','migrate-and-keep','skip']) { if (!mm.markdownDescription.includes(tok)) { console.error('migrationMode missing token:', tok); process.exit(1); } } if (!mm.markdownDescription.includes('Recheck Migrations')) { console.error('migrationMode missing Recheck Migrations'); process.exit(1); } if (!cm.markdownDescription.includes('Recheck Migrations')) { console.error('completedMigrations missing Recheck Migrations'); process.exit(1); } if (!/scope/i.test(cm.markdownDescription)) { console.error('completedMigrations missing scope/Scope token'); process.exit(1); } if (mm.markdownDescription.includes('](')) { console.error('migrationMode has markdown link'); process.exit(1); } if (cm.markdownDescription.includes('](')) { console.error('completedMigrations has markdown link'); process.exit(1); } console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log(p.contributes.configuration.properties['gs-behave-bdd.migrationMode'].markdownDescription)"` prints a string containing `prompt`, `migrate-and-delete`, `migrate-and-keep`, `skip`, and `Recheck Migrations`.
    - `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));console.log(p.contributes.configuration.properties['gs-behave-bdd.completedMigrations'].markdownDescription)"` prints a string containing `scope` (case-insensitive) and `Recheck Migrations`. (The verify node script asserts `/scope/i.test(cm.markdownDescription)`.)
    - Neither description contains the substring `](` (no markdown links).
    - Both descriptions are short (under 400 characters each — `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).contributes.configuration.properties['gs-behave-bdd.migrationMode'].markdownDescription.length)"` < 400).
    - `npx eslint src --ext ts` still exits 0 (package.json changes don't break lint, but verify the project state hasn't regressed).
    - `npm run test:unit` still passes (the schema-test pins from Phase 19 may or may not assert the description string — confirm; if any test pins the OLD description verbatim, it must be updated to the new copy).
  </acceptance_criteria>
  <done>
    Both `markdownDescription` strings are tight, self-contained, and free of cross-document links. The `completedMigrations` description includes a `scope`/`Scope` token (verify script enforces this). Settings UI users see coherent inline help. The Phase 19 schema-test pins still pass.
  </done>
</task>

</tasks>

<verification>
- README contains a bullet #14 + new sub-section with the v1.5.0 callout, all four `migrationMode` values, both `completedMigrations` and `Recheck Migrations` references, and at least one of each of the case-2 / case-3 button names.
- `package.json` markdownDescriptions are short, self-contained, and pass the JSON validation in the Task 2 verify step (including the new `/scope/i` check for `completedMigrations`).
- `npm run test:unit` is still green.
</verification>

<success_criteria>
1. DOC-01: README has a new numbered bullet #14 + Migration sub-section covering consent UX, `migrationMode`, `completedMigrations`, Recheck Migrations, AND the v1.5.0 silent-fallback-removal callout.
2. DOC-02: package.json descriptions for `migrationMode` and `completedMigrations` are 1-2 sentences each, self-contained, no README links, semantically aligned with README copy. `completedMigrations` includes the `scope` token.
</success_criteria>

<output>
After completion, create `.planning/phases/022-cleanup-integration-docs/022-03-docs-SUMMARY.md` covering:
- Final character counts of both descriptions
- Whether any Phase 19 schema-test pinned the old description verbatim (and if so, what was updated)
- Any prose decisions taken beyond the suggested copy
</output>
