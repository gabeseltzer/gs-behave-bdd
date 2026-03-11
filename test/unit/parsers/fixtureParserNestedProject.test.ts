// Tests for fixtureParser with storePythonFixtureDefinitions
// Verifies that fixture definitions from the Python subprocess are correctly
// stored and retrievable by the fixture parser.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { storePythonFixtureDefinitions, getFixtures, deleteFixtures, getFixtureByTag } from '../../../src/parsers/fixtureParser';
import type { BehaveFixtureDefinition } from '../../../src/parsers/behaveLoader';

const featuresUri = vscode.Uri.file('/workspace_root/subproject/features');

suite('fixtureParser storePythonFixtureDefinitions', () => {

  setup(() => {
    deleteFixtures(featuresUri);
  });

  teardown(() => {
    deleteFixtures(featuresUri);
  });

  test('should store fixtures from Python subprocess output', () => {
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'browser_setup',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 3,
        defLine: 4,
      }
    ];

    const stored = storePythonFixtureDefinitions(featuresUri, pythonFixtures);

    assert.strictEqual(stored, 1, 'Should store 1 fixture');
    const fixtures = getFixtures(featuresUri);
    assert.strictEqual(fixtures.length, 1, 'Should retrieve 1 fixture');

    const browserFixture = fixtures.find(f => f.name === 'browser_setup');
    assert.ok(browserFixture, 'Should find browser_setup fixture');
    assert.ok(browserFixture.uri.fsPath.includes('__init__.py'),
      'Fixture URI should point to the source file');
  });

  test('should convert 1-indexed Python lines to 0-indexed VS Code ranges', () => {
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'my_fixture',
        filePath: '/workspace_root/subproject/features/environment.py',
        decoratorLine: 10,
        defLine: 11,
      }
    ];

    storePythonFixtureDefinitions(featuresUri, pythonFixtures);
    const fixtures = getFixtures(featuresUri);
    const fixture = fixtures[0];

    // Python lines are 1-indexed, VS Code ranges are 0-indexed
    assert.strictEqual(fixture.decoratorRange.start.line, 9, 'Decorator line should be 0-indexed (10 -> 9)');
    assert.strictEqual(fixture.functionDefinitionRange.start.line, 10, 'Def line should be 0-indexed (11 -> 10)');
  });

  test('should store multiple fixtures', () => {
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'browser_setup',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 3,
        defLine: 4,
      },
      {
        functionName: 'database_connection',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 8,
        defLine: 9,
      },
      {
        functionName: 'direct_fixture',
        filePath: '/workspace_root/subproject/features/environment.py',
        decoratorLine: 5,
        defLine: 6,
      },
    ];

    const stored = storePythonFixtureDefinitions(featuresUri, pythonFixtures);
    assert.strictEqual(stored, 3, 'Should store 3 fixtures');

    const fixtures = getFixtures(featuresUri);
    assert.strictEqual(fixtures.length, 3, 'Should retrieve 3 fixtures');
    assert.ok(fixtures.find(f => f.name === 'browser_setup'));
    assert.ok(fixtures.find(f => f.name === 'database_connection'));
    assert.ok(fixtures.find(f => f.name === 'direct_fixture'));
  });

  test('should be retrievable via getFixtureByTag', () => {
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'browser_setup',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 3,
        defLine: 4,
      }
    ];

    storePythonFixtureDefinitions(featuresUri, pythonFixtures);

    const fixture = getFixtureByTag(featuresUri, 'fixture.browser_setup');
    assert.ok(fixture, 'Should find fixture by tag "fixture.browser_setup"');
    assert.strictEqual(fixture.name, 'browser_setup');
  });

  test('should handle empty fixture list', () => {
    const stored = storePythonFixtureDefinitions(featuresUri, []);
    assert.strictEqual(stored, 0, 'Should store 0 fixtures');

    const fixtures = getFixtures(featuresUri);
    assert.strictEqual(fixtures.length, 0, 'Should retrieve 0 fixtures');
  });

  test('deleteFixtures should clear stored fixtures', () => {
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'browser_setup',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 3,
        defLine: 4,
      }
    ];

    storePythonFixtureDefinitions(featuresUri, pythonFixtures);
    assert.strictEqual(getFixtures(featuresUri).length, 1);

    deleteFixtures(featuresUri);
    assert.strictEqual(getFixtures(featuresUri).length, 0, 'Fixtures should be cleared after delete');
  });

  test('should handle fixtures from nested project structure', () => {
    // Simulates the scenario where fixtures live in subproject/lib/
    // and are discovered by Python's inspect module via environment.py imports
    const pythonFixtures: BehaveFixtureDefinition[] = [
      {
        functionName: 'browser_setup',
        filePath: '/workspace_root/subproject/lib/__init__.py',
        decoratorLine: 3,
        defLine: 4,
      },
      {
        functionName: 'helper_fixture',
        filePath: '/workspace_root/subproject/features/helpers.py',
        decoratorLine: 5,
        defLine: 6,
      },
    ];

    storePythonFixtureDefinitions(featuresUri, pythonFixtures);

    const fixtures = getFixtures(featuresUri);
    assert.strictEqual(fixtures.length, 2);

    // Verify the file URIs point to the correct locations
    const browserFixture = fixtures.find(f => f.name === 'browser_setup');
    assert.ok(browserFixture);
    assert.ok(browserFixture.uri.fsPath.includes('lib'), 'browser_setup should reference lib/ directory');

    const helperFixture = fixtures.find(f => f.name === 'helper_fixture');
    assert.ok(helperFixture);
    assert.ok(helperFixture.uri.fsPath.includes('helpers.py'), 'helper_fixture should reference helpers.py');
  });
});
