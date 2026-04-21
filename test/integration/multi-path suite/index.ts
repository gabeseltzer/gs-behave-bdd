import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/multi-path suite/**.test.js");
}
