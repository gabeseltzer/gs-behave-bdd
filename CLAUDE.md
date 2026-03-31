# Claude Instructions for behave-vsc-gs

## Shared Instructions

See [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) for comprehensive project conventions, architecture patterns, common tasks, and pitfalls. **Read that file first** — it contains critical information about URI handling, error patterns, disposables, performance, and cross-platform compatibility.

## After Every Code Change

Always run the linter after modifying any TypeScript source file:

```bash
npx eslint src --ext ts
```

Exit 0 with no output means clean. Fix any warnings or errors before finishing.

## Unit Tests

After modifying files in `src/`, run unit tests to catch regressions:

```bash
npm run test:unit
```

Fix any failures before finishing.
