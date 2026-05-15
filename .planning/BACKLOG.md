# Backlog

Captured ideas for future milestones. Not yet scoped or prioritized into requirements.
Promote items via `/gsd-review-backlog` or by referencing them during `/gsd-new-milestone`.

---

## High Impact, Moderate Effort

### 1. Quick-fix to generate missing step definitions
When a step is underlined as "undefined" (yellow squiggly), offer a Code Action (lightbulb) that generates a stub `@given`/`@when`/`@then` decorated function in the appropriate steps file. Probably the #1 feature users of Behave tooling want — go from red to green fast.

### 2. CodeLens for step definitions
Show inline "N references" above each `@given`/`@when`/`@then` decorator in Python files (like how TypeScript shows reference counts). Clicking would trigger Find All References. Makes step files much easier to navigate and lets you spot dead steps at a glance.

### 3. Tag-based test filtering
Add a setting or quick-pick UI to filter which tests appear in Test Explorer by tag (e.g., `@smoke`, `@wip`, `@slow`). Behave supports `--tags` natively — wire it into the run command so users can scope their test runs without editing config files.

### 4. Improved step pattern matching
The README notes limitations around `{param:d}`, cfparse, and full regex patterns in step decorators. Improving the regex engine to handle these would fix false "undefined step" diagnostics for teams using advanced step patterns.

---

## High Impact, Lower Effort

### 5. Table formatting in feature files
Auto-align Data Table and Examples table columns (pipe-aligned) when formatting a feature file. The formatter already exists (`formatFeatureProvider.ts`) — extend it to pad table cells so columns line up. Very visible quality-of-life improvement.

### 6. "Run Last Test" / "Rerun Failed" commands
Add commands to re-run the last test execution or re-run only failed tests. Extremely common workflows during TDD cycles; saves clicks vs. navigating the Test Explorer each time.

### 7. Tag autocompletion in feature files
When typing `@` at the start of a line in a feature file, offer autocomplete suggestions based on tags already used across the workspace. Helps maintain consistency and avoids typos in tag names.

### 8. Snippet improvements / step keyword chaining
After typing a step line and pressing Enter, auto-suggest `And` or `But` continuation. The current snippets are basic — context-aware suggestions (e.g., after `Given`, suggest common patterns from existing steps) would be much more useful.

---

## Medium Impact, Moderate Effort

### 9. Gherkin i18n (internationalization)
Behave supports Gherkin in multiple languages (`# language: fr` header). Supporting non-English keywords (`Fonctionnalité`, `Scénario`, `Soit`, etc.) would open the extension to a much wider audience.

### 10. Dead step detection diagnostic
The extension already knows all step definitions and all feature file usages. Add a diagnostic (or a dedicated view) that flags step definitions with zero references — helps keep step files clean as features evolve.

### 11. Step refactoring — rename step pattern
When renaming a step's regex/pattern in a Python file, offer to update all matching step text in feature files. The inverse of "generate step" and makes refactoring safe.

### 12. Test run profiles with behave CLI args
Allow users to define named run profiles beyond just env var presets — e.g., profiles that include `--tags`, `--no-capture`, custom `behave.ini` overrides, etc. Surface these as VSCode Test Run Profiles in the Test Explorer dropdown.

---

## Lower Effort, Nice Quality-of-Life

### 13. Breadcrumb / sticky scroll for Data Tables
The `documentSymbolProvider` already supports Feature/Scenario sticky scroll. Extending it to keep the table header row visible while scrolling through long Examples tables would be helpful.

### 14. Color/icon customization for tags in Test Explorer
Allow mapping tags to icons or colors in Test Explorer (e.g., `@wip` gets a yellow icon, `@smoke` gets a lightning bolt). Makes it easier to visually scan test trees.

### 15. "Copy as behave command" from Test Explorer
Right-click a test item and copy the equivalent behave CLI command to clipboard. Useful for debugging outside VS Code or sharing repro steps with teammates.

### 16. Inline test output in feature files
After a test run, show pass/fail indicators as decorations (green check / red X) inline next to each scenario in the feature file, not just in Test Explorer.

---

## Unsorted

### 17. Icon for step references
We need a dedicated icon for step references (Find All References results, CodeLens, etc.) so the UI feels finished.

### 18. Secret-aware env var presets
Env var presets that include spooky secret env vars, with automatic redaction in the output log and test-results log for security. Users should be able to mark a preset entry as "secret" and have its value masked everywhere it would otherwise be printed.

### 19. `And` keyword handling after `Background` blocks
We don't handle `And` keywords correctly after Background statements. The first non-`Given`/`When`/`Then` keyword in a scenario should inherit from whichever Background step it follows, but currently the resolution breaks for scenarios that open with `And`.

Repro feature illustrating the issue:

```gherkin
@only.with_canonical_machine_type_id=FORM-4
@only.with_canonical_machine_type_id=CLRK-1
@only.with_real_hardware=true
Feature: Network UI (SPIX)
    UI-based WiFi tests that navigate through the touch screen
    using SPIX to interact with QML elements.

    Background:
        Given The printer is on the status screen
        And the printer has ethernet connection
        And detects required wifi ssid broadcast
        When I navigate to the WiFi settings page

    Scenario: Navigate to WiFi settings page via UI
        Then the WiFi settings page is visible
        And the WiFi toggle is visible

    Scenario: Connect to WiFi network via UI
        And the printer is not connected to wifi
        And I tap the WiFi network in the list
        And I enter the WiFi password via UI
        Then the printer is connected to wifi

    Scenario: View connected network details via UI
        And the printer is connected to wifi
        And I tap the connected WiFi network in the list
        Then the network info page is visible
        And the network info page shows "Connected" status

    Scenario: Disconnect WiFi network via UI
        And the printer is connected to wifi
        And I tap the connected WiFi network in the list
        And I tap the disconnect button
        Then the printer is not connected to wifi
```
