// Tests for which tags each block inherits.
//
// In Gherkin a tag line applies to the NEXT block, and a block's tags are inherited by
// what is inside it: a Feature's tags belong to every scenario, a Rule's to every
// scenario in that rule, and a Scenario Outline's to every example row. A row cannot be
// tagged on its own - the Examples block is the finest granularity Gherkin offers.
//
// This is what feeds TestItem.tags, so getting inheritance wrong means filtering the
// Test Explorer by a tag silently misses scenarios that really do carry it.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseFeatureContent, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { WorkspaceSettings } from '../../../src/settings';

suite('tag inheritance', () => {

  const testUri = vscode.Uri.file('c:/test/features/test.feature');
  const wkspSettings = { uri: vscode.Uri.file('c:/test') } as WorkspaceSettings;

  interface Seen {
    feature: string[];
    scenarios: { name: string, tags: string[] }[];
    groups: { name: string, tags: string[] }[];
    rows: { values: string[], tags: string[] }[];
  }

  const parse = (content: string): Seen => {
    deleteFeatureFileSteps(vscode.Uri.file('c:/test/features'));
    const seen: Seen = { feature: [], scenarios: [], groups: [], rows: [] };
    parseFeatureContent(wkspSettings, testUri, content, 'test',
      (_r, name, _isOutline, tags) => seen.scenarios.push({ name, tags }),
      (_r, tags) => { seen.feature = tags; },
      (_r, _outline, _ti, _ri, _ex, values, tags) => seen.rows.push({ values, tags }),
      (_r, _outline, _ti, examplesName, tags) => seen.groups.push({ name: examplesName, tags }));
    return seen;
  };


  test('a scenario carries its own tags', () => {
    const seen = parse(`
Feature: F
  @smoke @slow
  Scenario: S
    Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['smoke', 'slow']);
  });


  test('tags stack across several tag lines', () => {
    const seen = parse(`
Feature: F
  @smoke
  @slow @wip
  Scenario: S
    Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['smoke', 'slow', 'wip']);
  });


  test('a feature tag is inherited by every scenario', () => {
    const seen = parse(`
@api
Feature: F
  Scenario: one
    Given x
  @smoke
  Scenario: two
    Given x
`);
    assert.deepStrictEqual(seen.feature, ['api']);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['api'], 'inherited even with no tags of its own');
    assert.deepStrictEqual(seen.scenarios[1].tags, ['api', 'smoke'], 'feature tag first, own tag after');
  });


  test('a feature tag is not also given to the first scenario twice', () => {
    const seen = parse(`
@api
Feature: F
  Scenario: one
    Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['api']);
  });


  test('a rule tag reaches its scenarios but not a later rule', () => {
    const seen = parse(`
Feature: F
  @ruleone
  Rule: first
    Scenario: a
      Given x
  @ruletwo
  Rule: second
    Scenario: b
      Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['ruleone']);
    assert.deepStrictEqual(seen.scenarios[1].tags, ['ruletwo'],
      'the first rule tag must not leak into the second');
  });


  test('an outline tag reaches every example row', () => {
    const seen = parse(`
Feature: F
  @outline
  Scenario Outline: O
    Given <thing>

  Examples:
    | thing |
    | a     |
    | b     |
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['outline']);
    assert.deepStrictEqual(seen.groups[0].tags, ['outline']);
    assert.deepStrictEqual(seen.rows.map(r => r.tags), [['outline'], ['outline']]);
  });


  test('an Examples block can add its own tags on top of the outline', () => {
    const seen = parse(`
Feature: F
  @outline
  Scenario Outline: O
    Given <thing>

  @amphibians
  Examples: Amphibians
    | thing |
    | frog  |

  @electronics
  Examples: Consumer Electronics
    | thing  |
    | iphone |
`);
    assert.deepStrictEqual(seen.groups[0].tags, ['outline', 'amphibians']);
    assert.deepStrictEqual(seen.groups[1].tags, ['outline', 'electronics'],
      'the first Examples tag must not leak into the second');
    assert.deepStrictEqual(seen.rows[0].tags, ['outline', 'amphibians']);
    assert.deepStrictEqual(seen.rows[1].tags, ['outline', 'electronics']);
  });


  test('an outline tag does not leak into the next scenario', () => {
    const seen = parse(`
Feature: F
  @outline
  Scenario Outline: O
    Given <thing>

  Examples:
    | thing |
    | a     |

  Scenario: plain
    Given x
`);
    assert.deepStrictEqual(seen.scenarios[1].tags, [], 'the plain scenario has no tags of its own');
  });


  test('a scenario tag does not leak into the next scenario', () => {
    const seen = parse(`
Feature: F
  @first
  Scenario: one
    Given x
  Scenario: two
    Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['first']);
    assert.deepStrictEqual(seen.scenarios[1].tags, []);
  });


  test('an untagged feature file yields no tags anywhere', () => {
    const seen = parse(`
Feature: F
  Scenario: S
    Given x
`);
    assert.deepStrictEqual(seen.feature, []);
    assert.deepStrictEqual(seen.scenarios[0].tags, []);
  });


  test('feature, rule and scenario tags compose outermost-first', () => {
    const seen = parse(`
@api
Feature: F
  @ruleone
  Rule: first
    @smoke
    Scenario: a
      Given x
`);
    assert.deepStrictEqual(seen.scenarios[0].tags, ['api', 'ruleone', 'smoke']);
  });

});
