// Unit tests for FeatureLineIndex - the "feature file + 1-based line" lookup shared
// by StreamResultReporter and OutputAttributor. It is shared precisely so the two
// cannot drift apart; these tests pin the key's semantics.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { FeatureLineIndex, lineKey } from '../../../src/runners/itemIndex';
import { QueueItem } from '../../../src/extension';
import { ExampleRow, Scenario, ScenarioExamplesGroup, TestData } from '../../../src/parsers/testFile';

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


  // A Scenario Outline is queued as ONE item - its parent - because
  // queueSelectedTestItems stops recursing at the first Scenario it meets, and the
  // outline parent IS one (testFile.ts:111). Its example rows are Scenarios too
  // (testFile.ts:151) but sit two levels below, behind a ScenarioExamplesGroup, so
  // they are never reached.
  //
  // behave reports every example row at its OWN data-row line, in both the event
  // stream and the "# file:line" comment on each header. So an index built from the
  // queue alone knows the outline header line and none of the row lines - which is
  // why an outline row had no output attributed to it and no live result.
  //
  // Shape below is project A's outline_mixed.feature "Blenders Fail <thing>":
  // outline header at line 33, rows at 40 (Amphibians) and 44/45/46 (Consumer
  // Electronics, 44 being the failing one).
  suite('scenario outline example rows', () => {

    const FEATURE = '/proj/features/outline_mixed.feature';
    const uri = vscode.Uri.file(FEATURE);

    const testItem = (id: string, zeroBasedLine: number, children: vscode.TestItem[] = []) => {
      const kids = new Map(children.map(c => [c.id, c]));
      return {
        id,
        uri,
        range: new vscode.Range(new vscode.Position(zeroBasedLine, 0), new vscode.Position(zeroBasedLine, 5)),
        children: {
          size: kids.size,
          forEach: (cb: (i: vscode.TestItem) => void) => kids.forEach(cb),
        },
      } as unknown as vscode.TestItem;
    };

    /** The tree testFile builds: outline -> examples group -> example rows. */
    const buildOutline = () => {
      const row40 = testItem('outline/Amphibians/@1.1', 39);
      const row44 = testItem('outline/Consumer/@2.1', 43);
      const row45 = testItem('outline/Consumer/@2.2', 44);
      const row46 = testItem('outline/Consumer/@2.3', 45);
      const groupA = testItem('outline/Amphibians', 37, [row40]);
      const groupC = testItem('outline/Consumer', 41, [row44, row45, row46]);
      const outline = testItem('outline', 32, [groupA, groupC]);
      return { outline, row40, row44 };
    };

    /**
     * testData exactly as testFile.ts populates it. REAL Scenario instances, because
     * the index tells a row from a group with `instanceof Scenario && data.exampleRow`
     * - a duck-typed stand-in would pass the test while production still failed.
     */
    const makeTestData = (outline: vscode.TestItem) => {
      const data: TestData = new WeakMap();
      const scenario = (name: string, isOutline: boolean, row?: ExampleRow) =>
        new Scenario('outline_mixed.feature', 'features/outline_mixed.feature',
          'Mixed outline', name, 1, isOutline, row);
      const exampleRow = (tableIndex: number, rowIndex: number): ExampleRow => ({
        tableIndex, rowIndex, examplesName: 'Consumer Electronics', values: ['x', 'y'],
        junitName: `Blenders Fail -- @${tableIndex}.${rowIndex}`,
      });

      // depth 0 outline (Scenario), 1 group (ScenarioExamplesGroup), 2 row (Scenario)
      const walk = (item: vscode.TestItem, depth: number) => {
        if (depth === 0)
          data.set(item, scenario('Blenders Fail', true));
        else if (depth === 1)
          data.set(item, new ScenarioExamplesGroup('outline_mixed.feature',
            'features/outline_mixed.feature', 'Mixed outline', 'Blenders Fail', 'Consumer Electronics', 2));
        else
          data.set(item, scenario('Blenders Fail', false, exampleRow(2, depth)));
        item.children.forEach(c => walk(c, depth + 1));
      };
      walk(outline, 0);
      return data;
    };

    test('the outline parent alone is what the queue holds', () => {
      // Pins the premise. If queueSelectedTestItems ever starts queueing rows, this
      // test should be revisited rather than silently passing.
      const { outline } = buildOutline();
      const index = new FeatureLineIndex([{ test: outline, scenario: {} } as unknown as QueueItem]);

      assert.ok(index.find(uri, 33), 'the outline header line is indexed');
    });

    test('an example row is found by its own data-row line', () => {
      const { outline, row44 } = buildOutline();
      const index = new FeatureLineIndex(
        [{ test: outline, scenario: {} } as unknown as QueueItem],
        makeTestData(outline));

      assert.strictEqual(index.find(uri, 44)?.test.id, row44.id,
        'behave reports this row at line 44; without it the row gets no output and no result');
      assert.strictEqual(index.find(uri, 40)?.test.id, 'outline/Amphibians/@1.1');
      assert.strictEqual(index.find(uri, 46)?.test.id, 'outline/Consumer/@2.3');
    });

    test('the examples group itself is not indexed', () => {
      // behave emits nothing at an "Examples:" line, and indexing it would put a
      // non-Scenario item where consumers expect one.
      const { outline } = buildOutline();
      const index = new FeatureLineIndex(
        [{ test: outline, scenario: {} } as unknown as QueueItem],
        makeTestData(outline));

      assert.strictEqual(index.find(uri, 38), undefined, 'Amphibians group line');
      assert.strictEqual(index.find(uri, 42), undefined, 'Consumer group line');
    });

    test('the outline parent stays indexed alongside its rows', () => {
      const { outline } = buildOutline();
      const index = new FeatureLineIndex(
        [{ test: outline, scenario: {} } as unknown as QueueItem],
        makeTestData(outline));

      assert.strictEqual(index.find(uri, 33)?.test.id, 'outline');
    });

    test('without testData the behaviour is exactly as before', () => {
      // The junit path builds an index without it; rows simply stay unfindable there.
      const { outline } = buildOutline();
      const index = new FeatureLineIndex([{ test: outline, scenario: {} } as unknown as QueueItem]);

      assert.strictEqual(index.find(uri, 44), undefined);
      assert.strictEqual(index.find(uri, 33)?.test.id, 'outline');
    });
  });

});
