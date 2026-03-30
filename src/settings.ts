import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  findHighestTargetParentDirectorySync, findSubdirectorySync, getUrisOfWkspFoldersWithFeatures,
  getWorkspaceFolder, uriId, WkspError
} from './common';
import { config } from './configuration';
import { Logger } from './logger';


// Returns the new config value if explicitly set at any scope; otherwise falls back to the legacy
// config value (to support users migrating from behave-vsc); finally falls back to the new default.
function getWithLegacyFallback<T>(
  newConfig: vscode.WorkspaceConfiguration,
  legacyConfig: vscode.WorkspaceConfiguration,
  key: string
): T | undefined {
  const insp = newConfig.inspect<T>(key);
  const isExplicit = insp !== undefined && (
    insp.globalValue !== undefined ||
    insp.workspaceValue !== undefined ||
    insp.workspaceFolderValue !== undefined
  );
  if (isExplicit) return newConfig.get<T>(key);
  const legacyValue = legacyConfig.get<T>(key);
  return legacyValue !== undefined ? legacyValue : newConfig.get<T>(key);
}

export class WindowSettings {
  // class for package.json "window" settings
  // these apply to the whole vscode instance, but may be set in settings.json or *.code-workspace
  // (in a multi-root workspace they will be read from *.code-workspace, and greyed-out and disabled in settings.json)
  public readonly multiRootRunWorkspacesInParallel: boolean;
  public readonly xRay: boolean;

  constructor(winConfig: vscode.WorkspaceConfiguration, legacyConfig?: vscode.WorkspaceConfiguration) {
    const get = <T>(key: string): T | undefined =>
      legacyConfig ? getWithLegacyFallback<T>(winConfig, legacyConfig, key) : winConfig.get<T>(key);

    // note: undefined should never happen (or packages.json is wrong) as get will return a default value for packages.json settings
    const multiRootRunWorkspacesInParallelCfg: boolean | undefined = get("multiRootRunWorkspacesInParallel");
    if (multiRootRunWorkspacesInParallelCfg === undefined)
      throw "multiRootRunWorkspacesInParallel is undefined";
    const xRayCfg: boolean | undefined = get("xRay");
    if (xRayCfg === undefined)
      throw "xRay is undefined";

    this.multiRootRunWorkspacesInParallel = multiRootRunWorkspacesInParallelCfg;
    this.xRay = xRayCfg;
  }
}

export class WorkspaceSettings {
  // class for package.json "resource" settings in settings.json
  // these apply to a single workspace 

  // user-settable
  public readonly envVarOverrides: { [name: string]: string } = {};
  public readonly envVarPresets: { [presetName: string]: { [name: string]: string } } = {};
  public readonly activeEnvVarPreset: string;
  public readonly justMyCode: boolean;
  public readonly runParallel: boolean;
  public readonly importStrategy: string;
  public readonly workspaceRelativeProjectPath: string;
  public readonly projectRelativeFeaturesPath: string;
  // convenience properties
  public readonly id: string;
  public readonly uri: vscode.Uri;
  public readonly name: string;
  public readonly projectUri: vscode.Uri;
  public readonly featuresUri: vscode.Uri;
  public readonly stepsSearchUri: vscode.Uri;
  public readonly workspaceRelativeFeaturesPath: string; // computed: projectPath + featuresPath
  // internal
  private readonly _warnings: string[] = [];
  private readonly _fatalErrors: string[] = [];


  constructor(wkspUri: vscode.Uri, wkspConfig: vscode.WorkspaceConfiguration, winSettings: WindowSettings, logger: Logger, legacyConfig?: vscode.WorkspaceConfiguration) {
    const get = <T>(key: string): T | undefined =>
      legacyConfig ? getWithLegacyFallback<T>(wkspConfig, legacyConfig, key) : wkspConfig.get<T>(key);

    this.uri = wkspUri;
    this.id = uriId(wkspUri);
    const wsFolder = getWorkspaceFolder(wkspUri);
    this.name = wsFolder.name;

    // note: undefined should never happen (or packages.json is wrong) as get will return a default value for packages.json settings
    const envVarOverridesCfg: { [name: string]: string } | undefined = get("envVarOverrides");
    if (envVarOverridesCfg === undefined)
      throw "envVarOverrides is undefined";
    const envVarPresetsCfg: { [presetName: string]: { [name: string]: string } } | undefined = get("envVarPresets");
    if (envVarPresetsCfg === undefined)
      throw "envVarPresets is undefined";
    const activeEnvVarPresetCfg: string | undefined = get("activeEnvVarPreset");
    if (activeEnvVarPresetCfg === undefined)
      throw "activeEnvVarPreset is undefined";
    const projectPathCfg: string | undefined = get("projectPath");
    if (projectPathCfg === undefined)
      throw "projectPath is undefined";
    const featuresPathCfg: string | undefined = get("featuresPath");
    if (featuresPathCfg === undefined)
      throw "featuresPath is undefined";
    const justMyCodeCfg: boolean | undefined = get("justMyCode");
    if (justMyCodeCfg === undefined)
      throw "justMyCode is undefined";
    const runParallelCfg: boolean | undefined = get("runParallel");
    if (runParallelCfg === undefined)
      throw "runParallel is undefined";
    const importStrategyCfg: string | undefined = get("importStrategy");
    if (importStrategyCfg === undefined)
      throw "importStrategy is undefined";
    if (importStrategyCfg !== 'useBundled' && importStrategyCfg !== 'fromEnvironment')
      throw `importStrategy value "${importStrategyCfg}" is invalid. Must be "useBundled" or "fromEnvironment"`;


    this.justMyCode = justMyCodeCfg;
    this.runParallel = runParallelCfg;
    this.importStrategy = importStrategyCfg;
    this.activeEnvVarPreset = activeEnvVarPresetCfg;


    // Process projectPath - this is the root of the behave project
    this.workspaceRelativeProjectPath = projectPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
    if (this.workspaceRelativeProjectPath) {
      this.projectUri = vscode.Uri.joinPath(wkspUri, this.workspaceRelativeProjectPath);
      if (!fs.existsSync(this.projectUri.fsPath)) {
        this._fatalErrors.push(`project path ${this.projectUri.fsPath} not found.`);
      }
    } else {
      this.projectUri = wkspUri;
    }

    // Process featuresPath - this is relative to projectPath
    this.projectRelativeFeaturesPath = featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim();
    // vscode will not substitute a default if an empty string is specified in settings.json
    if (!this.projectRelativeFeaturesPath)
      this.projectRelativeFeaturesPath = "features";
    this.featuresUri = vscode.Uri.joinPath(this.projectUri, this.projectRelativeFeaturesPath);
    if (this.projectRelativeFeaturesPath === ".")
      this._fatalErrors.push(`"." is not a valid "behave-vsc-gs.featuresPath" value. The features folder must be a subfolder.`);
    if (!fs.existsSync(this.featuresUri.fsPath)) {
      // note - this error should never happen or some logic/hooks are wrong 
      // (or the user has actually deleted/moved the features path since loading)
      // because the existence of the path should always be checked by getUrisOfWkspFoldersWithFeatures(true)
      // before we get here (i.e. called elsewhere when workspace folders/settings are changed etc.)    
      this._fatalErrors.push(`features path ${this.featuresUri.fsPath} not found.`);
    }

    // Compute workspace-relative features path for file watchers etc.
    this.workspaceRelativeFeaturesPath = this.workspaceRelativeProjectPath
      ? `${this.workspaceRelativeProjectPath}/${this.projectRelativeFeaturesPath}`
      : this.projectRelativeFeaturesPath;

    // default to watching features folder for (possibly multiple) "steps" 
    // subfolders (e.g. like example project B/features folder)
    this.stepsSearchUri = vscode.Uri.joinPath(this.featuresUri);
    if (!findSubdirectorySync(this.stepsSearchUri.fsPath, "steps")) {
      // if not found, get the highest-level "steps" folder above the features folder inside the project
      const stepsSearchFsPath = findHighestTargetParentDirectorySync(this.featuresUri.fsPath, this.projectUri.fsPath, "steps");
      if (stepsSearchFsPath)
        this.stepsSearchUri = vscode.Uri.file(stepsSearchFsPath);
      else
        logger.showWarn(`No "steps" folder found.`, this.uri);
    }

    // parse envVarPresets
    if (envVarPresetsCfg && typeof envVarPresetsCfg === "object") {
      for (const presetName in envVarPresetsCfg) {
        const presetVars = envVarPresetsCfg[presetName];
        if (typeof presetVars === "object") {
          this.envVarPresets[presetName] = {};
          for (const name in presetVars) {
            const value = presetVars[name];
            if (typeof value === "string") {
              this.envVarPresets[presetName][name] = value;
            }
          }
        }
      }
    }

    if (envVarOverridesCfg) {
      const err = `Invalid envVarOverrides setting ${JSON.stringify(envVarOverridesCfg)} ignored.`;
      try {
        if (typeof envVarOverridesCfg !== "object") {
          this._warnings.push(err);
        }
        else {
          for (const name in envVarOverridesCfg) {
            // just check for "=" typo
            if (name.includes("=")) {
              this._warnings.push(`${err} ${name} must not contain =`);
              break;
            }
            const value = envVarOverridesCfg[name];
            if (value) {
              if (typeof value !== "string") {
                this._warnings.push(`${err} ${value} is not a string`);
                break;
              }
              this.envVarOverrides[name] = value;
            }
          }
        }
      }
      catch {
        this._warnings.push(err);
      }
    }


    this.logSettings(logger, winSettings);
  }


  /**
   * Gets the effective environment variables by merging the active preset with overrides.
   * The order of precedence (highest to lowest): envVarOverrides > activePreset
   */
  getEffectiveEnvVars(): { [name: string]: string } {
    const presetVars = this.activeEnvVarPreset && this.envVarPresets[this.activeEnvVarPreset]
      ? this.envVarPresets[this.activeEnvVarPreset]
      : {};
    return { ...presetVars, ...this.envVarOverrides };
  }


  logSettings(logger: Logger, winSettings: WindowSettings) {

    // build sorted output dict of window settings
    const nonUserSettableWinSettings: string[] = [];
    const winSettingsDic: { [name: string]: string; } = {};
    const winEntries = Object.entries(winSettings).sort()
    winEntries.forEach(([key, value]) => {
      if (!key.startsWith("_") && !nonUserSettableWinSettings.includes(key)) {
        winSettingsDic[key] = value;
      }
    });

    // build sorted output dict of workspace settings
    const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri", "stepsSearchUri", "workspaceRelativeFeaturesPath"];
    const rscSettingsDic: { [name: string]: string; } = {};
    let wkspEntries = Object.entries(this).sort();
    wkspEntries.push(["fullProjectPath", this.projectUri.fsPath]);
    wkspEntries.push(["fullFeaturesPath", this.featuresUri.fsPath]);
    wkspEntries.push(["junitTempPath", config.extensionTempFilesUri.fsPath]);
    wkspEntries = wkspEntries.filter(([key]) => !key.startsWith("_") && !nonUserSettableWkspSettings.includes(key) && key !== "workspaceRelativeProjectPath" && key !== "projectRelativeFeaturesPath");
    wkspEntries.push(["projectPath", this.workspaceRelativeProjectPath || "(workspace root)"]);
    wkspEntries.push(["featuresPath", this.projectRelativeFeaturesPath]);
    wkspEntries = wkspEntries.sort();
    wkspEntries.forEach(([key, value]) => {
      rscSettingsDic[key] = value;
    });


    // output settings, and any warnings or errors for settings

    const wkspUris = getUrisOfWkspFoldersWithFeatures();
    if (wkspUris.length > 0 && this.uri === wkspUris[0])
      logger.logInfoAllWksps(`\ninstance settings:\n${JSON.stringify(winSettingsDic, null, 2)}`);

    logger.logInfo(`\n${this.name} workspace settings:\n${JSON.stringify(rscSettingsDic, null, 2)}`, this.uri);

    if (this._fatalErrors.length > 0) {
      throw new WkspError(`\nFATAL error due to invalid workspace setting in workspace "${this.name}". Extension cannot continue. ` +
        `${this._fatalErrors.join("\n")}\n` +
        `NOTE: fatal errors may require you to restart vscode after correcting the problem.) `, this.uri);
    }
  }

}


