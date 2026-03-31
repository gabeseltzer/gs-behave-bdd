import { runner } from "../index.helper";

export function run(): Promise<void> {
  return runner("**/nested project suite/**.test.js");
}
