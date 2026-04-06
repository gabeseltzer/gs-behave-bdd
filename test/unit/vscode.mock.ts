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
  private diagnostics = new Map<string, Diagnostic[]>();

  clear() { this.diagnostics.clear(); }
  delete(uri: Uri) { this.diagnostics.delete(uri.toString()); }
  dispose() { this.diagnostics.clear(); }
  forEach() { /* mock */ }
  get(uri: Uri): Diagnostic[] { return this.diagnostics.get(uri.toString()) || []; }
  has(uri: Uri): boolean { return this.diagnostics.has(uri.toString()); }
  set(uri: Uri, diagnostics: Diagnostic[] | undefined) {
    if (diagnostics === undefined || diagnostics.length === 0) {
      this.diagnostics.delete(uri.toString());
    } else {
      this.diagnostics.set(uri.toString(), diagnostics);
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
  getConfiguration: (section?: string) => ({
    get: (key: string) => {
      // Return default values for known configuration keys
      if (section === 'gs-behave-bdd' || !section) {
        if (key === 'multiRootRunWorkspacesInParallel') return false;
      }
      if (key === 'xRay') {
        return false;
      }
      if (key === 'importStrategy') {
        return 'useBundled';
      }
      return undefined;
    },
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  }),
  asRelativePath: (pathOrUri: string | Uri): string => {
    if (typeof pathOrUri === 'string') return pathOrUri;
    return pathOrUri.fsPath || pathOrUri.path || String(pathOrUri);
  },
  onDidChangeConfiguration: () => ({ dispose: () => { /* mock */ } }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => { /* mock */ } }),
  onDidSaveTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidOpenTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidCloseTextDocument: () => ({ dispose: () => { /* mock */ } }),
};

export const languages = {
  createDiagnosticCollection: (_name?: string) => new DiagnosticCollection(),
  registerCompletionItemProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDefinitionProvider: () => ({ dispose: () => { /* mock */ } }),
  registerHoverProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDocumentSymbolProvider: () => ({ dispose: () => { /* mock */ } }),
  registerReferenceProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDocumentSemanticTokensProvider: (_selector: unknown, _provider: unknown, _legend: unknown) => ({ dispose: () => { /* mock */ } })
};

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
  registerTreeDataProvider: () => ({ dispose: () => { /* mock */ } })
};

export const debug = {
  startDebugging: async (_folder: unknown, _config: unknown): Promise<boolean> => true,
  stopDebugging: async (): Promise<void> => { /* mock */ },
  onDidTerminateDebugSession: (listener: () => void): { dispose: () => void } => {
    // Immediately invoke to simulate session termination
    setTimeout(listener, 0);
    return { dispose: () => { /* mock */ } };
  }
};

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
  registerCommand: () => ({ dispose: () => { /* mock */ } })
};

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
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

export class SemanticTokens {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(public readonly data: Uint32Array) { }
}

export class SemanticTokensBuilder {
  push(..._args: unknown[]) { /* mock */ }
  build() { return new SemanticTokens(new Uint32Array(0)); }
}
