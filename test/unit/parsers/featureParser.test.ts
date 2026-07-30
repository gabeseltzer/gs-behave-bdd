// Unit tests for featureParser module - focus on text block and table handling

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseFeatureContent, getFeatureFileSteps, getFeatureParseErrors, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
import { WorkspaceSettings } from '../../../src/settings';

suite('featureParser', () => {
  const testUri = vscode.Uri.file('c:/test/features/test.feature');
  const wkspUri = vscode.Uri.file('c:/test');

  // Create a minimal WorkspaceSettings mock
  const wkspSettings = {
    uri: wkspUri,
  } as WorkspaceSettings;

  setup(() => {
    // Clear any existing steps before each test
    deleteFeatureFileSteps(vscode.Uri.file('c:/test/features'));
  });

  suite('parseFeatureContent - Triple-Quoted Text Blocks', () => {
    test('should skip lines inside triple-double-quote blocks', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    This is a text block
    It should not be parsed as a step
    """
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // Should have 2 steps: "Given a precondition" and "Then a postcondition"
      // Should NOT include lines from inside the """ block
      assert.strictEqual(steps.length, 2, 'Should have exactly 2 steps (lines inside block should be skipped)');
      const stepTexts = steps.map(s => s[1].text);
      assert.ok(stepTexts.some(s => s.includes('Given a precondition')), 'Should have precondition step');
      assert.ok(stepTexts.some(s => s.includes('Then a postcondition')), 'Should have postcondition step');
      assert.ok(!stepTexts.some(s => s.includes('This is a text block')), 'Should NOT have text block content as step');
    });

    test('should skip lines inside triple-single-quote blocks', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    '''
    This is a text block
    It should not be parsed as a step
    '''
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have exactly 2 steps (lines inside block should be skipped)');
      const stepTexts = steps.map(s => s[1].text);
      assert.ok(stepTexts.some(s => s.includes('Given a precondition')), 'Should have precondition step');
      assert.ok(stepTexts.some(s => s.includes('Then a postcondition')), 'Should have postcondition step');
      assert.ok(!stepTexts.some(s => s.includes('This is a text block')), 'Should NOT have text block content as step');
    });

    test('should handle multiple text blocks in same scenario', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    First text block
    """
    When an action
    '''
    Second text block
    '''
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 3, 'Should have exactly 3 steps');
      const stepTexts = steps.map(s => s[1].text);
      assert.ok(stepTexts.some(s => s.includes('Given a precondition')), 'Should have given step');
      assert.ok(stepTexts.some(s => s.includes('When an action')), 'Should have when step');
      assert.ok(stepTexts.some(s => s.includes('Then a postcondition')), 'Should have then step');
    });

    test('should handle nested scenarios with text blocks', () => {
      const content = `
Feature: Test
  Scenario: First scenario
    Given first scenario precondition
    """
    Text block in first scenario
    """
    Then first scenario result

  Scenario: Second scenario
    Given second scenario precondition
    '''
    Text block in second scenario
    '''
    Then second scenario result
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 4, 'Should have exactly 4 steps (2 from each scenario)');
      assert.strictEqual(_scenarios, 2, 'Should have detected 2 scenarios');
    });

    test('should not confuse text block delimiters with step content', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given I set the text to """hello"""
    When I process it
    Then it works
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // Steps containing """ in the middle should still be parsed as steps
      // The delimiter detection should only trigger at line start (after indent)
      // This is a tricky case - we'll handle it by only toggling on lines that are JUST """ or '''
      assert.strictEqual(steps.length, 3, 'Should have all 3 steps (quotes in content are not delimiters)');
    });

    test('should handle text block with empty lines inside', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition

    """
    Line 1 in block

    Line 2 in block
    """

    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have exactly 2 steps');
    });

    test('should handle unterminated triple-quote block gracefully', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    This block is never closed
    Then a postcondition
    And another step
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // If not closed, everything after """ should be skipped
      assert.strictEqual(steps.length, 1, 'Should only have the precondition step, rest should be skipped');
    });
  });

  suite('parseFeatureContent - Table Rows', () => {
    test('should skip table rows starting with pipe', () => {
      const content = `
Feature: Test
  Scenario: Test with table
    Given a precondition
    | Header1 | Header2 |
    | Value1  | Value2  |
    | Value3  | Value4  |
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // Should have 2 steps: precondition and postcondition
      // Table rows should NOT be parsed as steps
      assert.strictEqual(steps.length, 2, 'Should have exactly 2 steps (table rows should be skipped)');
      const stepTexts = steps.map(s => s[1].text);
      assert.ok(stepTexts.some(s => s.includes('Given a precondition')), 'Should have precondition step');
      assert.ok(stepTexts.some(s => s.includes('Then a postcondition')), 'Should have postcondition step');
      assert.ok(!stepTexts.some(s => s.includes('Header1')), 'Should NOT have table header as step');
      assert.ok(!stepTexts.some(s => s.includes('Value1')), 'Should NOT have table row as step');
    });

    test('should skip multiple table rows with varying content', () => {
      const content = `
Feature: Test
  Scenario: Test with complex table
    Given I have data:
    | id | name    | status |
    | 1  | Alice   | active |
    | 2  | Bob     | inactive |
    | 3  | Charlie | active |
    When I process it
    Then it works
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 3, 'Should have exactly 3 steps');
      const stepTexts = steps.map(s => s[1].text);
      assert.ok(stepTexts.some(s => s.includes('Given I have data')), 'Should have data step');
      assert.ok(!stepTexts.some(s => s.includes('Alice')), 'Should NOT have table data as step');
    });

    test('should handle table with pipes in different positions', () => {
      const content = `
Feature: Test
  Scenario: Test table
    Given a setup
    |name|value|
    |test|123|
    Then verify
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have exactly 2 steps');
    });
  });

  suite('parseFeatureContent - Combined Text Blocks and Tables', () => {
    test('should handle scenario with both text blocks and tables', () => {
      const content = `
Feature: Test
  Scenario: Complex scenario
    Given I have some setup
    """
    This is a description
    """
    And I have data:
    | id | name |
    | 1  | test |
    When I process
    Then it works
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 4, 'Should have 4 steps (Given, And, When, Then)');
      assert.strictEqual(_scenarios, 1, 'Should have 1 scenario');
    });

    test('should handle text block containing pipe characters', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    This text contains pipes | like | this
    But they should not trigger table skip
    """
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have 2 steps (text block content ignored)');
    });
  });

  suite('parseFeatureContent - Tags and Text Blocks', () => {
    test('should not parse tags inside text blocks', () => {
      const content = `
Feature: Test
  @tag1
  Scenario: Test scenario
    Given a precondition
    """
    @tag2
    This should not be parsed as a tag
    """
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have 2 steps');
      // The @tag2 inside the text block should not be added as a tag
      // This is indirectly tested by ensuring text block content is skipped
    });
  });

  suite('parseFeatureContent - Edge Cases', () => {
    test('should handle document with only text blocks', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given I have text
    """
    
    """
    Then done
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have 2 steps');
    });

    test('should handle consecutive text blocks', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    First block
    """
    """
    Second block
    """
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // After first closing """, we exit the block
      // The second """ should toggle back into block mode, then the closing """ exits
      assert.strictEqual(steps.length, 2, 'Should have 2 steps');
    });

    test('should handle text block with whitespace variations', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
      """
      Indented text block
      """
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 2, 'Should have 2 steps');
    });

    test('should parse steps normally when no text blocks or tables present', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    When an action
    Then a result
    And another step
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 4, 'Should have all 4 steps');
      assert.strictEqual(_scenarios, 1, 'Should have 1 scenario');
      assert.strictEqual(_featureLines, 1, 'Should have 1 feature');
    });

    test('should handle text block delimiter in column 0 (not indented)', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
"""
This text block starts at column 0
"""
    Then a postcondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      // Text block delimiters at column 0 should still work
      assert.strictEqual(steps.length, 2, 'Should have 2 steps');
    });

    test('should handle table at the end of file', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    | col1 | col2 |
    | val1 | val2 |`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      assert.strictEqual(steps.length, 1, 'Should have 1 step');
    });
  });

  suite('parseFeatureContent - Step Types with Text Blocks', () => {
    test('should preserve step type tracking across text blocks', () => {
      const content = `
Feature: Test
  Scenario: Test scenario
    Given a precondition
    """
    Text block
    """
    And another given
    When an action
    """
    Another text block
    """
    And another when
    Then result
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const steps = getFeatureFileSteps(vscode.Uri.file('c:/test/features'));
      const stepsArray = steps.map(s => s[1]);

      // Check that And steps get the correct previous step type
      const andSteps = stepsArray.filter(s => s.text.includes('And'));
      assert.ok(andSteps.length >= 2, 'Should have at least 2 "And" steps');

      // First "And" should inherit from Given
      const firstAnd = stepsArray.find(s => s.text.includes('And another given'));
      assert.strictEqual(firstAnd?.stepType, 'given', 'First And should inherit given type');

      // Second "And" should inherit from When
      const secondAnd = stepsArray.find(s => s.text.includes('And another when'));
      assert.strictEqual(secondAnd?.stepType, 'when', 'Second And should inherit when type');
    });
  });

  suite('parseFeatureContent - And/But step type after Background', () => {
    // behave resets step-type tracking at every scenario; a leading And/But inherits the
    // Background's last step type, NOT the previous scenario's. See bundled behave
    // parser.py action_scenario()/parse_step()/_select_last_background_step_type().

    test('leading And in a later scenario inherits the Background, not the prior scenario', () => {
      const content = `
Feature: Test
  Background:
    Given a precondition

  Scenario: One
    When I do X
    Then result happens

  Scenario: Two
    And another precondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const stepsArray = getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]);
      const leadingAnd = stepsArray.find(s => s.text.includes('And another precondition'));
      // Background's last step is "Given", so the leading And must be "given" (not "then")
      assert.strictEqual(leadingAnd?.stepType, 'given', 'Leading And should inherit Background last step type (given)');
    });

    test('leading And inherits a When-terminated Background', () => {
      const content = `
Feature: Test
  Background:
    Given a precondition
    When I prepare

  Scenario: One
    And more setup
    Then it works
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const stepsArray = getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]);
      const leadingAnd = stepsArray.find(s => s.text.includes('And more setup'));
      assert.strictEqual(leadingAnd?.stepType, 'when', 'Leading And should inherit Background last step type (when)');
    });

    test('Background ending in its own And (resolving to given) is inherited by next scenario But', () => {
      const content = `
Feature: Test
  Background:
    Given a precondition
    And another precondition

  Scenario: One
    But not this
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const stepsArray = getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]);
      const leadingBut = stepsArray.find(s => s.text.includes('But not this'));
      // Background's last step is an And that resolved to "given", so the But is "given"
      assert.strictEqual(leadingBut?.stepType, 'given', 'Leading But should inherit Background last resolved step type (given)');
    });

    test('multiple scenarios each starting with And after the same Background all inherit the Background', () => {
      const content = `
Feature: Test
  Background:
    When I set things up

  Scenario: One
    And one
    Then ok

  Scenario: Two
    And two
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const stepsArray = getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]);
      const andOne = stepsArray.find(s => s.text.includes('And one'));
      const andTwo = stepsArray.find(s => s.text.includes('And two'));
      assert.strictEqual(andOne?.stepType, 'when', 'Scenario One leading And should be when');
      // Scenario Two's And must NOT pick up "then" from Scenario One — it inherits the Background
      assert.strictEqual(andTwo?.stepType, 'when', 'Scenario Two leading And should still be when (Background), not then');
    });

    test('multi-scenario feature: every And-led scenario inherits the When-terminated Background', () => {
      // Regression guard for the reported bug: a Background whose leading steps are Ands
      // (inheriting Given) and whose last step is a When, followed by several scenarios that
      // each open with And. Verified against behave 1.3.3 — every leading And resolves to
      // "when". Structure mirrors a real report; content here is domain-neutral.
      const content = `@only.with_tag=true
Feature: Multi-scenario And handling
    Background:
        Given the system is initialized
        And a first precondition holds
        And a second precondition holds
        When the primary action is performed

    Scenario: First scenario opens with Then
        Then the expected result is visible
        And a secondary result is visible

    Scenario: Second scenario opens with And
        And an additional precondition holds
        And another additional precondition holds
        Then the outcome is confirmed

    Scenario: Third scenario opens with And
        And a further precondition holds
        And a step is taken
        Then the final outcome is confirmed
`;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });

      const byText = (needle: string) =>
        getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]).find(s => s.text.includes(needle));

      // Background: leading Ands inherit Given; the closing When flips the type.
      assert.strictEqual(byText('And a first precondition holds')?.stepType, 'given', 'Background And inherits Given');
      assert.strictEqual(byText('When the primary action is performed')?.stepType, 'when', 'Background When');
      // First scenario opens with Then; its trailing And inherits Then.
      assert.strictEqual(byText('And a secondary result is visible')?.stepType, 'then', 'And after Then inherits then');
      // Both later scenarios open with And -> inherit the Background last step (when).
      assert.strictEqual(byText('And an additional precondition holds')?.stepType, 'when', 'Second scenario leading And inherits Background when');
      assert.strictEqual(byText('And a further precondition holds')?.stepType, 'when', 'Third scenario leading And inherits Background when');
      assert.strictEqual(getFeatureParseErrors(vscode.Uri.file('c:/test/features')).length, 0, 'valid feature -> no parse errors');
    });

    test('Scenario Outline leading And inherits the Background just like a Scenario', () => {
      // behave treats Scenario Outline the same as Scenario for step-type resolution.
      const content = `
Feature: Test
  Background:
    Given g
    When w

  Scenario Outline: S
    And leading and
    Then <x>

    Examples:
      | x |
      | 1 |
`;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });

      const stepsArray = getFeatureFileSteps(vscode.Uri.file('c:/test/features')).map(s => s[1]);
      const leadingAnd = stepsArray.find(s => s.text.includes('And leading and'));
      assert.strictEqual(leadingAnd?.stepType, 'when', 'Scenario Outline leading And should inherit Background last step type (when)');
    });
  });

  suite('parseFeatureContent - Rule-level Background inheritance for leading And/But', () => {
    // behave resolves a leading And/But against the enclosing container's Background:
    // a Rule's own Background if it has one, otherwise the feature Background
    // (background.inherited_steps). Verified against behave 1.3.3 — see parser.py
    // _select_last_background_step_type().
    const featuresUri = vscode.Uri.file('c:/test/features');
    const leadingAndTypeOf = (content: string): string | undefined => {
      deleteFeatureFileSteps(featuresUri);
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });
      return getFeatureFileSteps(featuresUri).map(s => s[1]).find(s => s.text.includes('And leading and'))?.stepType;
    };

    test('Rule WITH its own Background: leading And inherits the Rule Background (not the feature Background)', () => {
      // feature Background ends in When, Rule Background ends in Given -> And should be given.
      const content = `Feature: F
  Background:
    Given feature bg given
    When feature bg when
  Rule: R
    Background:
      Given rule bg given
    Scenario: S
      And leading and
      Then done
`;
      assert.strictEqual(leadingAndTypeOf(content), 'given', 'leading And should inherit the Rule Background last step (given)');
    });

    test('Rule WITHOUT its own Background: leading And inherits the feature Background', () => {
      const content = `Feature: F
  Background:
    Given feature bg given
    When feature bg when
  Rule: R
    Scenario: S
      And leading and
      Then done
`;
      assert.strictEqual(leadingAndTypeOf(content), 'when', 'leading And should inherit the feature Background last step (when)');
    });

    test('a Rule Background does not leak into a later Rule that has none', () => {
      // feature bg -> When; Rule R1 has own bg -> Given; Rule R2 has none. R2's leading And
      // must inherit the FEATURE Background (when), NOT R1's Background (given).
      const content = `Feature: F
  Background:
    When feature bg when
  Rule: R1
    Background:
      Given r1 bg given
    Scenario: S1
      Then t
  Rule: R2
    Scenario: S2
      And leading and
      Then done
`;
      assert.strictEqual(leadingAndTypeOf(content), 'when', 'R2 leading And should inherit the feature Background (when), not R1 Background (given)');
    });
  });

  suite('parseFeatureContent - generic "*" (bullet) steps', () => {
    // behave treats "* " as a generic step keyword: it inherits the previous step's type,
    // but as the FIRST step it defaults to "given" and does NOT consult the Background
    // (unlike And/But). Verified against behave 1.3.3 parser.py parse_step().
    const featuresUri = vscode.Uri.file('c:/test/features');

    test('a "*" step is recognized as a step (not dropped)', () => {
      deleteFeatureFileSteps(featuresUri);
      const content = `Feature: F
  Scenario: S
    Given g
    * a bullet step
    Then done
`;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });
      const bullet = getFeatureFileSteps(featuresUri).map(s => s[1]).find(s => s.text.includes('a bullet step'));
      assert.ok(bullet, '"*" step should be parsed');
      assert.strictEqual(bullet?.textWithoutType, 'a bullet step', 'match text should exclude the "*" keyword');
    });

    test('mid-scenario "*" inherits the previous step type', () => {
      deleteFeatureFileSteps(featuresUri);
      const content = `Feature: F
  Scenario: S
    When w
    * bullet inherits
    Then done
`;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });
      const bullet = getFeatureFileSteps(featuresUri).map(s => s[1]).find(s => s.text.includes('bullet inherits'));
      assert.strictEqual(bullet?.stepType, 'when', '"*" after When should inherit when');
    });

    test('a leading "*" defaults to given and ignores the Background (unlike And/But)', () => {
      deleteFeatureFileSteps(featuresUri);
      // Background ends in When; a leading And would be "when", but a leading "*" is "given".
      const content = `Feature: F
  Background:
    Given g
    When w
  Scenario: S
    * bullet first
    Then done
`;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { /* */ }, () => { /* */ });
      const bullet = getFeatureFileSteps(featuresUri).map(s => s[1]).find(s => s.text.includes('bullet first'));
      assert.strictEqual(bullet?.stepType, 'given', 'leading "*" should default to given, not inherit the Background');
      assert.strictEqual(getFeatureParseErrors(featuresUri).length, 0, 'a leading "*" is valid (no parse error)');
    });
  });

  suite('parseFeatureContent - invalid leading And/But parse errors', () => {
    const featuresUri = vscode.Uri.file('c:/test/features');

    test('records a parse error for a leading And with no Background', () => {
      const content = `
Feature: Test
  Scenario: One
    And nothing precedes this
    Then result
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const errors = getFeatureParseErrors(featuresUri);
      assert.strictEqual(errors.length, 1, 'Should record exactly one parse error');
      assert.ok(errors[0].message.includes("'And'"), 'Message should name the offending keyword');

      // The step is still recorded (graceful fallback) with stepType "given"
      const stepsArray = getFeatureFileSteps(featuresUri).map(s => s[1]);
      const badStep = stepsArray.find(s => s.text.includes('And nothing precedes this'));
      assert.strictEqual(badStep?.stepType, 'given', 'Invalid leading And should fall back to given');
    });

    test('records a parse error when a later scenario starts with And and there is no Background', () => {
      const content = `
Feature: Test
  Scenario: One
    Given a precondition
    Then result

  Scenario: Two
    And no background to inherit from
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const errors = getFeatureParseErrors(featuresUri);
      assert.strictEqual(errors.length, 1, 'Should record one parse error on scenario two leading And');
      assert.ok(errors[0].range.start.line > 0, 'Error should point at the offending step line');
    });

    test('does NOT record a parse error when a Background exists', () => {
      const content = `
Feature: Test
  Background:
    Given a precondition

  Scenario: One
    And this is valid
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const errors = getFeatureParseErrors(featuresUri);
      assert.strictEqual(errors.length, 0, 'A leading And after a Background is valid - no parse error');
    });

    test('records a parse error when the Background itself starts with And', () => {
      const content = `
Feature: Test
  Background:
    And nothing precedes this in the background

  Scenario: One
    Given a precondition
`;
      let _scenarios = 0;
      let _featureLines = 0;
      parseFeatureContent(wkspSettings, testUri, content, 'test', () => { _scenarios++; }, () => { _featureLines++; });

      const errors = getFeatureParseErrors(featuresUri);
      assert.strictEqual(errors.length, 1, 'A Background starting with And has nothing to inherit - parse error');
    });
  });
});
