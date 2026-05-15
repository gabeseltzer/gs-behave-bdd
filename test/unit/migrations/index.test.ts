import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATION_REGISTRY } from '../../../src/migrations';

suite('Phase 20 — migrations registry invariants', () => {

  test('no duplicate entry ids (Pitfall 3)', () => {
    const ids = MIGRATION_REGISTRY.map(e => e.id);
    const duplicates = ids.filter((id, i, a) => a.indexOf(id) !== i);
    assert.strictEqual(
      new Set(ids).size,
      ids.length,
      `Registry contains duplicate ids: [${duplicates.join(', ')}]`
    );
  });

  test('every id matches the documented naming convention', () => {
    for (const e of MIGRATION_REGISTRY) {
      assert.ok(
        /-from-behavevsc$/.test(e.id) || /-self$/.test(e.id),
        `Entry id "${e.id}" does not match <key>-from-behavevsc or <key>-self convention`
      );
    }
  });

  test('registry contains exactly 17 entries (D-A4.4)', () => {
    assert.strictEqual(MIGRATION_REGISTRY.length, 17, 'D-A4.4 mandates 17 entries');
  });

  test('Phase 20 D-A6.1: extension.ts wires evaluateAllMigrations and deletes v1.4.0 silent calls', () => {
    // Tests run from out/test/test/unit/migrations/ — 5 levels up to project root.
    let extPath = path.resolve(__dirname, '../../../../../src/extension.ts');
    if (!fs.existsSync(extPath)) {
      extPath = path.resolve(__dirname, '../../../../src/extension.ts');
    }
    const src = fs.readFileSync(extPath, 'utf8');
    assert.ok(
      src.includes('evaluateAllMigrations'),
      'extension.ts must call evaluateAllMigrations during activation (D-A6.1)',
    );
    assert.ok(
      !src.includes('migrateLegacyFeaturesPath(wkspUri)'),
      'D-A6.1: migrateLegacyFeaturesPath direct call site must be deleted from extension.ts',
    );
    assert.ok(
      !src.includes('migrateLegacySuppressMultiConfig(wkspUri)'),
      'D-A6.1: migrateLegacySuppressMultiConfig direct call site must be deleted from extension.ts',
    );
  });

});
