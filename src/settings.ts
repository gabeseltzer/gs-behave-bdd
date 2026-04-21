import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  findHighestTargetParentDirectorySync, findSubdirectorySync, getUrisOfWkspFoldersWithFeatures,
  getWorkspaceFolder, uriId, urisMatch, WkspError,
  DiscoverySource, DiscoveryEntry, getDiscoveryEntry, hasExplicitSetting,
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
  public readonly verboseLogging: boolean;

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
    const verboseLoggingCfg: boolean | undefined = get("verboseLogging");
    if (verboseLoggingCfg === undefined)
      throw "verboseLogging is undefined";

    this.multiRootRunWorkspacesInParallel = multiRootRunWorkspacesInParallelCfg;
    this.xRay = xRayCfg;
    this.verboseLogging = verboseLoggingCfg;
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
  public readonly stepDefinitionSearchTimeout: number;
  public readonly discoveryDepth: number;
  public readonly discoveryStopOnFirstHit: boolean;
  public readonly suppressMultiConfigNotification: boolean;
  public readonly workspaceRelativeProjectPath: string;
  // Plural fields (Phase 7, D-03) — non-empty; length-1 in Phase 7, grows in Phase 8
  public readonly projectRelativeFeaturesPaths: string[];
  public readonly featuresUris: vscode.Uri[];
  public readonly stepsSearchUris: vscode.Uri[];
  public readonly workspaceRelativeFeaturesPaths: string[];
  // Singular back-compat getters (D-03, D-05) — 32 existing call sites read these
  public get projectRelativeFeaturesPath(): string { return this.projectRelativeFeaturesPaths[0]; }
  public get featuresUri(): vscode.Uri { return this.featuresUris[0]; }
  public get stepsSearchUri(): vscode.Uri { return this.stepsSearchUris[0]; }
  public get workspaceRelativeFeaturesPath(): string { return this.workspaceRelativeFeaturesPaths[0]; }
  // D-08 instance method — returns true if uri is inside any featuresUri root
  public isFileInFeatures(uri: vscode.Uri): boolean {
    return this.featuresUris.some(
      fu => uri.path.startsWith(fu.path + '/') || urisMatch(fu, uri)
    );
  }
  // convenience properties
  public readonly id: string;
  public readonly uri: vscode.Uri;
  public readonly name: string;
  public readonly projectUri: vscode.Uri;
  // Discovery metadata (Phase 2 -- INTG-06)
  public readonly discoverySource: DiscoverySource;
  public readonly configFileUri: vscode.Uri | undefined;
  // internal
  private readonly _warnings: string[] = [];
  private readonly _fatalErrors: string[] = [];


  constructor(wkspUri: vscode.Uri, wkspConfig: vscode.WorkspaceConfiguration, winSettings: WindowSettings, logger: Logger, legacyConfig?: vscode.WorkspaceConfiguration, discoveryEntry?: DiscoveryEntry) {
    const get = <T>(key: string): T | undefined =>
      legacyConfig ? getWithLegacyFallback<T>(wkspConfig, legacyConfig, key) : wkspConfig.get<T>(key);

    this.uri = wkspUri;
    this.id = uriId(wkspUri);
    const wsFolder = getWorkspaceFolder(wkspUri);
    this.name = wsFolder.name;

    // Discovery metadata -- read from passed-in entry or from cache (INTG-06)
    const entry = discoveryEntry ?? getDiscoveryEntry(wkspUri);
    this.discoverySource = entry?.source ?? "convention";
    this.configFileUri = entry?.configFileUri;

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
    const stepDefinitionSearchTimeoutCfg: number | undefined = get("stepDefinitionSearchTimeout");
    if (stepDefinitionSearchTimeoutCfg === undefined)
      throw "stepDefinitionSearchTimeout is undefined";
    const discoveryDepthCfg: number | undefined = get("discoveryDepth");
    if (discoveryDepthCfg === undefined)
      throw "discoveryDepth is undefined";
    const discoveryStopOnFirstHitCfg: boolean | undefined = get("discoveryStopOnFirstHit");
    if (discoveryStopOnFirstHitCfg === undefined)
      throw "discoveryStopOnFirstHit is undefined";
    const suppressMultiConfigNotificationCfg: boolean | undefined = get("suppressMultiConfigNotification");
    if (suppressMultiConfigNotificationCfg === undefined)
      throw "suppressMultiConfigNotification is undefined";


    this.justMyCode = justMyCodeCfg;
    this.runParallel = runParallelCfg;
    this.importStrategy = importStrategyCfg;
    this.stepDefinitionSearchTimeout = Math.max(1, stepDefinitionSearchTimeoutCfg);
    this.activeEnvVarPreset = activeEnvVarPresetCfg;
    this.discoveryDepth = Math.max(0, Math.min(10, discoveryDepthCfg));
    this.discoveryStopOnFirstHit = discoveryStopOnFirstHitCfg;
    this.suppressMultiConfigNotification = suppressMultiConfigNotificationCfg;


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

    // Process featuresPath(s) - D-11 precedence ladder
    // Read optional plural config (D-12: no throw on undefined — VS Code returns undefined for undeclared keys)
    const featuresPathsCfg: string[] | undefined = get<string[] | undefined>("featuresPaths");

    let projectRelativeFeaturesPaths: string[];
    if (featuresPathsCfg && Array.isArray(featuresPathsCfg) && featuresPathsCfg.length > 0) {
      // Rung 1: plural non-empty
      // D-06..D-09: emit info log if singular also explicitly set at any scope
      if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig)) {
        logger.logInfo(
          "Both featuresPath and featuresPaths are set — using featuresPaths (plural). " +
          "The singular featuresPath value is ignored.",
          wkspUri
        );
      }
      projectRelativeFeaturesPaths = featuresPathsCfg
        .map(p => p.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim())
        .filter(p => p.length > 0);
      if (projectRelativeFeaturesPaths.length === 0) {
        // Plural was all-empty → fall to singular
        projectRelativeFeaturesPaths = [
          featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim() || "features"
        ];
      }
    } else if (hasExplicitSetting(wkspConfig, "featuresPath", legacyConfig) && featuresPathCfg && featuresPathCfg.trim() !== "") {
      // Rung 2: singular explicitly set (not just the package.json default)
      projectRelativeFeaturesPaths = [featuresPathCfg.replace(/^\\|^\//, "").replace(/\\$|\/$/, "").trim()];
    } else if (entry?.source === 'config-file' && entry.featuresUris.length > 0) {
      // Rung 3: config-file discovery paths (from behave.ini/setup.cfg/pyproject.toml)
      projectRelativeFeaturesPaths = entry.featuresUris.map(u =>
        path.relative(this.projectUri.fsPath, u.fsPath).replace(/\\/g, '/')
      );
    } else {
      // Rung 4: neither set, no config file → convention
      projectRelativeFeaturesPaths = ["features"];
    }

    // D-05 non-empty invariant (defense-in-depth)
    if (projectRelativeFeaturesPaths.length === 0) projectRelativeFeaturesPaths = ["features"];

    // vscode will not substitute a default if an empty string is specified in settings.json
    projectRelativeFeaturesPaths = projectRelativeFeaturesPaths.map(p => p || "features");

    // D-07 per-entry "." rejection
    for (const p of projectRelativeFeaturesPaths) {
      if (p === ".") {
        this._fatalErrors.push(`"." is not a valid "gs-behave-bdd.featuresPath" value. The features folder must be a subfolder.`);
      }
    }

    this.projectRelativeFeaturesPaths = projectRelativeFeaturesPaths;
    this.featuresUris = projectRelativeFeaturesPaths.map(p =>
      vscode.Uri.joinPath(this.projectUri, p)
    );

    // D-06 per-entry existence check
    for (const u of this.featuresUris) {
      if (!fs.existsSync(u.fsPath)) {
        this._fatalErrors.push(`features path ${u.fsPath} not found.`);
      }
    }

    // Compute workspace-relative features paths for file watchers etc.
    this.workspaceRelativeFeaturesPaths = projectRelativeFeaturesPaths.map(p =>
      this.workspaceRelativeProjectPath ? `${this.workspaceRelativeProjectPath}/${p}` : p
    );

    // stepsSearchUris: per-entry via existing helpers
    this.stepsSearchUris = this.featuresUris.map(featUri => {
      let stepsSearchUri = vscode.Uri.joinPath(featUri);
      if (!findSubdirectorySync(stepsSearchUri.fsPath, "steps")) {
        const stepsSearchFsPath = findHighestTargetParentDirectorySync(
          featUri.fsPath, this.projectUri.fsPath, "steps"
        );
        if (stepsSearchFsPath) {
          stepsSearchUri = vscode.Uri.file(stepsSearchFsPath);
        } else {
          logger.showWarn(`No "steps" folder found.`, this.uri);
        }
      }
      return stepsSearchUri;
    });

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
    const nonUserSettableWkspSettings = ["name", "uri", "id", "projectUri", "featuresUri", "stepsSearchUri",
      "workspaceRelativeFeaturesPath", "configFileUri",
      "featuresUris", "stepsSearchUris", "projectRelativeFeaturesPaths", "workspaceRelativeFeaturesPaths"];
    const rscSettingsDic: { [name: string]: string; } = {};
    let wkspEntries = Object.entries(this).sort();
    wkspEntries.push(["fullProjectPath", this.projectUri.fsPath]);
    wkspEntries.push(["fullFeaturesPaths", this.featuresUris.map(u => u.fsPath).join(", ")]);
    wkspEntries.push(["junitTempPath", config.extensionTempFilesUri.fsPath]);
    wkspEntries = wkspEntries.filter(([key]) => !key.startsWith("_") && !nonUserSettableWkspSettings.includes(key) && key !== "workspaceRelativeProjectPath" && key !== "projectRelativeFeaturesPath");
    wkspEntries.push(["projectPath", this.workspaceRelativeProjectPath || "(workspace root)"]);
    wkspEntries.push(["featuresPaths", this.projectRelativeFeaturesPaths.join(", ")]);
    wkspEntries.push(["discoverySource", this.discoverySource]);
    wkspEntries.push(["configFileUri", this.configFileUri?.fsPath ?? "(none)"]);
    wkspEntries = wkspEntries.sort();
    wkspEntries.forEach(([key, value]) => {
      rscSettingsDic[key] = value;
    });


    // output settings, and any warnings or errors for settings

    const wkspUris = getUrisOfWkspFoldersWithFeatures();
    if (wkspUris.length > 0 && this.uri === wkspUris[0])
      logger.logInfoAllWksps(`\ninstance settings:\n${JSON.stringify(winSettingsDic, null, 2)}`);

    // By default, only log the number of presets rather than their full contents (which may be sensitive).
    // The full contents can be re-enabled via the verboseLogging setting.
    if (!winSettings.verboseLogging) {
      const presetCount = Object.keys(this.envVarPresets).length;
      rscSettingsDic["envVarPresets"] = `${presetCount} preset${presetCount !== 1 ? "s" : ""} loaded`;
    }

    logger.logInfo(`\n${this.name} workspace settings:\n${JSON.stringify(rscSettingsDic, null, 2)}`, this.uri);

    if (this._fatalErrors.length > 0) {
      throw new WkspError(`\nFATAL error due to invalid workspace setting in workspace "${this.name}". Extension cannot continue. ` +
        `${this._fatalErrors.join("\n")}\n` +
        `NOTE: fatal errors may require you to restart vscode after correcting the problem.) `, this.uri);
    }
  }

}


