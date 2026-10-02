import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { config } from '../../../src/configuration';
import * as behaveLoader from '../../../src/parsers/behaveLoader';
import * as behaveEnv from '../../../src/runners/behaveEnv';
import { getPythonStepCheck, requestPythonStepChecks } from '../../../src/parsers/stepArgumentPythonCheck';
import { rememberStepsPaths, setArgumentCheckDefinitions } from '../../../src/parsers/stepArgumentStore';
import { WorkspaceSettings } from '../../../src/settings';

suite('stepArgumentPythonCheck', () => {
  let sandbox: sinon.SinonSandbox;
  let clock: sinon.SinonFakeTimers;
  let checkStub: sinon.SinonStub;
  let featuresUri: vscode.Uri;
  let wkspSettings: WorkspaceSettings;
  let testNo = 0;

  setup(() => {
    sandbox = sinon.createSandbox();
    clock = sinon.useFakeTimers();
    // a fresh workspace per test: the module keeps its state per features uri
    featuresUri = vscode.Uri.file(`/proj${testNo++}/features`);
    wkspSettings = {
      uri: featuresUri, name: "w", featuresUri, projectUri: vscode.Uri.file("/proj"),
      importStrategy: "useBundled", stepDefinitionSearchTimeout: 5,
    } as unknown as WorkspaceSettings;
    rememberStepsPaths(featuresUri, ["/proj/features/steps"]);
    sandbox.stub(config, 'getPythonExecutable').resolves("python");
    sandbox.stub(behaveEnv, 'getBehaveEnv').returns({});
    checkStub = sandbox.stub(behaveLoader, 'checkStepsWithBehave').callsFake(async (_p, _proj, _paths, requests) => ({
      checks: requests.map(r => ({ stepType: r.stepType, text: r.text, status: "matched" as const })),
      incomplete: false,
    }));
  });

  teardown(() => {
    clock.restore();
    sandbox.restore();
  });

  const request = (text: string, flush: boolean) =>
    requestPythonStepChecks(wkspSettings, [{ stepType: "given", text }], flush);

  async function settle() {
    await clock.tickAsync(1000);
  }

  test('nothing is sent until a flush (a saved file)', async () => {
    request("a", false);
    await settle();
    assert.strictEqual(checkStub.callCount, 0);

    request("b", true);
    await settle();
    assert.strictEqual(checkStub.callCount, 1);
    assert.deepStrictEqual(checkStub.firstCall.args[3].map((r: { text: string }) => r.text), ["a", "b"], "one batch");
    assert.strictEqual(getPythonStepCheck(featuresUri, "given", "a")?.result.status, "matched");
  });

  test('a checked text is not sent again', async () => {
    request("a", true);
    await settle();
    request("a", true);
    await settle();
    assert.strictEqual(checkStub.callCount, 1);
  });

  test('new step definitions discard every verdict', async () => {
    request("a", true);
    await settle();
    setArgumentCheckDefinitions(featuresUri, []);
    assert.strictEqual(getPythonStepCheck(featuresUri, "given", "a"), undefined);
    request("a", true);
    await settle();
    assert.strictEqual(checkStub.callCount, 2);
  });

  test('a failed check is not retried until definitions change', async () => {
    checkStub.rejects(new Error("python exploded"));
    request("a", true);
    await settle();
    request("a", true);
    await settle();
    assert.strictEqual(checkStub.callCount, 1);
  });

  test('a text behave returned no verdict for is not re-requested forever', async () => {
    checkStub.resolves({ checks: [], incomplete: false });
    request("a", true);
    await settle();
    request("a", true);
    await settle();
    assert.strictEqual(checkStub.callCount, 1);
  });
});
