'use strict';
// Skipped when VSCE_FAST=1 (e.g. via `npm run package:fast`).
if (!process.env.VSCE_FAST) {
    const { execSync } = require('child_process');
    execSync('npm run test:integration', { stdio: 'inherit', shell: true });
}
