import * as vscode from 'vscode';
import { ProjectEntry } from './projectList';


// --- Quick-pick item building (pure function, testable) ---

export interface ProjectQuickPickItem extends vscode.QuickPickItem {
  entry: ProjectEntry;
}

export function buildQuickPickItems(
  projects: ProjectEntry[],
  activeProject: ProjectEntry | undefined,
  openConfigButton: vscode.QuickInputButton,
  urisMatch: (a: vscode.Uri, b: vscode.Uri) => boolean
): ProjectQuickPickItem[] {
  return projects.map(p => {
    const isActive = activeProject && urisMatch(p.configFileUri, activeProject.configFileUri);
    const configType = p.configFileUri.path.split('/').pop() ?? 'config';
    // D-03: Root-level projects labeled "(root)"
    const displayLabel = p.label === '.' ? '(root)' : p.label;
    return {
      // D-02: Label = workspace-relative dir, Description = config type, Detail = full path
      label: displayLabel,
      description: isActive ? `${configType} \u2014 \u2713 active` : configType,
      detail: p.configFileUri.fsPath,
      buttons: [openConfigButton],
      entry: p
    };
  });
}


// --- Status bar visibility logic (pure function, testable) ---

export interface StatusBarState {
  visible: boolean;
  text?: string;
  tooltip?: string;
}

export function computeStatusBarState(
  projects: ProjectEntry[],
  activeProject: ProjectEntry | undefined,
  isManualMode: boolean
): StatusBarState {
  if (projects.length <= 1 || isManualMode || !activeProject) {
    return { visible: false };
  }
  // D-03: Root-level projects labeled "(root)"
  const displayLabel = activeProject.label === '.' ? '(root)' : activeProject.label;
  // D-06: Status bar text format
  const text = `Behave: ${displayLabel}`;
  // D-07: Detailed tooltip
  const configType = activeProject.configFileUri.path.split('/').pop() ?? 'config';
  const tooltip = `Active: ${displayLabel} (${configType})\n${projects.length} projects discovered \u2014 click to switch`;
  return { visible: true, text, tooltip };
}
