// A workspace folder that project discovery rejects gets NO test items, NO step parsing and
// NO step navigation - the extension simply does nothing for it. That rejection used to be
// completely silent, which is the most common cause of "it isn't working for me". These tests
// pin the reason-reporting.

import * as assert from 'assert';
import * as fs from 'fs';
import * as sinon from 'sinon';
import { getUrisOfWkspFoldersWithFeatures } from '../../../src/common';
import * as configModule from '../../../src/configuration';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');


suite('project discovery rejection logging', () => {

  let verboseLines: string[];
  let allWkspLines: string[];

  function useFolders(folders: { name: string; path: string }[]) {
    sinon.stub(vscode.workspace, 'workspaceFolders').value(
      folders.map(f => ({ name: f.name, uri: vscode.Uri.file(f.path), index: 0 })));
  }

  setup(() => {
    verboseLines = [];
    allWkspLines = [];
    sinon.stub(configModule.config.logger, 'logVerbose').callsFake((t: string) => { verboseLines.push(t); });
    sinon.stub(configModule.config.logger, 'logInfoAllWksps').callsFake((t: string) => { allWkspLines.push(t); });
    // no config files, no features folders => every folder is rejected
    sinon.stub(fs, 'existsSync').returns(false);
  });

  teardown(() => {
    sinon.restore();
    // the module caches the result; force the next real caller to recompute
    try { getUrisOfWkspFoldersWithFeatures(true); } catch { /* no folders stubbed any more */ }
  });


  test('names each rejected folder and why it was rejected', () => {
    useFolders([{ name: 'my-tests', path: '/repo/my-tests' }]);

    const result = getUrisOfWkspFoldersWithFeatures(true);

    assert.deepStrictEqual(result, []);
    const detail = verboseLines.join("\n");
    assert.ok(detail.includes('project discovery: examined 1 workspace folder(s), accepted 0'), detail);
    assert.ok(detail.includes('"my-tests"'), detail);
    assert.ok(detail.includes('no behave project found'), detail);
    assert.ok(detail.includes('behave.ini'), 'should name the config files it looked for');
  });

  test('states unconditionally that the extension will do nothing when nothing is found', () => {
    // this one is NOT gated on verboseLogging - a user who has not enabled it still gets a
    // standing record of why the extension is inert
    useFolders([{ name: 'a', path: '/repo/a' }, { name: 'b', path: '/repo/b' }]);

    getUrisOfWkspFoldersWithFeatures(true);

    const loud = allWkspLines.join("\n");
    assert.ok(loud.includes('no behave project was found'), loud);
    assert.ok(loud.includes('step navigation'), 'should name the consequence');
    assert.ok(loud.includes('"a"') && loud.includes('"b"'), 'should list every folder');
  });

  test('does not claim failure when at least one folder was accepted', () => {
    useFolders([{ name: 'ok', path: '/repo/ok' }]);
    // features/ exists for this folder => convention branch accepts it
    (fs.existsSync as sinon.SinonStub).callsFake((p: string) => String(p).endsWith('features'));

    const result = getUrisOfWkspFoldersWithFeatures(true);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(allWkspLines.length, 0, 'must not log the "nothing found" message');
    assert.ok(verboseLines.join("\n").includes('accepted 1'), verboseLines.join("\n"));
  });

});
