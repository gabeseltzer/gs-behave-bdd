import * as assert from 'assert';
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

  // TODO: Plan 05 — flip this test.skip to test() once all 17 entries land (D-A4.4).
  test.skip('registry contains exactly 17 entries (D-A4.4) — enabled by Plan 05', () => {
    assert.strictEqual(MIGRATION_REGISTRY.length, 17);
  });

});
