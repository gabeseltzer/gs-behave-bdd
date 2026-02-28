import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/debug suite/**.test.js");
}
