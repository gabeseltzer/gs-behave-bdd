# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on **`gabeseltzer/gs-behave-bdd`**. Use the `gh` CLI for all operations.

## Repo resolution — always pass `--repo`

`gabeseltzer/gs-behave-bdd` is a **hard fork** of `jimasp/behave-vsc`. It has diverged and is developed independently — we do **not** merge changes back upstream, and upstream is not a contribution target. Treat `gabeseltzer/gs-behave-bdd` as the only repo for this project.

The fork relationship still exists on GitHub's side (`isFork: true`, parent `jimasp/behave-vsc`), and that's what matters here: bare `gh issue` commands in a fork resolve to the **parent** repo.

This clone has already been pinned with `gh repo set-default gabeseltzer/gs-behave-bdd` (recorded as `remote.origin.gh-resolved = base` in `.git/config`), so bare commands now resolve correctly here. The commands below still pass `--repo` explicitly: `.git/config` isn't checked in, so a fresh clone, a CI runner, or a teammate's machine will fall back to the upstream default until they run the same command. Keep the flag.

Never file, comment on, or close an issue or PR on `jimasp/behave-vsc`, and never open a cross-fork PR against it. If a bug traces to inherited upstream code, it's still our issue — file it here.

The `upstream` git remote is kept for occasional reference only (reading history or diffing against original code). Don't treat its presence as a sign that work flows back.

## Conventions

- **Create an issue**: `gh issue create --repo gabeseltzer/gs-behave-bdd --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo gabeseltzer/gs-behave-bdd --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --repo gabeseltzer/gs-behave-bdd --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo gabeseltzer/gs-behave-bdd --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo gabeseltzer/gs-behave-bdd --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo gabeseltzer/gs-behave-bdd --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `gabeseltzer/gs-behave-bdd`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo gabeseltzer/gs-behave-bdd --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/gabeseltzer/gs-behave-bdd/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/gabeseltzer/gs-behave-bdd/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
