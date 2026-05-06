import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { runner } from "../index.helper";

// Phase 17 / D-01: install the showInformationMessage stub BEFORE runner() returns.
// The extension's activate() fires the Phase 16 migration notification during
// workspace open — which happens BEFORE any test file's suiteSetup runs. If we
// install the stub in suiteSetup, the real notification UI fires, displays a
// popup, and the fire-and-forget .then() chain hangs forever in CI.
//
// The stub captures every call (sinon stubs auto-record args via .getCalls()).
// Tests in extension.test.ts assert against this call history. Per-test
// re-stubbing for the DSA + "Open Settings" click flows is done by mutating
// the stub's behavior via .callsFake() in those specific tests — see
// RESEARCH §5.2.B / §5.2.C.
//
// No sinon.restore() is called — this Dev Host process exits at end of suite,
// and the stub's lifetime is the entire process. Restoring would re-arm the
// real UI for subsequent tests in the same suite, which we don't want.
sinon.stub(vscode.window, 'showInformationMessage').callsFake(
	(async (..._args: unknown[]) => {
		// Default: dismiss (return undefined). Per-test stubs override via .callsFake().
		return undefined;
	}) as unknown as typeof vscode.window.showInformationMessage
);

export function run(): Promise<void> {
	return runner("**/migrations suite/**.test.js");
}
