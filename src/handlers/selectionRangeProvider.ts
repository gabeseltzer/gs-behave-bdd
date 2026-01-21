import * as vscode from 'vscode';
import { DocumentSymbolProvider } from './documentSymbolProvider';

export class SelectionRangeProvider implements vscode.SelectionRangeProvider {

  provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): vscode.ProviderResult<vscode.SelectionRange[]> {

    const documentSymbolProvider = new DocumentSymbolProvider();
    const symbols = documentSymbolProvider.provideDocumentSymbols(document, token);

    if (!symbols) {
      return null;
    }

    const result: vscode.SelectionRange[] = [];

    for (const position of positions) {
      const ranges = this.getSelectionRanges(position, symbols);
      if (ranges) {
        result.push(ranges);
      }
    }

    return result;
  }

  private getSelectionRanges(position: vscode.Position, symbols: vscode.DocumentSymbol[]): vscode.SelectionRange | undefined {

    // find the deepest symbol that contains the position

    let currentSymbol: vscode.DocumentSymbol | undefined;

    const findSymbol = (nodes: vscode.DocumentSymbol[]) => {
      for (const node of nodes) {
        if (node.range.contains(position)) {
          currentSymbol = node;
          findSymbol(node.children);
          return;
        }
      }
    };

    findSymbol(symbols);

    if (!currentSymbol) {
      return undefined;
    }

    // build the selection range chain from bottom up
    // we already found the deepest node "currentSymbol", and we need to walk back up the tree? 
    // Actually, the previous recursive search didn't keep the stack. 
    // Let's redo the search to build the chain directly.

    return this.buildRangeChain(position, symbols);
  }

  private buildRangeChain(position: vscode.Position, symbols: vscode.DocumentSymbol[]): vscode.SelectionRange | undefined {

    for (const symbol of symbols) {
      if (symbol.range.contains(position)) {
        const parentRange = new vscode.SelectionRange(symbol.range);
        const childRange = this.buildRangeChain(position, symbol.children);

        if (childRange) {
          let last = childRange;
          while (last.parent) {
            last = last.parent;
          }
          last.parent = parentRange;
          return childRange;
        } else {
          if (symbol.selectionRange.contains(position) && !symbol.selectionRange.isEqual(symbol.range)) {
            const inner = new vscode.SelectionRange(symbol.selectionRange);
            inner.parent = parentRange;
            return inner;
          }

          return parentRange;
        }
      }
    }

    return undefined;
  }
}
