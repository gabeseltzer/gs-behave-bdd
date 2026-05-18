import * as os from 'os';
import * as vscode from 'vscode';
import { getUrisOfWkspFoldersWithFeatures } from './common';
import { diagLog, Logger } from './logger';
import { WorkspaceSettings as WorkspaceSettings, WindowSettings } from './settings';

export interface Configuration {
  integrationTestRun: boolean;
  readonly extensionTempFilesUri: vscode.Uri;
  readonly logger: Logger;
  readonly diagnostics: vscode.DiagnosticCollection;
  readonly workspaceSettings: { [wkspUriPath: string]: WorkspaceSettings };
  readonly globalSettings: WindowSettings;
  reloadSettings(wkspUri: vscode.Uri, testConfig?: vscode.WorkspaceConfiguration): void;
  isWorkspaceSettingsFailed(wkspUri: vscode.Uri): boolean;
  getPythonExecutable(wkspUri: vscode.Uri, wkspName: string): Promise<string>;
  dispose(): void;
}


// don't export this, use the interface
class ExtensionConfiguration implements Configuration {
  public integrationTestRun = false;
  public exampleProject = false;
  public readonly extensionTempFilesUri;
  public readonly logger: Logger;
  public readonly diagnostics: vscode.DiagnosticCollection;
  private static _configuration?: ExtensionConfiguration;
  private _windowSettings: WindowSettings | undefined = undefined;
  private _resourceSettings: { [wkspUriPath: string]: WorkspaceSettings } = {};
  // W-06 / 260518-hyz: per-uri tracker so getter-path WkspError surfaces are emitted
  // ONCE per workspace (across the lifetime of the singleton). Stores the failure
  // error itself (upgraded from Set<string> to Map<string, Error>) so the getter
  // can short-circuit construction entirely on subsequent calls — without this,
  // the WorkspaceSettings constructor reran on every getter access, producing
  // duplicate log output and duplicate steps-folder warnings on broken configs.
  // reloadSettings(wkspUri) deletes the entry to allow a fix-then-reload cycle.
  private _failedSettingsWorkspaces = new Map<string, Error>();

  private constructor() {
    ExtensionConfiguration._configuration = this;
    this.logger = new Logger();
    this.diagnostics = vscode.languages.createDiagnosticCollection("gs-behave-bdd");
    this.extensionTempFilesUri = vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), "gs-behave-bdd");
    this.exampleProject = (vscode.workspace.workspaceFolders?.find(f =>
      f.uri.path.includes("/gs-behave-bdd/example-projects/")) !== undefined);
    diagLog("Configuration singleton constructed (this should only fire once)");
  }

  public dispose() {
    this.logger.dispose();
    this.diagnostics.dispose();
  }

  static get configuration() {
    if (ExtensionConfiguration._configuration)
      return ExtensionConfiguration._configuration;
    ExtensionConfiguration._configuration = new ExtensionConfiguration();
    return ExtensionConfiguration._configuration;
  }

  public isWorkspaceSettingsFailed(wkspUri: vscode.Uri): boolean {
    return this._failedSettingsWorkspaces.has(wkspUri.path);
  }

  // called by onDidChangeConfiguration
  public reloadSettings(wkspUri: vscode.Uri, testConfig?: vscode.WorkspaceConfiguration) {
    // W-06: clear the per-uri "already surfaced" flag so a workspace that
    // previously failed and is now being re-loaded will surface a fresh
    // notification if it still fails (fix-then-break cycle).
    this._failedSettingsWorkspaces.delete(wkspUri.path);
    delete this._resourceSettings[wkspUri.path];
    // Re-cache failures so subsequent workspaceSettings getter calls
    // short-circuit instead of re-running the ctor (duplicate settings dumps).
    // The throw is preserved so callers that want to react to the failure still can.
    try {
      if (testConfig) {
        this._windowSettings = new WindowSettings(testConfig);
        this._resourceSettings[wkspUri.path] = new WorkspaceSettings(wkspUri, testConfig, this._windowSettings, this.logger);
      }
      else {
        this._windowSettings = new WindowSettings(vscode.workspace.getConfiguration("gs-behave-bdd"));
        this._resourceSettings[wkspUri.path] = new WorkspaceSettings(wkspUri,
          vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri), this._windowSettings, this.logger);
      }
    } catch (e) {
      this._failedSettingsWorkspaces.set(wkspUri.path, e as Error);
      throw e;
    }
  }

  public get globalSettings(): WindowSettings {
    return this._windowSettings
      ? this._windowSettings
      : this._windowSettings = new WindowSettings(
        vscode.workspace.getConfiguration("gs-behave-bdd")
      );
  }

  public get workspaceSettings(): { [wkspUriPath: string]: WorkspaceSettings } {
    const winSettings = this.globalSettings;
    getUrisOfWkspFoldersWithFeatures().forEach(wkspUri => {
      if (!this._resourceSettings[wkspUri.path]) {
        // 260518-hyz: short-circuit construction if this workspace's settings
        // previously failed to construct. The failure was already surfaced via
        // showError on the first attempt; reconstructing on every getter call
        // produced duplicate log output and duplicate "No steps folder" warns.
        // reloadSettings(wkspUri) clears this entry so a fix-then-reload retries.
        if (this._failedSettingsWorkspaces.has(wkspUri.path)) {
          return;
        }
        try {
          this._resourceSettings[wkspUri.path] = new WorkspaceSettings(wkspUri,
            vscode.workspace.getConfiguration("gs-behave-bdd", wkspUri), winSettings, this.logger);
        } catch (e) {
          // WorkspaceSettings throws WkspError on fatal config errors (e.g. bad featuresPaths).
          // The error is already logged via the workspace's output channel inside logSettings()
          // before the throw. Swallow here so a single misconfigured workspace doesn't poison
          // iteration / settings access for unrelated workspaces (e.g. an integration test for
          // workspace A asserting its own settings should not throw because workspace B has a
          // bad path). Direct callers of reloadSettings() still observe the throw.
          //
          // W-06: surface ONCE per workspace via showError so users with a genuinely broken
          // config see a one-shot notification (they would otherwise see nothing in the UI
          // unless the FIRST settings-loading code path was a direct reloadSettings caller).
          // Per-uri tracking prevents spamming if the getter is hit repeatedly for the same
          // bad workspace.
          if (!this._failedSettingsWorkspaces.has(wkspUri.path)) {
            this._failedSettingsWorkspaces.set(wkspUri.path, e as Error);
            this.logger.showError(e, wkspUri);
          }
          diagLog(`workspaceSettings getter: skipping ${wkspUri.path} due to: ${e}`, wkspUri);
        }
      }
    });
    return this._resourceSettings;
  }

  // note - python interpreter can be changed dynamically by the user, so don't store the result
  getPythonExecutable = async (wkspUri: vscode.Uri, wkspName: string) => {
    const msPyExt = "ms-python.python";
    const pyext = vscode.extensions.getExtension(msPyExt);

    if (!pyext)
      throw (`Behave BDD could not find required dependency ${msPyExt}`);

    if (!pyext.isActive) {
      await pyext?.activate();
      if (!pyext.isActive)
        throw (`Behave BDD could not activate required dependency ${msPyExt}`);
    }

    const pythonExec = await pyext?.exports.settings.getExecutionDetails(wkspUri).execCommand[0];
    if (!pythonExec)
      throw (`Behave BDD failed to obtain python executable for ${wkspName} workspace from ${msPyExt}`);

    return pythonExec;
  }

}



// global = stop the constructor getting called twice in extension integration tests
declare const global: any; // eslint-disable-line @typescript-eslint/no-explicit-any
if (!global.config)
  global.config = ExtensionConfiguration.configuration;
export const config: ExtensionConfiguration = global.config;
