/**
 * The Python half of the step argument check: asks behave itself to match step texts the
 * TypeScript check can't decide - steps whose parameter types have converters that can raise
 * (custom types, especially ones registered without a pattern), and steps an unverifiable
 * definition could match.
 *
 * Each check spawns discover.py (it loads every step module), so requests are batched per
 * workspace, only sent for files that are saved, and every verdict is cached until the next
 * step discovery replaces the definitions.
 */

import * as vscode from 'vscode';
import { uriId } from '../common';
import { config } from '../configuration';
import { diagLog } from '../logger';
import { getBundledBehavePath } from '../bundledBehave';
import { getBehaveEnv } from '../runners/behaveEnv';
import { WorkspaceSettings } from '../settings';
import { checkStepsWithBehave, StepCheckRequest, StepCheckResult } from './behaveLoader';
import { getRememberedStepsPaths, onArgumentCheckDefinitionsChanged } from './stepArgumentStore';


const FLUSH_DELAY_MS = 300;

interface WorkspaceChecks {
  results: Map<string, StepCheckResult>;
  /** texts whose check failed to run - not retried until definitions change */
  failed: Set<string>;
  /** "undefined" verdicts can't be trusted: a step file failed to load during the check */
  incomplete: boolean;
  pending: Map<string, StepCheckRequest>;
  timer?: NodeJS.Timeout;
  running: boolean;
}

const workspaces = new Map<string, WorkspaceChecks>();
let resultsListener: ((featuresUri: vscode.Uri) => void) | undefined;

// New definitions make every verdict stale. The workspace entry is replaced rather than
// cleared, so a check still in flight writes into the discarded one (see runChecks).
onArgumentCheckDefinitionsChanged(featuresUri => {
  const wksp = workspaces.get(uriId(featuresUri));
  if (!wksp)
    return;
  if (wksp.timer)
    clearTimeout(wksp.timer);
  workspaces.delete(uriId(featuresUri));
});

function newWorkspaceChecks(): WorkspaceChecks {
  return { results: new Map(), failed: new Set(), incomplete: false, pending: new Map(), running: false };
}

function getWorkspace(featuresUri: vscode.Uri) {
  const id = uriId(featuresUri);
  let wksp = workspaces.get(id);
  if (!wksp) {
    wksp = newWorkspaceChecks();
    workspaces.set(id, wksp);
  }
  return wksp;
}

const requestKey = (stepType: string, text: string) => `${stepType}\n${text}`;


/** Called (once) with the workspace whose verdicts just arrived, so diagnostics can refresh. */
export function onPythonStepChecks(listener: (featuresUri: vscode.Uri) => void) {
  resultsListener = listener;
}

export function getPythonStepCheck(featuresUri: vscode.Uri, stepType: string, text: string) {
  const wksp = workspaces.get(uriId(featuresUri));
  if (!wksp)
    return undefined;
  const result = wksp.results.get(requestKey(stepType, text));
  return result ? { result, incomplete: wksp.incomplete } : undefined;
}

/**
 * Queues step texts for behave to check. Texts already checked (or failed) are ignored.
 * Nothing is sent until a call with `flush` - i.e. once the feature file is saved - because
 * each check runs a Python process.
 */
export function requestPythonStepChecks(wkspSettings: WorkspaceSettings, requests: StepCheckRequest[], flush: boolean) {
  const wksp = getWorkspace(wkspSettings.featuresUri);
  for (const request of requests) {
    const key = requestKey(request.stepType, request.text);
    if (!wksp.results.has(key) && !wksp.failed.has(key))
      wksp.pending.set(key, request);
  }
  if (!flush || wksp.pending.size === 0 || wksp.running)
    return;
  if (wksp.timer)
    clearTimeout(wksp.timer);
  wksp.timer = setTimeout(() => {
    wksp.timer = undefined;
    runChecks(wkspSettings, wksp);
  }, FLUSH_DELAY_MS);
}


async function runChecks(wkspSettings: WorkspaceSettings, wksp: WorkspaceChecks) {
  const stepsPaths = getRememberedStepsPaths(wkspSettings.featuresUri);
  if (!stepsPaths || wksp.pending.size === 0)
    return;

  const batch = new Map(wksp.pending);
  wksp.pending.clear();
  wksp.running = true;

  try {
    const pythonExec = await config.getPythonExecutable(wkspSettings.uri, wkspSettings.name);
    const { checks, incomplete } = await checkStepsWithBehave(
      pythonExec,
      wkspSettings.projectUri.fsPath,
      stepsPaths,
      [...batch.values()],
      wkspSettings.importStrategy === 'useBundled' ? getBundledBehavePath() : undefined,
      wkspSettings.stepDefinitionSearchTimeout * 1000,
      getBehaveEnv(wkspSettings)
    );
    for (const check of checks)
      wksp.results.set(requestKey(check.stepType, check.text), check);
    wksp.incomplete = incomplete;
    config.logger.logVerbose(`step argument check: behave checked ${checks.length} step(s)`, wkspSettings.uri);
  }
  catch (e: unknown) {
    // quiet by design: a missed argument check is not worth a popup, and discovery
    // already reports interpreter/behave problems
    const msg = e instanceof Error ? e.message : String(e);
    diagLog(`step argument check failed: ${msg}`, wkspSettings.uri);
    config.logger.logVerbose(`step argument check failed: ${msg}`, wkspSettings.uri);
    for (const key of batch.keys())
      wksp.failed.add(key);
  }
  finally {
    wksp.running = false;
  }

  // definitions changed while behave was checking: these verdicts are for the old ones
  const live = workspaces.get(uriId(wkspSettings.featuresUri));
  if (live !== wksp)
    return;
  resultsListener?.(wkspSettings.featuresUri);
  if (wksp.pending.size > 0)
    requestPythonStepChecks(wkspSettings, [], true);
}
