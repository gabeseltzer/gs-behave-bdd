import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { runner } from "../index.helper";

// Phase 22 / 022-02: install the showInformationMessage stub BEFORE runner()
// returns. Activation fires during workspace open (workspaceContains:**/*.feature),
// BEFORE any test file's suiteSetup. Mirrors the migrations-suite pattern in
// test/integration/migrations suite/index.ts.
//
// The default fake dismisses every prompt (returns undefined). Per-test
// .callsFake() overrides drive the case-2 / case-3 button paths. The stub
// captures every call via .getCalls(), which Test 1 uses to assert that
// case-1 fires ZERO prompts.
//
// No sinon.restore() is called — this Dev Host process exits at end of suite,
// and the stub's lifetime is the entire process.
sinon.stub(vscode.window, 'showInformationMessage').callsFake(
	(async (..._args: unknown[]) => {
		return undefined;
	}) as unknown as typeof vscode.window.showInformationMessage
);

export function run(): Promise<void> {
	return runner("**/migration-consent suite/**.test.js");
}
