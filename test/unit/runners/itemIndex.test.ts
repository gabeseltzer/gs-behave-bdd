// Unit tests for FeatureLineIndex - the "feature file + 1-based line" lookup shared
// by StreamResultReporter and OutputAttributor. It is shared precisely so the two
// cannot drift apart; these tests pin the key's semantics.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { FeatureLineIndex, lineKey } from '../../../src/runners/itemIndex';
import { QueueItem } from '../../../src/extension';

suite('itemIndex', () => {

  const makeItem = (id: string, path: string, zeroBasedLine: number | undefined): QueueItem => ({
    test: {
      id,
      uri: vscode.Uri.file(path),
      range: zeroBasedLine === undefined
        ? undefined
        : new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 5)),
    },
    scenario: {},
  } as unknown as QueueItem);


  test('finds an item by its behave (1-based) line', () => {
    const index = new FeatureLineIndex([makeItem('s1', '/proj/features/a.feature', 2)]);

    assert.strictEqual(index.find(vscode.Uri.file('/proj/features/a.feature'), 3)?.test.id, 's1');
    assert.strictEqual(index.find(vscode.Uri.file('/proj/features/a.feature'), 2), undefined,
      'the 0-based line must not match');
  });


  test('the same line in two feature files does not collide', () => {
    const index = new FeatureLineIndex([
      makeItem('a', '/proj/features/a.feature', 2),
      makeItem('b', '/proj/features/b.feature', 2),
    ]);

    assert.strictEqual(index.find(vscode.Uri.file('/proj/features/a.feature'), 3)?.test.id, 'a');
    assert.strictEqual(index.find(vscode.Uri.file('/proj/features/b.feature'), 3)?.test.id, 'b');
  });


  // Same reason urisMatch() exists: on Windows the drive letter and path casing are
  // not stable between what vscode holds and what behave prints.
  test('paths are matched case-insensitively', () => {
    const index = new FeatureLineIndex([makeItem('s1', 'c:/Proj/Features/A.feature', 2)]);

    assert.strictEqual(index.find(vscode.Uri.file('C:/proj/features/a.feature'), 3)?.test.id, 's1');
  });


  test('hasFile distinguishes a feature file from a step definition', () => {
    const index = new FeatureLineIndex([makeItem('s1', '/proj/features/a.feature', 2)]);

    assert.ok(index.hasFile(vscode.Uri.file('/proj/features/a.feature')));
    assert.ok(!index.hasFile(vscode.Uri.file('/proj/features/steps/a.py')),
      'a step definition location must not be treated as a scenario header');
  });


  test('hasFile is true for a known file even at an unqueued line', () => {
    const index = new FeatureLineIndex([makeItem('s1', '/proj/features/a.feature', 2)]);

    assert.ok(index.hasFile(vscode.Uri.file('/proj/features/a.feature')),
      'the Feature: line is in a known file but is not a queued scenario');
    assert.strictEqual(index.find(vscode.Uri.file('/proj/features/a.feature'), 1), undefined);
  });


  test('an item with no range is skipped rather than throwing', () => {
    assert.doesNotThrow(() => new FeatureLineIndex([makeItem('s1', '/proj/features/a.feature', undefined)]));
    const index = new FeatureLineIndex([makeItem('s1', '/proj/features/a.feature', undefined)]);
    assert.ok(!index.hasFile(vscode.Uri.file('/proj/features/a.feature')));
  });


  test('lineKey includes the line, so it cannot be confused with a whole-file key', () => {
    const uri = vscode.Uri.file('/proj/features/a.feature');
    assert.notStrictEqual(lineKey(uri, 3), lineKey(uri, 4));
  });

});
