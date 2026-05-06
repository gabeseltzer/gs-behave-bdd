import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/config-only suite/**.test.js");
}
