---
name: release-extension
description: Cut a VS Code Marketplace release of this extension — bump version on main, package the .vsix, push commit + tag, create the GitHub release with the .vsix attached, and publish to the marketplace. Use when the user says "release", "publish", "ship a new version", "promote the pre-release", or names a target version like "release 1.4.2". Handles the pre-release → full-release promotion flow and the stale-`out/` build trap.
---

# Release the VS Code Extension

End-to-end release procedure for `gs-behave-bdd`. The extension is published to the VS Code Marketplace under publisher `gabeseltzer`, and GitHub releases live at `gabeseltzer/gs-behave-bdd`.

## Inputs to confirm before starting

Ask the user (use AskUserQuestion if more than one is unclear):

1. **Target version** — e.g. `1.4.2`. Confirm against current `package.json` version (`grep '"version"' package.json`).
2. **Release type** — full release (default) or another pre-release (`--pre-release` flag on `vsce publish`, mark prerelease on the GH release).
3. **Release notes shape** — typical options when promoting a pre-release:
   - Short promo line + link back to the prior pre-release tag (recommended for promotion-only bumps)
   - Promo line + full prior notes pasted verbatim
   - Fresh notes for a real feature release
4. **Tag format** — this repo uses bare `1.4.2` (no `v` prefix). Match the most recent tag unless told otherwise.

## Preconditions to verify

- Default branch is `main` (NOT `master` — the user often calls it master out of habit; don't argue, just use `main`).
- Working tree clean and on `main` (`git checkout main && git status`).
- Local `main` matches `origin/main` (no divergence).
- A `.vsix` for the target version doesn't already exist locally (would mean a partial prior attempt).
- The target tag doesn't already exist (`git tag -l <version>` and `gh release view <version> --repo gabeseltzer/gs-behave-bdd`).

## Branch flow when releasing from a feature branch

When the user asks to release work that lives on a feature branch (e.g. `gabes/<slug>`), the established flow is **feature → `gabe-dev` → `main`**, not feature → main directly. Important quirks:

- `gabe-dev` tends to fall **behind** `origin/main` because each prior release lands as a `Merge branch 'gabe-dev'` commit on `main` and `gabe-dev` is not rebased back. Before merging the feature branch in, sync first: `git checkout gabe-dev && git merge origin/main --no-edit`. This pulls in the prior `chore(release): bump version to X.Y.Z` commit so the next conflict is small and predictable.
- After the main-sync merge, `git merge <feature-branch>` will conflict on `package.json` (gabe-dev now has the old version from main's release-bump commit; the feature branch has the new pre-bumped version). **Resolve in favor of the feature branch's version** — that's the version you're about to release.
- Then push `gabe-dev`, checkout `main`, and `git merge gabe-dev --no-ff -m "Merge branch 'gabe-dev' for v<X.Y.Z> pre-release"` (or `release`). The `--no-ff` and message style matches prior history (`d713915 Merge branch 'gabe-dev' for v1.4.1 release`).
- If the feature branch already bumped `package.json` to the target version (common when development happens at the next version), **skip step 1 (Bump version)** — the version is already in via the merges. Confirm with the user before skipping.

## Procedure

### 1. Bump version

Edit `package.json` only — the established pattern in this repo is a one-file commit. **Do not touch `package-lock.json`** (its top-level version is stale at `0.7.1` and the previous bump commit `7bb68f5` only modified `package.json`).

```
chore(release): bump version to <X.Y.Z>

<one-line reason — e.g. "Promotes the X.Y.(Z-1) pre-release to a full release. No code changes.">
```

### 2. Package the .vsix

```powershell
npx vsce package
```

This runs the `vscode:prepublish` script which does `bundle-behave && test && package`. The full chain is: `pretest` (`lint` + `lint:python` = eslint + ruff + ruff-format + mypy) → `test:unit` (876+ Mocha tests) → `maybe-integration-tests.js` (runs `test:integration` unless `VSCE_FAST=1`) → webpack production bundle.

**If you're packaging as a pre-release, pass `--pre-release` here too** — the flag has to be set at *package* time, not just publish time (see step 5).

```powershell
npx vsce package --pre-release
```

**Stale-`out/` trap (important):** If you've recently been on a feature branch with test files that don't exist on `main` (e.g. `gabes/migration-consent` had `test/.../migrations/consent.test.ts`), `tsc` will not delete their compiled JS from `out/test/`. Mocha picks up the orphaned `.test.js` files and tests will fail with errors about code that doesn't exist on main. Fix:

```powershell
Remove-Item -Recurse -Force out, dist; npx vsce package
```

When the integration tests have already passed once in this session and you only need to **repackage** (e.g. you forgot `--pre-release` the first time), skip the slow integration run with `$env:VSCE_FAST='1'`:

```powershell
$env:VSCE_FAST='1'; npx vsce package --pre-release; Remove-Item Env:\VSCE_FAST
```

If real test failures appear, stop and surface them to the user — don't try to fix on the release branch.

**Watch out for repo-root files getting bundled into the VSIX.** `vsce` ships everything not in `.vscodeignore`. Things like `release-notes-<version>.md` left at repo root will end up inside the extension. Either delete after release or add to `.vscodeignore`.

### 3. Push commit and tag

Use the **PowerShell tool**, not Bash. The Git Bash SSH agent does not see the user's Windows SSH key and will fail with `Permission denied (publickey)`. PowerShell picks up the Windows ssh-agent correctly.

```powershell
git push origin main
git tag <X.Y.Z>
git push origin <X.Y.Z>
```

### 4. Create the GitHub release

`gh` defaults to the `upstream` remote (`jimasp/behave-vsc`) because of how this fork is set up — **always pass `--repo gabeseltzer/gs-behave-bdd` explicitly**.

```powershell
$body = @'
Promoting the [<prior-version> pre-release](https://github.com/gabeseltzer/gs-behave-bdd/releases/tag/<prior-version>) to a full release. No code changes from <prior-version> — see the prior release notes for details.
'@
gh release create <X.Y.Z> --repo gabeseltzer/gs-behave-bdd --title "<X.Y.Z>" --notes $body "gs-behave-bdd-<X.Y.Z>.vsix"
```

Add `--prerelease` if this is itself a pre-release. Omit it for a full release. Always attach the `.vsix` as a release asset.

**Let the user review notes before publishing.** For real feature releases (not promotion-only bumps), the user will usually want to edit the release notes. Write a draft to `release-notes-<X.Y.Z>.md` at repo root, hand it off for review, then publish with `--notes-file release-notes-<X.Y.Z>.md` instead of `--notes $body`. That file will ship inside the VSIX if you have to repackage after editing — delete it after release or add it to `.vscodeignore`.

### 5. Publish to the marketplace

```powershell
npx vsce publish --packagePath gs-behave-bdd-<X.Y.Z>.vsix
```

Add `--pre-release` if this is a pre-release on the marketplace.

**Hard rule: pre-release flag must match between package and publish.** If you packaged without `--pre-release` and try `vsce publish --pre-release`, it fails with:

```
ERROR  Cannot use '--pre-release' flag with a package that was not packaged as pre-release.
       Please package it using the '--pre-release' flag and publish again.
```

Fix: repackage with `--pre-release` (use `VSCE_FAST=1` to skip the integration retest if it just passed — see step 2). Then **also re-upload the new .vsix to the GitHub release** so the asset matches what's on the marketplace:

```powershell
gh release upload <X.Y.Z> gs-behave-bdd-<X.Y.Z>.vsix --repo gabeseltzer/gs-behave-bdd --clobber
```

**Authentication will likely fail with `TF400813: The user 'aaaaaaaa-...' is not authorized` if the cached PAT is missing or expired.** Do NOT prompt the user for their PAT — instead, tell them to run one of these themselves with the `!` prefix:

```
! npx vsce login gabeseltzer       # interactive PAT prompt
! npx vsce publish --packagePath gs-behave-bdd-<X.Y.Z>.vsix
```

Or as a one-liner: `! $env:VSCE_PAT='<pat>'; npx vsce publish --packagePath gs-behave-bdd-<X.Y.Z>.vsix`

## Marketplace versioning notes

- Once a version is published as a pre-release, the **same version number** cannot be re-published as a full release — you must bump (this is why pre-release → full release is always at least a patch bump).
- VS Code Marketplace pre-release flag is independent of semver. This repo does not follow the odd-minor / even-minor convention; just bump normally.

## What success looks like

End-of-turn summary to the user should report:
- Version committed (with short SHA)
- `.vsix` filename and size
- GitHub release URL
- Marketplace publish status (succeeded, or blocked on PAT with the exact command to run)
