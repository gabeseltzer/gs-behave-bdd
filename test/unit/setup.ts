// Test setup and teardown hooks for unit tests

// This file is loaded before all unit tests run (see .mocharc.json)
// Mock the vscode module for unit tests since they run outside VS Code

import * as Module from 'module';
import * as vscodeMock from './vscode.mock';

// Intercept all require calls to 'vscode' and return our mock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequireFunction = (id: string) => any;
const originalRequire = Module.prototype.require as RequireFunction;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype.require as any) = function (this: NodeModule, id: string) {
  if (id === 'vscode') {
    return vscodeMock;
  }
  return originalRequire.call(this, id);
};

export function mochaHooks() {
  return {
    beforeAll(done: Mocha.Done) {
      // Global setup
      done();
    },
    afterAll(done: Mocha.Done) {
      // Global teardown  
      done();
    }
  };
}
