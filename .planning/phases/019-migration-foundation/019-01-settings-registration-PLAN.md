---
phase: 019-migration-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - test/unit/packageJsonSchema.test.ts
autonomous: true
requirements: [CONSENT-05, CONSENT-07, CONSENT-08]
must_haves:
  truths:
    - "User sees `gs-behave-bdd.migrationMode` in the Settings UI as an enum dropdown with values prompt / migrate-and-delete / migrate-and-keep / skip and default `prompt`."
    - "User sees `gs-behave-bdd.completedMigrations` in the Settings UI as a string array with default `[]`."
    - "Both settings have markdownDescriptions explaining their semantics (per CONSENT-08)."
    - "Both settings are editable per-scope (Global / Workspace / WorkspaceFolder)."
  artifacts:
    - path: "package.json"
      provides: "migrationMode + completedMigrations contribution entries under contributes.configuration.properties"
      contains: "gs-behave-bdd.migrationMode"
    - path: "test/unit/packageJsonSchema.test.ts"
      provides: "Schema-shape tests pinning the new entries (enum values, defaults, descriptions present)"
  key_links:
    - from: "package.json"
      to: "vscode Settings UI"
      via: "contributes.configuration.properties"
      pattern: "gs-behave-bdd\\.migrationMode"
---

<objective>
Register the two new v1.5.0 settings — `gs-behave-bdd.migrationMode` (enum) and `gs-behave-bdd.completedMigrations` (string[]) — in `package.json` so the migration evaluator (Plan 02) and recheck command (Plan 03) have a real settings surface to read/write through `vscode.workspace.getConfiguration("gs-behave-bdd").inspect(...)`.

Purpose: Closes CONSENT-05, CONSENT-07, CONSENT-08. Pure schema-level work — no TypeScript code changes.
Output: `package.json` updated; schema tests in `test/unit/packageJsonSchema.test.ts` pin the new entries.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/019-migration-foundation/019-CONTEXT.md
@CLAUDE.md
@AI_INSTRUCTIONS.md

<interfaces>
<!-- Existing settings registration pattern in package.json. New entries follow the same shape. -->
<!-- All gs-behave-bdd.* settings declare scope, type, markdownDescription, default. -->

From package.json (existing analog — `suppressedNotifications` array setting, lines 114-122):
```json
"gs-behave-bdd.suppressedNotifications": {
  "scope": "resource",
  "type": "array",
  "items": { "type": "string" },
  "markdownDescription": "List of notification keys that have been dismissed via 'Don't Show Again'. Edit this list to re-enable suppressed notifications. Known keys: `multiConfigNotification` (multiple behave configs found).",
  "default": []
}
```

From package.json (existing enum pattern — `importStrategy`, around line 78):
The repo uses `"type": "string"` + `"enum": [...]` pattern (verify by reading the file). New `migrationMode` follows the same shape.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Register migrationMode and completedMigrations in package.json</name>
  <read_first>
    - C:\code\gs-behave-bdd\package.json (lines 1-125 — read the full `contributes.configuration.properties` block to confirm shape, ordering, and the existing `gs-behave-bdd.importStrategy` enum pattern; place new entries alphabetically with the other gs-behave-bdd.* entries, e.g. after `discoveryStopOnFirstHit` and before `suppressedNotifications`)
    - C:\code\gs-behave-bdd\test\unit\packageJsonSchema.test.ts (existing schema tests — understand the assertion style; we will add tests for the new entries here)
  </read_first>
  <files>package.json, test/unit/packageJsonSchema.test.ts</files>
  <behavior>
    - Schema test 1: `gs-behave-bdd.migrationMode` exists; type === "string"; enum === ["prompt", "migrate-and-delete", "migrate-and-keep", "skip"]; default === "prompt"; scope === "resource"; markdownDescription is a non-empty string mentioning "prompt" and "migrate".
    - Schema test 2: `gs-behave-bdd.completedMigrations` exists; type === "array"; items.type === "string"; default deep-equals []; scope === "resource"; markdownDescription is a non-empty string mentioning "migration" and "Recheck Migrations".
  </behavior>
  <action>
    Add two new entries to `package.json` under `contributes.configuration.properties` (place alphabetically near the other `gs-behave-bdd.*` entries — suggested location: after `gs-behave-bdd.discoveryStopOnFirstHit` and before `gs-behave-bdd.suppressedNotifications`).

    Entry 1 — `gs-behave-bdd.migrationMode` (per CONSENT-05, D-04 context, REQUIREMENTS.md design reference):
    ```json
    "gs-behave-bdd.migrationMode": {
      "scope": "resource",
      "type": "string",
      "enum": ["prompt", "migrate-and-delete", "migrate-and-keep", "skip"],
      "markdownDescription": "Default strategy for case 2 migration prompts (legacy setting present, canonical setting absent at the same scope). `prompt` (default) shows a notification with three actions. `migrate-and-delete` silently copies the legacy value into the canonical key and removes the legacy key. `migrate-and-keep` silently copies the legacy value into the canonical key and leaves the legacy key in place. `skip` silently marks the migration as Finished without copying. Case 3 (both legacy and canonical set) always prompts regardless of this setting. Run *Behave BDD: Recheck Migrations* from the command palette to re-evaluate.",
      "default": "prompt"
    }
    ```

    Entry 2 — `gs-behave-bdd.completedMigrations` (per CONSENT-07):
    ```json
    "gs-behave-bdd.completedMigrations": {
      "scope": "resource",
      "type": "array",
      "items": { "type": "string" },
      "markdownDescription": "List of migration IDs that have been finished at this scope. Edited automatically by the extension after each migration is evaluated. Each VS Code scope (Global / Workspace / Workspace Folder) maintains its own array — a new workspace folder starts empty and is automatically scanned on first activation. Run *Behave BDD: Recheck Migrations* from the command palette to clear this list and re-prompt.",
      "default": []
    }
    ```

    Then add tests to `test/unit/packageJsonSchema.test.ts` (mirror the assertion style already used for `suppressedNotifications`):
    - Pin every property listed in <behavior> above. Use `assert.deepStrictEqual` for the enum array and the empty default array.
    - The markdownDescription assertion checks for non-emptiness AND substring presence ("Recheck Migrations" for completedMigrations satisfies CONSENT-08's "clearly explain their semantics" bar; "prompt" + "migrate" for migrationMode).

    Per CONSENT-08, the descriptions above are the canonical copy for v1.5.0 — they will be reused verbatim by Phase 22 DOC-02. Do not paraphrase.
  </action>
  <verify>
    <automated>npm run test:unit -- --grep "packageJsonSchema"</automated>
  </verify>
  <acceptance_criteria>
    - Reading `package.json` and JSON-parsing it shows both new properties under `contributes.configuration.properties` with the exact shapes above.
    - `npm run test:unit` reports 0 failures; new schema tests pass.
    - `npx eslint src --ext ts` exits 0 (no `src/` changes, but this catches any incidental).
    - Grep `"gs-behave-bdd.migrationMode"` in package.json returns exactly 1 hit; same for `"gs-behave-bdd.completedMigrations"`.
  </acceptance_criteria>
  <done>Both settings are registered, schema tests pin their shapes, lint and unit tests pass.</done>
</task>

</tasks>

<verification>
- `node -e "const p=require('./package.json'); const s=p.contributes.configuration.properties; if(!s['gs-behave-bdd.migrationMode']||!s['gs-behave-bdd.completedMigrations']) process.exit(1)"` exits 0.
- `npm run test:unit` reports 0 failures.
- `npx eslint src --ext ts` exits 0.
</verification>

<success_criteria>
Phase 19 success criterion #1 satisfied: both settings visible in Settings UI, default values correct, descriptions present.
</success_criteria>

<output>
After completion, create `.planning/phases/019-migration-foundation/019-01-SUMMARY.md` summarising the schema additions, the description copy chosen, and the schema-test count delta.
</output>
