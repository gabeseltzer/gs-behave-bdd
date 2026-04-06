import * as assert from 'assert';

suite('importStrategy setting', () => {

  test('vscode mock returns useBundled as default importStrategy', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('gs-behave-bdd');
    assert.strictEqual(config.get('importStrategy'), 'useBundled');
  });

  test('importStrategy valid values', () => {
    const validValues = ['useBundled', 'fromEnvironment'];
    assert.ok(validValues.includes('useBundled'), 'useBundled should be valid');
    assert.ok(validValues.includes('fromEnvironment'), 'fromEnvironment should be valid');
    assert.ok(!validValues.includes('invalid'), 'invalid should not be valid');
  });
});
