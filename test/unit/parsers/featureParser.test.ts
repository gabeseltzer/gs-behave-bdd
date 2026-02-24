// Unit tests for featureParser module - focus on text block and table handling

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseFeatureContent, getFeatureFileSteps, deleteFeatureFileSteps } from '../../../src/parsers/featureParser';
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
});
