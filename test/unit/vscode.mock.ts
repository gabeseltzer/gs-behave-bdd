// Mock implementation of VS Code API for unit tests
// This provides minimal implementations of VS Code APIs needed for testing

import * as path from 'path';

export class EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any = () => ({ dispose: () => { /* mock */ } });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  fire(_event: any) { /* mock */ }
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  delete(_uri: Uri) { /* mock */ }
  dispose() { /* mock */ }
  forEach() { /* mock */ }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  get(_uri: Uri) { return []; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  has(_uri: Uri) { return false; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  set(_uri: Uri, _diagnostics: any) { /* mock */ }
}

export class TreeItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(public label: string, public collapsibleState?: any) { }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
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
  getConfiguration: () => ({
    get: () => undefined,
    has: () => false,
    inspect: () => undefined,
    update: () => Promise.resolve()
  }),
  onDidChangeConfiguration: () => ({ dispose: () => { /* mock */ } }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => { /* mock */ } }),
  onDidSaveTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidOpenTextDocument: () => ({ dispose: () => { /* mock */ } }),
  onDidCloseTextDocument: () => ({ dispose: () => { /* mock */ } })
};

export const languages = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDiagnosticCollection: (_name?: string) => new DiagnosticCollection(),
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
    reveal: () => Promise.resolve()
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