# External Integrations

**Analysis Date:** 2026-04-13

## APIs & External Services

**None detected.** This extension does not make HTTP requests to external APIs or cloud services. All operations are local.

## Data Storage

**Databases:**
- None - Extension is stateless regarding external databases

**File Storage:**
- Local filesystem only - Reads/writes within workspace directories
  - Feature files: `features/*.feature` (workspace-relative path)
  - Step definition files: `features/steps/*.py` (workspace-relative path)
  - behave configuration: `behave.ini` or `.behaverc` in project root
  - JUnit output: Monitored via `src/watchers/junitWatcher.ts` for test result parsing

**Caching:**
- In-memory only - Uses WeakMap in `src/extension.ts` to cache TestData
- No persistent cache or temp files (temporary directories cleaned on activation)

## Authentication & Identity

**Auth Provider:**
- None - Extension runs entirely within VSCode context
- No user authentication required
- VSCode Python extension provides Python interpreter detection (no explicit auth)

## Process Execution

**Child Processes:**
- Python interpreter - Used to spawn step discovery process
  - Module: `src/parsers/behaveLoader.ts` via `child_process.spawn()`
  - Executes: `python discover.py` to load step definitions and fixtures from behave registry
  - Path resolution: Uses Python from VSCode's Python extension (ms-python.python)
  - Timeout: 10 seconds (configurable in `loadFromBehave()`)

- behave test runner - Used to execute tests
  - Module: `src/runners/behaveRun.ts` via `child_process.spawn()`
  - Executes: `python -m behave [args]` with test execution arguments
  - Working directory: Project root (where behave.ini is located)
  - Environment: Inherits system env vars, merged with user-configured presets from `src/runners/behaveEnv.ts`

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to VSCode output channel only

**Logs:**
- VSCode Output Channel - "gs-behave-bdd (Workspace Name)" per workspace
  - Logger: `src/logger.ts` (custom implementation)
  - Diagnostic logging: Optional via `gs-behave-bdd.xRay` setting
  - Verbose logging: Optional via `gs-behave-bdd.verboseLogging` setting (may include env var preset contents)

**Test Results:**
- JUnit XML parsing - From behave's `--junit` output
  - Parser: `src/parsers/junitParser.ts` using xml2js library
  - Watcher: `src/watchers/junitWatcher.ts` monitors for junit output files
  - Results fed to VSCode Test Controller for UI display

## Dependencies & Version Pinning

**Critical External Dependency:**
- VSCode Python Extension (ms-python.python) - **REQUIRED**
  - Used to detect and invoke Python interpreter
  - No version specified; works with any recent version
  - Extension fails to activate if not installed

**Bundled Dependency:**
- Behave 1.3.3 - Bundled in `bundled/libs/` (Python package)
  - Installed during build: `npm run bundle-behave` → `uv pip install --target bundled/libs behave==1.3.3`
  - Can be overridden by user's system behave if configured via `gs-behave-bdd.importStrategy` setting
  - Two import strategies:
    - `useBundled` (default) - Uses bundled behave 1.3.3
    - `fromEnvironment` - Uses system/venv behave (must be installed separately)

## Configuration & Presets

**Environment Variables:**
- User-configurable via VSCode settings (stored in .vscode/settings.json or *.code-workspace)
  - `gs-behave-bdd.envVarOverrides` - Global overrides for all test runs
  - `gs-behave-bdd.envVarPresets` - Named preset groups (dev, staging, prod, etc.)
  - `gs-behave-bdd.activeEnvVarPreset` - Currently selected preset
- Managed by: `src/settings.ts` (WorkspaceSettings) and `src/runners/behaveEnv.ts`
- No support for .env files or external secret management

**Project Path Configuration:**
- `gs-behave-bdd.projectPath` - Optional workspace-relative path to project root (where behave.ini lives)
- `gs-behave-bdd.featuresPath` - Optional project-relative path to features directory (default: "features")
- Defaults assume standard behave layout: `workspace_root/features/` and `workspace_root/features/steps/`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## Test Discovery & Execution Flow

1. **On Extension Activation** (`src/extension.ts`):
   - Creates VSCode TestController
   - Parses all .feature files in workspace(s)
   - Spawns Python to load step definitions via `src/parsers/behaveLoader.ts`

2. **Step Discovery** (`src/parsers/behaveLoader.ts`):
   - Calls `loadFromBehave()` with Python interpreter path from VSCode Python extension
   - Spawns: `python src/python/discover.py <project_path> <steps_paths_json> [--bundled-libs <path>]`
   - Python subprocess loads behave's step_registry to discover all @given/@when/@then/@step decorators
   - Returns JSON: `{steps: [...], fixtures: [...]}`
   - Parsed by `src/parsers/stepsParser.ts` into StepFileStep objects

3. **Test Execution** (`src/runners/behaveRun.ts`):
   - Spawns: `python -m behave <feature_file> [--junit]`
   - Inherits environment variables merged from system env + user presets
   - Outputs to VSCode Test Run output channel
   - Optional JUnit output monitored by `src/watchers/junitWatcher.ts`

4. **Debugging** (`src/runners/behaveDebug.ts`):
   - Creates VSCode debug launch configuration
   - Debugger: Python (from VSCode Python extension)
   - Invokes debugpy for step-by-step debugging of Python step definitions

## Security Considerations

**No network access** - Extension does not make HTTP/HTTPS requests. Cannot leak data to external services.

**Local file access** - Reads/writes only within workspace directories. Respects VSCode workspace trust model.

**Environment variables** - Stored in VSCode settings (committed to repo or local config). No external secret store. Users should not store API keys in env var presets.

---

*Integration audit: 2026-04-13*
