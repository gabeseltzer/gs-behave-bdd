// Unit tests for the feature-file "create step definition" quick-fix: target ranking, the
// lightbulb actions, step context detection and the picker/insert command. The parser
// caches, workspace settings and vscode document/window APIs are stubbed.
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import {
  CREATE_STEP_DEFINITION_COMMAND, StepDefinitionCodeActionProvider, createStepDefinitionHandler,
  getStepDefinitionSource, initStepDefinitionTargetMemory, rankStepsFiles, validateNewStepsFileName,
} from '../../../src/handlers/stepDefinitionCodeActionProvider';
import { STEP_NOT_FOUND } from '../../../src/handlers/stepDiagnostics';
import * as common from '../../../src/common';
import * as featureParser from '../../../src/parsers/featureParser';
import { FeatureFileStep } from '../../../src/parsers/featureParser';
import * as stepsParser from '../../../src/parsers/stepsParser';
import { StepFileStep } from '../../../src/parsers/stepsParser';
import * as stepMappings from '../../../src/parsers/stepMappings';

suite('stepDefinitionCodeActionProvider', () => {
  let sandbox: sinon.SinonSandbox;
  const provider = new StepDefinitionCodeActionProvider();

  const wkspUri = vscode.Uri.file('/test');
  const featuresUri = vscode.Uri.file('/test/features');
  const featureUri = vscode.Uri.file('/test/features/login.feature');
  const authStepsUri = vscode.Uri.file('/test/features/steps/auth_steps.py');
  const commonStepsUri = vscode.Uri.file('/test/features/steps/common_steps.py');
  const emptyStepsUri = vscode.Uri.file('/test/features/steps/empty_steps.py');

  const featureContent = [
    'Feature: Login',            // 0
    '  Scenario: ok',            // 1
    '    Given a known user',    // 2  defined in auth_steps.py
    '    When the user logs in', // 3  undefined
    '      | name | pw |',       // 4
    '  Scenario Outline: many',  // 5
    '    Then <user> sees "<page>"', // 6 undefined
    '    Examples:',             // 7
  ].join('\n');

  function mockDocument(uri: vscode.Uri, content: string): vscode.TextDocument {
    const lines = content.split('\n');
    return {
      uri,
      lineCount: lines.length,
      getText: () => content,
      lineAt: (line: number) => ({ text: lines[line], range: new vscode.Range(line, 0, line, lines[line].length) }),
      positionAt: (offset: number) => {
        const before = content.slice(0, offset).split('\n');
        return new vscode.Position(before.length - 1, before[before.length - 1].length);
      },
    } as unknown as vscode.TextDocument;
  }

  function featureStep(line: number, text: string, stepType: string): [string, FeatureFileStep] {
    const textWithoutType = text.trim().replace(/^\S+\s+/, '');
    const key = `${featureUri.path}:${line}`;
    return [key, new FeatureFileStep(key, featureUri, 'login.feature', new vscode.Range(line, 4, line, 4 + text.trim().length),
      text.trim(), textWithoutType, stepType)];
  }

  function memento(initial: Record<string, unknown> = {}): vscode.Memento {
    const store = { ...initial };
    return {
      get: (key: string) => store[key],
      update: (key: string, value: unknown) => { store[key] = value; return Promise.resolve(); },
      keys: () => Object.keys(store),
    } as unknown as vscode.Memento;
  }

  setup(() => {
    sandbox = sinon.createSandbox();
    initStepDefinitionTargetMemory(memento());
  });
  teardown(() => sandbox.restore());

  function setupWorkspace(opts: { stepFiles?: boolean } = {}) {
    sandbox.stub(common, 'getWorkspaceSettingsForFile').returns({
      uri: wkspUri, featuresUri, featuresUris: [featuresUri], stepsSearchUri: featuresUri, stepsSearchUris: [featuresUri],
    } as unknown as ReturnType<typeof common.getWorkspaceSettingsForFile>);

    const hasFiles = opts.stepFiles ?? true;
    const authDef = new StepFileStep('a1', authStepsUri, 'auth_steps.py', 'given', 'a known user');
    sandbox.stub(stepsParser, 'getStepFileSteps').returns(hasFiles ? [
      ['a1', authDef],
      ['c1', new StepFileStep('c1', commonStepsUri, 'common_steps.py', 'given', 'x')],
      ['c2', new StepFileStep('c2', commonStepsUri, 'common_steps.py', 'when', 'y')],
    ] : []);
    sandbox.stub(vscode.workspace, 'findFiles').resolves(hasFiles ? [authStepsUri, commonStepsUri, emptyStepsUri] : []);
    sandbox.stub(featureParser, 'getFeatureFileSteps').returns([
      featureStep(2, 'Given a known user', 'given'),
      featureStep(3, 'When the user logs in', 'when'),
      featureStep(6, 'Then <user> sees "<page>"', 'then'),
    ]);
    sandbox.stub(stepMappings, 'getStepFileStepForFeatureFileStep').callsFake((_uri, line) => line === 2 ? authDef : undefined);
  }

  function notFoundDiagnostic(line: number): vscode.Diagnostic {
    const diag = new vscode.Diagnostic(new vscode.Range(line, 4, line, 20), 'No step definition found', vscode.DiagnosticSeverity.Warning);
    diag.code = STEP_NOT_FOUND;
    return diag;
  }

  function context(diags: vscode.Diagnostic[]): vscode.CodeActionContext {
    return { diagnostics: diags } as unknown as vscode.CodeActionContext;
  }


  suite('rankStepsFiles', () => {
    const a = vscode.Uri.file('/s/steps/a.py');
    const b = vscode.Uri.file('/s/steps/b.py');
    const c = vscode.Uri.file('/s/steps/c.py');
    const d = vscode.Uri.file('/s/steps/d.py');

    test('orders recent, then related, then the rest, each by definition count', () => {
      const counts = new Map([[common.uriId(a), 1], [common.uriId(b), 9], [common.uriId(c), 5], [common.uriId(d), 2]]);
      const ranked = rankStepsFiles([a, b, c, d], counts, new Set([common.uriId(c), common.uriId(d)]), common.uriId(a));
      assert.deepStrictEqual(ranked.map(r => [r.uri.path, r.group]), [
        ['/s/steps/a.py', 'recent'],
        ['/s/steps/c.py', 'related'],
        ['/s/steps/d.py', 'related'],
        ['/s/steps/b.py', 'other'],
      ]);
    });

    test('breaks ties by path', () => {
      const ranked = rankStepsFiles([c, a, b], new Map(), new Set(), undefined);
      assert.deepStrictEqual(ranked.map(r => r.uri.path), ['/s/steps/a.py', '/s/steps/b.py', '/s/steps/c.py']);
    });
  });


  suite('provideCodeActions', () => {
    test('offers the best-ranked file as the preferred fix, plus a picker', async () => {
      setupWorkspace();
      const diag = notFoundDiagnostic(3);
      const actions = await provider.provideCodeActions(mockDocument(featureUri, featureContent), diag.range, context([diag]));

      assert.ok(actions && actions.length === 2);
      // auth_steps.py defines another step of this feature, so it outranks the bigger common_steps.py
      assert.ok(actions[0].title.startsWith('Create step definition in ') && actions[0].title.endsWith('auth_steps.py'), actions[0].title);
      assert.strictEqual(actions[0].isPreferred, true);
      assert.deepStrictEqual(actions[0].diagnostics, [diag]);
      assert.strictEqual(actions[0].command?.command, CREATE_STEP_DEFINITION_COMMAND);
      assert.deepStrictEqual(actions[0].command?.arguments, [featureUri, 3, authStepsUri]);

      assert.strictEqual(actions[1].title, 'Create step definition in…');
      assert.notStrictEqual(actions[1].isPreferred, true);
      assert.deepStrictEqual(actions[1].command?.arguments, [featureUri, 3]);
    });

    test('prefers the last file the user picked', async () => {
      initStepDefinitionTargetMemory(memento({ [`gs-behave-bdd.lastStepDefinitionTarget:${wkspUri.toString()}`]: emptyStepsUri.toString() }));
      setupWorkspace();
      const diag = notFoundDiagnostic(3);
      const actions = await provider.provideCodeActions(mockDocument(featureUri, featureContent), diag.range, context([diag]));
      assert.deepStrictEqual(actions?.[0].command?.arguments, [featureUri, 3, emptyStepsUri]);
    });

    test('offers only a new-file fix when there are no steps files', async () => {
      setupWorkspace({ stepFiles: false });
      const diag = notFoundDiagnostic(3);
      const actions = await provider.provideCodeActions(mockDocument(featureUri, featureContent), diag.range, context([diag]));
      assert.ok(actions && actions.length === 1);
      assert.strictEqual(actions[0].title, 'Create step definition in a new steps file…');
    });

    test('offers nothing for other diagnostics', async () => {
      setupWorkspace();
      const other = new vscode.Diagnostic(new vscode.Range(3, 0, 3, 5), 'other', vscode.DiagnosticSeverity.Warning);
      other.code = 'duplicate-scenario';
      const actions = await provider.provideCodeActions(mockDocument(featureUri, featureContent), other.range, context([other]));
      assert.strictEqual(actions, undefined);
    });
  });


  suite('getStepDefinitionSource', () => {
    test('detects a data table and a non-outline scenario', () => {
      const [, step] = featureStep(3, 'When the user logs in', 'when');
      const source = getStepDefinitionSource(mockDocument(featureUri, featureContent), step);
      assert.deepStrictEqual(source, {
        stepType: 'when', stepText: 'When the user logs in', textWithoutType: 'the user logs in',
        inOutline: false, hasTable: true, hasDocString: false,
      });
    });

    test('detects an outline step', () => {
      const [, step] = featureStep(6, 'Then <user> sees "<page>"', 'then');
      const source = getStepDefinitionSource(mockDocument(featureUri, featureContent), step);
      assert.strictEqual(source.inOutline, true);
      assert.strictEqual(source.hasTable, false);
    });

    test('detects a doc string', () => {
      const content = 'Feature: f\n  Scenario: s\n    Given a body\n\n      """\n      hi\n      """\n';
      const [, step] = featureStep(2, 'Given a body', 'given');
      const source = getStepDefinitionSource(mockDocument(featureUri, content), step);
      assert.strictEqual(source.hasDocString, true);
    });
  });


  suite('createStepDefinitionHandler', () => {
    const authStepsContent = 'from behave import given\n\n\n@given("a known user")\ndef step_impl(context):\n    pass\n';

    function stubDocuments(extra: Record<string, string> = {}) {
      const contents: Record<string, string> = { [featureUri.toString()]: featureContent, [authStepsUri.toString()]: authStepsContent, ...extra };
      sandbox.stub(vscode.workspace, 'openTextDocument').callsFake(((uri: vscode.Uri) =>
        Promise.resolve(mockDocument(uri, contents[uri.toString()] ?? ''))) as never);
      const editor = { selection: undefined as vscode.Selection | undefined, revealRange: sandbox.spy() };
      sandbox.stub(vscode.window, 'showTextDocument').resolves(editor as never);
      return editor;
    }

    test('appends the stub to the given target and fixes up the import', async () => {
      setupWorkspace();
      stubDocuments();
      const applyEdit = sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);

      await createStepDefinitionHandler(featureUri, 3, authStepsUri);

      assert.ok(applyEdit.calledOnce);
      const edit = applyEdit.firstCall.args[0] as unknown as {
        inserts: { uri: vscode.Uri; newText: string }[]; replaces: { range: vscode.Range; newText: string }[];
      };
      assert.deepStrictEqual(edit.replaces.map(r => [r.range.start.line, r.newText]), [[0, 'from behave import given, when']]);
      assert.strictEqual(edit.inserts.length, 1);
      assert.strictEqual(edit.inserts[0].newText,
        '\n\n@when("the user logs in")\ndef step_impl(context):\n' +
        '    # context.table holds the step\'s data table\n' +
        '    raise NotImplementedError("STEP: When the user logs in")\n');
    });

    test('remembers the target so it is preferred next time', async () => {
      setupWorkspace();
      stubDocuments();
      sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);

      await createStepDefinitionHandler(featureUri, 3, emptyStepsUri);

      const diag = notFoundDiagnostic(6);
      const actions = await provider.provideCodeActions(mockDocument(featureUri, featureContent), diag.range, context([diag]));
      assert.deepStrictEqual(actions?.[0].command?.arguments, [featureUri, 6, emptyStepsUri]);
    });

    test('creates a new, unsaved steps file chosen from the picker', async () => {
      setupWorkspace();
      stubDocuments();
      const applyEdit = sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);
      const quickPick = sandbox.stub(vscode.window, 'showQuickPick').callsFake(((items: vscode.QuickPickItem[]) =>
        Promise.resolve(items[items.length - 1])) as never);
      const inputBox = sandbox.stub(vscode.window, 'showInputBox').resolves('login_steps.py');

      await createStepDefinitionHandler(featureUri, 6);

      // picker lists the ranked files under group separators, with "New steps file…" last
      const items = quickPick.firstCall.args[0] as unknown as vscode.QuickPickItem[];
      const fileItems = items.filter(i => i.kind !== vscode.QuickPickItemKind.Separator);
      assert.deepStrictEqual(fileItems.map(i => i.label), [
        '$(file) auth_steps.py', '$(file) common_steps.py', '$(file) empty_steps.py', '$(new-file) New steps file…',
      ]);
      assert.strictEqual((inputBox.firstCall.args[0] as vscode.InputBoxOptions).value, 'login_steps.py');

      const edit = applyEdit.firstCall.args[0] as unknown as {
        createdFiles: { uri: vscode.Uri }[]; inserts: { uri: vscode.Uri; newText: string }[];
      };
      const newUri = vscode.Uri.file('/test/features/steps/login_steps.py');
      assert.deepStrictEqual(edit.createdFiles.map(f => f.uri.path), [newUri.path]);
      assert.strictEqual(edit.inserts[0].newText,
        'from behave import given, when, then\n\n\n' +
        '@then("{user} sees \\"{page}\\"")\ndef step_impl(context, user, page):\n' +
        '    raise NotImplementedError("STEP: Then <user> sees \\"<page>\\"")\n');
    });

    test('resolves the step from the live text when the parsed cache is stale', async () => {
      setupWorkspace();
      // an unsaved And step on line 4 that the parsed cache does not know about yet
      const liveContent = 'Feature: Login\n  Scenario: ok\n    Given a known user\n    When the user logs in\n    And the session starts\n';
      stubDocuments({ [featureUri.toString()]: liveContent });
      const applyEdit = sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);

      await createStepDefinitionHandler(featureUri, 4, authStepsUri);

      const edit = applyEdit.firstCall.args[0] as unknown as { inserts: { newText: string }[] };
      assert.ok(edit.inserts[0].newText.includes('@when("the session starts")'), edit.inserts[0].newText);
      assert.ok(edit.inserts[0].newText.includes('"STEP: And the session starts"'));
    });

    test('does nothing when the picker is dismissed', async () => {
      setupWorkspace();
      stubDocuments();
      const applyEdit = sandbox.stub(vscode.workspace, 'applyEdit').resolves(true);
      sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);

      await createStepDefinitionHandler(featureUri, 3);
      assert.ok(applyEdit.notCalled);
    });
  });


  suite('validateNewStepsFileName', () => {
    const stepsDir = vscode.Uri.file('/nonexistent/features/steps');

    test('accepts a python file name', () => {
      assert.strictEqual(validateNewStepsFileName('login_steps.py', stepsDir), undefined);
    });

    test('rejects non-python names and subfolders', () => {
      assert.ok(validateNewStepsFileName('login_steps', stepsDir));
      assert.ok(validateNewStepsFileName('sub/login_steps.py', stepsDir));
      assert.ok(validateNewStepsFileName('', stepsDir));
    });
  });
});
