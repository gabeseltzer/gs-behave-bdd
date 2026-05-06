---
status: complete
phase: 18-address-v1-4-0-tech-debt-artifact-rollups-mock-cleanup
source:
  - 18-01-SUMMARY.md
  - 18-02-SUMMARY.md
started: 2026-05-04T00:00:00Z
updated: 2026-05-04T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Lint and unit suite stay green
expected: |
  `npx eslint src --ext ts` exits 0 with no output. `npm run test:unit` reports 697 passing
  (one above plan baseline of 696 — suite drift, not regression).
result: pass
evidence: |
  Lint: clean exit 0 with no output. Unit suite: 697 passing in 12s.

### 2. Phase 15 dead-mock fallback removed
expected: |
  `test/unit/vscode.mock.ts` no longer contains `suppressMultiConfigNotification`. The literal
  appears only in the two allow-listed Phase 15 test files (`notifications.test.ts`,
  `packageJsonSchema.test.ts`).
result: pass
evidence: |
  grep count in vscode.mock.ts: 0. Remaining matches restricted to the two allow-listed files.

### 3. Phase 17 ad-hoc cache pattern documented in src/common.ts
expected: |
  `src/common.ts` carries WHY-comment sentinels at the Phase 17 fix block:
  `deliberate read-time`, `cache-invalidation hook`, `follow-up tech debt`.
result: pass
evidence: |
  Lines 345-347 contain all three sentinel phrases.

### 4. Phase 16 phase-level SUMMARY rollup landed
expected: |
  `.planning/phases/16-deprecate-featurespath/16-SUMMARY.md` exists with `status: verified`
  in frontmatter and references all 7 DEP-* requirements.
result: pass
evidence: |
  File exists. Frontmatter `status: verified`. 9 DEP-0 grep matches in body (≥7 required).

### 5. Phase 17 phase-level SUMMARY + VERIFICATION rollups landed
expected: |
  `.planning/phases/17-cross-cutting-verification/17-SUMMARY.md` and `17-VERIFICATION.md` exist.
  VERIFICATION carries `status: passed`. SUMMARY cites commits 27e5af3 (suite registration) and
  c08ced5 (cache fix).
result: pass
evidence: |
  Both files exist. VERIFICATION frontmatter `status: passed`. SUMMARY cites both commits
  (13 combined matches).

### 6. Multiroot mutex flake documented in AI_INSTRUCTIONS.md
expected: |
  `AI_INSTRUCTIONS.md` § Integration Test Structure carries the "Another instance of app"
  callout with workarounds (close editor or separate user-data-dir).
result: pass
evidence: |
  Literal `Another instance of app` present (1 match). Workarounds (`user-data-dir`,
  `npm run test:integration`) present (3 combined matches).

### 7. v1.4.0 cache-invalidation carry-forward in STATE.md
expected: |
  `.planning/STATE.md` carries a v1.4.0 carry-forward entry naming `activeProjectCache`
  and either `c08ced5` or `clearScanResultCache`.
result: pass
evidence: |
  `activeProjectCache` appears 2x; `clearScanResultCache` appears (1 match including the
  recommended pairing).

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
