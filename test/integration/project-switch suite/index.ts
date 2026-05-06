import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/project-switch suite/**.test.js");
}
