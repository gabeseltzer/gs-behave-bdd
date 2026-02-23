// Mock implementation of VS Code API for unit tests
// This provides minimal implementations of VS Code APIs needed for testing

import * as path from 'path';

export class EventEmitter<T = unknown> {
  event: (listener: (e: T) => unknown) => { dispose: () => void } = () => ({ dispose: () => { /* mock */ } });
  fire() { /* mock */ }
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
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) { }
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
  clear() { /* mock */ }
  delete() { /* mock */ }
  dispose() { /* mock */ }
  forEach() { /* mock */ }
  get() { return []; }
  has() { return false; }
  set() { /* mock */ }
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
    readDirectory: () => Promise.resolve([])
  },
  getWorkspaceFolder: () => undefined,
  workspaceFolders: [],
  getConfiguration: (section?: string) => ({
    get: (key: string) => {
      // Return default values for known configuration keys
      if (section === 'behave-vsc' || !section) {
        if (key === 'multiRootRunWorkspacesInParallel') return false;
      }
      return undefined;
    },
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  }),
  asRelativePath: (pathOrUri: string | Uri) => {
    const pathStr = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
    return pathStr;
  },
  onDidChangeConfiguration: () => ({ dispose: () => { /* mock */ } }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => { /* mock */ } }),
  onDidSaveTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidOpenTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidCloseTextDocument: () => ({ dispose: () => { /* mock */ } })
};

export const languages = {
  createDiagnosticCollection: () => new DiagnosticCollection(),
  registerCompletionItemProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDefinitionProvider: () => ({ dispose: () => { /* mock */ } }),
  registerHoverProvider: () => ({ dispose: () => { /* mock */ } }),
  registerDocumentSymbolProvider: () => ({ dispose: () => { /* mock */ } }),
  registerReferenceProvider: () => ({ dispose: () => { /* mock */ } })
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
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) { }

  public source?: string;
  public code?: string | number;
}