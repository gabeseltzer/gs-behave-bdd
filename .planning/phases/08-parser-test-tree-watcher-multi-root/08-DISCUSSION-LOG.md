# Phase 8: Parser / Test-Tree / Watcher Multi-Root Iteration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 08-parser-test-tree-watcher-multi-root
**Areas discussed:** Test tree path-group labels, Partial discovery behavior, Cross-root step/fixture scoping, Overlapping path dedup

---

## Test Tree Path-Group Labels

### Q1: How should path-group TestItem labels be derived?

| Option | Description | Selected |
|--------|-------------|----------|
| Project-relative path | Always show the full project-relative path (e.g. src/features/, tests/features-alt/). Unambiguous but can be long. | ✓ |
| Leaf directory name | Just the last segment (features/, features-alt/). Short but ambiguous if leaf names collide. | |
| Shortest unique suffix | Minimal path segments to disambiguate. Smart but more complex logic. | |

**User's choice:** Project-relative path
**Notes:** Recommended option selected. Unambiguous labeling preferred over brevity.

### Q2: When should path-group intermediate TestItems appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Only when multiple paths | Path-group nodes only appear when featuresUris.length > 1. | |
| Always when paths= is explicit | Always show the path-group node if paths= is explicitly set, even with one entry. | ✓ |

**User's choice:** Always when paths= is explicit
**Notes:** User chose the non-recommended option. Single explicit `paths = features` will show an intermediate `features/` node as a visual signal that the project is multi-path-aware.

### Q3: Should path-group TestItem nodes default to expanded or collapsed?

| Option | Description | Selected |
|--------|-------------|----------|
| Start expanded | Path-group nodes start expanded so the user immediately sees all features | |
| Start collapsed | Path-group nodes start collapsed — cleaner initial view, user expands as needed | |

**User's choice:** "Just follow whatever VSCode normally does"
**Notes:** Defer to VS Code's default TestItem expansion behavior. No explicit override.

---

## Partial Discovery Behavior

### Q1: What should happen when one path in `paths=` fails to resolve?

| Option | Description | Selected |
|--------|-------------|----------|
| Partial success + Warning diagnostic | Valid paths work, bad paths get Warning diagnostic. | |
| Partial success + Error diagnostic | Valid paths work, bad paths get Error diagnostic. More visible but still permissive. | ✓ |
| Strict all-or-nothing | One bad path = no tests. Consistent with v1.1 but harsh. | |

**User's choice:** Partial success + Error diagnostic
**Notes:** Error severity chosen over Warning for maximum visibility in the Problems panel.

### Q2: Where should the per-path diagnostic attach?

| Option | Description | Selected |
|--------|-------------|----------|
| Config file at bad path line | Diagnostic points to the exact config line containing the bad path. Best UX. | ✓ |
| Config file at line 0 | Diagnostic points to config file line 0. Simpler implementation. | |
| Workspace root | Diagnostic attached to workspace root. Minimal effort but poor UX. | |

**User's choice:** Config file at bad path line
**Notes:** Requires parser enrichment to track line numbers per path entry.

### Q3: When ALL paths in `paths=` fail, should it fall back to convention?

| Option | Description | Selected |
|--------|-------------|----------|
| Fall to convention | Try convention path as last resort. More forgiving. | |
| No fallback — treat as malformed | No fallback. All bad = no tests. Clean failure with diagnostics. | ✓ |

**User's choice:** No fallback — treat as malformed
**Notes:** Consistent failure behavior. User must fix their config.

---

## Cross-Root Step/Fixture Scoping

### Q1: Should step definitions be shared across feature roots or scoped per-root?

| Option | Description | Selected |
|--------|-------------|----------|
| Steps shared, fixtures per-root | Steps shared across all feature roots, only fixtures scoped per-root. | |
| Steps and fixtures per-root | Steps and fixtures both per-root scoped. | |
| Full per-root isolation | Full isolation per root including step mappings. | |

**User's choice:** (free text) "We need to match what Behave will handle. If Behave will accept a step definition from another root, then we should show those as auto-complete suggestions. If the step definition wouldn't work, then we shouldn't suggest it. Same thing for fixtures."
**Notes:** User's guiding principle: match behave's runtime behavior exactly. No extension-level isolation beyond what behave enforces.

### Q2: Given behave's global step/fixture model, how should the extension scope things?

| Option | Description | Selected |
|--------|-------------|----------|
| Match behave: everything shared | Steps + fixtures shared across all roots. Extension matches behave's global registry model. | ✓ |
| Steps shared, fixture guardrail | Steps shared, fixtures per-root with warning for non-primary environment.py files. | |
| Keep INT-01 per-root isolation | Keep INT-01 per-root scoping. Stricter than behave to prevent false positives. | |

**User's choice:** Match behave: everything shared
**Notes:** Behave loads all steps and fixtures globally regardless of feature path. Extension should mirror this.

### Q3: What should happen to INT-01?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop INT-01 from Phase 8 | Remove INT-01. getFeaturesRootForFile still used for test tree and JUnit. | ✓ |
| Defer INT-01 to later | Keep as future work if users report issues. | |

**User's choice:** Drop INT-01 from Phase 8
**Notes:** INT-01 was based on incorrect assumption that behave isolates fixtures per feature path. Dropped from scope.

---

## Overlapping Path Dedup

### Q1: When paths overlap (parent contains child), which survives dedup?

| Option | Description | Selected |
|--------|-------------|----------|
| Broader path wins (parent subsumes child) | The broader path always wins. Drop features/api. Prevents double-counting. | ✓ |
| First-listed wins | First-listed wins regardless of containment. | |
| More specific wins | Keep the more specific path, drop the parent. | |

**User's choice:** Broader path wins (parent subsumes child)
**Notes:** Prevents double-counting features that exist in both parent and child directories.

### Q2: How should path subsumption collisions be reported?

| Option | Description | Selected |
|--------|-------------|----------|
| Output channel only | Just an info log in the output channel. Silent unless user checks. | |
| Warning diagnostic | Warning diagnostic in Problems panel at the subsumed line. | |
| Both | Both output channel log and Warning diagnostic. | ✓ |

**User's choice:** Both
**Notes:** Maximum visibility for path collisions. Output channel for debugging, Problems panel for user awareness.

### Q3: Should path dedup be case-insensitive on Windows?

| Option | Description | Selected |
|--------|-------------|----------|
| Use uriId() (case-insensitive) | Platform-correct behavior using existing comparator. | ✓ |
| Always case-sensitive | Case-sensitive comparison regardless of platform. | |

**User's choice:** Use uriId() (case-insensitive)
**Notes:** Reuses existing infrastructure. Correct on Windows where filesystem is case-insensitive.

---

## Claude's Discretion

- Consumer migration ordering (parsers → test tree → watchers → handlers → runners)
- Line number propagation strategy from INI/TOML parser
- Watcher fan-out implementation (one FileSystemWatcher per entry vs compound glob)
- Exact subsumption check implementation (`startsWith` on URI paths vs `uriId` prefix match)

## Deferred Ideas

- INT-01 per-root fixture scoping — dropped based on behave's global model
- Per-root step isolation — not applicable per behave's global model
- `featuresPaths` user-facing setting — Phase 10
- Integration test fixtures — Phase 11
