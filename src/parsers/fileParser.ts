import * as vscode from 'vscode';
import { performance } from 'perf_hooks';
import { config } from "../configuration";
import { WorkspaceSettings } from "../settings";
import { deleteFeatureFileSteps, getFeatureFileSteps, getFeatureNameFromContent } from './featureParser';
import {
  countTestItemsInCollection, getAllTestItems, uriId, getWorkspaceFolder,
  getUrisOfWkspFoldersWithFeatures, isFeatureFile, isStepsFile, TestCounts, findFiles, getContentFromFilesystem, couldBePythonStepsFile,
  getFeaturesRootForFile, getDiscoveryEntry, urisMatch
} from '../common';
import { getStepFileSteps, deleteStepFileSteps, storeStepFileStep } from './stepsParser';
import { deleteFixtures, storePythonFixtureDefinitions, getFixtures, restoreFixtures } from './fixtureParser';
import { loadFromBehave, BehaveDiscoveryResult, FailedFileInfo } from './behaveLoader';
import { storeBehaveStepDefinitions } from './stepsParserBehaveAdapter';
import { TestData, TestFile } from './testFile';
import { diagLog } from '../logger';
import * as path from 'path';
import { deleteStepMappings, rebuildStepMappings, getStepMappings, rebuildExecuteStepsMappings } from './stepMappings';
import { parseExecuteStepsFileContent, deleteExecuteStepsCallSteps } from './executeStepsParser';
import { getBundledBehavePath } from '../bundledBehave';
import { getBehaveEnv } from '../runners/behaveEnv';
import { setDuplicateStepDiagnostics, clearDuplicateStepDiagnostics } from '../handlers/duplicateStepDiagnostics';
import { setStepLoadDiagnostics, setMissingModuleHints } from '../handlers/stepLoadDiagnostics';


// for integration test assertions      
export type WkspParseCounts = {
  tests: TestCounts,
  featureFilesExceptEmptyOrCommentedOut: number,
  stepFilesExceptEmptyOrCommentedOut: number,
  stepFileStepsExceptCommentedOut: number
  featureFileStepsExceptCommentedOut: number,
  stepMappings: number
};

export class FileParser {

  private _parseFilesCallCounts = 0;
  private _finishedFeaturesParseForAllWorkspaces = false;
  private _finishedStepsParseForAllWorkspaces = false;
  private _finishedFeaturesParseForWorkspace: { [key: string]: boolean } = {};
  private _finishedStepsParseForWorkspace: { [key: string]: boolean } = {};
  private _cancelTokenSources: { [wkspUriPath: string]: vscode.CancellationTokenSource } = {};
  private _errored = false;
  private _reparsingFile = false;
  private _pythonReparseTimers: Map<string, NodeJS.Timeout> = new Map();
  // Python files edited during the current debounce window, per workspace. The debounce timer
  // is per-workspace and its closure only captures the LATEST edit's fileUri/content, so the
  // execute_steps rescan must accumulate and process EVERY file edited in the window - not just
  // the last one - or earlier-edited files' call-site caches go stale (WR-06).
  private _pendingExecScanFiles: Map<string, Map<string, { uri: vscode.Uri; content: string }>> = new Map();
  private static readonly PYTHON_REPARSE_DEBOUNCE_MS = 500;
  private _statusChangeHandlers: ((busy: boolean) => void)[] = [];
  private _stepLoadErrorHandlers: ((error: string | undefined, failedFiles?: FailedFileInfo[]) => void)[] = [];
  // Workspaces whose WorkspaceSettings ctor threw (e.g. bad projectPath). Surfaced
  // to the language-status item so it shows Error severity instead of "Ready".
  private _wkspsWithFatalSettings = new Set<string>();

  // Called after a Python file debounce fires and step mappings have been rebuilt.
  // extension.ts registers this to re-validate diagnostics for all open feature files.
  public onStepMappingsRebuilt: ((featuresUri: vscode.Uri) => void) | undefined;

  get initialStepsParseComplete(): boolean {
    return this._finishedStepsParseForAllWorkspaces;
  }

  public onStatusChange(handler: (busy: boolean) => void) {
    this._statusChangeHandlers.push(handler);
  }

  public onStepLoadError(handler: (error: string | undefined, failedFiles?: FailedFileInfo[]) => void) {
    this._stepLoadErrorHandlers.push(handler);
  }

  public clearStepLoadError() {
    this._notifyStepLoadError(undefined);
  }

  public hasFatalSettings(): boolean {
    return this._wkspsWithFatalSettings.size > 0;
  }

  // Marks a workspace as having fatal settings from outside the parse loop —
  // used when discovery filtering excludes the workspace before parseFilesForWorkspace
  // is reached (e.g. projectPath dir missing → workspace filtered by hasFeaturesFolder).
  // Without this seam, the language-status item never flips to "Invalid Settings"
  // for filtered-out workspaces because the parser's guard is unreachable.
  public markWorkspaceFatalSettings(wkspUri: vscode.Uri) {
    this._wkspsWithFatalSettings.add(wkspUri.path);
    this._notifyStatusChange(false);
  }

  public clearWorkspaceFatalSettings(wkspUri: vscode.Uri) {
    this._wkspsWithFatalSettings.delete(wkspUri.path);
  }

  private _notifyStatusChange(busy: boolean) {
    this._statusChangeHandlers.forEach(h => h(busy));
  }

  private _notifyStepLoadError(error: string | undefined, failedFiles?: FailedFileInfo[]) {
    this._stepLoadErrorHandlers.forEach(h => h(error, failedFiles));
  }

  async featureParseComplete(timeout: number, caller: string) {
    const interval = 100;
    if (timeout < 150)
      timeout = 150;

    // parsing is a background task, ensure things had a chance to start to avoid false positives
    await new Promise(t => setTimeout(t, 50));
    timeout = timeout - 50;

    const check = (resolve: (value: boolean) => void) => {
      if (this._finishedFeaturesParseForAllWorkspaces) {
        diagLog(`featureParseComplete (${caller}) - is good to go (all features parsed, steps parsing may continue in background)`);
        resolve(true);
      }
      else {
        timeout -= interval;
        diagLog(`featureParseComplete  (${caller}) waiting - ${timeout} left until timeout`);
        if (timeout < interval) {
          diagLog(`featureParseComplete (${caller})  - timed out`);
          return resolve(false);
        }
        setTimeout(() => check(resolve), interval);
      }
    }

    return new Promise<boolean>(check);
  }


  async stepsParseComplete(timeout: number, caller: string) {
    const interval = 100;
    if (timeout < 150)
      timeout = 150;

    // parsing is a background task, ensure things had a chance to start to avoid false positives
    await new Promise(t => setTimeout(t, 50));
    timeout = timeout - 50;

    const check = (resolve: (value: boolean) => void) => {
      if (this._finishedStepsParseForAllWorkspaces && !this._reparsingFile) {
        diagLog(`stepsParseComplete (${caller}) - is good to go (all steps parsed)`);
        resolve(true);
      }
      else {
        timeout -= interval;
        diagLog(`stepsParseComplete (${caller}) waiting - ${timeout} left until timeout`);
        if (timeout < interval) {
          diagLog(`stepsParseComplete (${caller}) - timed out`);
          return resolve(false);
        }
        setTimeout(() => check(resolve), interval);
      }
    }

    return new Promise<boolean>(check);
  }


  private _parseFeatureFiles = async (wkspSettings: WorkspaceSettings, testData: TestData, controller: vscode.TestController,
    cancelToken: vscode.CancellationToken, caller: string, firstRun: boolean): Promise<number> => {

    diagLog("removing existing test nodes/items for workspace: " + wkspSettings.name);
    const items = getAllTestItems(wkspSettings.id, controller.items);
    for (const item of items) {
      testData.delete(item);
      controller.items.delete(item.id);
    }

    for (const root of wkspSettings.featuresUris) {
      deleteFeatureFileSteps(root);
      deleteStepMappings(root);
    }

    const findFilesStart = performance.now();
    const featureFiles: vscode.Uri[] = [];
    for (const root of wkspSettings.featuresUris) {
      const files = await findFiles(root, undefined, ".feature", cancelToken);
      featureFiles.push(...files);
    }
    diagLog(`${caller}: _parseFeatureFiles findFiles took ${Math.round(performance.now() - findFilesStart)}ms, found ${featureFiles.length} feature files`);

    if (featureFiles.length < 1 && !cancelToken.isCancellationRequested)
      throw `No feature files found in ${wkspSettings.featuresUris.map(u => u.fsPath).join(", ")}`;

    const parseLoopStart = performance.now();
    let processed = 0;
    for (const uri of featureFiles) {
      if (cancelToken.isCancellationRequested)
        break;
      const content = await getContentFromFilesystem(uri);
      await this._updateTestItemFromFeatureFileContent(wkspSettings, content, testData, controller, uri, caller, firstRun);
      processed++;
    }
    diagLog(`${caller}: _parseFeatureFiles parsing loop took ${Math.round(performance.now() - parseLoopStart)}ms for ${processed} files`);

    if (cancelToken.isCancellationRequested) {
      // either findFiles or loop will have exited early, log it either way
      diagLog(`${caller}: cancelling, _parseFeatureFiles stopped`);
    }

    return processed;
  }


  private _parseStepsFiles = async (wkspSettings: WorkspaceSettings, cancelToken: vscode.CancellationToken,
    caller: string): Promise<number> => {

    // Search all step directories across all roots
    const findFilesStart = performance.now();
    let allPyFiles: vscode.Uri[] = [];
    for (let i = 0; i < wkspSettings.featuresUris.length; i++) {
      const featUri = wkspSettings.featuresUris[i];
      const stepsUri = wkspSettings.stepsSearchUris[i];
      const searchInFeatures = stepsUri.path.startsWith(featUri.path);
      const searchUri = searchInFeatures ? featUri : stepsUri;
      const pyFiles = await findFiles(searchUri, undefined, ".py", cancelToken);
      allPyFiles.push(...pyFiles);
    }
    // Dedup in case of overlapping search paths
    const seenPy = new Set<string>();
    allPyFiles = allPyFiles.filter(f => { const id = uriId(f); if (seenPy.has(id)) return false; seenPy.add(id); return true; });
    diagLog(`${caller}: _parseStepsFiles findFiles took ${Math.round(performance.now() - findFilesStart)}ms, found ${allPyFiles.length} .py files`);

    // Scan every watched .py file for embedded execute_steps() call sites (helper modules and
    // environment.py included, not just step definition files - REFS-01/02/03). This is pure
    // in-memory scanning independent of the behave subprocess below, so it must run even if
    // the behave load fails.
    deleteExecuteStepsCallSteps(wkspSettings.featuresUri);
    const execScanStart = performance.now();
    let execCallSitesFound = 0;
    for (const pyFile of allPyFiles) {
      if (cancelToken.isCancellationRequested)
        break;
      try {
        const pyContent = await getContentFromFilesystem(pyFile);
        execCallSitesFound += parseExecuteStepsFileContent(wkspSettings.featuresUri, pyContent, pyFile, caller);
      }
      catch {
        // a transient read failure for one file (deleted/renamed between findFiles and the
        // read, e.g. branch switch or build clean) must never abort the whole workspace parse -
        // the scanner is designed to never throw, so honour that here too (WR-05)
        diagLog(`${caller}: could not read ${pyFile.path} for execute_steps scan, skipping`);
      }
    }
    diagLog(`${caller}: _parseStepsFiles execute_steps scan took ${Math.round(performance.now() - execScanStart)}ms, found ${execCallSitesFound} call sites across ${allPyFiles.length} .py files`);

    const stepFiles = allPyFiles.filter(uri => isStepsFile(uri));

    config.logger.logVerbose(
      `step discovery: searched ${wkspSettings.featuresUris.map(u => u.fsPath).join(", ")} ` +
      `(steps search paths: ${wkspSettings.stepsSearchUris.map(u => u.fsPath).join(", ")})\n` +
      `  found ${allPyFiles.length} .py file(s), of which ${stepFiles.length} look like step files`,
      wkspSettings.uri);
    if (stepFiles.length === 0) {
      // no step files => no step definitions => ctrl+click can never resolve. Almost always a
      // wrong steps folder location rather than an execution failure, so name the paths searched.
      config.logger.logVerbose(
        `step discovery: >>> NO step files found. Step definitions must live in a "steps" folder under a ` +
        `configured features path. Nothing will resolve until this is fixed.`,
        wkspSettings.uri);
    }

    // Load all steps and fixtures using behave's built-in registry (handles imports automatically)
    // We load BEFORE deleting old steps so that on failure we keep the previous valid definitions
    try {
      const getPythonStart = performance.now();
      const pythonExec = await config.getPythonExecutable(wkspSettings.uri, wkspSettings.name);
      diagLog(`${caller}: _parseStepsFiles getPythonExecutable took ${Math.round(performance.now() - getPythonStart)}ms`);
      const startTime = performance.now();

      // Collect all unique step directories (may be multiple across the workspace)
      // e.g., features/steps/ and features/grouped/steps/
      const stepDirSet = new Set<string>();
      for (const stepFile of stepFiles) {
        const stepDir = path.dirname(stepFile.fsPath);
        stepDirSet.add(stepDir);
      }
      const stepsDirs = Array.from(stepDirSet);

      // If no step directories found, use the default search path
      const stepsPaths = stepsDirs.length > 0 ? stepsDirs : [wkspSettings.stepsSearchUri.fsPath];

      const loadBehaveStart = performance.now();
      config.logger.logVerbose(
        `step discovery: interpreter "${pythonExec}", cwd "${wkspSettings.projectUri.fsPath}", ` +
        `importStrategy "${wkspSettings.importStrategy}", timeout ${wkspSettings.stepDefinitionSearchTimeout}s\n` +
        `  step dirs passed to behave: ${stepsPaths.join(", ")}`,
        wkspSettings.uri);
      config.logger.logInfo(`Searching for step definitions...`, wkspSettings.uri);
      const result = await loadFromBehave(
        pythonExec,
        wkspSettings.projectUri.fsPath,
        stepsPaths,
        wkspSettings.importStrategy === 'useBundled' ? getBundledBehavePath() : undefined,
        wkspSettings.stepDefinitionSearchTimeout * 1000,
        // Same environment as an actual test run, so discovery resolves the same
        // imports behave does (user PYTHONPATH, virtualenv, env presets).
        getBehaveEnv(wkspSettings)
      );
      const loadBehaveElapsed = Math.round(performance.now() - loadBehaveStart);
      diagLog(`${caller}: _parseStepsFiles loadFromBehave took ${loadBehaveElapsed}ms, returned ${result.steps.length} steps and ${result.fixtures.length} fixtures`);
      config.logger.logInfo(`Step definition search complete in ${loadBehaveElapsed}ms`, wkspSettings.uri);
      config.logger.logVerbose(
        `step discovery: behave returned ${result.steps.length} step definition(s) and ${result.fixtures.length} fixture(s)` +
        (result.failedFiles?.length ? `\n  file(s) that failed to load: ${result.failedFiles.map(f => `${f.filePath} (${f.kind}: ${f.errorMessage})`).join("; ")}` : "") +
        (result.mockedModules?.length ? `\n  missing modules stubbed out: ${result.mockedModules.join(", ")}` : "") +
        (result.duplicates?.length ? `\n  duplicate step definitions: ${result.duplicates.length}` : ""),
        wkspSettings.uri);

      if (result.stderr) {
        config.logger.logInfo(`behave stderr output:\n${result.stderr}`, wkspSettings.uri);
      }

      if (cancelToken.isCancellationRequested) {
        diagLog(`${caller}: cancelling, _parseStepsFiles stopped after behave load`);
        return 0;
      }

      // Wholesale failure (behave's fallback loader path): keep ALL old definitions.
      // This is a code-shaped error (a syntax/import problem in workspace files) —
      // expected during editing and self-resolving, so no popup: the language-status
      // item and Problems-pane diagnostics carry it instead (quiet-by-design).
      if (result.error) {
        this._handleWholesaleLoadError(result, wkspSettings);
        return stepFiles.length;
      }

      // Behave loaded (possibly with per-file failures) — merge fresh results with
      // cached definitions for any files that failed to load
      const storedCount = await this._applyBehaveResult(wkspSettings, result, stepFiles, caller);

      // Behave's registry can pull in step-library files that live OUTSIDE the watched roots
      // (e.g. lib/ next to features/) - the allPyFiles scan above never saw them, so scan any
      // step-def file we haven't scanned yet for execute_steps call sites too. In-editor edits
      // to these files reparse via onDidChangeTextDocument, but on-disk-only changes are not
      // watched (documented limitation).
      const libScanStart = performance.now();
      let libFilesScanned = 0;
      for (const [, stepDef] of getStepFileSteps(wkspSettings.featuresUri)) {
        const defUriId = uriId(stepDef.uri);
        if (seenPy.has(defUriId))
          continue;
        seenPy.add(defUriId);
        if (cancelToken.isCancellationRequested)
          break;
        try {
          const libContent = await getContentFromFilesystem(stepDef.uri);
          execCallSitesFound += parseExecuteStepsFileContent(wkspSettings.featuresUri, libContent, stepDef.uri, caller);
          libFilesScanned++;
        }
        catch {
          diagLog(`${caller}: could not read ${stepDef.uri.path} for execute_steps library scan, skipping`);
        }
      }
      if (libFilesScanned > 0)
        diagLog(`${caller}: _parseStepsFiles execute_steps library scan took ${Math.round(performance.now() - libScanStart)}ms across ${libFilesScanned} library files`);

      // Return count of step files (not step definitions)
      // stepFiles was already filtered to exclude non-step files
      // This count is used for test assertions that check stepFilesExceptEmptyOrCommentedOut
      const stepFileCount = stepFiles.length;

      const elapsed = Math.round(performance.now() - startTime);
      diagLog(`${caller}: loaded ${storedCount} steps from ${stepFileCount} files in ${elapsed}ms`);

      return stepFileCount;

    } catch (e) {
      // This catch handles truly unrecoverable, ENVIRONMENTAL errors (Python not
      // found, behave not installed, timeout). These won't self-resolve by editing
      // code, so they keep the warning popup.
      const errMsg = e instanceof Error ? e.message : String(e);
      diagLog(`behave step loading error: ${errMsg}`);
      // Include the environment the search actually ran in. Without it this reads as "it just
      // doesn't work"; with it, the usual causes (wrong interpreter/virtualenv, bundled behave
      // missing from a broken install, a steps folder that isn't where the extension looked)
      // are all visible in one place.
      config.logger.logInfo(
        `Failed to load step definitions: ${errMsg}\n` +
        `  step definition search ran with:\n` +
        `    project (cwd):    ${wkspSettings.projectUri.fsPath}\n` +
        `    features paths:   ${wkspSettings.featuresUris.map(u => u.fsPath).join(", ")}\n` +
        `    step files found: ${stepFiles.length}\n` +
        `    importStrategy:   ${wkspSettings.importStrategy}\n` +
        `    timeout:          ${wkspSettings.stepDefinitionSearchTimeout}s\n` +
        `  No step definitions could be loaded, so step navigation (ctrl+click / F12), hover, and ` +
        `missing-step diagnostics will not work for this workspace.`,
        wkspSettings.uri);
      this._notifyStepLoadError(errMsg);
      this._showStepLoadWarning(errMsg, wkspSettings.uri);
      // Return the count of step files found (not 0) so callers know files exist even though loading failed
      return stepFiles.length;
    }
  }


  // Wholesale load failure (result.error set): keep old definitions, no popup unless
  // discover.py explicitly classified the error as environmental.
  private _handleWholesaleLoadError(result: BehaveDiscoveryResult, wkspSettings: WorkspaceSettings) {
    diagLog(`behave step loading error: ${result.error}`);
    // This path is deliberately quiet in the UI for code-shaped errors (a syntax/import problem
    // the user is probably mid-edit on), which means the log is the ONLY standing record of it -
    // so spell out the consequence here rather than just the error string.
    config.logger.logInfo(
      `Failed to load step definitions: ${result.error}\n` +
      `  Previously loaded step definitions (if any) have been kept, so step navigation may be ` +
      `stale or unavailable until this is fixed. ` +
      (result.errorKind === "code"
        ? `This looks like a syntax or import error in your own files - see the Problems pane.`
        : `This looks like an environment problem (interpreter, behave install, or timeout).`),
      wkspSettings.uri);
    this._logDiscoveryDiagnostics(result, wkspSettings);
    this._notifyStepLoadError(result.error);
    if (result.errorKind === "environmental")
      this._showStepLoadWarning(result.error ?? "unknown error", wkspSettings.uri);
    if (result.duplicates?.length) {
      setDuplicateStepDiagnostics(result.duplicates);
    }
  }


  // Logs the interpreter, search paths, and per-file tracebacks to the workspace
  // output channel whenever discovery hits import problems. This is the ground
  // truth for "imports that work for behave aren't followed": it shows the exact
  // interpreter and sys.path used, to compare against a working `behave` run.
  private _logDiscoveryDiagnostics(result: BehaveDiscoveryResult, wkspSettings: WorkspaceSettings) {
    if (result.diagnostics) {
      config.logger.logInfo(
        `Step discovery ran with:\n` +
        `  interpreter: ${result.diagnostics.pythonExecutable}\n` +
        `  sys.path:\n${result.diagnostics.sysPath.map(p => `    ${p}`).join('\n')}\n` +
        `If an import that works when you run behave is failing here, compare this ` +
        `interpreter and these paths against your working behave environment ` +
        `(a different virtualenv, or a path only your shell/PYTHONPATH provides, is the usual cause).`,
        wkspSettings.uri);
    }
    for (const failed of result.failedFiles ?? []) {
      if (failed.traceback)
        config.logger.logInfo(`Traceback for ${failed.filePath}:\n${failed.traceback}`, wkspSettings.uri);
    }
  }


  // Applies a successful (possibly partial) discovery result:
  // - notifies status/diagnostics consumers (including per-file failures and stub hints)
  // - replaces stored definitions, EXCEPT files that failed to load, which keep
  //   their previously cached definitions (per-file isolation, G)
  // Cached entries are stored before fresh ones so that on a pattern-key
  // collision the fresh definition (from a file that currently loads) wins.
  private _applyBehaveResult = async (wkspSettings: WorkspaceSettings, result: BehaveDiscoveryResult,
    stepFilesForHints: vscode.Uri[], caller: string): Promise<number> => {

    const failedFiles = result.failedFiles ?? [];

    this._notifyStepLoadError(undefined, failedFiles.length ? failedFiles : undefined);

    if (result.duplicates?.length)
      setDuplicateStepDiagnostics(result.duplicates);
    else
      clearDuplicateStepDiagnostics();

    setStepLoadDiagnostics(failedFiles);
    await setMissingModuleHints(result.mockedModules ?? [], stepFilesForHints);
    if (failedFiles.length > 0)
      this._logDiscoveryDiagnostics(result, wkspSettings);

    // Snapshot cached definitions BEFORE the delete-all. Retain a cached entry only
    // when the file has NO fresh definitions AND is in a broken state, specifically:
    // (a) its file failed to load and discovery recovered nothing fresh for it, or
    // (b) failures exist AND its file was neither executed by discover.py nor present
    //     in the fresh results — i.e. a step LIBRARY whose steps are missing only
    //     because their importer failed (libraries are never executed directly, so
    //     they appear in neither loaded_files nor failed_files).
    // Fresh definitions ALWAYS win: a file whose literal steps discovery recovered
    // from source (despite a failed import) is replaced with those, not the cache;
    // and a healthy file that genuinely deleted its steps is replaced too.
    const failedIds = new Set(failedFiles.map(f => uriId(vscode.Uri.file(f.filePath))));
    const loadedIds = new Set((result.loadedFiles ?? []).map(f => uriId(vscode.Uri.file(f))));
    const freshStepFileIds = new Set(result.steps.map(s => uriId(vscode.Uri.file(s.filePath))));
    const freshFixtureFileIds = new Set(result.fixtures.map(f => uriId(vscode.Uri.file(f.filePath))));

    const retain = (fileUri: vscode.Uri, freshIds: Set<string>): boolean => {
      const id = uriId(fileUri);
      if (freshIds.has(id)) return false; // fresh definitions supersede cache
      return failedIds.has(id) || !loadedIds.has(id);
    };

    const cachedSteps = failedIds.size > 0
      ? getStepFileSteps(wkspSettings.featuresUri, false).map(([, s]) => s).filter(s => retain(s.uri, freshStepFileIds))
      : [];
    const cachedFixtures = failedIds.size > 0
      ? getFixtures(wkspSettings.featuresUri).filter(f => retain(f.uri, freshFixtureFileIds))
      : [];

    diagLog("removing existing steps for workspace: " + wkspSettings.name);
    deleteStepFileSteps(wkspSettings.featuresUri);
    deleteFixtures(wkspSettings.featuresUri);

    // Cached first, fresh second: fresh wins any pattern-key collision
    for (const cachedStep of cachedSteps)
      storeStepFileStep(wkspSettings.featuresUri, cachedStep);
    restoreFixtures(cachedFixtures);

    const storeBehaveStart = performance.now();
    const storedCount = await storeBehaveStepDefinitions(wkspSettings.featuresUri, result.steps);
    storePythonFixtureDefinitions(wkspSettings.featuresUri, result.fixtures);
    diagLog(`${caller}: _applyBehaveResult storeBehaveStepDefinitions took ${Math.round(performance.now() - storeBehaveStart)}ms`);

    if (failedFiles.length > 0) {
      const failedNames = failedFiles.map(f => path.basename(f.filePath)).join(", ");
      config.logger.logInfo(
        `${failedFiles.length} file(s) could not be loaded for step discovery (kept ${cachedSteps.length} previously cached step definition(s) for: ${failedNames}) — see the Problems pane`,
        wkspSettings.uri);
    }

    return storedCount;
  }







  private async _updateTestItemFromFeatureFileContent(wkspSettings: WorkspaceSettings, content: string, testData: TestData,
    controller: vscode.TestController, uri: vscode.Uri, caller: string, firstRun: boolean) {

    if (!isFeatureFile(uri))
      throw new Error(`${caller}: ${uri.path} is not a feature file`);

    if (!content)
      return;

    const item = await this._getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature(wkspSettings, content, testData,
      controller, uri, caller, firstRun);
    if (item) {
      diagLog(`${caller}: parsing ${uri.path}`);
      await item.testFile.createScenarioTestItemsFromFeatureFileContent(wkspSettings, content, testData, controller, item.testItem, caller);
    }
    else {
      diagLog(`${caller}: no scenarios found in ${uri.path}`);
    }
  }


  private async _getOrCreateFeatureTestItemAndParentFolderTestItemsForFeature(wkspSettings: WorkspaceSettings, content: string,
    testData: TestData, controller: vscode.TestController, uri: vscode.Uri, caller: string,
    firstRun: boolean): Promise<{ testItem: vscode.TestItem, testFile: TestFile } | undefined> {

    if (!isFeatureFile(uri))
      throw new Error(`${uri.path} is not a feature file`);

    if (!content)
      return;

    // note - get() will only match the top level node (e.g. a folder or root feature)
    const existingItem = controller.items.get(uriId(uri));

    const featureName = await getFeatureNameFromContent(content, uri, firstRun);
    if (!featureName) {
      if (existingItem)
        controller.items.delete(existingItem.id);
      return undefined;
    }

    if (existingItem) {
      diagLog(`${caller}: found existing top-level node for file ${uri.path}`);
      existingItem.label = featureName;
      return { testItem: existingItem, testFile: testData.get(existingItem) as TestFile || new TestFile() };
    }

    const testItem = controller.createTestItem(uriId(uri), featureName, uri);
    testItem.canResolveChildren = true;
    controller.items.add(testItem);
    const testFile = new TestFile();
    testData.set(testItem, testFile);

    // if it's a multi-root workspace, use workspace grandparent nodes, e.g. "workspace_1", "workspace_2"
    let wkspGrandParent: vscode.TestItem | undefined;
    if ((getUrisOfWkspFoldersWithFeatures()).length > 1) {
      wkspGrandParent = controller.items.get(wkspSettings.id);
      if (!wkspGrandParent) {
        const wkspName = wkspSettings.name;
        wkspGrandParent = controller.createTestItem(wkspSettings.id, wkspName);
        wkspGrandParent.canResolveChildren = true;
        controller.items.add(wkspGrandParent);
      }
    }

    // Determine the owning root for this feature file
    const root = getFeaturesRootForFile(wkspSettings, uri) ?? wkspSettings.featuresUri;

    // Path-group intermediate nodes (D-01, D-02): show when paths come from config or multi-path
    const entry = getDiscoveryEntry(wkspSettings.uri);
    const showPathGroups = (entry?.source === 'config-file') || wkspSettings.featuresUris.length > 1;

    let pathGroupParent: vscode.TestItem | undefined;
    if (showPathGroups) {
      const pathGroupId = uriId(root);
      const rootIndex = wkspSettings.featuresUris.findIndex(u => urisMatch(u, root));
      const pathGroupLabel = (rootIndex >= 0 ? wkspSettings.projectRelativeFeaturesPaths[rootIndex] : "features") + "/";

      pathGroupParent = wkspGrandParent
        ? wkspGrandParent.children.get(pathGroupId)
        : controller.items.get(pathGroupId);

      if (!pathGroupParent) {
        pathGroupParent = controller.createTestItem(pathGroupId, pathGroupLabel);
        pathGroupParent.canResolveChildren = true;
        if (wkspGrandParent) {
          wkspGrandParent.children.add(pathGroupParent);
        } else {
          controller.items.add(pathGroupParent);
        }
      }
    }

    // build folder hierarchy above test item
    // build top-down in case parent folder gets renamed/deleted etc.
    // note that the id is based on the file path so a new node is created if the folder is renamed
    // (old nodes are removed when required by parseFeatureFiles())
    let firstFolder: vscode.TestItem | undefined = undefined;
    let parent: vscode.TestItem | undefined = undefined;
    let current: vscode.TestItem | undefined;
    const sfp = uri.path.substring(root.path.length + 1);
    if (sfp.includes("/")) {

      const folders = sfp.split("/").slice(0, -1);
      for (let i = 0; i < folders.length; i++) {
        const path = folders.slice(0, i + 1).join("/");
        const folderName = "\uD83D\uDCC1 " + folders[i]; // folder icon
        const folderTestItemId = `${uriId(root)}/${path}`;

        if (i === 0)
          parent = pathGroupParent ?? wkspGrandParent;

        if (parent)
          current = parent.children.get(folderTestItemId);

        if (!current) { // TODO: move getAllTestItems above the loop (moving it would need thorough testing of UI interactions of folder/file renames)
          const allTestItems = getAllTestItems(wkspSettings.id, controller.items);
          current = allTestItems.find(item => item.id === folderTestItemId);
        }

        if (!current) {
          current = controller.createTestItem(folderTestItemId, folderName);
          current.canResolveChildren = true;
          controller.items.add(current);
        }

        if (i === folders.length - 1)
          current.children.add(testItem);

        if (parent)
          parent.children.add(current);

        parent = current;

        if (i === 0)
          firstFolder = current;
      }
    }

    if (pathGroupParent) {
      if (firstFolder) {
        pathGroupParent.children.add(firstFolder);
      } else {
        pathGroupParent.children.add(testItem);
      }
    } else if (wkspGrandParent) {
      if (firstFolder) {
        wkspGrandParent.children.add(firstFolder);
      } else {
        wkspGrandParent.children.add(testItem);
      }
    }

    diagLog(`${caller}: created test item for ${uri.path}`);
    return { testItem: testItem, testFile: testFile };
  }


  async clearTestItemsAndParseFilesForAllWorkspaces(testData: TestData, ctrl: vscode.TestController,
    intiator: string, firstRun: boolean, cancelToken?: vscode.CancellationToken) {

    this._finishedFeaturesParseForAllWorkspaces = false;
    this._errored = false;

    // this function is called e.g. when a workspace gets added/removed/renamed, so 
    // clear everything up-front so that we rebuild the top level nodes
    diagLog("clearTestItemsAndParseFilesForAllWorkspaces - removing all test nodes/items for all workspaces");
    const items = getAllTestItems(null, ctrl.items);
    for (const item of items) {
      ctrl.items.delete(item.id);
      testData.delete(item);
    }

    const wkspsToParse = getUrisOfWkspFoldersWithFeatures();
    for (const wkspUri of wkspsToParse) {
      this.parseFilesForWorkspace(wkspUri, testData, ctrl, `clearTestItemsAndParseFilesForAllWorkspaces from ${intiator}`,
        firstRun, cancelToken);
    }
    // If discovery filtered out every workspace (e.g. all have bad projectPath
    // settings), no parseFilesForWorkspace runs and the busy spinner — set by
    // the initial activation block at extension.ts — never clears. Fire it here.
    if (wkspsToParse.length === 0) {
      this._notifyStatusChange(false);
      config.logger.logVerbose(
        `${intiator}: no workspace folders to parse - project discovery accepted none, so no step ` +
        `definitions will be loaded (see the "project discovery" entry above for the per-folder reason)`);
    }
  }


  // NOTE:
  // - This is normally a BACKGROUND task. It should only be await-ed on user request, i.e. when called by the refreshHandler.
  // - It is a self-cancelling re-entrant function, i.e. any current parse for the same workspace will be cancelled. 
  async parseFilesForWorkspace(wkspUri: vscode.Uri, testData: TestData, ctrl: vscode.TestController, intiator: string, firstRun: boolean,
    callerCancelToken?: vscode.CancellationToken): Promise<WkspParseCounts | undefined> {

    const wkspPath = wkspUri.path;
    this._finishedFeaturesParseForAllWorkspaces = false;
    this._finishedStepsParseForAllWorkspaces = false;
    this._finishedFeaturesParseForWorkspace[wkspPath] = false;
    this._finishedStepsParseForWorkspace[wkspPath] = false;

    this._notifyStatusChange(true);

    // if caller cancels, pass it on to the internal token
    const cancellationHandler = callerCancelToken?.onCancellationRequested(() => {
      if (this._cancelTokenSources[wkspPath])
        this._cancelTokenSources[wkspPath].cancel();
    });


    try {

      this._parseFilesCallCounts++;
      const wkspName = getWorkspaceFolder(wkspUri).name;
      const wkspId = uriId(wkspUri);
      const callName = `parseFiles #${this._parseFilesCallCounts} ${wkspName} (${intiator})`;
      let testCounts: TestCounts = { nodeCount: 0, testCount: 0 };

      diagLog(`\n===== ${callName}: started =====`);

      // this function is not generally awaited, and therefore re-entrant, so 
      // cancel any existing parseFiles call for this workspace
      if (this._cancelTokenSources[wkspPath]) {
        diagLog(`cancelling previous parseFiles call for ${wkspName}`);
        this._cancelTokenSources[wkspPath].cancel();
        while (this._cancelTokenSources[wkspPath]) {
          await new Promise(t => setTimeout(t, 20));
        }
      }
      this._cancelTokenSources[wkspPath] = new vscode.CancellationTokenSource();
      const wkspSettings: WorkspaceSettings = config.workspaceSettings[wkspUri.path];

      // Guard: if WorkspaceSettings construction threw a FATAL error, the configuration getter has already
      // surfaced exactly one user-facing notification and left _resourceSettings[wkspUri.path] unpopulated.
      // Silently no-op here — mark parse state as finished and dispose the cancel token so other waiters
      // don't hang and so a subsequent call (after the user fixes their settings) is not poisoned.
      if (!wkspSettings) {
        diagLog(`parseFilesForWorkspace: skipping ${wkspUri.path} — workspace settings unavailable (fatal config error already reported)`);
        // The notification was shown once by the configuration getter and is easily missed/dismissed,
        // after which nothing works for this workspace with no standing explanation anywhere. Leave
        // a permanent record in the log so a diagnostic report shows why nothing was parsed.
        config.logger.logInfo(
          `Not parsing this workspace: its gs-behave-bdd settings could not be loaded (see the FATAL ` +
          `settings error earlier in this log). No tests, step definitions, or step navigation will ` +
          `be available here until that is fixed.`,
          wkspUri);
        this._wkspsWithFatalSettings.add(wkspPath);
        this._finishedFeaturesParseForWorkspace[wkspPath] = true;
        this._finishedStepsParseForWorkspace[wkspPath] = true;
        this._cancelTokenSources[wkspPath].dispose();
        delete this._cancelTokenSources[wkspPath];
        // Without this, the "Behave: Parsing..." status item spins forever when
        // every workspace has invalid settings (no other parse completes to flip
        // the busy flag). Mirror the all-workspaces check from the happy path.
        const stillParsing = getUrisOfWkspFoldersWithFeatures()
          .filter(u => !this._finishedFeaturesParseForWorkspace[u.path]);
        if (stillParsing.length === 0) {
          this._finishedFeaturesParseForAllWorkspaces = true;
          this._finishedStepsParseForAllWorkspaces = true;
          this._notifyStatusChange(false);
        }
        return undefined;
      }
      // Reaching here means settings construction succeeded for this workspace.
      // Clear any prior fatal marker (fix-then-reload cycle).
      this._wkspsWithFatalSettings.delete(wkspPath);

      const start = performance.now();
      const featureFileCount = await this._parseFeatureFiles(wkspSettings, testData, ctrl, this._cancelTokenSources[wkspPath].token,
        callName, firstRun);
      const featTime = performance.now() - start;
      if (this._cancelTokenSources[wkspPath].token.isCancellationRequested) {
        diagLog(`${callName}: cancellation complete`);
        return;
      }
      diagLog(`${callName}: features loaded for workspace ${wkspName}`);
      this._finishedFeaturesParseForWorkspace[wkspPath] = true;
      const wkspsStillParsingFeatures = (getUrisOfWkspFoldersWithFeatures()).filter(uri => !this._finishedFeaturesParseForWorkspace[uri.path])
      if (wkspsStillParsingFeatures.length === 0) {
        this._finishedFeaturesParseForAllWorkspaces = true;
        diagLog(`${callName}: features loaded for all workspaces`);
      }
      else {
        diagLog(`${callName}: waiting on feature parse for ${wkspsStillParsingFeatures.map(w => w.path)}`)
      }


      let mappingsCount = 0;
      let buildMappingsTime = 0;
      const stepsStart = performance.now();
      const stepFileCount = await this._parseStepsFiles(wkspSettings, this._cancelTokenSources[wkspPath].token, callName);
      const stepsTime = performance.now() - stepsStart;
      if (this._cancelTokenSources[wkspPath].token.isCancellationRequested) {
        diagLog(`${callName}: cancellation complete`);
        return;
      }

      this._finishedStepsParseForWorkspace[wkspPath] = true;
      diagLog(`${callName}: steps loaded`);

      const updateMappingsStart = performance.now();
      for (const root of wkspSettings.featuresUris) {
        mappingsCount += rebuildStepMappings(root, wkspSettings.featuresUri);
      }
      rebuildExecuteStepsMappings(wkspSettings.featuresUri);
      buildMappingsTime = performance.now() - updateMappingsStart;
      diagLog(`${callName}: stepmappings built`);

      const wkspsStillParsingSteps = (getUrisOfWkspFoldersWithFeatures()).filter(uri => !this._finishedStepsParseForWorkspace[uri.path])
      if (wkspsStillParsingSteps.length === 0) {
        this._finishedStepsParseForAllWorkspaces = true;
        this._notifyStatusChange(false);
        diagLog(`${callName}: steps loaded for all workspaces`);
      }
      else {
        diagLog(`${callName}: waiting on steps parse for ${wkspsStillParsingSteps.map(w => w.path)}`)
      }


      if (this._cancelTokenSources[wkspPath].token.isCancellationRequested) {
        diagLog(`${callName}: cancellation complete`);
        return;
      }

      diagLog(`${callName}: complete`);
      testCounts = countTestItemsInCollection(wkspId, testData, ctrl.items);
      this._logTimesToConsole(callName, testCounts, featTime, stepsTime, mappingsCount, buildMappingsTime, featureFileCount, stepFileCount);

      if (!config.integrationTestRun)
        return;

      return {
        tests: testCounts,
        featureFilesExceptEmptyOrCommentedOut: featureFileCount,
        stepFilesExceptEmptyOrCommentedOut: stepFileCount,
        stepFileStepsExceptCommentedOut: getStepFileSteps(wkspSettings.featuresUri).length,
        featureFileStepsExceptCommentedOut: wkspSettings.featuresUris.reduce(
          (sum, u) => sum + getFeatureFileSteps(u).length, 0),
        stepMappings: wkspSettings.featuresUris.reduce(
          (sum, u) => sum + getStepMappings(u).length, 0)
      };
    }
    catch (e: unknown) {
      // unawaited async func, must log the error 

      this._finishedFeaturesParseForWorkspace[wkspPath] = true;
      this._finishedStepsParseForWorkspace[wkspPath] = true;
      this._finishedFeaturesParseForAllWorkspaces = true;
      this._finishedStepsParseForAllWorkspaces = true;

      // multiple functions can be running in parallel, but if any of them fail we'll consider it fatal and bail out all of them
      Object.keys(this._cancelTokenSources).forEach(k => {
        this._cancelTokenSources[k].cancel();
        this._cancelTokenSources[k].dispose();
        delete this._cancelTokenSources[k];
      });
      // Only POPUP the first error (avoids a stack of near-identical toasts when several
      // workspaces fail together), but always write it to the log: previously a second
      // workspace's parse failure vanished entirely if another had already failed, which made
      // multi-root setups look like they had silently done nothing.
      if (!this._errored) {
        this._errored = true;
        config.logger.showError(e, wkspUri);
      }
      else {
        config.logger.logInfo(
          `Parsing failed for this workspace (error notification suppressed - another workspace ` +
          `already reported one this pass): ${e instanceof Error ? e.message : e}`,
          wkspUri);
      }
      // Clear the "Behave: Parsing..." status item — the happy path's status
      // notification at line 575 is unreachable when we throw, and prior code
      // left the spinner running indefinitely on parse failure.
      this._notifyStatusChange(false);

      return;
    }
    finally {

      this._cancelTokenSources[wkspPath]?.dispose();
      delete this._cancelTokenSources[wkspPath];
      cancellationHandler?.dispose();
    }
  }



  async reparseFile(fileUri: vscode.Uri, content: string | undefined, wkspSettings: WorkspaceSettings, testData: TestData, ctrl: vscode.TestController) {
    const isEnvFile = fileUri.path.endsWith("/environment.py");
    const isPythonFile = couldBePythonStepsFile(fileUri) || isEnvFile;
    const isFeature = isFeatureFile(fileUri);

    if (!isPythonFile && !isFeature) return;

    if (!content)
      content = await getContentFromFilesystem(fileUri);

    // Feature files: immediate processing (fast TS parsing, needs instant UX)
    if (isFeature) {
      try {
        this._reparsingFile = true;
        await this._updateTestItemFromFeatureFileContent(wkspSettings, content, testData, ctrl, fileUri, "reparseFile", false);
        const root = getFeaturesRootForFile(wkspSettings, fileUri) ?? wkspSettings.featuresUri;
        rebuildStepMappings(root, wkspSettings.featuresUri);
        // Notify subscribers (e.g. CodeLens, diagnostics) that mappings changed.
        // Feature edits change which feature lines reference a step definition,
        // so consumers of step mappings must refresh even though no .py changed.
        this.onStepMappingsRebuilt?.(wkspSettings.featuresUri);
      }
      catch (e: unknown) {
        config.logger.showError(e, wkspSettings.uri);
      }
      finally {
        this._reparsingFile = false;
      }
      return;
    }

    // Python files: debounce the expensive subprocess work
    this._reparsingFile = true;
    this._debouncePythonReparse(fileUri, content, wkspSettings);
  }


  private _debouncePythonReparse(fileUri: vscode.Uri, content: string, wkspSettings: WorkspaceSettings) {
    // Keyed per-workspace: rapid edits across different Python files in the same workspace
    // (e.g. steps file then environment.py) will cancel the earlier timer, keeping only the latest.
    const wkspKey = wkspSettings.uri.path;

    // Cancel any pending timer for this workspace
    const existingTimer = this._pythonReparseTimers.get(wkspKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Record this file for the execute_steps rescan - keyed per file so rapid edits to
    // DIFFERENT files in the same workspace all get rescanned when the timer fires (WR-06)
    let pendingFiles = this._pendingExecScanFiles.get(wkspKey);
    if (!pendingFiles) {
      pendingFiles = new Map();
      this._pendingExecScanFiles.set(wkspKey, pendingFiles);
    }
    pendingFiles.set(uriId(fileUri), { uri: fileUri, content });

    const timer = setTimeout(async () => {
      this._pythonReparseTimers.delete(wkspKey);
      try {
        diagLog(`[reparseFile] Starting: file=${fileUri.path}`);

        try {
          const pythonExec = await config.getPythonExecutable(wkspSettings.uri, wkspSettings.name);
          const startTime = performance.now();

          let stepFiles: vscode.Uri[] = [];
          const tokenSource = new vscode.CancellationTokenSource();
          const cancelToken = tokenSource.token;

          if (wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path))
            stepFiles = await findFiles(wkspSettings.stepsSearchUri, "steps", ".py", cancelToken);
          else
            stepFiles = await findFiles(wkspSettings.stepsSearchUri, undefined, ".py", cancelToken);

          stepFiles = stepFiles.filter(uri => isStepsFile(uri));

          let stepsPath = wkspSettings.stepsSearchUri.fsPath;
          if (stepFiles.length > 0) {
            stepsPath = path.dirname(stepFiles[0].fsPath);
          }

          config.logger.logInfo(`Searching for step definitions...`, wkspSettings.uri);
          const result = await loadFromBehave(
            pythonExec,
            wkspSettings.projectUri.fsPath,
            [stepsPath],
            wkspSettings.importStrategy === 'useBundled' ? getBundledBehavePath() : undefined,
            wkspSettings.stepDefinitionSearchTimeout * 1000,
            // Same environment as an actual test run, so discovery resolves the same
            // imports behave does (user PYTHONPATH, virtualenv, env presets).
            getBehaveEnv(wkspSettings)
          );

          if (result.stderr) {
            config.logger.logInfo(`behave stderr output:\n${result.stderr}`, wkspSettings.uri);
          }

          if (result.error) {
            // Wholesale, code-shaped failure — keep old definitions, no popup.
            // Mid-edit breakage is expected and self-resolving; the language-status
            // item and Problems-pane diagnostics carry the signal instead.
            diagLog(`[reparseFile] Behave step loading error: ${result.error}`);
            this._handleWholesaleLoadError(result, wkspSettings);
          } else {
            // Behave loaded (possibly with per-file failures) — merge fresh results
            // with cached definitions for any files that failed to load
            const storedCount = await this._applyBehaveResult(wkspSettings, result, stepFiles, "[reparseFile]");
            const elapsed = Math.round(performance.now() - startTime);
            diagLog(`[reparseFile] Reloaded ${storedCount} steps and ${result.fixtures.length} fixtures from behave in ${elapsed}ms`);
            config.logger.logInfo(`Step definition search complete in ${elapsed}ms`, wkspSettings.uri);
          }

          tokenSource.dispose();
        } catch (e) {
          // Truly unrecoverable, ENVIRONMENTAL errors (Python not found, behave not
          // installed, timeout) — these keep the warning popup because they won't
          // self-resolve by editing code.
          const errMsg = e instanceof Error ? e.message : String(e);
          diagLog(`[reparseFile] Behave step loading error: ${errMsg}`);
          config.logger.logInfo(`Failed to load step definitions: ${errMsg}`, wkspSettings.uri);
          this._notifyStepLoadError(errMsg);
          this._showStepLoadWarning(errMsg, wkspSettings.uri);
        }

        // Rescan EVERY .py file edited during this debounce window for execute_steps() call
        // sites (any watched .py file, not just step definition files - helper modules/
        // environment.py count too) before rebuilding exec mappings (WR-06).
        // parseExecuteStepsFileContent clears each fileUri's prior entries itself, so this
        // refreshes only the edited files' cache entries.
        const pendingFilesForWksp = this._pendingExecScanFiles.get(wkspKey);
        this._pendingExecScanFiles.delete(wkspKey);
        for (const pendingFile of pendingFilesForWksp?.values() ?? []) {
          parseExecuteStepsFileContent(wkspSettings.featuresUri, pendingFile.content, pendingFile.uri, "[reparseFile]");
        }

        for (const root of wkspSettings.featuresUris) {
          rebuildStepMappings(root, wkspSettings.featuresUri);
        }
        rebuildExecuteStepsMappings(wkspSettings.featuresUri);
        this.onStepMappingsRebuilt?.(wkspSettings.featuresUri);
      }
      catch (e: unknown) {
        config.logger.showError(e, wkspSettings.uri);
      }
      finally {
        this._reparsingFile = false;
      }
    }, FileParser.PYTHON_REPARSE_DEBOUNCE_MS);

    this._pythonReparseTimers.set(wkspKey, timer);
  }


  private _showStepLoadWarning(errMsg: string, wkspUri: vscode.Uri) {
    const firstLine = errMsg.split('\n')[0];
    let winText = `Failed to load step definitions: ${firstLine}`;
    if (winText.length > 512)
      winText = winText.substring(0, 512) + "...";
    // Fire-and-forget: don't block the caller or let errors propagate
    vscode.window.showWarningMessage(winText, "Show Output").then(action => {
      if (action === "Show Output")
        config.logger.show(wkspUri);
    }, () => { /* ignore dismiss/error */ });
  }

  dispose() {
    for (const timer of this._pythonReparseTimers.values()) {
      clearTimeout(timer);
    }
    this._pythonReparseTimers.clear();
    this._pendingExecScanFiles.clear();
    this._reparsingFile = false;
  }



  private _logTimesToConsole = (callName: string, testCounts: TestCounts, featParseTime: number, stepsParseTime: number,
    mappingsCount: number, buildMappingsTime: number, featureFileCount: number, stepFileCount: number) => {
    diagLog(
      `---` +
      `\nperf info: ${callName} completed.` +
      `\nProcessing ${featureFileCount} feature files, ${stepFileCount} step files, ` +
      `producing ${testCounts.nodeCount} tree nodes, ${testCounts.testCount} tests, and ${mappingsCount} stepMappings took ${stepsParseTime + featParseTime} ms. ` +
      `\nBreakdown: feature file parsing ${featParseTime} ms, step file parsing ${stepsParseTime} ms, building step mappings: ${buildMappingsTime} ms` +
      `\nIgnore times if any of these are true:` +
      `\n  (a) time taken was during vscode startup contention, ` +
      `\n  (b) busy cpu due to background processes, ` +
      `\n  (c) another test extension is also refreshing, ` +
      `\n  (d) you are debugging the extension itself and have breakpoints, or you are running an extension integration test.` +
      `\nFor a more representative time, disable other test extensions then click the test refresh button a few times.` +
      `\n(Note that for multi-root, multiple workspaces refresh in parallel, so you should consider the longest parseFile time as the total time.)` +
      `\n==================`
    );
  }


}
