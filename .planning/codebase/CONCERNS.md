# Codebase Concerns

**Analysis Date:** 2026-04-13

## Tech Debt

**Step Mappings UI Interaction Optimization:**
- Issue: Inefficient step mapping cache clearing during folder/file renames
- Files: `src/parsers/fileParser.ts:374`
- Impact: Performance hit during workspace reorganization; the TODO explicitly states that moving `getAllTestItems()` above the loop would improve performance but requires "thorough testing of UI interactions of folder/file renames"
- Fix approach: Refactor UI interaction tests to validate rename behavior comprehensively, then optimize cache invalidation logic to avoid redundant tree lookups

**Semantic Highlighting Retrigger Mechanism:**
- Issue: Hardcoded workaround for VSCode semantic token refresh
- Files: `src/handlers/semHighlightProvider.ts:131`
- Impact: Reliance on undocumented/potentially fragile VSCode API behavior; code comment explicitly acknowledges lack of better solution
- Fix approach: Monitor VSCode API changes; consider contributing to VSCode if a better mechanism is proposed

## Known Bugs

**VSCode Test API Bug with unittest in Multi-Root Workspaces:**
- Symptoms: Test runs may not stop properly or fail to update results when using `unittest` with "Run Tests" button in multiroot projects
- Files: Not in this codebase (VSCode/Python extension issue)
- Trigger: Using unittest + multiroot workspace + clicking global "Run Tests" button
- Workaround: Use pytest instead, or run tests from individual test tree nodes (not the global button)

**VSCode Test Editor Play Button After Format:**
- Symptoms: Feature file loses ability to execute from the editor's inline play buttons after formatting or adding spaces
- Files: Not in this codebase (VSCode platform issue)
- Trigger: Format feature file (Ctrl+K,Ctrl+F) or add spaces, then try to run via editor gutter
- Workaround: Close and reopen the feature file

## Race Conditions

**JUnit Parsing Race Condition (Fixed in f4d4f8c):**
- Issue: Recent fix applied to resolve race condition in junit file parsing during concurrent test runs
- Files: `src/parsers/junitParser.ts`
- Impact: Integration tests were failing sporadically; likely triggered by parallel test execution or timing issues in multi-workspace scenarios
- Current status: Fixed; monitor for regression in multiroot + parallel test scenarios

**Step Mapping Rebuild During Concurrent Parses:**
- Issue: Step mappings are rebuilt globally in response to Python file changes without workspace isolation
- Files: `src/parsers/stepMappings.ts` (global `stepMappings` array)
- Impact: Concurrent feature parsing in multiple workspaces could race when rebuilding step mappings; no per-workspace locking
- Fix approach: Consider workspace-scoped mapping tables instead of global state; ensure debounce window is sufficient for multi-workspace scenarios

## Performance Bottlenecks

**Large File Parser (757 lines):**
- Problem: `fileParser.ts` orchestrates all parsing logic with complex state management
- Files: `src/parsers/fileParser.ts`
- Current impact: Difficult to test in isolation; state interactions (parse completion flags, cancellation tokens, debounce timers) are tightly coupled
- Improvement path: Extract state machine into separate class; split parsing orchestration from UI status/notification logic

**Extension Activation Parsing:**
- Problem: Full workspace parse triggered on activation, no incremental/cached approach
- Files: `src/extension.ts:70`, `src/parsers/fileParser.ts`
- Impact: Slow startup for large workspaces; all files parsed from scratch on every restart
- Improvement path: Implement file hash caching to skip unchanged files on re-activation

**Step Matching Loop Performance:**
- Problem: Regex matching done sequentially for each feature step against all step definitions
- Files: `src/parsers/stepMappings.ts:67-94`
- Impact: O(n*m) complexity (feature steps × step definitions); logged timings show this can be slow for large projects
- Improvement path: Pre-compile regex patterns; consider using trie-based or indexing approach for exact matches

## Fragile Areas

**Diagnostic Management System:**
- Files: `src/handlers/stepDiagnostics.ts`, `src/handlers/fixtureDiagnostics.ts`
- Why fragile: Multiple diagnostic providers must cooperate to avoid duplication. Filter logic is duplicated across providers using `d.code` markers. If new providers added, coordination becomes harder.
- Safe modification: Always explicitly clear old diagnostics by code before setting new ones; add integration tests validating no duplicate diagnostic codes
- Test coverage: Limited coverage of multi-diagnostic coexistence scenarios

**URI Comparison Across Platform:**
- Files: `src/common.ts` (helper functions `urisMatch`, `uriId`)
- Why fragile: Windows drive letter casing inconsistency (C: vs c:) is a known issue. Code uses `uri.toString()` workaround, but any direct path comparison risks bugs
- Safe modification: Always use `urisMatch()` for URI equality; never use `===`, `.path`, or `.fsPath` comparisons. Add lint rule to catch direct URI comparisons.
- Test coverage: URI handling tests exist in `test/unit/` but edge cases on Windows untested by CI

**Multi-Root Workspace State:**
- Files: `src/extension.ts` (workspace folder watchers, test data structure), `src/runners/testRunHandler.ts`
- Why fragile: Workspace folders can be added/removed at runtime. Test data stored in global `WeakMap` per test item; parallel runs across workspaces must not interfere
- Safe modification: Test all changes with `example-projects/multiroot.code-workspace`; verify isolation when running tests from different workspaces simultaneously
- Test coverage: Integration test suite includes multiroot tests, but parallel execution scenarios may have gaps

**Python Step Loading via Behave Subprocess:**
- Files: `src/parsers/behaveLoader.ts`, `src/parsers/stepsParserBehaveAdapter.ts`
- Why fragile: Invokes behave subprocess to discover steps; depends on project structure, Python environment, import side effects. Timeouts can occur if imports are slow.
- Safe modification: Test with projects that have slow imports; increase `stepDefinitionSearchTimeout` in tests if needed. Monitor subprocess exit codes.
- Test coverage: Timeout handling tested but edge cases (import errors, missing dependencies) may not be covered

**JUnit File Matching:**
- Files: `src/parsers/junitParser.ts`, `src/watchers/junitWatcher.ts`
- Why fragile: Maps junit test results back to feature scenarios by name matching. Scenario outline rows, parameterized examples, and special characters in names can break matching
- Safe modification: Add escape/quote handling for special chars; validate junit parsing against known edge cases (duplicate scenario names, complex parameters)
- Test coverage: Integration tests validate common patterns; edge cases with `<param>` names in scenario outlines recently fixed (commit 40e9ceb)

## Scaling Limits

**Global Step Mappings Table Memory:**
- Current capacity: Linear growth with workspace size (feature steps × step definitions)
- Limit: For large projects (1000+ feature steps, 500+ step definitions), mapping table could become memory-intensive
- Scaling path: Implement lazy loading of mappings; rebuild only for active workspace; use WeakMap to allow GC when workspaces removed

**Test Tree Item Count:**
- Current capacity: VSCode Test API handles typical projects; tested with simple/nested/multiroot examples
- Limit: Projects with 10k+ scenarios may hit VSCode UI performance limits
- Scaling path: Implement virtual scrolling in test tree (VSCode may handle this); consider grouping scenarios by tag/status

**Behave Regex Pattern Length:**
- Current capacity: Smart `-i` regex built from selected tests; Windows command line limit is 8191 chars
- Limit: Running 100+ scenarios in one behave instance may exceed command line length
- Scaling path: Auto-split into multiple behave instances when regex exceeds safe length; already enforced by `WIN_MAX_CMD` checks in code

## Security Considerations

**Environment Variable Logging:**
- Risk: `verboseLogging` setting (added in v0.9.17) can log full env var presets including sensitive values
- Files: `src/settings.ts`, extension configuration
- Current mitigation: Warning in extension setting description; not enabled by default
- Recommendations: Add additional warning in output channel when verboseLogging enabled; sanitize secret-looking values (API keys, tokens) from logs; consider implementing log filtering rules

**Behave Command Injection:**
- Risk: Environment variable overrides and presets are passed to behave subprocess without validation
- Files: `src/runners/behaveEnv.ts`, `src/runners/behaveRun.ts`
- Current mitigation: Values treated as environment variables (not shell command arguments); spawn uses array args (not shell string)
- Recommendations: Validate env var keys match safe pattern (alphanumeric + underscore); document security implications in README

## Dependencies at Risk

**xml2js Parsing:**
- Risk: XML parsing vulnerability if malformed or malicious junit files provided
- Impact: Behave writes junit files, so unlikely to be malicious, but worthwhile to validate
- Migration plan: xml2js is actively maintained; monitor for security updates; consider switching to native Node.js XML parsing if xml2js becomes unmaintained

**Bundled Behave 1.3.3:**
- Risk: Extension ships with pinned behave version; cannot receive security updates without extension release
- Impact: Medium - behave processes user test code but doesn't parse untrusted input; projects can override with `importStrategy: fromEnvironment`
- Migration plan: Monitor behave releases; test with newer versions before bundling upgrades; add clear upgrade path in release notes

## Test Coverage Gaps

**Extension Activation Edge Cases:**
- What's not tested: Activation when no Python interpreter configured; activation with behave import failures; very large workspaces (1000+ files)
- Files: `src/extension.ts:activate()`, integration test suite
- Risk: Could fail silently or hang on startup
- Priority: High - affects user experience on fresh install

**Multi-Root Parallel Execution:**
- What's not tested: Running tests from 3+ workspaces simultaneously; one workspace timeout while others running
- Files: `src/runners/testRunHandler.ts`, `src/watchers/junitWatcher.ts`
- Risk: Race condition in junit file handling; test results crossover between workspaces
- Priority: High - reported in README as known issue with unittest; insufficient validation with behave

**Fixture Validation Edge Cases:**
- What's not tested: Fixtures with decorators, fixtures from imported modules, fixture names with special characters
- Files: `src/handlers/fixtureDiagnostics.ts`, `src/parsers/fixtureParser.ts`
- Risk: False positives/negatives in fixture diagnostics
- Priority: Medium - affects developer experience but not test execution

**Step Parameter Matching:**
- What's not tested: `{param:d}` (type-specific) patterns, `cfparse` module patterns, multi-line regex patterns, backreferences
- Files: `src/parsers/stepMappings.ts` (step matching logic)
- Risk: Step mapping failures for projects using advanced behave patterns
- Priority: Medium - documented in README as known limitation; affects ~5% of projects

**Semantic Highlighting Edge Cases:**
- What's not tested: Multi-line steps, table data, doc strings with step text
- Files: `src/handlers/semHighlightProvider.ts`
- Risk: Parameter highlighting misalignment; performance issues on large feature files
- Priority: Low - visual feature; doesn't affect test execution

---

*Concerns audit: 2026-04-13*
