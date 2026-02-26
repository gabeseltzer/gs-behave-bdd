import * as vscode from 'vscode';
import { performance } from 'perf_hooks';
import { config } from "../configuration";
import { WorkspaceSettings } from "../settings";
import { deleteFeatureFileSteps, getFeatureFileSteps, getFeatureNameFromContent } from './featureParser';
import {
  countTestItemsInCollection, getAllTestItems, uriId, getWorkspaceFolder,
  getUrisOfWkspFoldersWithFeatures, isFeatureFile, isStepsFile, TestCounts, findFiles, getContentFromFilesystem, couldBePythonStepsFile
} from '../common';
import { getStepFileSteps, deleteStepFileSteps } from './stepsParser';
import { parseEnvironmentFileContent, deleteFixtures } from './fixtureParser';
import { loadStepsFromBehave } from './behaveStepLoader';
import { storeBehaveStepDefinitions } from './stepsParserBehaveAdapter';
import { TestData, TestFile } from './testFile';
import { diagLog } from '../logger';
import * as path from 'path';
import { deleteStepMappings, rebuildStepMappings, getStepMappings } from './stepMappings';


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
  private _statusChangeHandlers: ((busy: boolean) => void)[] = [];

  public onStatusChange(handler: (busy: boolean) => void) {
    this._statusChangeHandlers.push(handler);
  }

  private _notifyStatusChange(busy: boolean) {
    this._statusChangeHandlers.forEach(h => h(busy));
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

    deleteFeatureFileSteps(wkspSettings.featuresUri);
    deleteStepMappings(wkspSettings.featuresUri);

    // replaced with custom findFiles function for now (see comment in findFiles function)
    //const pattern = new vscode.RelativePattern(wkspSettings.uri, `${wkspSettings.workspaceRelativeFeaturesPath}/**/*.feature`);
    //const featureFiles = await vscode.workspace.findFiles(pattern, null, undefined, cancelToken);
    const findFilesStart = performance.now();
    const featureFiles = await findFiles(wkspSettings.featuresUri, undefined, ".feature", cancelToken);
    diagLog(`${caller}: _parseFeatureFiles findFiles took ${Math.round(performance.now() - findFilesStart)}ms, found ${featureFiles.length} feature files`);

    if (featureFiles.length < 1 && !cancelToken.isCancellationRequested)
      throw `No feature files found in ${wkspSettings.featuresUri.fsPath}`;

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

    diagLog("removing existing steps for workspace: " + wkspSettings.name);
    deleteStepFileSteps(wkspSettings.featuresUri);
    deleteFixtures(wkspSettings.featuresUri);

    // Single findFiles call for all .py files — used for both environment files and step files
    const findFilesStart = performance.now();
    const searchInFeatures = wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path);
    // When stepsSearchUri is inside featuresUri, search from featuresUri to also find environment.py;
    // otherwise search from stepsSearchUri (the broader path)
    const searchUri = searchInFeatures ? wkspSettings.featuresUri : wkspSettings.stepsSearchUri;
    const allPyFiles = await findFiles(searchUri, undefined, ".py", cancelToken);
    diagLog(`${caller}: _parseStepsFiles findFiles took ${Math.round(performance.now() - findFilesStart)}ms, found ${allPyFiles.length} .py files`);

    // Split results: environment files vs step files
    const environmentFiles = allPyFiles.filter(uri => uri.path.endsWith("/environment.py"));
    const stepFiles = allPyFiles.filter(uri => isStepsFile(uri));

    // Parse environment.py files
    for (const uri of environmentFiles) {
      if (cancelToken.isCancellationRequested)
        break;
      const content = await getContentFromFilesystem(uri);
      await parseEnvironmentFileContent(wkspSettings.featuresUri, content, uri, caller);
    }

    // Load all steps using behave's built-in registry (handles imports automatically)
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
      const behaveDefinitions = await loadStepsFromBehave(
        pythonExec,
        wkspSettings.projectUri.fsPath,
        stepsPaths
      );
      diagLog(`${caller}: _parseStepsFiles loadStepsFromBehave took ${Math.round(performance.now() - loadBehaveStart)}ms, returned ${behaveDefinitions.length} definitions`);

      if (cancelToken.isCancellationRequested) {
        diagLog(`${caller}: cancelling, _parseStepsFiles stopped after behave load`);
        return 0;
      }

      // Convert and store all behave definitions
      const storeBehaveStart = performance.now();
      const storedCount = await storeBehaveStepDefinitions(wkspSettings.featuresUri, behaveDefinitions);
      diagLog(`${caller}: _parseStepsFiles storeBehaveStepDefinitions took ${Math.round(performance.now() - storeBehaveStart)}ms`);

      // Return count of step files (not step definitions)
      // stepFiles was already filtered to exclude non-step files
      // This count is used for test assertions that check stepFilesExceptEmptyOrCommentedOut
      const stepFileCount = stepFiles.length;

      const elapsed = Math.round(performance.now() - startTime);
      diagLog(`${caller}: loaded ${storedCount} steps from ${stepFileCount} files in ${elapsed}ms`);

      return stepFileCount;

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      diagLog(`behave step loading error: ${errMsg}`);
      config.logger.showWarn(`Failed to load step definitions: ${errMsg}`, wkspSettings.uri);
      return 0;
    }
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



    // build folder hierarchy above test item
    // build top-down in case parent folder gets renamed/deleted etc.
    // note that the id is based on the file path so a new node is created if the folder is renamed
    // (old nodes are removed when required by parseFeatureFiles())
    let firstFolder: vscode.TestItem | undefined = undefined;
    let parent: vscode.TestItem | undefined = undefined;
    let current: vscode.TestItem | undefined;
    const sfp = uri.path.substring(wkspSettings.featuresUri.path.length + 1);
    if (sfp.includes("/")) {

      const folders = sfp.split("/").slice(0, -1);
      for (let i = 0; i < folders.length; i++) {
        const path = folders.slice(0, i + 1).join("/");
        const folderName = "\uD83D\uDCC1 " + folders[i]; // folder icon
        const folderTestItemId = `${uriId(wkspSettings.featuresUri)}/${path}`;

        if (i === 0)
          parent = wkspGrandParent;

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

    if (wkspGrandParent) {
      if (firstFolder) {
        wkspGrandParent.children.add(firstFolder);
      }
      else {
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

    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      this.parseFilesForWorkspace(wkspUri, testData, ctrl, `clearTestItemsAndParseFilesForAllWorkspaces from ${intiator}`,
        firstRun, cancelToken);
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
      mappingsCount = rebuildStepMappings(wkspSettings.featuresUri);
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
        featureFileStepsExceptCommentedOut: getFeatureFileSteps(wkspSettings.featuresUri).length,
        stepMappings: getStepMappings(wkspSettings.featuresUri).length
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
      // only log the first error (i.e. avoid logging the same error multiple times)
      if (!this._errored) {
        this._errored = true;
        config.logger.showError(e, wkspUri);
      }

      return;
    }
    finally {

      this._cancelTokenSources[wkspPath]?.dispose();
      delete this._cancelTokenSources[wkspPath];
      cancellationHandler?.dispose();
    }
  }



  async reparseFile(fileUri: vscode.Uri, content: string | undefined, wkspSettings: WorkspaceSettings, testData: TestData, ctrl: vscode.TestController) {
    try {
      this._reparsingFile = true;

      // Check for environment.py specifically
      const isEnvFile = fileUri.path.endsWith("/environment.py");

      if (!couldBePythonStepsFile(fileUri) && !isFeatureFile(fileUri) && !isEnvFile)
        return;

      if (!content)
        content = await getContentFromFilesystem(fileUri);

      // Handle steps files (in /steps/ folder) and library files (any other Python file)
      // With behave loader, we reload ALL steps when any step file changes (simpler, ensures correctness)
      if (couldBePythonStepsFile(fileUri) && !isEnvFile) {
        const isLibraryFile = !isStepsFile(fileUri);
        diagLog(`[reparseFile] Starting: file=${fileUri.path}, isLibraryFile=${isLibraryFile}`);

        // Reload all steps from behave (handles imports automatically)
        try {
          deleteStepFileSteps(wkspSettings.featuresUri);

          const pythonExec = await config.getPythonExecutable(wkspSettings.uri, wkspSettings.name);
          const startTime = performance.now();

          // Find step files to determine what to pass to behave
          let stepFiles: vscode.Uri[] = [];
          const tokenSource = new vscode.CancellationTokenSource();
          const cancelToken = tokenSource.token;

          if (wkspSettings.stepsSearchUri.path.startsWith(wkspSettings.featuresUri.path))
            stepFiles = await findFiles(wkspSettings.stepsSearchUri, "steps", ".py", cancelToken);
          else
            stepFiles = await findFiles(wkspSettings.stepsSearchUri, undefined, ".py", cancelToken);

          stepFiles = stepFiles.filter(uri => isStepsFile(uri));

          // Determine stepsPath: use the directory containing the first step file
          let stepsPath = wkspSettings.stepsSearchUri.fsPath;
          if (stepFiles.length > 0) {
            const firstStepsFile = stepFiles[0];
            // Use path.dirname to correctly handle path separators on all platforms
            stepsPath = path.dirname(firstStepsFile.fsPath);
          }

          const behaveDefinitions = await loadStepsFromBehave(
            pythonExec,
            wkspSettings.projectUri.fsPath,
            [stepsPath]
          );

          const storedCount = await storeBehaveStepDefinitions(wkspSettings.featuresUri, behaveDefinitions);
          const elapsed = Math.round(performance.now() - startTime);
          diagLog(`[reparseFile] Reloaded ${storedCount} steps from behave in ${elapsed}ms`);

          tokenSource.dispose();
        } catch (e) {
          diagLog(`[reparseFile] Behave step loading error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (isEnvFile)
        await parseEnvironmentFileContent(wkspSettings.featuresUri, content, fileUri, "reparseFile");

      if (isFeatureFile(fileUri))
        await this._updateTestItemFromFeatureFileContent(wkspSettings, content, testData, ctrl, fileUri, "reparseFile", false);

      rebuildStepMappings(wkspSettings.featuresUri);
    }
    catch (e: unknown) {
      // unawaited async func, must log the error
      config.logger.showError(e, wkspSettings.uri);
    }
    finally {
      this._reparsingFile = false;
    }
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
