# Phase 2: Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 02-integration
**Areas discussed:** Settings override scope, Activation triggers, Error capture for Phase 3

---

## Settings Override Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All three scopes (Recommended) | globalValue + workspaceValue + workspaceFolderValue. If a user explicitly set projectPath/featuresPath at ANY level, respect it. Matches getWithLegacyFallback pattern already in settings.ts and aligns with INTG-02. | ✓ |
| Workspace + folder only | workspaceValue + workspaceFolderValue only. Global settings treated as soft defaults. | |
| Folder only (current behavior) | Only workspaceFolderValue counts. Keeps current getActualWorkspaceSetting behavior. | |

**User's choice:** All three scopes
**Notes:** Aligns with existing `getWithLegacyFallback` pattern and INTG-02 as written.

---

## Activation Triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, activate on config files (Recommended) | Core zero-config value — config tells us where features live even in non-standard paths. Lightweight activation cost acceptable. | ✓ |
| Activate but validate first | Activate on config files, but immediately check if resolved path contains .feature files. Heavier but prevents false positives. | |
| No, keep .feature-only activation | Only activate on .feature files. Safest but defeats purpose for non-standard layouts. | |

**User's choice:** Yes, activate on config files
**Notes:** This is the whole point of zero-config discovery.

---

## Error Capture for Phase 3

### Error propagation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Expand parser return type (Recommended) | Add error variant to BehaveConfigResult. Single source of truth, no re-parsing. | ✓ |
| Separate error channel | Keep parser returning undefined, add side-channel for errors. | |
| Phase 3 re-detects errors | Phase 2 ignores errors, Phase 3 re-reads config files independently. | |

**User's choice:** Expand parser return type
**Notes:** None

### Error type shape

| Option | Description | Selected |
|--------|-------------|----------|
| Union with discriminant (Recommended) | Add 'kind' field for discriminated union. TypeScript-idiomatic. | |
| Separate error property | Wrapper with optional result and error fields. | |
| You decide | Let Claude pick the best pattern. | ✓ |

**User's choice:** You decide
**Notes:** Important thing is errors flow through, not the specific shape.

### Fallback on malformed config

| Option | Description | Selected |
|--------|-------------|----------|
| Fall through to convention (Recommended) | Capture error + continue to features/ convention. User still gets working extension. Matches UX-03. | ✓ |
| Block and show error only | Stop discovery on malformed config. Forces user to fix config. | |

**User's choice:** Fall through to convention
**Notes:** Matches UX-03 requirement directly.

---

## Claude's Discretion

- TypeScript shape of error variant (discriminated union vs wrapper vs other)
- Cache data structure details
- Internal function decomposition
- Whether to modify existing functions or create new ones for settings detection

## Deferred Ideas

None — discussion stayed within phase scope.
