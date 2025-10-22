import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface LaunchConfig {
  name: string;
  type?: string;
  request?: string;
}

interface LaunchJson {
  version?: string;
  configurations?: LaunchConfig[];
}

export async function selectDebugLaunchConfigHandler(): Promise<void> {
  try {
    // Get the workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }

    // Determine which workspace to configure
    let targetWorkspace: vscode.WorkspaceFolder;
    if (workspaceFolders.length === 1) {
      targetWorkspace = workspaceFolders[0];
    } else {
      const selected = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Select workspace to configure debug launch config for"
      });
      if (!selected) {
        return; // User cancelled
      }
      targetWorkspace = selected;
    }

    // Read launch.json
    const launchJsonPath = path.join(targetWorkspace.uri.fsPath, ".vscode", "launch.json");
    let launchConfigs: LaunchConfig[] = [];

    if (fs.existsSync(launchJsonPath)) {
      try {
        const content = fs.readFileSync(launchJsonPath, "utf8");
        // Remove comments from JSON (VS Code launch.json supports comments)
        const jsonContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const launchJson: LaunchJson = JSON.parse(jsonContent);

        if (launchJson.configurations && Array.isArray(launchJson.configurations)) {
          launchConfigs = launchJson.configurations;
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to parse launch.json: ${error}`);
        return;
      }
    }

    // Build quick pick items
    interface ConfigQuickPickItem extends vscode.QuickPickItem {
      configName: string;
    }

    const items: ConfigQuickPickItem[] = [
      {
        label: "$(circle-slash) Use Default",
        description: "Use extension's built-in debug configuration",
        configName: "",
        detail: "Automatically configured by behave-vsc extension"
      }
    ];

    if (launchConfigs.length > 0) {
      items.push({
        label: "Available Launch Configurations",
        kind: vscode.QuickPickItemKind.Separator,
        configName: ""
      } as ConfigQuickPickItem);

      for (const config of launchConfigs) {
        const icon = config.type === "python" ? "$(symbol-method)" : "$(debug-alt)";
        items.push({
          label: `${icon} ${config.name}`,
          description: config.type ? `type: ${config.type}` : undefined,
          detail: config.request ? `request: ${config.request}` : undefined,
          configName: config.name
        });
      }
    } else {
      items.push({
        label: "No launch configurations found",
        description: "Create a launch.json file first",
        kind: vscode.QuickPickItemKind.Separator,
        configName: ""
      } as ConfigQuickPickItem);
    }

    // Show quick pick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a debug launch configuration for behave tests",
      title: "Debug Launch Configuration"
    });

    if (!selected) {
      return; // User cancelled
    }

    // Update the setting
    const config = vscode.workspace.getConfiguration("behave-vsc", targetWorkspace.uri);
    await config.update("debugLaunchConfig", selected.configName, vscode.ConfigurationTarget.WorkspaceFolder);

    if (selected.configName) {
      vscode.window.showInformationMessage(
        `Debug launch configuration set to: ${selected.configName}`
      );
    } else {
      vscode.window.showInformationMessage(
        "Using default debug configuration"
      );
    }

  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to select debug launch configuration: ${error}`
    );
  }
}
