// Unit tests for gherkinPatterns module

import * as assert from 'assert';
import {
  featureRe,
  featureMultiLineRe,
  backgroundRe,
  scenarioRe,
  scenarioOutlineRe,
  examplesRe,
  ruleRe,
  stepRe,
  featureFileStepRe,
  executeStepsKeywordRe,
  tagRe,
  getSymbolStartLine,
  getStepParamSpans
} from '../../../src/parsers/gherkinPatterns';

suite('gherkinPatterns', () => {

  suite('featureRe', () => {
    test('should match Feature keyword', () => {
      const match = featureRe.exec('Feature: User login');
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'User login');
    });

    test('should match Feature with leading whitespace', () => {
      const match = featureRe.exec('  Feature: User login');
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'User login');
    });

    test('should be case insensitive', () => {
      const match = featureRe.exec('FEATURE: User login');
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'User login');
    });

    test('should not match non-feature lines', () => {
      const match = featureRe.exec('Scenario: Login');
      assert.strictEqual(match, null);
    });
  });

  suite('featureMultiLineRe', () => {
    test('should match Feature keyword in multiline text', () => {
      const text = 'Some text\nFeature: User login\nMore text';
      const match = featureMultiLineRe.exec(text);
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'User login');
    });
  });

  suite('backgroundRe', () => {
    test('should match Background keyword', () => {
      const match = backgroundRe.exec('Background:');
      assert.ok(match);
    });

    test('should match Background with description', () => {
      const match = backgroundRe.exec('  Background: Common setup');
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'Common setup');
    });

    test('should be case insensitive', () => {
      const match = backgroundRe.exec('BACKGROUND: Setup');
      assert.ok(match);
    });
  });

  suite('scenarioRe', () => {
    test('should match Scenario keyword', () => {
      const match = scenarioRe.exec('Scenario: User logs in');
      assert.ok(match);
      assert.strictEqual(match[1], 'Scenario');
      assert.strictEqual(match[2].trim(), 'User logs in');
    });

    test('should match Scenario Outline keyword', () => {
      const match = scenarioRe.exec('Scenario Outline: Multiple logins');
      assert.ok(match);
      assert.strictEqual(match[1], 'Scenario Outline');
    });

    test('should match Scenario Template keyword', () => {
      const match = scenarioRe.exec('Scenario Template: Test template');
      assert.ok(match);
      assert.strictEqual(match[1], 'Scenario Template');
    });

    test('should be case insensitive', () => {
      const match = scenarioRe.exec('SCENARIO: Test');
      assert.ok(match);
    });
  });

  suite('scenarioOutlineRe', () => {
    test('should match Scenario Outline keyword', () => {
      const match = scenarioOutlineRe.exec('Scenario Outline: Data-driven test');
      assert.ok(match);
    });

    test('should match Scenario Template keyword', () => {
      const match = scenarioOutlineRe.exec('Scenario Template: Template test');
      assert.ok(match);
    });

    test('should not match plain Scenario', () => {
      const match = scenarioOutlineRe.exec('Scenario: Regular scenario');
      assert.strictEqual(match, null);
    });
  });

  suite('examplesRe', () => {
    test('should match Examples keyword', () => {
      const match = examplesRe.exec('Examples:');
      assert.ok(match);
    });

    test('should match Examples with description', () => {
      const match = examplesRe.exec('  Examples: Valid users');
      assert.ok(match);
      assert.strictEqual(match[2].trim(), 'Valid users');
    });

    test('should match Scenarios keyword (alias for Examples)', () => {
      const match = examplesRe.exec('  Scenarios: Valid users');
      assert.ok(match);
      assert.strictEqual(match[1], 'Scenarios');
      assert.strictEqual(match[2].trim(), 'Valid users');
    });

    test('should be case insensitive', () => {
      const match = examplesRe.exec('EXAMPLES: Test data');
      assert.ok(match);
    });
  });

  suite('ruleRe', () => {
    test('should match Rule keyword', () => {
      const match = ruleRe.exec('Rule: Business rule');
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'Business rule');
    });

    test('should match Rule with leading whitespace', () => {
      const match = ruleRe.exec('  Rule: Another rule');
      assert.ok(match);
    });

    test('should be case insensitive', () => {
      const match = ruleRe.exec('RULE: Test');
      assert.ok(match);
    });
  });

  suite('stepRe', () => {
    test('should match Given step', () => {
      const match = stepRe.exec('Given a user exists');
      assert.ok(match);
      assert.strictEqual(match[1], 'Given');
      assert.strictEqual(match[2].trim(), 'a user exists');
    });

    test('should match When step', () => {
      const match = stepRe.exec('When I log in');
      assert.ok(match);
      assert.strictEqual(match[1], 'When');
    });

    test('should match Then step', () => {
      const match = stepRe.exec('Then I see dashboard');
      assert.ok(match);
      assert.strictEqual(match[1], 'Then');
    });

    test('should match And step', () => {
      const match = stepRe.exec('And I click button');
      assert.ok(match);
      assert.strictEqual(match[1], 'And');
    });

    test('should match But step', () => {
      const match = stepRe.exec('But not for admin');
      assert.ok(match);
      assert.strictEqual(match[1], 'But');
    });

    test('should match * (wildcard) step', () => {
      const match = stepRe.exec('* something happens');
      assert.ok(match);
      assert.strictEqual(match[1], '*');
    });

    test('should match steps with leading whitespace', () => {
      const match = stepRe.exec('  Given a precondition');
      assert.ok(match);
    });

    test('should be case insensitive', () => {
      const match = stepRe.exec('GIVEN a condition');
      assert.ok(match);
    });
  });

  suite('featureFileStepRe', () => {
    test('should match Given step with space', () => {
      const match = featureFileStepRe.exec('Given a user exists');
      assert.ok(match);
      assert.strictEqual(match[1], 'Given ');
      assert.strictEqual(match[2].trim(), 'a user exists');
    });

    test('should match steps with leading whitespace', () => {
      const match = featureFileStepRe.exec('  When I do something');
      assert.ok(match);
    });

    test('should not match steps without trailing space after keyword', () => {
      // This regex specifically requires a space after the keyword
      const match = featureFileStepRe.exec('Given');
      assert.strictEqual(match, null);
    });
  });

  suite('tagRe', () => {
    test('should match tag with @', () => {
      const match = tagRe.exec('@smoke');
      assert.ok(match);
      assert.strictEqual(match[1], 'smoke');
    });

    test('should match tag with leading whitespace', () => {
      const match = tagRe.exec('  @regression');
      assert.ok(match);
      assert.strictEqual(match[1], 'regression');
    });

    test('should match tag with underscores and dashes', () => {
      const match1 = tagRe.exec('@test_suite');
      assert.ok(match1);
      assert.strictEqual(match1[1], 'test_suite');

      const match2 = tagRe.exec('@test-suite');
      assert.ok(match2);
      assert.strictEqual(match2[1], 'test-suite');
    });

    test('should match tag with numbers', () => {
      const match = tagRe.exec('@test123');
      assert.ok(match);
      assert.strictEqual(match[1], 'test123');
    });

    test('should not match lines without @', () => {
      const match = tagRe.exec('Feature: Test');
      assert.strictEqual(match, null);
    });
  });

  suite('getSymbolStartLine', () => {
    test('should return same line when no tags or comments above', () => {
      const lines = [
        'Feature: Test',
        '',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 2);
      assert.strictEqual(startLine, 2);
    });

    test('should include tags above symbol', () => {
      const lines = [
        'Feature: Test',
        '@tag1',
        '@tag2',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 3);
      assert.strictEqual(startLine, 1);
    });

    test('should include comments above symbol', () => {
      const lines = [
        'Feature: Test',
        '# This is a comment',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 2);
      assert.strictEqual(startLine, 1);
    });

    test('should include both comments and tags', () => {
      const lines = [
        'Feature: Test',
        '# Comment',
        '@tag1',
        '@tag2',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 4);
      assert.strictEqual(startLine, 1);
    });

    test('should stop at empty line', () => {
      const lines = [
        '@oldtag',
        '',
        '@tag1',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 3);
      assert.strictEqual(startLine, 2);
    });

    test('should stop at other content', () => {
      const lines = [
        'Given a step',
        '@tag1',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 2);
      assert.strictEqual(startLine, 1);
    });

    test('should handle line at start of file', () => {
      const lines = [
        '@tag1',
        'Scenario: Test scenario'
      ];
      const startLine = getSymbolStartLine(lines, 1);
      assert.strictEqual(startLine, 0);
    });

    test('should handle symbol at line 0', () => {
      const lines = [
        'Feature: Test'
      ];
      const startLine = getSymbolStartLine(lines, 0);
      assert.strictEqual(startLine, 0);
    });
  });

  suite('getStepParamSpans', () => {

    // mirrors how the callers build the pattern: the step def text with each {param}
    // already turned into the parse wildcard, then each wildcard wrapped in a group
    const grouped = (textAsRe: string) => textAsRe.replaceAll('.*', '(.*)');

    // asserts on the substrings the spans actually cover, which is what the user sees
    const highlighted = (text: string, textAsRe: string, keywordRe = featureFileStepRe) =>
      getStepParamSpans(text, grouped(textAsRe), keywordRe)
        .map(s => text.substr(s.start, s.length));

    test('locates a quoted parameter value', () => {
      assert.deepStrictEqual(
        highlighted("    Given I select the 'German' language", "I select the '.*' language"),
        ["German"]);
    });

    test('does not match a value that also occurs inside the step keyword', () => {
      // regression: 'en' occurs inside "Then", and locating the span with indexOf() found
      // that one first, so the "en" of "Then" was painted as the parameter
      const text = "        Then the printer language setting is 'en'";
      const spans = getStepParamSpans(text, grouped("the printer language setting is '.*'"),
        featureFileStepRe);

      assert.strictEqual(spans.length, 1);
      assert.strictEqual(text.substr(spans[0].start, spans[0].length), "en");
      assert.strictEqual(spans[0].start, text.lastIndexOf("en"), 'must be the quoted value');
      assert.ok(spans[0].start > text.indexOf("Then") + 4, 'must not land inside the keyword');
    });

    test('locates each of several parameters', () => {
      assert.deepStrictEqual(
        highlighted("    When I set 'width' to '10'", "I set '.*' to '.*'"),
        ["width", "10"]);
    });

    test('distinguishes repeated identical values', () => {
      const text = "    When I copy 'a1' onto 'a1'";
      const spans = getStepParamSpans(text, grouped("I copy '.*' onto '.*'"), featureFileStepRe);

      assert.strictEqual(spans.length, 2);
      assert.notStrictEqual(spans[0].start, spans[1].start, 'each occurrence has its own span');
      assert.strictEqual(text.substr(spans[0].start, spans[0].length), "a1");
      assert.strictEqual(text.substr(spans[1].start, spans[1].length), "a1");
      assert.strictEqual(spans[1].start, text.lastIndexOf("a1"));
    });

    test('excludes the step keyword when the step def starts with a wildcard', () => {
      assert.deepStrictEqual(
        highlighted("    Given some value is set", ".* is set"),
        ["some value"]);
    });

    test('returns nothing when the step does not match', () => {
      assert.deepStrictEqual(highlighted("    Given something else", "I select the '.*'"), []);
    });

    test('returns nothing for a wildcard that matched an empty value', () => {
      assert.deepStrictEqual(highlighted("    Given I select the '' language", "I select the '.*' language"), []);
    });

    test('does not use the d (hasIndices) regex flag, which some extension hosts reject', () => {
      // regression guard: `new RegExp(source, "d")` throws "SyntaxError: Invalid flags: d"
      // on some extension hosts (seen on a remote container), and because the callers
      // catch and log, that silently disabled ALL parameter highlighting rather than
      // degrading. node here supports the flag, so only inspecting the source catches a
      // reintroduction.
      const body = getStepParamSpans.toString();
      assert.ok(!/new RegExp\([^)]*,\s*["'][^"']*d[^"']*["']\s*\)/.test(body),
        'getStepParamSpans must not construct a RegExp with the "d" flag');
    });

    test('works on execute_steps call text, which has no leading whitespace', () => {
      assert.deepStrictEqual(
        highlighted("Then the language setting is 'en'", "the language setting is '.*'",
          executeStepsKeywordRe),
        ["en"]);
    });
  });
});
