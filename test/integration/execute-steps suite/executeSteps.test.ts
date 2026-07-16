// Integration tests for execute_steps IDE support: diagnostics, go-to-definition,
// references, and CodeLens counts for context.execute_steps("...") strings in .py files.

import * as vscode from 'vscode';
import * as assert from 'assert';
import { TestSupport } from '../../../src/extension';

let testSupport: TestSupport;

function getWorkspaceUri(): vscode.Uri {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  assert.ok(workspaceFolders, 'workspace folders should exist');
  return workspaceFolders[0].uri;
}

async function ensureExtensionReady(): Promise<void> {
  const extension = vscode.extensions.getExtension('gabeseltzer.gs-behave-bdd');
  if (!extension) {
    throw new Error('Behave BDD extension not found');
  }
  testSupport = await extension.activate() as TestSupport;
  testSupport.config.integrationTestRun = true;
}

function getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
  const diags = testSupport.config.diagnostics.get(uri);
  return diags ? Array.from(diags) : [];
}

async function waitForCondition(condition: () => boolean, timeoutMs = 10000, checkIntervalMs = 100): Promise<void> {
  const startTime = Date.now();
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
}

// finds the (first) document line containing the given text
function findLine(document: vscode.TextDocument, text: string): number {
  for (let i = 0; i < document.lineCount; i++) {
    if (document.lineAt(i).text.includes(text))
      return i;
  }
  return -1;
}

suite('execute_steps IDE support', () => {

  suiteSetup(async function () {
    this.timeout(60000);
    await ensureExtensionReady();
    await testSupport.parser.stepsParseComplete(20000, "executeSteps-suiteSetup");
  });

  test('diagnostics: undefined step is a Warning, invalid content is an Error, dynamic strings are silent', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri();
    const edgeCasesUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'edge_cases.py');

    const document = await vscode.workspace.openTextDocument(edgeCasesUri);
    await vscode.window.showTextDocument(document);

    // opening the .py file triggers validateExecuteSteps
    await waitForCondition(() => getDiagnosticsForUri(edgeCasesUri).length >= 3, 15000);
    const diags = getDiagnosticsForUri(edgeCasesUri);

    // 1 Warning: the undefined embedded step
    const warnings = diags.filter(d => d.code === 'execute-steps-step-not-found');
    assert.strictEqual(warnings.length, 1, `expected 1 step-not-found warning, got: ${JSON.stringify(diags.map(d => ({ code: d.code, line: d.range.start.line, msg: d.message })))}`);
    const undefinedLine = findLine(document, 'Given this step does not exist anywhere');
    assert.strictEqual(warnings[0].range.start.line, undefinedLine, 'warning must be on the undefined embedded step line');
    assert.strictEqual(warnings[0].severity, vscode.DiagnosticSeverity.Warning);
    // range must cover the trimmed step text, not the whole line
    const lineText = document.lineAt(undefinedLine).text;
    assert.strictEqual(warnings[0].range.start.character, lineText.indexOf('Given'), 'warning range must start at the step text');

    // 2 Errors: the Scenario: line and the leading And line
    const errors = diags.filter(d => d.code === 'execute-steps-invalid-content');
    assert.strictEqual(errors.length, 2, `expected 2 invalid-content errors, got: ${JSON.stringify(errors.map(d => d.range.start.line))}`);
    const errorLines = errors.map(d => d.range.start.line).sort((a, b) => a - b);
    const scenarioLine = findLine(document, 'Scenario: not valid inside execute_steps');
    const leadingAndLine = findLine(document, 'And a leading and-step always raises a ParserError');
    assert.deepStrictEqual(errorLines, [scenarioLine, leadingAndLine].sort((a, b) => a - b));
    assert.ok(errors.every(d => d.severity === vscode.DiagnosticSeverity.Error));

    // dynamic strings are silent: no diagnostics on the format-placeholder or f-string lines
    const formatLine = findLine(document, 'Given a machine named {name}');
    const fstringSection = findLine(document, 'def step_f_string');
    assert.ok(diags.every(d => d.range.start.line !== formatLine), 'placeholder line of a .format literal must have no diagnostics');
    assert.ok(diags.every(d => d.range.start.line < fstringSection), 'f-string content must have no diagnostics');
  });

  test('go-to-definition: F12 from an embedded step jumps to the step definition function', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri();
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'steps.py');

    const document = await vscode.workspace.openTextDocument(stepsUri);
    await vscode.window.showTextDocument(document);

    const embeddedStepLine = findLine(document, 'Given the machine is primed');
    assert.notStrictEqual(embeddedStepLine, -1);
    const embeddedStepCol = document.lineAt(embeddedStepLine).text.indexOf('Given') + 2;

    const results = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider', stepsUri, new vscode.Position(embeddedStepLine, embeddedStepCol));

    assert.ok(results && results.length >= 1, 'expected at least one definition result');
    const defFunctionLine = findLine(document, 'def step_machine_primed');
    const hit = results.some(r => {
      const targetUri = 'targetUri' in r ? r.targetUri : r.uri;
      const targetRange = 'targetRange' in r ? r.targetRange : r.range;
      return targetUri.path === stepsUri.path && targetRange.start.line === defFunctionLine;
    });
    assert.ok(hit, `expected a definition targeting the step function line ${defFunctionLine}`);

    // clicking OUTSIDE the embedded step text (the def line itself) must contribute nothing from our provider
    const offTargetResults = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider', stepsUri, new vscode.Position(defFunctionLine, 0));
    const offTargetHits = (offTargetResults ?? []).filter(r => {
      const targetRange = 'targetRange' in r ? r.targetRange : r.range;
      return targetRange.start.line === defFunctionLine && 'originSelectionRange' in r && r.originSelectionRange;
    });
    assert.strictEqual(offTargetHits.length, 0, 'provider must not contribute for positions outside embedded step text');
  });

  test('references: execute_steps call sites appear in Find All References from the step definition', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri();
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'steps.py');
    const edgeCasesUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'edge_cases.py');

    const document = await vscode.workspace.openTextDocument(stepsUri);
    await vscode.window.showTextDocument(document);

    const defFunctionLine = findLine(document, 'def step_machine_primed');
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider', stepsUri, new vscode.Position(defFunctionLine, 4));

    assert.ok(references && references.length >= 2, `expected at least 2 references, got ${references?.length}`);

    const embeddedInSteps = findLine(document, 'Given the machine is primed');
    assert.ok(
      references.some(r => r.uri.path === stepsUri.path && r.range.start.line === embeddedInSteps),
      'references must include the execute_steps call site in steps.py');
    assert.ok(
      references.some(r => r.uri.path === edgeCasesUri.path),
      'references must include execute_steps call sites in edge_cases.py');
  });

  test('CodeLens: reference count includes execute_steps call sites', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri();
    const stepsUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'steps.py');

    const document = await vscode.workspace.openTextDocument(stepsUri);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider', stepsUri, 20);

    assert.ok(lenses && lenses.length > 0, 'expected CodeLenses on the steps file');

    // "the machine is primed" is never used by a feature file, only by execute_steps call
    // sites (steps.py compound step + 3 statically-scannable calls in edge_cases.py)
    const decoratorLine = findLine(document, '@given("the machine is primed")');
    const primedLens = lenses.find(l => l.range.start.line === decoratorLine && l.command?.title.match(/\d+ reference/));
    assert.ok(primedLens, `expected a references CodeLens on the decorator line ${decoratorLine}`);
    const count = parseInt(primedLens.command?.title.match(/(\d+) reference/)?.[1] ?? '0', 10);
    assert.ok(count >= 3, `expected at least 3 references from execute_steps call sites, got ${count} ("${primedLens.command?.title}")`);
  });

  test('live edit: fixing an undefined embedded step clears its Warning before the debounce', async function () {
    this.timeout(60000);

    const wkspUri = getWorkspaceUri();
    const edgeCasesUri = vscode.Uri.joinPath(wkspUri, 'features', 'steps', 'edge_cases.py');

    const document = await vscode.workspace.openTextDocument(edgeCasesUri);
    const editor = await vscode.window.showTextDocument(document);

    await waitForCondition(
      () => getDiagnosticsForUri(edgeCasesUri).some(d => d.code === 'execute-steps-step-not-found'), 15000);

    const undefinedLine = findLine(document, 'Given this step does not exist anywhere');
    const lineText = document.lineAt(undefinedLine).text;
    const start = lineText.indexOf('this step does not exist anywhere');

    try {
      // replace the undefined step text with one that matches an existing step definition
      await editor.edit(edit => {
        edit.replace(
          new vscode.Range(undefinedLine, start, undefinedLine, lineText.length),
          'the machine is primed');
      });

      // diagnostics scan the live document text, so the warning should clear promptly
      // (well within the 500ms python reparse debounce + validation turnaround)
      await waitForCondition(
        () => !getDiagnosticsForUri(edgeCasesUri).some(d => d.code === 'execute-steps-step-not-found'), 10000);

      // and typing the mistake back re-introduces it
      await editor.edit(edit => {
        edit.replace(
          new vscode.Range(undefinedLine, start, undefinedLine, start + 'the machine is primed'.length),
          'this step does not exist anywhere');
      });
      await waitForCondition(
        () => getDiagnosticsForUri(edgeCasesUri).some(d => d.code === 'execute-steps-step-not-found'), 10000);
    }
    finally {
      // restore the document to its on-disk state
      await vscode.commands.executeCommand('workbench.action.files.revert');
    }
  });
});
