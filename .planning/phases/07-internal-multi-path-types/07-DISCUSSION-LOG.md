# Phase 7: Internal Multi-Path Types - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 07-internal-multi-path-types
**Areas discussed:** resolvedPath rename strategy, Invalid-token rejection semantics, Scope: helpers + path normalization, SC#3 feasibility — length-2 arrays, Plural settings-key reading, Test harness shape

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| resolvedPath rename strategy | How to evolve BehaveConfigResult.resolvedPath: Uri → resolvedPaths: Uri[]. Breaking rename vs. getter shim. | ✓ |
| Invalid-token rejection semantics | SC#4 says featuresPath="." still rejected. For the internal array shape, one invalid entry policy. | ✓ |
| Scope: helpers + path normalization | isFileInFeatures/getFeaturesRootForFile helpers + Windows backslash normalization. | ✓ |
| SC#3 feasibility — length-2 arrays | How to satisfy SC#3 (length === 2 for `paths = features\n features-alt`). | ✓ |

**User selected:** all four.

---

## resolvedPath rename strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Breaking rename → resolvedPaths[] | Drop `resolvedPath`, add `resolvedPaths: Uri[]`. Research recommendation. 2 read sites in common.ts. | ✓ |
| Getter shim (resolvedPath returns resolvedPaths[0]) | Keep `resolvedPath` as a readonly getter over `resolvedPaths[0]`. Union-type getters awkward. | |
| Both fields, dual-populated | Keep both fields on the ok:true variant. Two sources of truth that can drift. | |

**User's choice:** Breaking rename → resolvedPaths[] (Recommended)
**Notes:** BehaveConfigResult has exactly 2 read sites (both in common.ts hasFeaturesFolder); blast radius is tiny.

---

## Invalid-token rejection semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Reject whole config, fall back to convention | Any invalid entry → whole BehaveConfigResult becomes ok:false OR undefined. Matches v1.1 all-or-nothing. | ✓ |
| Filter invalid, keep valid (length ≥ 1) | Drop the bad entries, return whatever's left. Silently changes v1.1 semantics. | |
| Include all entries, let consumer filter | Parser returns raw resolved URIs including non-existent ones; consumer decides. | |

**User's choice:** Reject whole config, fall back to convention (Recommended)
**Notes:** Preserves v1.1 all-or-nothing invariant. MP-04's per-path diagnostic softens this in Phase 8.

---

## Scope: helpers + path normalization (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| isFileInFeatures(uri) helper on WorkspaceSettings | `featuresUris.some(fu => uri.path.startsWith(fu.path + '/'))`. Pure addition. | ✓ |
| getFeaturesRootForFile() utility in common.ts | Used by Phase 8 per-document-root scoping. Pure addition but no Phase 7 caller. | ✓ |
| Windows backslash normalization on all entries | TEST-12 mentions it. Normalize `\` → `/` in the plural array builder. | ✓ |
| None — Phase 7 is types + getters only | Keep Phase 7 minimal. Helpers and normalization land in Phase 8. | |

**User's choice:** All three (isFileInFeatures + getFeaturesRootForFile + Windows normalization)
**Notes:** Phase 7 becomes "types + foundation primitives" rather than pure types. Keeps Phase 8 diff focused on consumers.

---

## SC#3 feasibility — length-2 arrays

| Option | Description | Selected |
|--------|-------------|----------|
| Unit-test only, both fake dirs exist | Mock filesystem so both features/ and features-alt/ fs.existsSync checks pass. | ✓ |
| Stop filtering non-existent paths in hasFeaturesFolder | Branch B populates featuresUris with ALL resolved URIs regardless of existence. Bleeds Phase 8 behavior. | |
| Add minimal features-alt to an existing fixture | Add features-alt/ dir to an existing example-project. Touches fixture surface. | |

**User's choice:** Unit-test only, both fake dirs exist (Recommended)
**Notes:** Preserves v1.1 filtering behavior. No example-project fixture changes — those land in Phase 11.

---

## Plural settings-key reading

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — read featuresPaths in Phase 7, declare in Phase 10 | WorkspaceSettings reads BOTH `featuresPath` and `featuresPaths`. package.json declaration waits for Phase 10. | ✓ |
| No — Phase 7 reads only singular, always length-1 | WorkspaceSettings only reads `featuresPath` in Phase 7. TEST-12 plural cases deferred. | |
| Yes, plus declare featuresPaths in package.json now | Read AND declare the plural settings key in Phase 7. Violates MP-03 → Phase 10 traceability. | |

**User's choice:** Yes — read featuresPaths in Phase 7, declare in Phase 10 (Recommended)
**Notes:** Tests exercise the full precedence matrix immediately via test-harness injection. Phase 10 becomes a small finish-line change (schema entry + hasExplicitSetting extension + info log).

---

## Test harness shape

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror plural + accept plural input | Add plural fields to match WorkspaceSettings; test config accepts `featuresPaths: string[]`. | ✓ |
| Mirror plural but accept only singular input | Expose plural fields but input interface only takes singular. Zero test authoring changes until Phase 10. | |

**User's choice:** Mirror plural + accept plural input (Recommended)
**Notes:** Production shape == test-harness shape. TEST-12's precedence matrix is exercised via the harness's plural input.

---

## Claude's Discretion

- TypeScript `get` accessor vs. readonly field at construction for singular getters — pick whichever reads cleaner.
- Commit ordering within the phase (recommend configParser → common → settings → testWorkspaceConfig atomically).
- Exact signature of `getFeaturesRootForFile` — follow existing helper conventions in `common.ts`.
- Windows normalization location (private helper in configParser.ts vs. shared util in common.ts).

## Deferred Ideas

- `package.json` `featuresPaths` schema declaration → MP-03 / Phase 10
- `hasExplicitSetting` extension to recognize `featuresPaths` → Phase 10
- Info log when both `featuresPath` and `featuresPaths` are set → Phase 10
- Per-path resolution failure diagnostic (MP-04) → Phase 8
- Overlap dedup in `resolvePaths` (Pitfall 2) → Phase 8
- 18-file consumer migration → MP-06 / Phase 8
- Path-group intermediate TestItems → MP-05 / Phase 8
- `configScanner.ts` subdir scan → SD-01 / Phase 9
- `example-projects/multi-path/` + `monorepo-scan/` fixtures → TEST-14 / Phase 11
- Integration test matrix → TEST-13 / Phase 11
