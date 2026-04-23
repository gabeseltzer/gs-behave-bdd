// Unit tests for Select Project command helpers — Phase 13: switching UX

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  buildQuickPickItems,
  computeStatusBarState,
  ProjectQuickPickItem,
} from '../../../src/discovery/selectProjectHelpers';
import { ProjectEntry } from '../../../src/discovery/projectList';


// --- Helpers ---

function makeProject(label: string, configFile: string, dir: string): ProjectEntry {
  return {
    configFileUri: vscode.Uri.file(`/workspace/${dir}/${configFile}`),
    dirUri: vscode.Uri.file(`/workspace/${dir}`),
    depth: dir === '.' ? 0 : 1,
    configPriority: 0,
    label,
  };
}

function urisMatch(a: vscode.Uri, b: vscode.Uri): boolean {
  return a.toString() === b.toString();
}

const mockButton: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('go-to-file'),
  tooltip: 'Open config file',
};


// --- Tests ---

suite('Select Project Helpers', () => {

  // =============================
  // buildQuickPickItems
  // =============================

  suite('buildQuickPickItems', () => {

    test('returns correct number of items for 3 projects', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
        makeProject('frontend', 'setup.cfg', 'frontend'),
        makeProject('api', 'behave.ini', 'api'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.strictEqual(items.length, 3);
    });

    test('active project is marked with ✓ active in description', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
        makeProject('frontend', 'setup.cfg', 'frontend'),
      ];
      const active = projects[1];
      const items = buildQuickPickItems(projects, active, mockButton, urisMatch);

      // Active project (index 1) should have ✓ active
      assert.ok(items[1].description?.includes('\u2713 active'), `Expected ✓ active in description, got: ${items[1].description}`);
      // Non-active project (index 0) should NOT have ✓ active
      assert.ok(!items[0].description?.includes('\u2713 active'), `Expected no ✓ active, got: ${items[0].description}`);
    });

    test('root-level project with label "." is displayed as "(root)"', () => {
      const projects = [
        makeProject('.', 'behave.ini', '.'),
        makeProject('sub', 'behave.ini', 'sub'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.strictEqual(items[0].label, '(root)');
      assert.strictEqual(items[1].label, 'sub');
    });

    test('description includes config file type', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
        makeProject('frontend', 'setup.cfg', 'frontend'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.ok(items[0].description?.includes('behave.ini'), `Expected behave.ini, got: ${items[0].description}`);
      assert.ok(items[1].description?.includes('setup.cfg'), `Expected setup.cfg, got: ${items[1].description}`);
    });

    test('detail contains full config file path', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.ok(items[0].detail?.includes('backend'), `Expected path in detail, got: ${items[0].detail}`);
      assert.ok(items[0].detail?.includes('behave.ini'), `Expected config file in detail, got: ${items[0].detail}`);
    });

    test('each item has buttons array with open-config button', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.ok(items[0].buttons, 'Expected buttons array');
      assert.strictEqual(items[0].buttons?.length, 1);
      assert.strictEqual(items[0].buttons?.[0], mockButton);
    });

    test('each item carries the original ProjectEntry', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      assert.strictEqual(items[0].entry, projects[0]);
    });

    test('no active project means no item has ✓ active', () => {
      const projects = [
        makeProject('a', 'behave.ini', 'a'),
        makeProject('b', 'behave.ini', 'b'),
      ];
      const items = buildQuickPickItems(projects, undefined, mockButton, urisMatch);
      for (const item of items) {
        assert.ok(!item.description?.includes('\u2713 active'), `Unexpected ✓ active on ${item.label}`);
      }
    });

    test('empty project list returns empty items', () => {
      const items = buildQuickPickItems([], undefined, mockButton, urisMatch);
      assert.strictEqual(items.length, 0);
    });

    test('active marker includes em-dash separator', () => {
      const projects = [makeProject('x', 'behave.ini', 'x')];
      const items = buildQuickPickItems(projects, projects[0], mockButton, urisMatch);
      // Should have "behave.ini — ✓ active"
      assert.ok(items[0].description?.includes('\u2014'), `Expected em-dash, got: ${items[0].description}`);
    });
  });


  // =============================
  // computeStatusBarState
  // =============================

  suite('computeStatusBarState', () => {

    test('hidden when 0 projects', () => {
      const state = computeStatusBarState([], undefined, false);
      assert.strictEqual(state.visible, false);
    });

    test('hidden when 1 project', () => {
      const projects = [makeProject('only', 'behave.ini', 'only')];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.strictEqual(state.visible, false);
    });

    test('hidden when manual project path mode', () => {
      const projects = [
        makeProject('a', 'behave.ini', 'a'),
        makeProject('b', 'behave.ini', 'b'),
      ];
      const state = computeStatusBarState(projects, projects[0], true);
      assert.strictEqual(state.visible, false);
    });

    test('hidden when no active project', () => {
      const projects = [
        makeProject('a', 'behave.ini', 'a'),
        makeProject('b', 'behave.ini', 'b'),
      ];
      const state = computeStatusBarState(projects, undefined, false);
      assert.strictEqual(state.visible, false);
    });

    test('visible with correct text for 2+ projects', () => {
      const projects = [
        makeProject('backend', 'behave.ini', 'backend'),
        makeProject('frontend', 'setup.cfg', 'frontend'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.strictEqual(state.visible, true);
      assert.strictEqual(state.text, 'Behave: backend');
    });

    test('root project shows "Behave: (root)" in text', () => {
      const projects = [
        makeProject('.', 'behave.ini', '.'),
        makeProject('sub', 'setup.cfg', 'sub'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.strictEqual(state.text, 'Behave: (root)');
    });

    test('tooltip contains project count', () => {
      const projects = [
        makeProject('a', 'behave.ini', 'a'),
        makeProject('b', 'behave.ini', 'b'),
        makeProject('c', 'behave.ini', 'c'),
      ];
      const state = computeStatusBarState(projects, projects[1], false);
      assert.ok(state.tooltip?.includes('3 projects discovered'), `Expected count in tooltip, got: ${state.tooltip}`);
    });

    test('tooltip contains "click to switch"', () => {
      const projects = [
        makeProject('a', 'behave.ini', 'a'),
        makeProject('b', 'behave.ini', 'b'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.ok(state.tooltip?.includes('click to switch'), `Expected hint in tooltip, got: ${state.tooltip}`);
    });

    test('tooltip shows active project name and config type', () => {
      const projects = [
        makeProject('myapp', 'setup.cfg', 'myapp'),
        makeProject('other', 'behave.ini', 'other'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.ok(state.tooltip?.includes('Active: myapp'), `Expected active label, got: ${state.tooltip}`);
      assert.ok(state.tooltip?.includes('setup.cfg'), `Expected config type, got: ${state.tooltip}`);
    });

    test('tooltip for root project shows "(root)"', () => {
      const projects = [
        makeProject('.', 'behave.ini', '.'),
        makeProject('sub', 'behave.ini', 'sub'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.ok(state.tooltip?.includes('Active: (root)'), `Expected (root) in tooltip, got: ${state.tooltip}`);
    });

    test('text format starts with "Behave:"', () => {
      const projects = [
        makeProject('api', 'behave.ini', 'api'),
        makeProject('web', 'behave.ini', 'web'),
      ];
      const state = computeStatusBarState(projects, projects[0], false);
      assert.ok(state.text?.startsWith('Behave:'), `Expected Behave: prefix, got: ${state.text}`);
    });
  });

});
