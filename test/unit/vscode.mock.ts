// Mock implementation of VS Code API for unit tests
// This provides minimal implementations of VS Code APIs needed for testing

import * as path from 'path';

export class EventEmitter<T = unknown> {
  event: (listener: (e: T) => unknown) => { dispose: () => void } = () => ({ dispose: () => { /* mock */ } });
  fire(_event: T) { /* mock */ }
  dispose() { /* mock */ }
}

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { /* mock */ } }) };
  cancel() { /* mock */ }
  dispose() { /* mock */ }
}

export class Uri {
  public scheme: string;
  public fsPath: string;
  public path: string;

  private constructor(scheme: string, fsPath: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath.replace(/\\/g, '/');
  }

  static file(fsPath: string): Uri {
    return new Uri('file', fsPath);
  }

  static parse(value: string): Uri {
    // Extract scheme from URI
    const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*):\/\//);
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : 'file';

    // Strip file:// or file:/// prefix and decode to a plain path
    const stripped = value.replace(/^file:\/\/\/?/i, '');
    // On Windows the path starts with a drive letter, e.g. /c:/foo -> c:/foo
    const fsPath = stripped.startsWith('/') && /^\/[a-zA-Z]:/.test(stripped)
      ? stripped.slice(1)
      : stripped;
    const uri = new Uri(scheme, fsPath);
    uri.scheme = scheme;
    return uri;
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = path.join(base.fsPath, ...pathSegments);
    return Uri.file(joined);
  }

  toString(): string {
    // Normalize path for consistent comparison
    // Windows: C:\path -> file:///c:/path
    // Unix: /path -> file:///path
    let normalized = this.fsPath.replace(/\\/g, '/');

    // Handle Windows drive letters
    if (/^[a-zA-Z]:/.test(normalized)) {
      // c:/path -> /c:/path
      normalized = '/' + normalized;
    }

    return 'file://' + normalized.toLowerCase();
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(startOrLine: Position | number, endOrChar: Position | number, endLine?: number, endChar?: number) {
    if (typeof startOrLine === 'number') {
      this.start = new Position(startOrLine, endOrChar as number);
      this.end = new Position(endLine ?? 0, endChar ?? 0);
    } else {
      this.start = startOrLine as Position;
      this.end = endOrChar as Position;
    }
  }
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) { }
}

export class Selection {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) { }
}

export class DiagnosticCollection {
  // 260513-oh5: keep the original Uri object so consumers iterating via
  // forEach get a real Uri (not just the string key). Map keys remain strings
  // for set/get/delete lookup parity with VS Code's behavior.
  private diagnostics = new Map<string, { uri: Uri; diags: Diagnostic[] }>();

  clear() { this.diagnostics.clear(); }
  delete(uri: Uri) { this.diagnostics.delete(uri.toString()); }
  dispose() { this.diagnostics.clear(); }
  forEach(callback: (uri: Uri, diagnostics: readonly Diagnostic[]) => void): void {
    for (const { uri, diags } of this.diagnostics.values()) {
      callback(uri, diags);
    }
  }
  get(uri: Uri): Diagnostic[] { return this.diagnostics.get(uri.toString())?.diags ?? []; }
  has(uri: Uri): boolean { return this.diagnostics.has(uri.toString()); }
  set(uri: Uri, diagnostics: Diagnostic[] | undefined) {
    if (diagnostics === undefined || diagnostics.length === 0) {
      this.diagnostics.delete(uri.toString());
    } else {
      this.diagnostics.set(uri.toString(), { uri, diags: diagnostics });
    }
  }
}

export class TreeItem {
  constructor(public label: string, public collapsibleState?: TreeItemCollapsibleState) { }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class SemanticTokensLegend {
  constructor(public tokenTypes: string[], public tokenModifiers: string[] = []) { }
}

export class RelativePattern {
  constructor(public base: Uri | string, public pattern: string) { }
}

export const workspace = {
  fs: {
    readFile: () => Promise.resolve(Buffer.from('')),
    writeFile: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    readDirectory: () => Promise.resolve([]),
    stat: () => Promise.reject(new Error('File not found'))
  },
  getWorkspaceFolder: (uri: Uri) => ({ uri, name: 'mock-workspace', index: 0 }),
  workspaceFolders: [],
  // Phase 19 Plan 03: recheckCommand inspects workspaceFile to know whether
  // Workspace scope is writeable (D-07). Stubs may overwrite this via Sinon
  // to simulate a .code-workspace being open.
  workspaceFile: undefined as Uri | undefined,
  getConfiguration: (section?: string) => ({
    get: (key: string, defaultValue?: unknown) => {
      // Return default values for known configuration keys
      if (section === 'gs-behave-bdd' || !section) {
        if (key === 'multiRootRunWorkspacesInParallel') return false;
      }
      if (key === 'xRay') {
        return false;
      }
      if (key === 'verboseLogging') {
        return false;
      }
      if (key === 'importStrategy') {
        return 'useBundled';
      }
      if (key === 'stepDefinitionSearchTimeout') {
        return 10;
      }
      if (key === 'discoveryDepth') {
        return 3;
      }
      if (key === 'discoveryStopOnFirstHit') {
        return false;
      }
      return defaultValue;
    },
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  }),
  asRelativePath: (pathOrUri: string | Uri): string => {
    if (typeof pathOrUri === 'string') return pathOrUri;
    return pathOrUri.fsPath || pathOrUri.path || String(pathOrUri);
  },
  // 260514-djs: summary-toast "Open Settings" path calls openTextDocument(uri)
  // then window.showTextDocument(doc, { selection }). Tests stub these per-case.
  openTextDocument: (uri: Uri): Promise<{ uri: Uri }> => Promise.resolve({ uri }),
  onDidChangeConfiguration: () => ({ dispose: () => { /* mock */ } }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => { /* mock */ } }),
  onDidSaveTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidOpenTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidCloseTextDocument: () => ({ dispose: () => { /* mock */ } }),
  createFileSystemWatcher: (_pattern: unknown): unknown => ({
    onDidCreate: () => ({ dispose: () => { /* mock */ } }),
    onDidChange: () => ({ dispose: () => { /* mock */ } }),
    onDidDelete: () => ({ dispose: () => { /* mock */ } }),
    dispose: () => { /* mock */ },
  }),
};

export const languages = {
  createDiagnosticCollection: (_name?: string) => new DiagnosticCollection(),
  registerCompletionItemProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDefinitionProvider: () => ({ dispose: () => { /* mock */ } }),
  registerHoverProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDocumentSymbolProvider: () => ({ dispose: () => { /* mock */ } }),
  registerReferenceProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDocumentSemanticTokensProvider: (_selector: unknown, _provider: unknown, _legend: unknown) => ({ dispose: () => { /* mock */ } }),
  registerCodeLensProvider: (_selector: unknown, _provider: unknown) => ({ dispose: () => { /* mock */ } }),
  registerCodeActionsProvider: (_selector: unknown, _provider: unknown, _meta?: unknown) => ({ dispose: () => { /* mock */ } }),
};

// 260513-oh5: CodeAction surface used by MigrationCodeActionProvider.
export class CodeAction {
  public diagnostics?: Diagnostic[];
  public command?: { command: string; title: string; arguments?: unknown[] };
  constructor(public title: string, public readonly kind?: CodeActionKind) { }
}

export class CodeActionKind {
  static readonly QuickFix = new CodeActionKind('quickfix');
  constructor(public readonly value: string) { }
}

export const window = {
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  createOutputChannel: () => ({
    append: () => { /* mock */ },
    appendLine: () => { /* mock */ },
    clear: () => { /* mock */ },
    show: () => { /* mock */ },
    hide: () => { /* mock */ },
    dispose: () => { /* mock */ }
  }),
  createTreeView: () => ({
    dispose: () => { /* mock */ },
    reveal: () => Promise.resolve(),
    onDidChangeVisibility: () => ({ dispose: () => { /* mock */ } })
  }),
  registerTreeDataProvider: () => ({ dispose: () => { /* mock */ } }),
  // Phase 19 Plan 03: recheckCommand uses showQuickPick for the scope picker
  // (D-06). Default returns undefined (user dismissed); stubs override via Sinon.
  showQuickPick: (_items?: unknown, _options?: unknown): Promise<unknown> => Promise.resolve(undefined),
  // 260514-djs: paired with workspace.openTextDocument for the "Open Settings"
  // summary-toast action. Returns a stub editor; tests stub for assertions.
  showTextDocument: (_doc: unknown, _options?: unknown): Promise<unknown> => Promise.resolve({}),
};

export const debug = {
  startDebugging: async (_folder: unknown, _config: unknown): Promise<boolean> => true,
  stopDebugging: async (): Promise<void> => { /* mock */ },
  onDidStartDebugSession: (listener: (session: { id: string; name: string }) => void): { dispose: () => void } => {
    // Immediately invoke to simulate session start (must fire before terminate)
    setTimeout(() => listener({ id: 'mock-session-1', name: 'gs-behave-bdd-debug' }), 0);
    return { dispose: () => { /* mock */ } };
  },
  onDidTerminateDebugSession: (listener: (session: { id: string }) => void): { dispose: () => void } => {
    // Immediately invoke to simulate session termination
    setTimeout(() => listener({ id: 'mock-session-1' }), 0);
    return { dispose: () => { /* mock */ } };
  }
};

export const commands = {
  executeCommand: (..._args: unknown[]) => Promise.resolve(undefined),
  registerCommand: () => ({ dispose: () => { /* mock */ } })
};

// 260514-djs: diagnostics.ts userDataFolderName() reads vscode.env.appName to
// pick the right user-data folder for Global-scope anchors. Default to stable
// VS Code; tests stub appName to exercise Insiders / VSCodium variants.
export const env = {
  appName: 'Visual Studio Code',
};

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export class Diagnostic {
  public code?: string | number;
  public source?: string;
  public relatedInformation?: DiagnosticRelatedInformation[];
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) { }
}

export class DiagnosticRelatedInformation {
  constructor(
    public readonly location: Location,
    public readonly message: string
  ) { }
}

export class Location {
  constructor(
    public readonly uri: Uri,
    public readonly range: Range
  ) { }
}

export class TestMessage {
  public location?: Location;
  constructor(public readonly message: string) { }
}

export class SemanticTokens {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(public readonly data: Uint32Array) { }
}

export class SemanticTokensBuilder {
  push(..._args: unknown[]) { /* mock */ }
  build() { return new SemanticTokens(new Uint32Array(0)); }
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: unknown) { }
}

export class CodeLens {
  public command?: { title: string; command: string; arguments?: unknown[] };
  constructor(
    public readonly range: Range,
    command?: { title: string; command: string; arguments?: unknown[] }
  ) {
    this.command = command;
  }
}
