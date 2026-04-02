import * as vscode from 'vscode';
import { config, Configuration } from "./configuration";
import { BehaveTestData, Scenario, TestData, TestFile } from './parsers/testFile';
import {
  getContentFromFilesystem,
  getUrisOfWkspFoldersWithFeatures, getWorkspaceSettingsForFile, isFeatureFile,
  logExtensionVersion, cleanExtensionTempDirectory, urisMatch, couldBePythonStepsFile
} from './common';
import { StepFileStep } from './parsers/stepsParser';
import { gotoStepHandler } from './handlers/gotoStepHandler';
import { findStepReferencesHandler, nextStepReferenceHandler as nextStepReferenceHandler, prevStepReferenceHandler, treeView } from './handlers/findStepReferencesHandler';
import { FileParser } from './parsers/fileParser';
import { testRunHandler } from './runners/testRunHandler';
import { TestWorkspaceConfigWithWkspUri } from './testWorkspaceConfig';
import { diagLog } from './logger';
import { performance } from 'perf_hooks';
import { StepMapping, getStepFileStepForFeatureFileStep, getStepMappingsForStepsFileFunction } from './parsers/stepMappings';
import { autoCompleteProvider } from './handlers/autoCompleteProvider';
import { formatFeatureProvider } from './handlers/formatFeatureProvider';
import { SemHighlightProvider, semLegend } from './handlers/semHighlightProvider';
import { DocumentSymbolProvider } from './handlers/documentSymbolProvider';
import { DefinitionProvider } from './handlers/definitionProvider';
import { SelectionRangeProvider } from './handlers/selectionRangeProvider';
import { HoverProvider } from './handlers/hoverProvider';
import { FixtureDefinitionProvider, FixtureHoverProvider, FixtureReferenceProvider } from './handlers/fixtureProviders';
import { StepReferenceProvider } from './handlers/stepReferenceProvider';
import { validateFixtureTags } from './handlers/fixtureDiagnostics';
import { validateStepDefinitions } from './handlers/stepDiagnostics';
import { startWatchingWorkspace } from './watchers/workspaceWatcher';
import { JunitWatcher } from './watchers/junitWatcher';


const testData = new WeakMap<vscode.TestItem, BehaveTestData>();
const wkspWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();
export const parser = new FileParser();
export interface QueueItem { test: vscode.TestItem; scenario: Scenario; }
let initialParsingComplete = false;


export type TestSupport = {
  runHandler: (debug: boolean, request: vscode.TestRunRequest) => Promise<QueueItem[] | undefined>,
  config: Configuration,
  ctrl: vscode.TestController,
  parser: FileParser,
  getStepMappingsForStepsFileFunction: (stepsFileUri: vscode.Uri, lineNo: number) => StepMapping[],
  getStepFileStepForFeatureFileStep: (featureFileUri: vscode.Uri, line: number) => StepFileStep | undefined,
  testData: TestData,
  configurationChangedHandler: (event?: vscode.ConfigurationChangeEvent, testCfg?: TestWorkspaceConfigWithWkspUri, forceRefresh?: boolean) => Promise<void>
};



// construction function called on extension activation OR the first time a new/unrecognised workspace gets added.
// - call anything that needs to be initialised/kicked off async on startup, and 
// - set up all relevant event handlers/hooks/subscriptions to the vscode api
// NOTE - THIS MUST RETURN FAST: AVOID using "await" here unless absolutely necessary (except inside handlers)
// this function should only contain initialisation, registering event handlers, and unawaited async calls
export async function activate(context: vscode.ExtensionContext): Promise<TestSupport | undefined> {

  try {
    // Reset flag on each activation (important for integration tests)
    initialParsingComplete = false;

    const start = performance.now();
    diagLog("activate called, node pid:" + process.pid);
    config.logger.syncChannelsToWorkspaceFolders();
    logExtensionVersion(context);
    const ctrl = vscode.tests.createTestController(`behave-vsc-gs.TestController`, 'Feature Tests');
    parser.clearTestItemsAndParseFilesForAllWorkspaces(testData, ctrl, "activate", true);

    const cleanExtensionTempDirectoryCancelSource = new vscode.CancellationTokenSource();
    cleanExtensionTempDirectory(cleanExtensionTempDirectoryCancelSource.token);

    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
      wkspWatchers.set(wkspUri, watchers);
      watchers.forEach(w => context.subscriptions.push(w));
    }

    const junitWatcher = new JunitWatcher();
    junitWatcher.startWatchingJunitFolder();

    const statusItem = vscode.languages.createLanguageStatusItem('behave.status', { language: 'gherkin' });
    statusItem.name = "Behave VSC Status";
    statusItem.text = "Behave: Parsing...";
    statusItem.busy = true;

    parser.onStatusChange((busy: boolean) => {
      statusItem.busy = busy;
      statusItem.text = busy ? "Behave: Parsing..." : "Behave: Ready";
      if (!busy)
        statusItem.severity = vscode.LanguageStatusSeverity.Information;
    });

    parser.onStepLoadError((error: string | undefined) => {
      if (error) {
        statusItem.text = "Behave: Step Load Error";
        statusItem.severity = vscode.LanguageStatusSeverity.Error;
        statusItem.detail = error.length > 200 ? error.substring(0, 200) + "..." : error;
      } else {
        statusItem.text = "Behave: Ready";
        statusItem.severity = vscode.LanguageStatusSeverity.Information;
        statusItem.detail = undefined;
      }
    });

    // After a Python step/env file debounce fires and step mappings are rebuilt, re-validate
    // diagnostics for all open feature files in the affected workspace. This handles the case
    // where files change via the disk (e.g. git branch switch) without going through
    // onDidChangeTextDocument, as well as the case where validateStepDefinitions was called
    // eagerly (before the debounce fired) and produced stale results.
    parser.onStepMappingsRebuilt = (featuresUri: vscode.Uri) => {
      for (const document of vscode.workspace.textDocuments) {
        if (!isFeatureFile(document.uri)) continue;
        const wkspSettings = getWorkspaceSettingsForFile(document.uri);
        if (!wkspSettings || !urisMatch(wkspSettings.featuresUri, featuresUri)) continue;
        validateFixtureTags(document);
        validateStepDefinitions(document);
      }
    };

    // any function contained in a context.subscriptions.push() will execute immediately, 
    // as well as registering the returned disposable object for a dispose() call on extension deactivation
    // i.e. startWatchingWorkspace will execute immediately, as will registerCommand, but gotoStepHandler will not (as it is a parameter 
    // to a register command, which returns a disposable so our custom command is deregistered when the extension is deactivated).
    // to test any custom dispose() methods (which must be synchronous), just start and then close the extension host environment.    
    context.subscriptions.push(
      ctrl,
      treeView,
      parser,
      config,
      config.diagnostics,
      cleanExtensionTempDirectoryCancelSource,
      junitWatcher,
      statusItem,
      vscode.commands.registerTextEditorCommand(`behave-vsc-gs.gotoStep`, gotoStepHandler),
      vscode.commands.registerTextEditorCommand(`behave-vsc-gs.findStepReferences`, findStepReferencesHandler),
      vscode.commands.registerCommand(`behave-vsc-gs.stepReferences.prev`, prevStepReferenceHandler),
      vscode.commands.registerCommand(`behave-vsc-gs.stepReferences.next`, nextStepReferenceHandler),
      // Legacy command aliases for users migrating from behave-vsc — preserves custom keybindings
      vscode.commands.registerTextEditorCommand(`behave-vsc.gotoStep`, gotoStepHandler),
      vscode.commands.registerTextEditorCommand(`behave-vsc.findStepReferences`, findStepReferencesHandler),
      vscode.commands.registerCommand(`behave-vsc.stepReferences.prev`, prevStepReferenceHandler),
      vscode.commands.registerCommand(`behave-vsc.stepReferences.next`, nextStepReferenceHandler),
      vscode.languages.registerCompletionItemProvider("gherkin", autoCompleteProvider, ...["  "]),
      vscode.languages.registerDocumentRangeFormattingEditProvider("gherkin", formatFeatureProvider),
      vscode.languages.registerDocumentSemanticTokensProvider({ language: "gherkin" }, new SemHighlightProvider(), semLegend),
      vscode.languages.registerDocumentSymbolProvider("gherkin", new DocumentSymbolProvider()),
      vscode.languages.registerSelectionRangeProvider("gherkin", new SelectionRangeProvider()),
      vscode.languages.registerDefinitionProvider({ language: "gherkin" }, new DefinitionProvider()),
      vscode.languages.registerHoverProvider({ language: "gherkin" }, new HoverProvider()),
      vscode.languages.registerDefinitionProvider({ language: "gherkin" }, new FixtureDefinitionProvider()),
      vscode.languages.registerHoverProvider({ language: "gherkin" }, new FixtureHoverProvider()),
      vscode.languages.registerReferenceProvider(["gherkin", "python"], new StepReferenceProvider()),
      vscode.languages.registerReferenceProvider(["gherkin", "python"], new FixtureReferenceProvider())
    );


    const runHandler = testRunHandler(testData, ctrl, parser, junitWatcher, cleanExtensionTempDirectoryCancelSource);

    // Environment preset selector command (shown in Testing view title bar)
    const editPresetButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("gear"),
      tooltip: "Edit this preset in settings"
    };

    const selectEnvPresetCommand = vscode.commands.registerCommand("behave-vsc-gs.selectEnvPreset", async () => {
      const wkspUris = getUrisOfWkspFoldersWithFeatures();
      if (wkspUris.length === 0) {
        vscode.window.showWarningMessage("No workspace folders with features found.");
        return;
      }

      // If multiple workspaces, let user select which one to configure
      let targetWkspUri: vscode.Uri;
      if (wkspUris.length === 1) {
        targetWkspUri = wkspUris[0];
      } else {
        const wkspItems = wkspUris.map(uri => ({
          label: vscode.workspace.getWorkspaceFolder(uri)?.name ?? uri.fsPath,
          uri: uri
        }));
        const selected = await vscode.window.showQuickPick(wkspItems, {
          placeHolder: "Select workspace to configure environment preset"
        });
        if (!selected) return;
        targetWkspUri = selected.uri;
      }

      // Get current presets for the workspace
      const wkspConfig = vscode.workspace.getConfiguration("behave-vsc-gs", targetWkspUri);
      const presets = wkspConfig.get<{ [name: string]: { [key: string]: string } }>("envVarPresets") ?? {};
      const currentPreset = wkspConfig.get<string>("activeEnvVarPreset") ?? "";

      const presetNames = Object.keys(presets);
      if (presetNames.length === 0) {
        const openSettings = await vscode.window.showWarningMessage(
          "No environment presets configured. Add presets in settings (behave-vsc-gs.envVarPresets).",
          "Open Settings"
        );
        if (openSettings === "Open Settings") {
          await vscode.commands.executeCommand("workbench.action.openSettings", "behave-vsc-gs.envVarPresets");
        }
        return;
      }

      // Build quick pick items with gear buttons for editing
      interface PresetQuickPickItem extends vscode.QuickPickItem {
        presetName: string;
      }

      const items: PresetQuickPickItem[] = [
        { label: "(none)", description: currentPreset === "" ? "✓ active" : "", presetName: "" },
        ...presetNames.map(name => ({
          label: name,
          description: name === currentPreset ? "✓ active" : "",
          detail: Object.entries(presets[name]).map(([k, v]) => `${k}=${v}`).join(", "),
          presetName: name,
          buttons: [editPresetButton]
        }))
      ];

      // Use createQuickPick for button support
      const quickPick = vscode.window.createQuickPick<PresetQuickPickItem>();
      quickPick.items = items;
      quickPick.placeholder = `Select environment preset (current: ${currentPreset || "(none)"})`;

      quickPick.onDidTriggerItemButton(async e => {
        const presetName = e.item.presetName;
        quickPick.hide();

        // Determine which scope contains this specific preset (most specific first)
        const inspection = wkspConfig.inspect<{ [name: string]: { [key: string]: string } }>("envVarPresets");
        let settingsUri: vscode.Uri | undefined;
        let isGlobalSettings = false;

        if (inspection?.workspaceFolderValue?.[presetName] !== undefined) {
          // Preset is in .vscode/settings.json of the workspace folder
          settingsUri = vscode.Uri.joinPath(targetWkspUri, ".vscode", "settings.json");
        } else if (inspection?.workspaceValue?.[presetName] !== undefined) {
          // Preset is in the .code-workspace file (multi-root workspace)
          const workspaceFile = vscode.workspace.workspaceFile;
          if (workspaceFile && workspaceFile.scheme === "file") {
            settingsUri = workspaceFile;
          }
        } else if (inspection?.globalValue?.[presetName] !== undefined) {
          // Preset is in user settings
          isGlobalSettings = true;
        }

        if (!settingsUri && !isGlobalSettings) {
          // Preset not found at any specific scope — open settings UI as fallback
          await vscode.commands.executeCommand("workbench.action.openSettings", "@id:behave-vsc-gs.envVarPresets");
          return;
        }

        try {
          let doc: vscode.TextDocument;
          let editor: vscode.TextEditor;

          if (isGlobalSettings) {
            // Open global settings via command, then get the active editor
            await vscode.commands.executeCommand("workbench.action.openSettingsJson");
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) return;
            editor = activeEditor;
            doc = editor.document;
          } else {
            if (!settingsUri) return;
            doc = await vscode.workspace.openTextDocument(settingsUri);
            editor = await vscode.window.showTextDocument(doc);
          }

          const text = doc.getText();

          // Find envVarPresets section — check new key, old key (backwards compat), and nested-key JSON formats
          let envVarPresetsMatch = text.indexOf('"behave-vsc-gs.envVarPresets"');
          if (envVarPresetsMatch === -1)
            envVarPresetsMatch = text.indexOf('"behave-vsc.envVarPresets"');
          if (envVarPresetsMatch === -1)
            envVarPresetsMatch = text.indexOf('"envVarPresets"');
          const searchString = `"${presetName}":`;
          const presetIndex = envVarPresetsMatch !== -1
            ? text.indexOf(searchString, envVarPresetsMatch)
            : -1;

          if (presetIndex !== -1) {
            const position = doc.positionAt(presetIndex);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          }
        } catch {
          // If file doesn't exist or can't be read, open the settings UI instead
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            `@id:behave-vsc-gs.envVarPresets`
          );
        }
      });

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        quickPick.hide();
        if (selected && selected.presetName !== currentPreset) {
          await wkspConfig.update("activeEnvVarPreset", selected.presetName, vscode.ConfigurationTarget.WorkspaceFolder);
          vscode.window.showInformationMessage(`Environment preset set to: ${selected.presetName || "(none)"}`);
        }
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    });

    // Legacy alias — preserves custom keybindings from behave-vsc
    const legacySelectEnvPresetCommand = vscode.commands.registerCommand("behave-vsc.selectEnvPreset",
      () => vscode.commands.executeCommand("behave-vsc-gs.selectEnvPreset"));

    context.subscriptions.push(selectEnvPresetCommand, legacySelectEnvPresetCommand);

    ctrl.createRunProfile("Run Tests", vscode.TestRunProfileKind.Run,
      async (request: vscode.TestRunRequest) => {
        await runHandler(false, request);
      }
      , true);


    ctrl.createRunProfile("Debug Tests", vscode.TestRunProfileKind.Debug,
      async (request: vscode.TestRunRequest) => {
        await runHandler(true, request);
      }
      , true);


    ctrl.resolveHandler = async (item: vscode.TestItem | undefined) => {
      let wkspSettings;

      try {
        if (!item || !item.uri || item.uri?.scheme !== 'file')
          return;

        const data = testData.get(item);
        if (!(data instanceof TestFile))
          return;

        wkspSettings = getWorkspaceSettingsForFile(item.uri);
        if (!wkspSettings)
          return;
        const content = await getContentFromFilesystem(item.uri);
        await data.createScenarioTestItemsFromFeatureFileContent(wkspSettings, content, testData, ctrl, item, "resolveHandler");
      }
      catch (e: unknown) {
        // entry point function (handler) - show error
        const wkspUri = wkspSettings ? wkspSettings.uri : undefined;
        config.logger.showError(e, wkspUri);
      }
    };


    ctrl.refreshHandler = async (cancelToken: vscode.CancellationToken) => {
      try {
        await parser.clearTestItemsAndParseFilesForAllWorkspaces(testData, ctrl, "refreshHandler", false, cancelToken);
      }
      catch (e: unknown) {
        // entry point function (handler) - show error        
        config.logger.showError(e, undefined);
      }
    };


    // called when a user renames, adds or removes a workspace folder.
    // NOTE: the first time a new not-previously recognised workspace gets added a new node host 
    // process will start, this host process will terminate, and activate() will be called shortly after    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      try {
        await configurationChangedHandler(undefined, undefined, true);
      }
      catch (e: unknown) {
        // entry point function (handler) - show error        
        config.logger.showError(e, undefined);
      }
    }));


    // Validate fixture tags when document is opened
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async (document) => {
      try {
        if (isFeatureFile(document.uri)) {
          // Skip validation during initial startup - the async IIFE below will handle it
          if (!initialParsingComplete) {
            return;
          }
          // Wait for steps/fixtures parsing to complete before validating
          await parser.stepsParseComplete(5000, "onDidOpenTextDocument");
          validateFixtureTags(document);
          validateStepDefinitions(document);
        }
      }
      catch (e: unknown) {
        // entry point function (handler) - show error
        config.logger.showError(e, undefined);
      }
    }));

    // Validate all currently open feature files after parsing completes
    (async () => {
      try {
        await parser.stepsParseComplete(10000, "activate-validateOpenDocs");
        initialParsingComplete = true;
        for (const document of vscode.workspace.textDocuments) {
          validateFixtureTags(document);
          validateStepDefinitions(document);
        }
      }
      catch (e: unknown) {
        config.logger.showError(e, undefined);
      }
    })();

    // called when a user edits a file.
    // we want to reparse on edit (not just on disk changes) because:
    // a. the user may run a file they just edited without saving,
    // b. the semantic highlighting while typing requires the stepmappings to be up to date as the user types,
    // c. instant test tree updates is a nice bonus for user experience
    // d. to keep stepmappings in sync in case user clicks go to step def/ref before file save
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async (event) => {
      try {
        const uri = event.document.uri;
        const isEnvFile = uri.path.endsWith("/environment.py");

        if (!isFeatureFile(uri) && !couldBePythonStepsFile(uri) && !isEnvFile)
          return;

        const wkspSettings = getWorkspaceSettingsForFile(uri);
        if (!wkspSettings)
          return;
        // We actully need to await this to ensure parsing is done before validation
        await parser.reparseFile(uri, event.document.getText(), wkspSettings, testData, ctrl);

        if (initialParsingComplete) {
          // Validate fixture tags and step definitions when feature file changes
          validateFixtureTags(event.document);
          validateStepDefinitions(event.document);

          // If enviroment file changes, re-validate fixtures in all open feature files
          if (isEnvFile) {
            for (const document of vscode.workspace.textDocuments) {
              if (isFeatureFile(document.uri)) {
                validateFixtureTags(document);
              }
            }
          }

          // If steps file or library file changes, re-validate step definitions in all open feature files
          if (couldBePythonStepsFile(uri) && !isEnvFile) {
            // Immediately clear any stale step load error — the debounce will re-evaluate from disk
            // after 500ms, but only surface an error if the file is still saved with the problem.
            parser.clearStepLoadError();
            for (const document of vscode.workspace.textDocuments) {
              if (isFeatureFile(document.uri)) {
                validateStepDefinitions(document);
              }
            }
          }
        }
      }
      catch (e: unknown) {
        // entry point function (handler) - show error        
        config.logger.showError(e, undefined);
      }
    }));


    // called by onDidChangeConfiguration when there is a settings.json/*.vscode-workspace change 
    // and onDidChangeWorkspaceFolders (also called by integration tests with a testCfg).
    // NOTE: in some circumstances this function can be called twice in quick succession when a multi-root workspace folder is added/removed/renamed 
    // (i.e. once by onDidChangeWorkspaceFolders and once by onDidChangeConfiguration), but parser methods will self-cancel as needed
    const configurationChangedHandler = async (event?: vscode.ConfigurationChangeEvent, testCfg?: TestWorkspaceConfigWithWkspUri,
      forceFullRefresh?: boolean) => {

      // for integration test runAllTestsAndAssertTheResults, 
      // only reload config on request (i.e. when testCfg supplied)
      if (config.integrationTestRun && !testCfg)
        return;

      try {

        // note - affectsConfiguration(ext,uri) i.e. with a scope (uri) param is smart re. default resource values, but  we don't want 
        // that behaviour because we want to distinguish between some properties being set vs being absent from 
        // settings.json (via inspect not get), so we don't include the uri in the affectsConfiguration() call
        // (separately, just note that the settings change could be a global window setting from *.code-workspace file, rather than from settings.json)
        const affected = event && event.affectsConfiguration("behave-vsc-gs");
        if (!affected && !forceFullRefresh && !testCfg)
          return;

        if (!testCfg)
          config.logger.clearAllWksps();

        // changing featuresPath in settings.json/*.vscode-workspace to a valid path, or adding/removing/renaming workspaces
        // will not only change the set of workspaces we are watching, but also the output channels
        config.logger.syncChannelsToWorkspaceFolders();

        for (const wkspUri of getUrisOfWkspFoldersWithFeatures(true)) {
          if (testCfg) {
            if (urisMatch(testCfg.wkspUri, wkspUri)) {
              config.reloadSettings(wkspUri, testCfg.testConfig);
            }
            continue;
          }

          config.reloadSettings(wkspUri);
          const oldWatchers = wkspWatchers.get(wkspUri);
          if (oldWatchers)
            oldWatchers.forEach(w => w.dispose());
          const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
          wkspWatchers.set(wkspUri, watchers);
          watchers.forEach(w => context.subscriptions.push(w));
        }

        // configuration has now changed, e.g. featuresPath, so we need to reparse files

        // (in the case of a testConfig insertion we just reparse the supplied workspace to avoid issues with parallel workspace integration test runs)
        if (testCfg) {
          parser.parseFilesForWorkspace(testCfg.wkspUri, testData, ctrl, "configurationChangedHandler", false);
          return;
        }

        // we don't know which workspace was affected (see comment on affectsConfiguration above), so just reparse all workspaces
        // (also, when a workspace is added/removed/renamed (forceRefresh), we need to clear down and reparse all test nodes to rebuild the top level nodes)
        parser.clearTestItemsAndParseFilesForAllWorkspaces(testData, ctrl, "configurationChangedHandler", false);
      }
      catch (e: unknown) {
        // entry point function (handler) - show error        
        config.logger.showError(e, undefined);
      }
    }


    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
      await configurationChangedHandler(event);
    }));

    diagLog(`perf info: activate took  ${performance.now() - start} ms`);

    return {
      // return instances to support integration testing
      runHandler: runHandler,
      config: config,
      ctrl: ctrl,
      parser: parser,
      getStepMappingsForStepsFileFunction: getStepMappingsForStepsFileFunction,
      getStepFileStepForFeatureFileStep: getStepFileStepForFeatureFileStep,
      testData: testData,
      configurationChangedHandler: configurationChangedHandler
    };

  }
  catch (e: unknown) {
    // entry point function (handler) - show error    
    if (config && config.logger) {
      config.logger.showError(e, undefined);
    }
    else {
      // no logger, use vscode.window.showErrorMessage directly
      const text = (e instanceof Error ? (e.stack ? e.stack : e.message) : e as string);
      vscode.window.showErrorMessage(text);
    }
  }

} // end activate()


