// Tests for "Run Tests With Tag..." item selection.
//
// The subtlety is inheritance. A tag on a Feature is also on every scenario inside it,
// so "everything carrying @api" is not the right selection - it names the same work
// twice. The top-most carrier is, because the run queue expands a parent into its
// children anyway.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { collectItemsWithTag, collectTags } from '../../../src/handlers/runByTag';

suite('runByTag', () => {

  /** A TestItem with just the shape these functions read: tags and children. */
  const item = (id: string, tags: string[], children: vscode.TestItem[] = []): vscode.TestItem => ({
    id,
    tags: tags.map(t => new vscode.TestTag(t)),
    children: {
      size: children.length,
      forEach: (cb: (i: vscode.TestItem) => void) => children.forEach(cb),
    },
  } as unknown as vscode.TestItem);

  const collection = (items: vscode.TestItem[]) => ({
    size: items.length,
    forEach: (cb: (i: vscode.TestItem) => void) => items.forEach(cb),
  }) as unknown as vscode.TestItemCollection;

  /** A feature tagged @api whose scenarios inherit it, plus one tagged @smoke. */
  const tree = () => {
    const inherited1 = item('f1/s1', ['api']);
    const inherited2 = item('f1/s2', ['api', 'smoke']);
    const feature1 = item('f1', ['api'], [inherited1, inherited2]);

    const plain = item('f2/s1', []);
    const smoke = item('f2/s2', ['smoke']);
    const feature2 = item('f2', [], [plain, smoke]);

    return collection([feature1, feature2]);
  };


  suite('collectTags', () => {

    test('gathers every distinct tag on the tree, sorted', () => {
      assert.deepStrictEqual(collectTags(tree()), ['api', 'smoke']);
    });

    test('finds tags nested below an untagged parent', () => {
      const nested = collection([item('f', [], [item('f/g', [], [item('f/g/row', ['deep'])])])]);
      assert.deepStrictEqual(collectTags(nested), ['deep']);
    });

    test('an untagged tree yields nothing', () => {
      assert.deepStrictEqual(collectTags(collection([item('f', [], [item('f/s', [])])])), []);
    });
  });


  suite('collectItemsWithTag', () => {

    test('takes the top-most carrier, not the parent and its children both', () => {
      const matched = collectItemsWithTag(tree(), 'api').map(i => i.id);
      assert.deepStrictEqual(matched, ['f1'],
        'the feature covers the scenarios that inherited its tag');
    });

    test('takes scenarios directly when their parent does not carry the tag', () => {
      const matched = collectItemsWithTag(tree(), 'smoke').map(i => i.id);
      assert.deepStrictEqual(matched, ['f1/s2', 'f2/s2']);
    });

    test('does not descend into a matched item', () => {
      // f1/s2 carries @smoke too, but @api already selected its feature - descending
      // would add it a second time under a different tag query.
      const matched = collectItemsWithTag(tree(), 'api');
      assert.strictEqual(matched.length, 1);
      assert.strictEqual(matched[0].id, 'f1');
    });

    test('an unknown tag matches nothing', () => {
      assert.deepStrictEqual(collectItemsWithTag(tree(), 'nope'), []);
    });

    test('matches an example row through its group', () => {
      const row = item('o/g/r', ['outline']);
      const group = item('o/g', ['outline'], [row]);
      const outline = item('o', ['outline'], [group]);
      const plainFeature = item('f', [], [outline]);

      const matched = collectItemsWithTag(collection([plainFeature]), 'outline').map(i => i.id);
      assert.deepStrictEqual(matched, ['o'], 'the outline covers its groups and rows');
    });
  });

});
