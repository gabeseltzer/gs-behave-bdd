import { getExpectedResults } from "./expectedResults";
import { getExpectedCounts } from "./expectedResults";
import { SharedWorkspaceTests } from "../suite-shared/shared.workspace.tests";


suite(`malformed-config suite`, () => {
	const folderName = "malformed-config";
	const testPre = `runHandler should return expected results for "${folderName}" with configuration:`;
	const sharedWorkspaceTests = new SharedWorkspaceTests(testPre);

	test("runDefault", async () =>
		await sharedWorkspaceTests.runDefault(folderName, getExpectedCounts, getExpectedResults)).timeout(300000);

}).timeout(900000);
