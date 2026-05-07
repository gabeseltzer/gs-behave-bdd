import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type SchemaProp = {
  type?: string;
  items?: { type?: string };
  default?: unknown;
  enum?: unknown;
  scope?: string;
  markdownDescription?: string;
};

suite('package.json schema — Phase 15 (NOTIF-01)', () => {
  let pkg: { contributes: { configuration: { properties: Record<string, SchemaProp> } } };

  suiteSetup(() => {
    let pkgPath = path.resolve(__dirname, '../../../../package.json');
    if (!fs.existsSync(pkgPath)) {
      pkgPath = path.resolve(__dirname, '../../../package.json');
    }
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  });

  test('suppressedNotifications has correct array schema shape', () => {
    const props = pkg.contributes.configuration.properties;
    const s = props['gs-behave-bdd.suppressedNotifications'];
    assert.ok(s, 'suppressedNotifications must be present in schema');
    assert.strictEqual(s.type, 'array', 'type must be "array"');
    assert.ok(s.items, 'items must be defined');
    assert.strictEqual(s.items!.type, 'string', 'items.type must be "string"');
    assert.ok(Array.isArray(s.default), 'default must be an array');
    assert.strictEqual((s.default as unknown[]).length, 0, 'default must be []');
  });

  test('legacy suppressMultiConfigNotification key REMOVED from schema (NOTIF-05)', () => {
    const props = pkg.contributes.configuration.properties;
    assert.ok(
      !('gs-behave-bdd.suppressMultiConfigNotification' in props),
      'Legacy key must be absent from schema after Plan 05',
    );
  });

  test('legacy singular featuresPath key REMOVED from schema (DEP-01)', () => {
    const props = pkg.contributes.configuration.properties;
    assert.ok(
      !('gs-behave-bdd.featuresPath' in props),
      'Legacy singular featuresPath must be absent from schema after Phase 16 / Plan 05',
    );
    assert.ok(
      'gs-behave-bdd.featuresPaths' in props,
      'Plural featuresPaths must remain present in schema',
    );
  });
});

suite('package.json schema — Phase 19 (CONSENT-05/07/08)', () => {
  let pkg: { contributes: { configuration: { properties: Record<string, SchemaProp> } } };

  suiteSetup(() => {
    let pkgPath = path.resolve(__dirname, '../../../../package.json');
    if (!fs.existsSync(pkgPath)) {
      pkgPath = path.resolve(__dirname, '../../../package.json');
    }
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  });

  test('migrationMode has correct enum schema shape (CONSENT-05)', () => {
    const props = pkg.contributes.configuration.properties;
    const s = props['gs-behave-bdd.migrationMode'];
    assert.ok(s, 'migrationMode must be present in schema');
    assert.strictEqual(s.type, 'string', 'type must be "string"');
    assert.strictEqual(s.scope, 'resource', 'scope must be "resource"');
    assert.deepStrictEqual(
      s.enum,
      ['prompt', 'migrate-and-delete', 'migrate-and-keep', 'skip'],
      'enum must list all four migration mode values in order',
    );
    assert.strictEqual(s.default, 'prompt', 'default must be "prompt"');
    assert.ok(typeof s.markdownDescription === 'string' && s.markdownDescription.length > 0,
      'markdownDescription must be a non-empty string');
    assert.ok(s.markdownDescription!.includes('prompt'),
      'markdownDescription must mention "prompt" (CONSENT-08)');
    assert.ok(s.markdownDescription!.includes('migrate'),
      'markdownDescription must mention "migrate" (CONSENT-08)');
  });

  test('completedMigrations has correct array schema shape (CONSENT-07)', () => {
    const props = pkg.contributes.configuration.properties;
    const s = props['gs-behave-bdd.completedMigrations'];
    assert.ok(s, 'completedMigrations must be present in schema');
    assert.strictEqual(s.type, 'array', 'type must be "array"');
    assert.strictEqual(s.scope, 'resource', 'scope must be "resource"');
    assert.ok(s.items, 'items must be defined');
    assert.strictEqual(s.items!.type, 'string', 'items.type must be "string"');
    assert.deepStrictEqual(s.default, [], 'default must be []');
    assert.ok(typeof s.markdownDescription === 'string' && s.markdownDescription.length > 0,
      'markdownDescription must be a non-empty string');
    assert.ok(s.markdownDescription!.includes('migration'),
      'markdownDescription must mention "migration" (CONSENT-08)');
    assert.ok(s.markdownDescription!.includes('Recheck Migrations'),
      'markdownDescription must mention the *Recheck Migrations* command (CONSENT-08)');
  });
});
