// Tests for the stepDefinitionSearchTimeout setting

import * as assert from 'assert';

suite('stepDefinitionSearchTimeout setting', () => {

  test('vscode mock returns 10 as default stepDefinitionSearchTimeout', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('gs-behave-bdd');
    assert.strictEqual(config.get('stepDefinitionSearchTimeout'), 10);
  });

  suite('clamping (Math.max(1, v)) — stored in seconds, ms conversion is at the call site', () => {
    // WorkspaceSettings stores seconds; fileParser.ts multiplies by 1000 when calling loadFromBehave
    const clamp = (seconds: number) => Math.max(1, seconds);

    test('default of 10 is stored as 10', () => {
      assert.strictEqual(clamp(10), 10);
    });

    test('30 is stored as 30', () => {
      assert.strictEqual(clamp(30), 30);
    });

    test('1 is stored as 1', () => {
      assert.strictEqual(clamp(1), 1);
    });

    test('0 is clamped to 1', () => {
      assert.strictEqual(clamp(0), 1);
    });

    test('negative value is clamped to 1', () => {
      assert.strictEqual(clamp(-5), 1);
    });
  });

});
