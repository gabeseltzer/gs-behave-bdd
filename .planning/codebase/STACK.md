# Technology Stack

**Analysis Date:** 2026-04-13

## Languages

**Primary:**
- TypeScript 4.5.5 - VSCode extension source code in `src/`
- Python 3.10.15+ - Step discovery and behave integration via `src/python/discover.py`

**Secondary:**
- JavaScript - Configuration files and build scripts

## Runtime

**Environment:**
- Node.js 18.17.1 - Extension runtime (required by VSCode API)
- Python 3.10.15+ - For behave test execution and step discovery

**Package Manager:**
- npm (with package-lock.json) - Node dependencies
- uv - Python package manager (`uv pip install` for dependencies, configured in `pyproject.toml`)

## Frameworks

**Core:**
- VSCode Test Controller API 1.82.0+ - Test discovery, execution, and UI
- VSCode Extensions API - Language features, providers, event handling

**Testing:**
- Mocha 9.2.2 - Unit test framework
- @vscode/test-electron 2.5.2 - Integration test runner (spawns VSCode Insiders/Stable)
- Sinon 21.0.1 - Mocking and stubbing for unit tests

**Build/Dev:**
- Webpack 5.76.2 - Bundles TypeScript into single extension.js
- TypeScript 4.5.5 - Compilation (strict mode enabled in `tsconfig.json`)
- ts-loader 9.2.8 - Webpack loader for TypeScript
- ESLint 8.11.0 with @typescript-eslint - Code linting

**Python Tools:**
- Behave 1.3.3 - BDD test framework (bundled in `bundled/libs/`, installed via `npm run bundle-behave`)
- Ruff 0.6+ - Python formatter and linter
- mypy 1.0+ - Python static type checking
- pytest - Not detected; Behave is the primary test runner

## Key Dependencies

**Runtime (Production):**
- xml2js 0.6.2 - Parses behave's JUnit XML output (in `src/parsers/junitParser.ts`)
- nanoid (transitive) - Generates unique IDs for temporary directories

**Development Only:**
- @types/glob 8.1.0 - TypeScript types for glob
- @types/mocha 10.0.10 - TypeScript types for Mocha
- @types/sinon 21.0.0 - TypeScript types for Sinon
- @types/vscode 1.82.0 - TypeScript types for VSCode API
- @types/xml2js 0.4.11 - TypeScript types for xml2js
- @typescript-eslint/eslint-plugin 5.15.0 - ESLint plugin for TypeScript
- @typescript-eslint/parser 5.15.0 - Parser for ESLint
- glob 7.2.0 - File globbing utility
- webpack-cli 4.9.2 - Webpack CLI
- copy-webpack-plugin 13.0.1 - Copies Python files to dist/ during webpack build

## Configuration

**Extension Configuration:**
- `package.json` - Defines extension manifest, commands, language support (Gherkin), keybindings
- `tsconfig.json` - TypeScript compiler options (target ES2021, strict mode)
- `.eslintrc.js` - ESLint rules (extends recommended + @typescript-eslint)
- `webpack.config.js` - Entry: `src/extension.ts`, output: `dist/extension.js`
- `.tool-versions` - Node.js 18.17.1 (for asdf/mise version managers)

**Python Configuration:**
- `pyproject.toml` - Python project metadata and tool configuration
  - Ruff: indent-width=2, quote-style="double", extensive lint rules
  - mypy: strict mode enabled, Python 3.10
  - behave 1.3.3 as dev dependency

**Build Output:**
- `dist/extension.js` - Bundled and minified extension (webpack output)
- `bundled/libs/` - Bundled behave 1.3.3 installed via `uv pip install --target`

## Platform Requirements

**Development:**
- Operating System: Windows, macOS, Linux
- VSCode: ^1.82.0
- Node.js: 18.17.1 (managed via .tool-versions)
- Python: 3.10.15+ (for step discovery and running tests)

**Production (Extension Runtime):**
- VSCode: ^1.82.0
- VSCode Python Extension (ms-python.python) - **REQUIRED** dependency
  - Extension depends on Python extension to find Python interpreter
  - Declared in `package.json` as `"extensionDependencies": ["ms-python.python"]`

**Extension Activation:**
- Triggered on: `workspaceContains:**/*.feature` (any .feature file in workspace)
- Entry point: `src/extension.ts` → `activate()` function

## Bundling Strategy

**TypeScript Extension Code:**
- webpack bundles `src/extension.ts` and all imports into single `dist/extension.js`
- Node.js modules excluded as externals: vscode module is created by VSCode
- Python files copied to `dist/python/` via copy-webpack-plugin

**Python Runtime:**
- Behave 1.3.3 bundled to `bundled/libs/` (installed during build via `npm run bundle-behave`)
- Custom step discovery script: `src/python/discover.py` spawned via `child_process.spawn()`
- Python is invoked from VSCode's Python extension (ms-python.python) interpreter

## Environment Variables

**Configuration:**
- No .env files detected (not used by this extension)
- Environment variables for behave tests configured through:
  - VSCode settings: `gs-behave-bdd.envVarOverrides` (key-value pairs)
  - VSCode settings: `gs-behave-bdd.envVarPresets` (named preset groups)
  - Can be set per workspace or workspace folder
  - See `src/settings.ts` for WorkspaceSettings.envVarPresets and envVarOverrides

## CI/CD Integration

**Not detected** - No GitHub Actions, Jenkins, or other CI configuration in codebase.

---

*Stack analysis: 2026-04-13*
