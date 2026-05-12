// Phase 022 — Cleanup, Integration, Docs.
// Static regression pins that complement the integration suite + existing
// packageJsonSchema unit tests. None of these touch the implementation; they
// just lock in the user-visible contracts that the Phase 022 plans landed:
//
//   - CLEANUP-01 — no silent `behave-vsc.*` reads remain in the runtime path
//     (settings.ts / configuration.ts / common.ts / discovery/*).
//   - DOC-01     — README bullet #14 and the "Migrating from `behave-vsc`"
//     sub-section exist with the required structural anchors.
//   - DOC-02     — the migrationMode markdownDescription contains the
//     case-3-always-prompt callout (and the Recheck Migrations reference)
//     that the existing packageJsonSchema test does NOT verify.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function repoRoot(): string {
  // Tests are compiled into out/test/test/unit/. Resolve back to repo root
  // robustly across the two layouts the project uses.
  const candidates = [
    path.resolve(__dirname, '../../../..'),
    path.resolve(__dirname, '../../..'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  throw new Error('could not locate repo root from ' + __dirname);
}

suite('Phase 022 — CLEANUP-01: no silent behave-vsc reads in runtime path', () => {
  const root = repoRoot();
  const filesToCheck = [
    path.join(root, 'src', 'settings.ts'),
    path.join(root, 'src', 'configuration.ts'),
    path.join(root, 'src', 'common.ts'),
    path.join(root, 'src', 'discovery', 'projectList.ts'),
  ];

  for (const file of filesToCheck) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    test(`${rel} contains no getConfiguration("behave-vsc"`, () => {
      assert.ok(fs.existsSync(file), `${rel} should exist`);
      const src = fs.readFileSync(file, 'utf8');
      const idx = src.indexOf('getConfiguration("behave-vsc"');
      const idxSingle = src.indexOf("getConfiguration('behave-vsc'");
      assert.strictEqual(idx, -1, `${rel} must not call getConfiguration("behave-vsc", …) (CLEANUP-01)`);
      assert.strictEqual(idxSingle, -1, `${rel} must not call getConfiguration('behave-vsc', …) (CLEANUP-01)`);
    });
  }

  test('getWithLegacyFallback helper is gone from src/settings.ts', () => {
    const settingsPath = path.join(root, 'src', 'settings.ts');
    const src = fs.readFileSync(settingsPath, 'utf8');
    assert.strictEqual(
      src.indexOf('getWithLegacyFallback'), -1,
      'getWithLegacyFallback helper was deleted in 022-01 and must not return',
    );
  });

  test('legacyConfig parameter name is gone from src/ (excluding extension.ts command aliases and notifications.ts source-namespace list)', () => {
    // Walk only the files the CLEANUP-01 plan explicitly drained.
    for (const file of filesToCheck) {
      const src = fs.readFileSync(file, 'utf8');
      assert.strictEqual(
        src.indexOf('legacyConfig'), -1,
        `${path.relative(root, file)} must not reference legacyConfig (CLEANUP-01)`,
      );
    }
  });
});

suite('Phase 022 — DOC-01: README Migrating from behave-vsc anchors', () => {
  const root = repoRoot();
  let readme: string;

  suiteSetup(() => {
    const p = path.join(root, 'README.md');
    assert.ok(fs.existsSync(p), 'README.md must exist at repo root');
    readme = fs.readFileSync(p, 'utf8');
  });

  test('README has bullet #14 referencing migration from behave-vsc', () => {
    // The bullet is a numbered list item in the "New in this fork" section.
    // We pin: there's a line starting with "14." that mentions both
    // `behave-vsc` and "migration" (case-insensitive).
    const lines = readme.split(/\r?\n/);
    const bullet14 = lines.find(l => /^14\.\s/.test(l));
    assert.ok(bullet14, 'README must contain a top-level "14." list item');
    assert.ok(
      /behave-vsc/i.test(bullet14!),
      `bullet #14 must mention behave-vsc; got: ${bullet14}`,
    );
    assert.ok(
      /migrat/i.test(bullet14!),
      `bullet #14 must mention migration; got: ${bullet14}`,
    );
  });

  test('README has the "Migrating from behave-vsc" sub-section heading', () => {
    // Heading is "#### Migrating from `behave-vsc`" per the 022-03 SUMMARY.
    // Match any h3/h4 heading whose text mentions Migrating + behave-vsc.
    const headingRx = /^#{2,4}\s+Migrating from `?behave-vsc`?/m;
    assert.ok(
      headingRx.test(readme),
      'README must contain a "Migrating from `behave-vsc`" sub-section heading',
    );
  });

  test('README sub-section mentions all three case outcomes plus Recheck Migrations', () => {
    // Don't pin specific wording — pin the structural anchors only.
    assert.ok(/v1\.5\.0/.test(readme), 'README must mention v1.5.0 in the migration section');
    assert.ok(/case 1|silently/i.test(readme), 'README must describe Case 1 outcome');
    assert.ok(/case 2/i.test(readme), 'README must describe Case 2 outcome');
    assert.ok(/case 3/i.test(readme), 'README must describe Case 3 outcome');
    assert.ok(
      /Behave BDD: Recheck Migrations/.test(readme),
      'README must reference the "Behave BDD: Recheck Migrations" command palette entry',
    );
    assert.ok(
      /gs-behave-bdd\.migrationMode/.test(readme),
      'README must reference the gs-behave-bdd.migrationMode setting',
    );
  });
});

suite('Phase 022 — DOC-02: migrationMode markdownDescription case-3 callout', () => {
  const root = repoRoot();
  let pkg: { contributes: { configuration: { properties: Record<string, { markdownDescription?: string }> } } };

  suiteSetup(() => {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  });

  test('migrationMode description contains the case-3-always-prompt callout', () => {
    const desc = pkg.contributes.configuration.properties['gs-behave-bdd.migrationMode'].markdownDescription;
    assert.ok(typeof desc === 'string' && desc.length > 0, 'migrationMode.markdownDescription must be non-empty');
    // The case-3 callout MUST be present per DOC-02 acceptance.
    assert.ok(
      /case ?3/i.test(desc!) && /(always|regardless)/i.test(desc!) && /prompt/i.test(desc!),
      `migrationMode.markdownDescription must explain that case 3 always prompts regardless of mode; got: ${desc}`,
    );
    // Plus the Recheck Migrations reference — pinned for both keys per DOC-02.
    assert.ok(
      /Recheck Migrations/.test(desc!),
      `migrationMode.markdownDescription must reference *Behave BDD: Recheck Migrations*; got: ${desc}`,
    );
    // Plus all four enum values must be enumerated in the prose.
    for (const v of ['prompt', 'migrate-and-delete', 'migrate-and-keep', 'skip']) {
      assert.ok(
        desc!.includes(v),
        `migrationMode.markdownDescription must list the '${v}' value; got: ${desc}`,
      );
    }
  });
});
