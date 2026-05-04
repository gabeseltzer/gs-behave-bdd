import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('package.json schema — Phase 15 (NOTIF-01)', () => {
  let pkg: { contributes: { configuration: { properties: Record<string, { type?: string; items?: { type?: string }; default?: unknown }> } } };

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
