import * as fs from 'fs';
import * as path from 'path';

// Snapshots fixture settings files before an integration test run so the
// extension's migration writes (which call `cfg.update(...)` against real
// VS Code config and persist to disk) don't pollute the git worktree.
//
// We capture every `example-projects/*/.vscode/settings.json` plus the
// `.code-workspace` files, and remember whether the file / its `.vscode`
// parent existed beforehand. Restore re-writes original content, deletes
// files that didn't exist, and removes `.vscode` dirs that we created.

interface FileSnapshot {
  path: string;
  existed: boolean;
  parentExistedBefore: boolean;
  content?: string;
}

function collectTargets(exampleProjectsDir: string): string[] {
  const targets: string[] = [];
  const entries = fs.readdirSync(exampleProjectsDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(exampleProjectsDir, entry.name);
    if (entry.isDirectory()) {
      targets.push(path.join(full, '.vscode', 'settings.json'));
    } else if (entry.isFile() && entry.name.endsWith('.code-workspace')) {
      targets.push(full);
    }
  }
  return targets;
}

export function snapshotFixtures(exampleProjectsDir: string): FileSnapshot[] {
  return collectTargets(exampleProjectsDir).map(p => {
    const existed = fs.existsSync(p);
    const parentExistedBefore = fs.existsSync(path.dirname(p));
    return {
      path: p,
      existed,
      parentExistedBefore,
      content: existed ? fs.readFileSync(p, 'utf-8') : undefined,
    };
  });
}

export function restoreFixtures(snapshots: FileSnapshot[]): void {
  for (const snap of snapshots) {
    try {
      if (snap.existed && snap.content !== undefined) {
        fs.writeFileSync(snap.path, snap.content, 'utf-8');
      } else {
        if (fs.existsSync(snap.path)) fs.unlinkSync(snap.path);
        const parent = path.dirname(snap.path);
        if (!snap.parentExistedBefore && fs.existsSync(parent)) {
          try { fs.rmdirSync(parent); } catch { /* not empty — leave it */ }
        }
      }
    } catch (e) {
      console.error(`Failed to restore fixture ${snap.path}:`, e);
    }
  }
}
