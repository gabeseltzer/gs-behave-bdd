import * as vscode from 'vscode';
import { config, Configuration } from "./configuration";
import { BehaveTestData, Scenario, TestData, TestFile } from './parsers/testFile';
import {
  getContentFromFilesystem,
  getUrisOfWkspFoldersWithFeatures, getWorkspaceSettingsForFile, isFeatureFile,
  logExtensionVersion, cleanExtensionTempDirectory, urisMatch, couldBePythonStepsFile,
  getDiscoveryEntry, basename, setProjectSwitchInProgress
} from './common';
import { setConfigParseErrorDiagnostic, clearConfigParseErrorDiagnostic } from './handlers/configDiagnostics';
import { StepFileStep } from './parsers/stepsParser';
import { gotoStepHandler } from './handlers/gotoStepHandler';
import { findStepReferencesHandler, nextStepReferenceHandler as nextStepReferenceHandler, prevStepReferenceHandler, treeView } from './handlers/findStepReferencesHandler';
import { FileParser } from './parsers/fileParser';
import { testRunHandler, checkRunGuard } from './runners/testRunHandler';
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
import { StepCodeLensProvider } from './handlers/codeLensProvider';
import { validateFixtureTags } from './handlers/fixtureDiagnostics';
import { validateStepDefinitions } from './handlers/stepDiagnostics';
import { startWatchingWorkspace } from './watchers/workspaceWatcher';
import { startWatchingConfigFiles, clearConfigDebounceTimers } from './watchers/configWatcher';
import { scanForBehaveConfig, setCachedScanResult, getCachedScanResult, clearScanResultCache, ScanResultEntry, ScanResult } from './discovery/configScanner';
import { findBehaveConfig } from './parsers/configParser';
import {
  initProjectListPersistence, rebuildProjectList, getActiveProject, getProjectList,
  setActiveProject, isManualProjectPathMode, clearActiveProjectCache
} from './discovery/projectList';
import { buildQuickPickItems, computeStatusBarState, ProjectQuickPickItem } from './discovery/selectProjectHelpers';
import { JunitWatcher } from './watchers/junitWatcher';
import { showSuppressibleNotification } from './notifications';
import {
  recheckMigrationsCommandHandler,
  evaluateAllMigrations,
  runConsentFlow,
  readMigrationMode,
  type ConsentHit,
  MIGRATION_ACTION_COMMAND,
  MigrationCodeActionProvider,
  dispatchMigrationAction,
  getDiagnosticCollection,
  type MigrationActionArgs,
} from './migrations';


const testData = new WeakMap<vscode.TestItem, BehaveTestData>();
const wkspWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();
const wkspConfigWatchers = new Map<vscode.Uri, vscode.FileSystemWatcher[]>();
export const parser = new FileParser();
export interface QueueItem { test: vscode.TestItem; scenario: Scenario; }
let initialParsingComplete = false;
const notifiedConfigErrors = new Set<string>();
// W-05: per-session dedup for the multi-config notification, analogous to
// notifiedConfigErrors. Keys are wkspUri.toString(). Without this, the
// notification re-fires every time configurationChangedHandler runs (e.g.
// the user edits any unrelated gs-behave-bdd setting), regardless of whether
// suppressedNotifications contains the key. The suppression mechanism
// remains the per-user opt-out; this gate is the per-session ratchet.
const notifiedMultiConfigWorkspaces = new Set<string>();
let updateProjectStatusBarFn: ((wkspUri: vscode.Uri) => void) | undefined;


export type TestSupport = {
  runHandler: (debug: boolean, request: vscode.TestRunRequest) => Promise<QueueItem[] | undefined>,
  config: Configuration,
  ctrl: vscode.TestController,
  parser: FileParser,
  getStepMappingsForStepsFileFunction: (stepsFileUri: vscode.Uri, lineNo: number) => StepMapping[],
  getStepFileStepForFeatureFileStep: (featureFileUri: vscode.Uri, line: number) => StepFileStep | undefined,
  testData: TestData,
  configurationChangedHandler: (event?: vscode.ConfigurationChangeEvent, testCfg?: TestWorkspaceConfigWithWkspUri, forceRefresh?: boolean) => Promise<void>,
  getDiscoveryEntry: typeof getDiscoveryEntry,
  getUrisOfWkspFoldersWithFeatures: typeof getUrisOfWkspFoldersWithFeatures,
  checkRunGuard: typeof checkRunGuard,
  // Exposed for integration tests so they read/write the same module-scoped
  // caches the bundled extension uses (the test process also imports
  // src/discovery/projectList directly, which would otherwise be a separate
  // module instance with its own caches).
  getProjectList: typeof getProjectList,
  getActiveProject: typeof getActiveProject,
  setActiveProject: typeof setActiveProject,
};



function updateDiscoveryUX(
  wkspUris: vscode.Uri[],
  clearNotifiedErrors: boolean
): void {
  if (clearNotifiedErrors) {
    notifiedConfigErrors.clear();
    notifiedMultiConfigWorkspaces.clear();
  }

  for (const wkspUri of wkspUris) {
    const entry = getDiscoveryEntry(wkspUri);
    if (!entry) continue;

    // UX-01: discovery summary in output channel
    config.logger.logInfo(`Discovery source: ${entry.source}`, wkspUri);
    if (entry.configFileUri) {
      config.logger.logInfo(`Config file: ${entry.configFileUri.fsPath}`, wkspUri);
    }
    config.logger.logInfo(`Features directories: ${entry.featuresUris.map(u => u.fsPath).join(", ")}`, wkspUri);

    // Phase 13: D-10 — Log bulleted project list on startup when multiple projects exist
    if (!isManualProjectPathMode(wkspUri)) {
      const projects = getProjectList(wkspUri);
      const active = getActiveProject(wkspUri);
      if (projects.length > 1 && active) {
        config.logger.logInfo(`Discovered ${projects.length} behave projects:`, wkspUri);
        for (const p of projects) {
          const configType = p.configFileUri.path.split('/').pop() ?? 'config';
          const displayLabel = p.label === '.' ? '(root)' : p.label;
          const marker = urisMatch(p.configFileUri, active.configFileUri) ? ' (active)' : '';
          config.logger.logInfo(`  \u2022 ${displayLabel} \u2014 ${configType}${marker}`, wkspUri);
        }
      }
    }

    // D-02: xRay full discovery chain
    diagLog(
      `Discovery detail: source=${entry.source}, config=${entry.configFileUri?.fsPath ?? 'none'}, features=[${entry.featuresUris.map(u => u.fsPath).join(", ")}]`,
      wkspUri
    );

    // UX-02 / D-03 / D-04 / D-05: malformed config notification + diagnostic
    if (entry.configError) {
      const errorUri = entry.configError.configFileUri;
      const rawMsg = entry.configError.errorMessage;
      const msg = rawMsg.length > 200 ? rawMsg.substring(0, 200) + '...' : rawMsg;

      // D-05: Problems panel diagnostic
      setConfigParseErrorDiagnostic(errorUri, msg);

      // D-03 / D-04: fire-and-forget warning notification (one per config file per session)
      const key = errorUri.fsPath;
      if (!notifiedConfigErrors.has(key)) {
        notifiedConfigErrors.add(key);
        vscode.window.showWarningMessage(
          `Behave BDD: Could not parse "${basename(errorUri)}": ${msg}\n\nFalling back to "features/" convention.`,
          'Open Config File',
          'Open Settings'
        ).then(action => {
          if (action === 'Open Config File') {
            vscode.commands.executeCommand('vscode.open', errorUri);
          } else if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd');
          }
        });
      }
    } else if (entry.configFileUri) {
      // Clear any stale diagnostic for this config file if it was previously malformed
      clearConfigParseErrorDiagnostic(entry.configFileUri);
    }

    // Phase 9: Multi-config notification (D-06, D-07, D-08, D-10)
    // Phase 15 / NOTIF-04: suppression delegated to showSuppressibleNotification wrapper.
    if (entry.alsoFoundConfigs && entry.alsoFoundConfigs.length > 0) {
      // D-09: Always log full results to output channel regardless of suppression
      config.logger.logInfo(`Multiple behave configs found:`, wkspUri);
      const primaryRelPath = entry.configFileUri
        ? vscode.workspace.asRelativePath(entry.configFileUri, false)
        : 'unknown';
      config.logger.logInfo(`  \u2022 ${primaryRelPath} (active)`, wkspUri);
      for (const alsoUri of entry.alsoFoundConfigs) {
        const relPath = vscode.workspace.asRelativePath(alsoUri, false);
        config.logger.logInfo(`  \u2022 ${relPath}`, wkspUri);
      }

      const totalConfigs = entry.alsoFoundConfigs.length + 1;
      const configLines = [`\u2022 ${primaryRelPath} (active)`];
      for (const alsoUri of entry.alsoFoundConfigs) {
        configLines.push(`\u2022 ${vscode.workspace.asRelativePath(alsoUri, false)}`);
      }
      // Phase 13: D-12 — Updated to reference Select Project command
      const message = `Behave BDD: Found ${totalConfigs} behave configs:\n${configLines.join('\n')}\nUse "Behave BDD: Select Project" to switch.`;

      // W-05: per-session dedup so this notification doesn't re-fire on every
      // configurationChangedHandler invocation when the user has not opted out.
      // The suppression mechanism (showSuppressibleNotification) is still the
      // per-user opt-out; this gate is the per-session ratchet keyed on workspace.
      const sessionKey = wkspUri.toString();
      if (!notifiedMultiConfigWorkspaces.has(sessionKey)) {
        notifiedMultiConfigWorkspaces.add(sessionKey);
        // Wrapper checks suppression, appends "Don't Show Again", and intercepts DSA internally.
        // Fire-and-forget — preserves the prior unawaited shape.
        showSuppressibleNotification(
          "multiConfigNotification",
          message,
          ['Select Project', 'Show Details'],
          wkspUri,
        ).then(action => {
          if (action === 'Select Project') {
            vscode.commands.executeCommand('gs-behave-bdd.selectProject');
          } else if (action === 'Show Details') {
            vscode.commands.executeCommand('gs-behave-bdd.openOutput');
          }
          // "Don't Show Again" is intercepted internally by the wrapper — never returned here.
        });
      }
    }


    // Phase 13: D-08 \u2014 Update status bar visibility when discovery changes
    if (updateProjectStatusBarFn) {
      updateProjectStatusBarFn(wkspUri);
    }
  }
}


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
    const ctrl = vscode.tests.createTestController(`gs-behave-bdd.TestController`, 'Feature Tests');
    initProjectListPersistence(context.workspaceState);

    // Phase 13: Project status bar item
    const projectStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    projectStatusBar.command = 'gs-behave-bdd.selectProject';
    projectStatusBar.name = 'Behave BDD Active Project';

    const updateProjectStatusBar = (wkspUri: vscode.Uri): void => {
      const state = computeStatusBarState(getProjectList(wkspUri), getActiveProject(wkspUri), isManualProjectPathMode(wkspUri));
      if (!state.visible) {
        projectStatusBar.hide();
        return;
      }
      projectStatusBar.text = state.text ?? '';
      projectStatusBar.tooltip = state.tooltip;
      projectStatusBar.show();
    };
    updateProjectStatusBarFn = updateProjectStatusBar;
    parser.clearTestItemsAndParseFilesForAllWorkspaces(testData, ctrl, "activate", true);

    const cleanExtensionTempDirectoryCancelSource = new vscode.CancellationTokenSource();
    cleanExtensionTempDirectory(cleanExtensionTempDirectoryCancelSource.token);

    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      // Per-workspace try/catch: a single workspace with invalid settings (e.g. bad
      // featuresPaths) throws WkspError from WorkspaceSettings construction. Log + skip
      // so other workspaces still activate (see example-projects/multiroot bad features path).
      try {
        const watchers = startWatchingWorkspace(wkspUri, ctrl, testData, parser);
        wkspWatchers.set(wkspUri, watchers);
        watchers.forEach(w => context.subscriptions.push(w));
      } catch (e: unknown) {
        config.logger.showError(e, wkspUri);
      }
    }

    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      try {
        const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser, updateDiscoveryUX);
        wkspConfigWatchers.set(wkspUri, configWatchers);
        configWatchers.forEach(w => context.subscriptions.push(w));
      } catch (e: unknown) {
        config.logger.showError(e, wkspUri);
      }
    }

    // Phase 12: Populate project list for sync-discovered workspaces
    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      if (isManualProjectPathMode(wkspUri)) continue;
      const existingScan = getCachedScanResult(wkspUri);
      if (existingScan) {
        rebuildProjectList(wkspUri, existingScan);
      } else {
        const entry = getDiscoveryEntry(wkspUri);
        if (entry?.configFileUri) {
          const configFileName = entry.configFileUri.path.split('/').pop() ?? '';
          const CONFIG_PRIORITY: Record<string, number> = {
            'behave.ini': 0, '.behaverc': 1, 'setup.cfg': 2, 'tox.ini': 3, 'pyproject.toml': 4
          };
          const rootEntry: ScanResultEntry = {
            configFileUri: entry.configFileUri,
            dirUri: wkspUri,
            depth: 0,
            configPriority: CONFIG_PRIORITY[configFileName] ?? 99,
          };
          const minimalScan: ScanResult = {
            primary: undefined, alsoFound: [], scannedDirs: 0,
            circuitBreakerFired: false, maxDepthReached: 0
          };
          rebuildProjectList(wkspUri, minimalScan, rootEntry);
        }
      }
    }

    const junitWatcher = new JunitWatcher();
    junitWatcher.startWatchingJunitFolder();

    const statusItem = vscode.languages.createLanguageStatusItem('behave.status', { language: 'gherkin' });
    statusItem.name = "Behave BDD Status";
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

    // Phase 20 D-A6.1: evaluator drives every registered migration.
    // Phase 21 D-A3.4: hooks collect case 2 / case 3 hits, runConsentFlow shows
    // non-blocking prompts (fire-and-forget — does not gate activation).
    // B-03: run per-workspace migrations concurrently (parallelism across workspaces).
    // Pitfall 8: reloadSettings is synchronous — do NOT await.
    await Promise.all(
      getUrisOfWkspFoldersWithFeatures().map(async (wkspUri) => {
        try {
          const hits: ConsentHit[] = [];
          await evaluateAllMigrations(wkspUri, {
            onCaseHit: (mcase, entry, scope) => {
              if (mcase === 2 || mcase === 3) {
                hits.push({ case: mcase, entry, scope });
              }
            },
          });
          config.reloadSettings(wkspUri);
          const mode = readMigrationMode(wkspUri);
          // Fire-and-forget: activation must not block on user prompts (CONSENT-01).
          // runConsentFlow never throws; the outer try/catch is defense-in-depth.
          void runConsentFlow(wkspUri, hits, mode);
        } catch (e) {
          // Defense-in-depth: evaluator never throws (Phase 19 D-03), but
          // reloadSettings is not contracted to never throw.
          config.logger.logInfo(`Phase 21 migration consent flow error: ${e}`, wkspUri);
        }
      }),
    );

    // Phase 3: Surface discovery results (UX-01 through UX-05)
    updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures(), false);

    // Phase 13: Initialize status bar for all workspaces
    for (const wkspUri of getUrisOfWkspFoldersWithFeatures()) {
      updateProjectStatusBar(wkspUri);
    }

    // D-07: Status bar click opens the Behave BDD output channel
    statusItem.command = {
      title: 'Show Behave BDD Output',
      command: 'gs-behave-bdd.openOutput'
    };

    // After a Python step/env file debounce fires and step mappings are rebuilt, re-validate
    // diagnostics for all open feature files in the affected workspace. This handles the case
    // where files change via the disk (e.g. git branch switch) without going through
    // onDidChangeTextDocument, as well as the case where validateStepDefinitions was called
    // eagerly (before the debounce fired) and produced stale results.
    parser.onStepMappingsRebuilt = (featuresUri: vscode.Uri) => {
      for (const document of vscode.workspace.textDocuments) {
        if (!isFeatureFile(document.uri)) continue;
        const wkspSettings = getWorkspaceSettingsForFile(document.uri);
        if (!wkspSettings || !wkspSettings.featuresUris.some(u => urisMatch(u, featuresUri))) continue;
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
      projectStatusBar,
      { dispose: () => clearConfigDebounceTimers() },
      vscode.commands.registerCommand('gs-behave-bdd.openOutput', () => {
        const wkspUris = getUrisOfWkspFoldersWithFeatures();
        if (wkspUris.length > 0) {
          config.logger.show(wkspUris[0]);
        }
      }),
      vscode.commands.registerTextEditorCommand(`gs-behave-bdd.gotoStep`, gotoStepHandler),
      vscode.commands.registerTextEditorCommand(`gs-behave-bdd.findStepReferences`, findStepReferencesHandler),
      vscode.commands.registerCommand(`gs-behave-bdd.stepReferences.prev`, prevStepReferenceHandler),
      vscode.commands.registerCommand(`gs-behave-bdd.stepReferences.next`, nextStepReferenceHandler),
      vscode.commands.registerCommand(`gs-behave-bdd.codeLensReferences`, async (uri: vscode.Uri, lineNo: number) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && urisMatch(editor.document.uri, uri)) {
          const pos = new vscode.Position(lineNo, 0);
          editor.selection = new vscode.Selection(pos, pos);
        }
        await vscode.commands.executeCommand('gs-behave-bdd.findStepReferences');
      }),
      vscode.commands.registerCommand('gs-behave-bdd.recheckMigrations', () => recheckMigrationsCommandHandler()),
      // 260513-oh5: migration consent quick-fix dispatcher + Code Action provider.
      // The provider attaches to settings.json / .code-workspace so the lightbulb
      // appears inline; the Problems pane also exposes the quick-fixes.
      vscode.commands.registerCommand(
        MIGRATION_ACTION_COMMAND,
        (args: MigrationActionArgs) => dispatchMigrationAction(args),
      ),
      vscode.languages.registerCodeActionsProvider(
        [
          { language: 'jsonc', pattern: '**/settings.json' },
          { language: 'json', pattern: '**/settings.json' },
          { language: 'jsonc', pattern: '**/*.code-workspace' },
          { language: 'json', pattern: '**/*.code-workspace' },
        ],
        new MigrationCodeActionProvider(),
        { providedCodeActionKinds: MigrationCodeActionProvider.providedCodeActionKinds },
      ),
      getDiagnosticCollection(),
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
      vscode.languages.registerReferenceProvider(["gherkin", "python"], new FixtureReferenceProvider()),
      vscode.languages.registerCodeLensProvider("python", new StepCodeLensProvider())
    );


    const runHandler = testRunHandler(testData, ctrl, parser, junitWatcher, cleanExtensionTempDirectoryCancelSource);

    // Environment preset selector command (shown in Testing view title bar)
    const editPresetButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("gear"),
      tooltip: "Edit this preset in settings"
    };

    const selectEnvPresetCommand = vscode.commands.registerCommand("gs-behave-bdd.selectEnvPreset", async () => {
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
      const wkspConfig = vscode.workspace.getConfiguration("gs-behave-bdd", targetWkspUri);
      const presets = wkspConfig.get<{ [name: string]: { [key: string]: string } }>("envVarPresets") ?? {};
      const currentPreset = wkspConfig.get<string>("activeEnvVarPreset") ?? "";

      const presetNames = Object.keys(presets);
      if (presetNames.length === 0) {
        const openSettings = await vscode.window.showWarningMessage(
          "No environment presets configured. Add presets in settings (gs-behave-bdd.envVarPresets).",
          "Open Settings"
        );
        if (openSettings === "Open Settings") {
          await vscode.commands.executeCommand("workbench.action.openSettings", "gs-behave-bdd.envVarPresets");
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
          await vscode.commands.executeCommand("workbench.action.openSettings", "@id:gs-behave-bdd.envVarPresets");
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
          let envVarPresetsMatch = text.indexOf('"gs-behave-bdd.envVarPresets"');
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
            `@id:gs-behave-bdd.envVarPresets`
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
      () => vscode.commands.executeCommand("gs-behave-bdd.selectEnvPreset"));

    context.subscriptions.push(selectEnvPresetCommand, legacySelectEnvPresetCommand);

    // Phase 13: Select Project command (quick-pick + project switching)
    const openConfigButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("go-to-file"),
      tooltip: "Open config file"
    };

    const selectProjectCommand = vscode.commands.registerCommand('gs-behave-bdd.selectProject', async () => {
      const wkspUris = getUrisOfWkspFoldersWithFeatures();
      if (wkspUris.length === 0) {
        vscode.window.showWarningMessage('No workspace folders with features found.');
        return;
      }

      let targetWkspUri: vscode.Uri;
      if (wkspUris.length === 1) {
        targetWkspUri = wkspUris[0];
      } else {
        const wkspItems = wkspUris.map(uri => ({
          label: vscode.workspace.getWorkspaceFolder(uri)?.name ?? uri.fsPath,
          uri: uri
        }));
        const selected = await vscode.window.showQuickPick(wkspItems, {
          placeHolder: 'Select workspace'
        });
        if (!selected) return;
        targetWkspUri = selected.uri;
      }

      if (isManualProjectPathMode(targetWkspUri)) {
        vscode.window.showInformationMessage(
          'Project switching is disabled when projectPath is manually set. Remove projectPath to enable switching.',
          'Open Settings'
        ).then(action => {
          if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'gs-behave-bdd.projectPath');
          }
        });
        return;
      }

      const projects = getProjectList(targetWkspUri);
      if (projects.length === 0) {
        vscode.window.showWarningMessage('No behave projects discovered in this workspace.');
        return;
      }

      const activeProject = getActiveProject(targetWkspUri);


      const items = buildQuickPickItems(projects, activeProject, openConfigButton, urisMatch);

      const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
      quickPick.items = items;
      quickPick.placeholder = `Select behave project (${projects.length} discovered)`;

      quickPick.onDidTriggerItemButton(async e => {
        quickPick.hide();
        await vscode.commands.executeCommand('vscode.open', (e.item as ProjectQuickPickItem).entry.configFileUri);
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        quickPick.hide();
        if (selected) {
          const wasActive = activeProject && urisMatch(selected.entry.configFileUri, activeProject.configFileUri);
          if (!wasActive) {
            setActiveProject(targetWkspUri, selected.entry);
            // D-09: Log switch to output channel
            const configType = selected.entry.configFileUri.path.split('/').pop() ?? 'config';
            const displayLabel = selected.entry.label === '.' ? '(root)' : selected.entry.label;
            config.logger.logInfo(`Active project switched to: ${displayLabel} (${configType})`, targetWkspUri);
            updateProjectStatusBar(targetWkspUri);

            // Phase 14: Trigger full rebuild after project switch (INT-01, INT-02)
            setProjectSwitchInProgress(true);
            vscode.window.withProgress(
              { location: vscode.ProgressLocation.Notification, title: `Switching to project: ${displayLabel}...` },
              async () => {
                try {
                  // N-05: configurationChangedHandler is forward-referenced — defined
                  // below at L989. This works because the const-binding is in scope
                  // by the time this callback fires (the user must click an item to
                  // trigger it, by which point activate() has finished registering
                  // the handler). If activate() is restructured, beware of TDZ.
                  await configurationChangedHandler(undefined, undefined, true);
                } finally {
                  setProjectSwitchInProgress(false);
                }
              }
            );
          }
        }
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    });

    const legacySelectProjectCommand = vscode.commands.registerCommand('behave-vsc.selectProject',
      () => vscode.commands.executeCommand('gs-behave-bdd.selectProject'));

    context.subscriptions.push(selectProjectCommand, legacySelectProjectCommand);

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

    // Phase 9: Async subdirectory config scan for undiscovered workspaces (D-01)
    (async () => {
      try {
        const allFolders = vscode.workspace.workspaceFolders;
        if (!allFolders) return;

        const discoveredUris = getUrisOfWkspFoldersWithFeatures();
        const discoveredSet = new Set(discoveredUris.map(u => u.path));
        const undiscovered = allFolders.filter(f => !discoveredSet.has(f.uri.path));

        if (undiscovered.length === 0) return;

        for (const folder of undiscovered) {
          const wkspConfig = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
          const discoveryDepth = wkspConfig.get<number>("discoveryDepth") ?? 3;
          const stopOnFirstHit = wkspConfig.get<boolean>("discoveryStopOnFirstHit") ?? false;

          if (discoveryDepth === 0) {
            diagLog(`Subdir scan: skipped for ${folder.name} (discoveryDepth=0)`, folder.uri);
            continue;
          }

          config.logger.logInfo(`Scanning for behave config in subdirectories (depth ${discoveryDepth})...`, folder.uri);

          const result = await scanForBehaveConfig(folder.uri, discoveryDepth, stopOnFirstHit);

          if (result.primary) {
            const primaryRelPath = vscode.workspace.asRelativePath(result.primary.configFileUri, false);
            config.logger.logInfo(
              `Subdir scan: found ${result.alsoFound.length + 1} config(s), ` +
              `scanned ${result.scannedDirs} dirs. Primary: ${primaryRelPath} (depth ${result.primary.depth})`,
              folder.uri
            );
            for (const entry of result.alsoFound) {
              const relPath = vscode.workspace.asRelativePath(entry.configFileUri, false);
              config.logger.logInfo(`  Also found: ${relPath} (depth ${entry.depth})`, folder.uri);
            }
          } else {
            config.logger.logInfo(
              `No behave config found in subdirectories (scanned depth ${result.maxDepthReached}, ${result.scannedDirs} dirs)`,
              folder.uri
            );
            continue;
          }

          if (result.circuitBreakerFired) {
            config.logger.logInfo(
              `Subdir scan: circuit breaker at ${result.scannedDirs} entries. ` +
              `Set discoveryDepth=0 to disable scan or set projectPath manually.`,
              folder.uri
            );
          }

          // Cache the result so hasFeaturesFolder can read it on force-refresh
          setCachedScanResult(folder.uri, result);

          // Phase 12: Populate project list from scan results
          if (!isManualProjectPathMode(folder.uri)) {
            const rootConfigResult = findBehaveConfig(folder.uri);
            let rootEntry: ScanResultEntry | undefined;
            if (rootConfigResult && rootConfigResult.ok) {
              const configFileName = rootConfigResult.configFileUri.path.split('/').pop() ?? '';
              const CONFIG_PRIORITY: Record<string, number> = {
                'behave.ini': 0, '.behaverc': 1, 'setup.cfg': 2, 'tox.ini': 3, 'pyproject.toml': 4
              };
              rootEntry = {
                configFileUri: rootConfigResult.configFileUri,
                dirUri: folder.uri,
                depth: 0,
                configPriority: CONFIG_PRIORITY[configFileName] ?? 99,
              };
            }
            const projects = rebuildProjectList(folder.uri, result, rootEntry);
            const active = getActiveProject(folder.uri);
            if (active) {
              config.logger.logInfo(
                `Project list: ${projects.length} project(s) discovered. Active: ${active.label}`,
                folder.uri
              );
            }
          }

          // INT-04: Call cache + parser directly, NOT through configurationChangedHandler
          getUrisOfWkspFoldersWithFeatures(true);
          config.reloadSettings(folder.uri);

          // Set up watchers and trigger parsing for newly-discovered workspace
          if (getUrisOfWkspFoldersWithFeatures().some(u => urisMatch(u, folder.uri))) {
            const watchers = startWatchingWorkspace(folder.uri, ctrl, testData, parser);
            wkspWatchers.set(folder.uri, watchers);
            watchers.forEach(w => context.subscriptions.push(w));

            const configWatchers = startWatchingConfigFiles(
              folder.uri, ctrl, testData, parser, updateDiscoveryUX
            );
            wkspConfigWatchers.set(folder.uri, configWatchers);
            configWatchers.forEach(w => context.subscriptions.push(w));

            updateDiscoveryUX([folder.uri], false);
            parser.parseFilesForWorkspace(folder.uri, testData, ctrl, 'subdirScan', false);
          }
        }
      } catch (e: unknown) {
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
      // only reload config on request (i.e. when testCfg supplied or forceFullRefresh)
      if (config.integrationTestRun && !testCfg && !forceFullRefresh)
        return;

      try {

        // note - affectsConfiguration(ext,uri) i.e. with a scope (uri) param is smart re. default resource values, but  we don't want 
        // that behaviour because we want to distinguish between some properties being set vs being absent from 
        // settings.json (via inspect not get), so we don't include the uri in the affectsConfiguration() call
        // (separately, just note that the settings change could be a global window setting from *.code-workspace file, rather than from settings.json)
        const affected = event && event.affectsConfiguration("gs-behave-bdd");
        if (!affected && !forceFullRefresh && !testCfg)
          return;

        if (!testCfg)
          config.logger.clearAllWksps();

        // changing featuresPaths in settings.json/*.vscode-workspace to a valid path, or adding/removing/renaming workspaces
        // will not only change the set of workspaces we are watching, but also the output channels
        config.logger.syncChannelsToWorkspaceFolders();

        // Phase 19 D-09 / CLEANUP-02: any change to scan-shaping settings invalidates
        // BOTH the scan-result cache AND the active-project cache. Replaces the v1.4.0
        // read-time discoveryDepth re-read in src/common.ts (CLEANUP-02 / D-11).
        const needsRescan = forceFullRefresh || (event && (
          event.affectsConfiguration('gs-behave-bdd.discoveryDepth') ||
          event.affectsConfiguration('gs-behave-bdd.discoveryStopOnFirstHit') ||
          event.affectsConfiguration('gs-behave-bdd.projectPath') ||
          event.affectsConfiguration('gs-behave-bdd.projectPaths') ||
          event.affectsConfiguration('gs-behave-bdd.featuresPath') ||
          event.affectsConfiguration('gs-behave-bdd.featuresPaths')
        ));
        if (needsRescan) {
          clearScanResultCache();
          clearActiveProjectCache();
        }

        // Phase 9 + 022-02 fix: re-run BFS scan for ALL workspaces when scan-shaping
        // settings change (or forceFullRefresh). The Phase 19 / CLEANUP-02 design clears
        // the caches but never repopulated them — so multi-project workspaces with no
        // root-level config (project-switch, monorepo-scan) lost their active-project
        // selection on any forceFullRefresh. Mirrors the activation block at L825-L893.
        if (needsRescan) {
          const allFolders = vscode.workspace.workspaceFolders;
          if (allFolders) {
            for (const folder of allFolders) {
              if (isManualProjectPathMode(folder.uri)) continue;
              const wkspCfg = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
              const depth = wkspCfg.get<number>("discoveryDepth") ?? 3;
              const stopFirst = wkspCfg.get<boolean>("discoveryStopOnFirstHit") ?? false;

              // Look for a root-level config file too — it becomes position-0 in the project list.
              const rootConfigResult = findBehaveConfig(folder.uri);
              let rootEntry: ScanResultEntry | undefined;
              if (rootConfigResult && rootConfigResult.ok) {
                const configFileName = rootConfigResult.configFileUri.path.split('/').pop() ?? '';
                const CONFIG_PRIORITY: Record<string, number> = {
                  'behave.ini': 0, '.behaverc': 1, 'setup.cfg': 2, 'tox.ini': 3, 'pyproject.toml': 4
                };
                rootEntry = {
                  configFileUri: rootConfigResult.configFileUri,
                  dirUri: folder.uri,
                  depth: 0,
                  configPriority: CONFIG_PRIORITY[configFileName] ?? 99,
                };
              }

              let scanResult: ScanResult;
              if (depth > 0) {
                scanResult = await scanForBehaveConfig(folder.uri, depth, stopFirst);
                if (scanResult.primary) setCachedScanResult(folder.uri, scanResult);
              } else {
                // discoveryDepth=0: no subdir scan. Project list contains only the
                // root entry (if any). monorepo-scan's "discoveryDepth=0 disables
                // subdirectory scanning" test relies on this — without it, the
                // stale projectListCache + persisted active would resurrect a
                // subdir selection that should no longer be reachable.
                scanResult = {
                  primary: undefined, alsoFound: [], scannedDirs: 0,
                  circuitBreakerFired: false, maxDepthReached: 0,
                };
              }
              // rebuildProjectList calls restoreOrAutoSelectActive — restores the
              // persisted setActiveProject choice if it's still in the new list,
              // otherwise auto-selects the first. project-switch's "switch to beta"
              // test relies on this restoration path.
              rebuildProjectList(folder.uri, scanResult, rootEntry);
            }
          }
        }

        // Phase 9: Re-run BFS scan for undiscovered workspaces when scan-affecting settings change
        if (needsRescan) {
          const allFolders = vscode.workspace.workspaceFolders;
          if (allFolders) {
            const discoveredUris = getUrisOfWkspFoldersWithFeatures(true);
            const discoveredSet = new Set(discoveredUris.map(u => u.path));
            const undiscovered = allFolders.filter(f => !discoveredSet.has(f.uri.path));
            for (const folder of undiscovered) {
              const wkspCfg = vscode.workspace.getConfiguration("gs-behave-bdd", folder.uri);
              const depth = wkspCfg.get<number>("discoveryDepth") ?? 3;
              const stopFirst = wkspCfg.get<boolean>("discoveryStopOnFirstHit") ?? false;
              if (depth > 0) {
                const result = await scanForBehaveConfig(folder.uri, depth, stopFirst);
                if (result.primary) {
                  setCachedScanResult(folder.uri, result);
                  getUrisOfWkspFoldersWithFeatures(true);
                  config.reloadSettings(folder.uri);
                  if (getUrisOfWkspFoldersWithFeatures().some(u => urisMatch(u, folder.uri))) {
                    const watchers = startWatchingWorkspace(folder.uri, ctrl, testData, parser);
                    wkspWatchers.set(folder.uri, watchers);
                    watchers.forEach(w => context.subscriptions.push(w));
                    const cWatchers = startWatchingConfigFiles(folder.uri, ctrl, testData, parser, updateDiscoveryUX);
                    wkspConfigWatchers.set(folder.uri, cWatchers);
                    cWatchers.forEach(w => context.subscriptions.push(w));
                  }
                }
              }
            }
          }
        }

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
          const oldConfigWatchers = wkspConfigWatchers.get(wkspUri);
          if (oldConfigWatchers)
            oldConfigWatchers.forEach(w => w.dispose());
          const configWatchers = startWatchingConfigFiles(wkspUri, ctrl, testData, parser, updateDiscoveryUX);
          wkspConfigWatchers.set(wkspUri, configWatchers);
          configWatchers.forEach(w => context.subscriptions.push(w));
        }

        // configuration has now changed, e.g. featuresPaths, so we need to reparse files

        // (in the case of a testConfig insertion we just reparse the supplied workspace to avoid issues with parallel workspace integration test runs)
        if (testCfg) {
          parser.parseFilesForWorkspace(testCfg.wkspUri, testData, ctrl, "configurationChangedHandler", false);
          return;
        }

        // we don't know which workspace was affected (see comment on affectsConfiguration above), so just reparse all workspaces
        // (also, when a workspace is added/removed/renamed (forceRefresh), we need to clear down and reparse all test nodes to rebuild the top level nodes)

        // Phase 3: Re-surface discovery results after config change
        updateDiscoveryUX(getUrisOfWkspFoldersWithFeatures(), !!forceFullRefresh);

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
      configurationChangedHandler: configurationChangedHandler,
      getDiscoveryEntry: getDiscoveryEntry,
      getUrisOfWkspFoldersWithFeatures: getUrisOfWkspFoldersWithFeatures,
      checkRunGuard: checkRunGuard,
      getProjectList: getProjectList,
      getActiveProject: getActiveProject,
      setActiveProject: setActiveProject,
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


