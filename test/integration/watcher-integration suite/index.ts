import { runner } from "../index.helper";

export function run(): Promise<void> {
	return runner("**/watcher-integration suite/**.test.js");
}
