// Unit tests for discover.py's find_duplicate_steps function
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';

/**
 * Runs the find_duplicate_steps function from discover.py via a small Python wrapper.
 * Returns the list of duplicate entries.
 */
function runFindDuplicates(stepsDirs: string[]): { step_type: string; pattern: string; file: string; line: number }[] {
  // Walk up from __dirname (which is out/test/test/unit/parsers/ when compiled) to find project root
  let dir = __dirname;
  let discoverPath = '';
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'src', 'python', 'discover.py');
    if (fs.existsSync(candidate)) {
      discoverPath = candidate;
      break;
    }
    dir = path.dirname(dir);
  }
  if (!discoverPath) throw new Error('Could not find discover.py');

  // Python snippet that imports and calls find_duplicate_steps
  const script = `
import sys, json
sys.path.insert(0, "${path.dirname(discoverPath).replace(/\\/g, '/')}")
from discover import find_duplicate_steps
result = find_duplicate_steps(${JSON.stringify(stepsDirs)})
print(json.dumps(result))
`;

  const output = execFileSync('python', ['-c', script], {
    encoding: 'utf-8',
    timeout: 10000,
  });

  return JSON.parse(output.trim());
}

suite('discover.py - find_duplicate_steps', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behave-vsc-dup-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects duplicate @given patterns across two files', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '@given("a calculator")',
      'def step_impl(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      '@given("a calculator")',
      'def step_impl_dup(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);

    assert.strictEqual(result.length, 2, 'should find 2 entries for the duplicate');
    assert.ok(result.every(r => r.pattern === 'a calculator'));
    assert.ok(result.every(r => r.step_type === 'given'));

    const files = result.map(r => path.basename(r.file));
    assert.ok(files.includes('a.py'));
    assert.ok(files.includes('b.py'));
  });

  test('does not flag unique step patterns as duplicates', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '@given("step one")',
      'def step_one(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      '@given("step two")',
      'def step_two(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);
    assert.strictEqual(result.length, 0, 'no duplicates should be found');
  });

  test('detects duplicate within the same file', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '@given("a step")',
      'def step_one(context):',
      '    pass',
      '',
      '@given("a step")',
      'def step_two(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);

    assert.strictEqual(result.length, 2, 'should find 2 entries for same-file duplicate');
    assert.strictEqual(result[0].line, 1);
    assert.strictEqual(result[1].line, 5);
  });

  test('detects @step conflicting with @given (same pattern)', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '@step("do something")',
      'def step_generic(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      '@given("do something")',
      'def step_given(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);

    assert.ok(result.length >= 2, '@step and @given with same pattern should be flagged as duplicates');
  });

  test('handles @behave.given decorator syntax', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '@behave.given("a step")',
      'def step_one(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      '@given("a step")',
      'def step_two(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);

    assert.strictEqual(result.length, 2, '@behave.given and @given with same pattern should be duplicates');
  });

  test('handles single-quoted decorator patterns', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      "@given('a step')",
      'def step_one(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      "@given('a step')",
      'def step_two(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);
    assert.strictEqual(result.length, 2);
  });

  test('returns correct line numbers (1-indexed)', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '# comment',
      '',
      '@given("on line three")',
      'def step_impl(context):',
      '    pass',
    ].join('\n'));

    fs.writeFileSync(path.join(stepsDir, 'b.py'), [
      '@given("on line three")',
      'def step_impl2(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);

    const aEntry = result.find(r => path.basename(r.file) === 'a.py');
    assert.strictEqual(aEntry?.line, 3, 'a.py decorator is on line 3');

    const bEntry = result.find(r => path.basename(r.file) === 'b.py');
    assert.strictEqual(bEntry?.line, 1, 'b.py decorator is on line 1');
  });

  test('ignores commented-out decorators', () => {
    const stepsDir = path.join(tmpDir, 'steps');
    fs.mkdirSync(stepsDir);

    fs.writeFileSync(path.join(stepsDir, 'a.py'), [
      '# @given("a step")',
      '@given("a step")',
      'def step_impl(context):',
      '    pass',
    ].join('\n'));

    const result = runFindDuplicates([stepsDir]);
    assert.strictEqual(result.length, 0, 'commented-out decorator should not count as duplicate');
  });

  test('returns empty array for nonexistent directory', () => {
    const result = runFindDuplicates([path.join(tmpDir, 'nonexistent')]);
    assert.strictEqual(result.length, 0);
  });
});
