'use strict';
// Sets VSCE_FAST=1 so that vscode:prepublish skips integration tests, then runs vsce package.
const { execSync } = require('child_process');
process.env.VSCE_FAST = '1';
execSync('vsce package', { stdio: 'inherit', shell: true });
