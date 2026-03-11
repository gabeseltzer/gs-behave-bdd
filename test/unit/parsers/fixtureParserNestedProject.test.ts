// Tests for fixtureParser with nested featuresPath (e.g. subproject/features)
// Verifies that parseEnvironmentFileContent can follow imports to modules
// that live alongside the features directory (e.g. subproject/lib/).

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { parseEnvironmentFileContent, getFixtures, deleteFixtures } from '../../../src/parsers/fixtureParser';

// Simulates:
//   workspace_root/
//     subproject/                  (behave project dir, has behave.ini)
//       lib/
//         __init__.py              (has @fixture decorator)
//       features/                  (featuresPath = "subproject/features")
//         environment.py           (imports from lib)
//         steps/

const featuresUri = vscode.Uri.file('/workspace_root/subproject/features');

suite('fixtureParser nested project', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    deleteFixtures(featuresUri);
  });

  teardown(() => {
    sandbox.restore();
    deleteFixtures(featuresUri);
  });

  /**
   * Mock workspace.fs.stat to simulate which files exist on disk.
   * resolveImportPath calls stat() to check if candidate paths exist.
   */
  function mockStat(existingPaths: string[]) {
    const normalizedPaths = existingPaths.map(p => p.replace(/\\/g, '/').toLowerCase());
    sandbox.stub(vscode.workspace.fs, 'stat').callsFake((uri: vscode.Uri) => {
      const normalized = uri.fsPath.replace(/\\/g, '/').toLowerCase();
      if (normalizedPaths.some(p => normalized.endsWith(p) || normalized === p)) {
        return Promise.resolve({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 });
      }
      return Promise.reject(new Error(`File not found: ${uri.fsPath}`));
    });
  }

  /**
   * Mock getContentFromFilesystem for files that parseEnvironmentFileContent reads
   * when following imports.
   */
  function mockFileContent(fileContentMap: Map<string, string>) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const commonModule = require('../../../src/common');
    sandbox.stub(commonModule, 'getContentFromFilesystem').callsFake(async (uri: vscode.Uri) => {
      const normalized = uri.fsPath.replace(/\\/g, '/').toLowerCase();
      for (const [filePath, content] of fileContentMap) {
        const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
        if (normalized.endsWith(normalizedPath) || normalized === normalizedPath) {
          return content;
        }
      }
      throw new Error(`File not found: ${uri.fsPath}`);
    });
  }

  test('should discover fixtures from lib/ imported by environment.py in nested layout', async () => {
    const envUri = vscode.Uri.file('/workspace_root/subproject/features/environment.py');
    const libInitUri = vscode.Uri.file('/workspace_root/subproject/lib/__init__.py');

    mockStat(['/workspace_root/subproject/lib/__init__.py']);

    const libContent = [
      'from behave import fixture',
      '',
      '@fixture',
      'def browser_setup(context):',
      '    context.browser = "chrome"',
    ].join('\n');

    mockFileContent(new Map([[libInitUri.fsPath, libContent]]));

    const envContent = [
      'from lib import browser_setup  # noqa',
      '',
      'def before_all(context):',
      '    pass',
    ].join('\n');

    await parseEnvironmentFileContent(featuresUri, envContent, envUri, 'test');

    const fixtures = getFixtures(featuresUri);
    assert.ok(fixtures.length > 0,
      'Should discover fixtures from lib/ in the behave project directory (parent of features). ' +
      'resolveImportPath needs to also search relative to the parent of the features directory.');

    const browserFixture = fixtures.find(f => f.name === 'browser_setup');
    assert.ok(browserFixture, 'Should find browser_setup fixture from lib/__init__.py');
  });

  test('should discover fixtures defined directly in environment.py', async () => {
    const envUri = vscode.Uri.file('/workspace_root/subproject/features/environment.py');

    const envContent = [
      'from behave import fixture',
      '',
      '@fixture',
      'def direct_fixture(context):',
      '    pass',
    ].join('\n');

    await parseEnvironmentFileContent(featuresUri, envContent, envUri, 'test');

    const fixtures = getFixtures(featuresUri);
    assert.ok(fixtures.length > 0, 'Should discover fixtures defined directly in environment.py');
    assert.ok(fixtures.find(f => f.name === 'direct_fixture'), 'Should find direct_fixture');
  });

  test('should discover fixtures from files relative to the features directory', async () => {
    const envUri = vscode.Uri.file('/workspace_root/subproject/features/environment.py');
    const helperUri = vscode.Uri.file('/workspace_root/subproject/features/helpers.py');

    mockStat(['/workspace_root/subproject/features/helpers.py']);

    const helperContent = [
      'from behave import fixture',
      '',
      '@fixture',
      'def helper_fixture(context):',
      '    pass',
    ].join('\n');

    mockFileContent(new Map([[helperUri.fsPath, helperContent]]));

    const envContent = 'from helpers import helper_fixture  # noqa\n';

    await parseEnvironmentFileContent(featuresUri, envContent, envUri, 'test');

    const fixtures = getFixtures(featuresUri);
    assert.ok(fixtures.find(f => f.name === 'helper_fixture'),
      'Should find fixtures from files in the same directory as environment.py');
  });
});
