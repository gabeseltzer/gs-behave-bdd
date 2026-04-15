---
phase: 02-integration
asvs_level: 1
threats_open: 0
threats_closed: 7
block_on: high
generated: 2026-04-15
---

# Security Audit — Phase 02: Integration

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-02-01 | T (Tampering) | accept | CLOSED | Accepted risks log below |
| T-02-02 | D (Denial of Service) | accept | CLOSED | Accepted risks log below |
| T-02-03 | I (Information Disclosure) | mitigate | CLOSED | configParser.ts:137 — catch returns `e.message`/`String(e)` (parse position info only); settings.ts:261 — "configFileUri" excluded from JSON.stringify; settings.ts:271 — logged as `.fsPath` string |
| T-02-04 | T (Tampering) | accept | CLOSED | Accepted risks log below |
| T-02-05 | S (Spoofing) | accept | CLOSED | Accepted risks log below |
| T-02-06 | I (Information Disclosure) | mitigate | CLOSED | settings.ts:261 — "configFileUri" in nonUserSettableWkspSettings exclusion list; settings.ts:271 — configFileUri logged as `this.configFileUri?.fsPath ?? "(none)"` (safe string, not serialized URI object) |
| T-02-07 | D (Denial of Service) | accept | CLOSED | Accepted risks log below |

## Mitigate Verification Detail

### T-02-03 — Information Disclosure via errorMessage

**Claim:** errorMessage from smol-toml contains only parse position info, not file contents.

**Verified at:** `src/parsers/configParser.ts:134-137`

```typescript
} catch (e: unknown) {
  // Malformed TOML: config file exists but is invalid -- return error variant (D-05)
  return { ok: false, configFileUri: fileUri, errorMessage: e instanceof Error ? e.message : String(e) };
}
```

smol-toml throws `Error` objects whose `.message` contains parse position (line, column, token) and error description — not raw file contents. This is consistent with smol-toml's documented error format.

**Verified at:** `src/settings.ts:261` — `"configFileUri"` is present in `nonUserSettableWkspSettings`, which excludes it from the `JSON.stringify` output in `logSettings()`.

**Verified at:** `src/settings.ts:271` — `configFileUri` is separately pushed as an fsPath string: `this.configFileUri?.fsPath ?? "(none)"`, ensuring no vscode.Uri object serialization (which would produce garbled `{}`).

No network transmission path found. Output is user-local (VS Code workspace output channel only). Phase 3 surfacing is not yet implemented; the error variant is stored in `discoveryCache` for later retrieval.

### T-02-06 — Information Disclosure via logSettings

**Claim:** configFileUri logged as fsPath string; excluded from JSON.stringify.

**Verified at:** `src/settings.ts:261`

```typescript
const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri",
  "stepsSearchUri", "workspaceRelativeFeaturesPath", "configFileUri"];
```

`configFileUri` is in the exclusion list, so it is not serialized by `JSON.stringify(rscSettingsDic)` on line 291.

**Verified at:** `src/settings.ts:270-271`

```typescript
wkspEntries.push(["discoverySource", this.discoverySource]);
wkspEntries.push(["configFileUri", this.configFileUri?.fsPath ?? "(none)"]);
```

`discoverySource` is a safe enum string (`"settings" | "config-file" | "convention"`). `configFileUri` is logged as its `.fsPath` string value (or literal `"(none)"`), not as a serialized URI object.

## Accepted Risks Log

| Threat ID | Category | Risk | Rationale | Owner |
|-----------|----------|------|-----------|-------|
| T-02-01 | T (Tampering) | Attacker with workspace write access could place a crafted pyproject.toml to influence the extension's features path discovery | Config files are under workspace control — same trust boundary as source code. smol-toml is a pure data parser with no eval/code execution capability. An attacker with workspace write access already has full code execution ability via Python files. Net risk: negligible. | Gabriel Seltzer |
| T-02-02 | D (Denial of Service) | Malformed TOML could cause parser hang or unbounded loop | smol-toml's catch block is verified present at configParser.ts:134-138. On any parse error, the catch returns an `ok:false` error variant immediately — no retry, no loop. File size is bounded by workspace convention (no streaming or line-by-line partial parse). Net risk: negligible. | Gabriel Seltzer |
| T-02-04 | T (Tampering) | Symlink or path-traversal attack via crafted config `paths` value targeting arbitrary filesystem locations | Config `paths` values are resolved via `vscode.Uri.joinPath` (workspace-rooted for relative paths; absolute paths accepted as-is per behave's own behavior). `fs.existsSync` validates the resolved path exists before it is used. Same trust model as the existing `projectPath`/`featuresPath` settings, which also accept arbitrary paths from settings.json. Net risk: negligible — workspace write access is a prerequisite. | Gabriel Seltzer |
| T-02-05 | S (Spoofing) | Malicious input to hasExplicitSetting causing false explicit-setting detection | `hasExplicitSetting` reads exclusively from `vscode.WorkspaceConfiguration.inspect()`, which is a trusted VS Code internal API. No external or user-provided string is passed as the setting name in any call path observed — callers pass literal string constants `"projectPath"` and `"featuresPath"`. No external input reaches this function. Net risk: none. | Gabriel Seltzer |
| T-02-07 | D (Denial of Service) | discoveryCache Map grows unbounded | `discoveryCache` is a `Map<string, DiscoveryEntry>` keyed by workspace folder URI string. Verified at `common.ts:161` (declaration) and `common.ts:175` (`discoveryCache.clear()` in the same `forceRefresh` block as `workspaceFoldersWithFeatures = []`). Cache entries are bounded by VS Code workspace folder count (typically 1-5; hard-limited by VS Code itself). Net risk: none. | Gabriel Seltzer |

## Unregistered Threat Flags

None. Both 02-01-SUMMARY.md and 02-02-SUMMARY.md report no new threat surface beyond what the plan's threat model documents.
