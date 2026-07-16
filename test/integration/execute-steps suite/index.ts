import { runner } from "../index.helper";

export function run(): Promise<void> {
  return runner("**/execute-steps suite/**.test.js");
}
