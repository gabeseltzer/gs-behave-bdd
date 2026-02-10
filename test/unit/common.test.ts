// Unit tests for common module utility functions
// Note: This tests only isolated utility functions that don't require VS Code extension context

import * as assert from 'assert';
import { sepr, beforeFirstSepr, afterFirstSepr, cleanBehaveText, getLines } from '../../src/common';

suite('common utilities', () => {

  suite('sepr', () => {
    test('should be a unique separator', () => {
      assert.strictEqual(sepr, ':////:');
    });

    test('should not be a valid path component', () => {
      // The separator should contain characters that cannot appear in file paths
      assert.ok(sepr.includes(':'));
      assert.ok(sepr.includes('/'));
    });
  });

  suite('beforeFirstSepr', () => {
    test('should return part before separator', () => {
      const input = 'part1:////:part2';
      const result = beforeFirstSepr(input);
      assert.strictEqual(result, 'part1');
    });

    test('should handle empty string before separator', () => {
      const input = ':////:part2';
      const result = beforeFirstSepr(input);
      assert.strictEqual(result, '');
    });

    test('should return empty string if no separator', () => {
      const input = 'noSeparator';
      const result = beforeFirstSepr(input);
      // indexOf returns -1 when not found, substring(0, -1) returns empty string
      assert.strictEqual(result, '');
    });
  });

  suite('afterFirstSepr', () => {
    test('should return part after separator', () => {
      const input = 'part1:////:part2';
      const result = afterFirstSepr(input);
      assert.strictEqual(result, 'part2');
    });

    test('should handle empty string after separator', () => {
      const input = 'part1:////:';
      const result = afterFirstSepr(input);
      assert.strictEqual(result, '');
    });

    test('should handle multiple separators', () => {
      const input = 'part1:////:part2:////:part3';
      const result = afterFirstSepr(input);
      assert.strictEqual(result, 'part2:////:part3');
    });
  });

  suite('cleanBehaveText', () => {
    test('should remove ANSI escape sequences', () => {
      const input = '\x1b[33mWarning\x1b[0m';
      const result = cleanBehaveText(input);
      assert.strictEqual(result, 'Warning');
    });

    test('should remove color codes', () => {
      const input = '[33mYellow text[0m';
      const result = cleanBehaveText(input);
      assert.strictEqual(result, 'Yellow text');
    });

    test('should handle text with multiple escape sequences', () => {
      const input = '\x1b[33mStart\x1b[0m middle \x1b[33mEnd\x1b[0m';
      const result = cleanBehaveText(input);
      assert.strictEqual(result, 'Start middle End');
    });

    test('should return unchanged text without escape sequences', () => {
      const input = 'Plain text';
      const result = cleanBehaveText(input);
      assert.strictEqual(result, 'Plain text');
    });

    test('should handle empty string', () => {
      const result = cleanBehaveText('');
      assert.strictEqual(result, '');
    });
  });

  suite('getLines', () => {
    test('should split text by newline', () => {
      const text = 'line1\nline2\nline3';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['line1', 'line2', 'line3']);
    });

    test('should handle Windows line endings (CRLF)', () => {
      const text = 'line1\r\nline2\r\nline3';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['line1', 'line2', 'line3']);
    });

    test('should handle old Mac line endings (CR)', () => {
      const text = 'line1\rline2\rline3';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['line1', 'line2', 'line3']);
    });

    test('should handle mixed line endings', () => {
      const text = 'line1\nline2\r\nline3\rline4';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['line1', 'line2', 'line3', 'line4']);
    });

    test('should handle empty string', () => {
      const text = '';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['']);
    });

    test('should handle single line', () => {
      const text = 'single line';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['single line']);
    });

    test('should handle trailing newline', () => {
      const text = 'line1\nline2\n';
      const result = getLines(text);
      assert.deepStrictEqual(result, ['line1', 'line2', '']);
    });
  });
});
