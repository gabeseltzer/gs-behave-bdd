import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  runTests
} from '@vscode/test-electron';
import { getCleanTestEnv, getShortPathOnWindows, installMsPythonExtension } from './testRunUtils';
import { snapshotFixtures, restoreFixtures } from './fixtureSnapshot';


// this code handles `npm run test` or `npm run testinsiders`
// to debug this code, add a breakpoint here, then open package.json and click the "Debug >" link 
// and choose "test" or "testinsiders" from the dropdown
// (to debug the tests themselves, just launch from the usual debug link in vscode and select the suite to run)


// Suite folder (under test/integration) and the workspace it opens. A workspace path
// containing spaces is pre-quoted, as the launcher passes it through a shell.
// Order matters only in that the run stops at the first failing suite.
const SUITES: { dir: string, workspace: string }[] = [
  { dir: 'simple suite', workspace: 'example-projects/simple' },
  { dir: 'nested project suite', workspace: '"example-projects/nested project"' },
  { dir: 'sibling steps folder 1 suite', workspace: '"example-projects/sibling steps folder 1"' },
  { dir: 'sibling steps folder 2 suite', workspace: '"example-projects/sibling steps folder 2"' },
  { dir: 'sibling steps folder 3 suite', workspace: '"example-projects/sibling steps folder 3"' },
  { dir: 'project A suite', workspace: '"example-projects/project A"' },
  { dir: 'project B suite', workspace: '"example-projects/project B"' },
  { dir: 'multiroot suite', workspace: 'example-projects/multiroot.code-workspace' },
  { dir: 'debug suite', workspace: 'example-projects/simple' },
  { dir: 'stepLibraryDiagnostics', workspace: '"example-projects/step library"' },
  { dir: 'execute-steps suite', workspace: 'example-projects/execute-steps' },
  { dir: 'config-only suite', workspace: 'example-projects/config-only' },
  { dir: 'pyproject-config suite', workspace: 'example-projects/pyproject-config' },
  { dir: 'malformed-config suite', workspace: 'example-projects/malformed-config' },
  { dir: 'watcher-integration suite', workspace: 'example-projects/watcher-integration' },
  { dir: 'multi-path suite', workspace: 'example-projects/multi-path' },
  { dir: 'multi-path-settings suite', workspace: 'example-projects/multi-path-settings' },
  { dir: 'monorepo-scan suite', workspace: 'example-projects/monorepo-scan' },
  { dir: 'project-switch suite', workspace: 'example-projects/project-switch' },
  { dir: 'migrations suite', workspace: 'example-projects/migration-stale' },
  { dir: 'migration-consent suite', workspace: 'example-projects/migration-consent' },
];


// `--suite <text>` (repeatable) runs only the suites whose folder name contains <text>,
// ignoring case, spaces and punctuation, e.g. `npm run test:integration -- --suite debug --suite "sibling steps folder 2"`.
// No --suite runs them all. An unmatched --suite is an error rather than a silent empty run.
function selectSuites(args: string[]) {
  const filters: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--suite' && args[i + 1] !== undefined)
      filters.push(args[++i]);
    else if (arg.startsWith('--suite='))
      filters.push(arg.slice('--suite='.length));
    else
      throw new Error(`unrecognised argument: ${arg}`);
  }
  if (filters.length === 0)
    return SUITES;

  // Compare letters and digits only: npm on Windows hands arguments through cmd, which turns
  // the spaces in a quoted "sibling steps folder 2" into ^-escapes before they reach us.
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matches = (dir: string, f: string) => norm(dir).includes(norm(f));
  const unmatched = filters.filter(f => !SUITES.some(s => matches(s.dir, f)));
  if (unmatched.length > 0)
    throw new Error(`no suite matches: ${unmatched.join(', ')}\navailable: ${SUITES.map(s => s.dir).join(', ')}`);
  return SUITES.filter(s => filters.some(f => matches(s.dir, f)));
}


async function runTestSuites() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');
  const exampleProjectsDir = path.resolve(extensionDevelopmentPath, 'example-projects');
  // Snapshot fixture settings.json / .code-workspace files so migration
  // writes during the run don't pollute the worktree.
  const snapshots = snapshotFixtures(exampleProjectsDir);
  try {
    const version = process.argv[2].slice(2);
    // before the download, so a mistyped --suite fails straight away
    const selected = selectSuites(process.argv.slice(3));

    // console.log("running pip...");
    // const result = cp.spawnSync("pip", ["install", "-r", path.resolve(extensionDevelopmentPath + "/requirements.txt")], {
    //   encoding: 'utf-8',
    //   stdio: 'inherit',
    // });
    // if(result.error)
    //   throw result.error;    

    console.log(`checking for latest ${version} vscode...`);
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);


    await installMsPythonExtension(vscodeExecutablePath);


    console.log("starting test run...");

    // strip the host extension host's env vars so the spawned VSCode does not start as plain node
    const extensionTestsEnv = getCleanTestEnv();

    for (const suite of selected) {
      console.log(`running suite: ${suite.dir}`);
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath: getShortPathOnWindows(path.resolve(__dirname, `./${suite.dir}`)),
        launchArgs: [suite.workspace],
        extensionTestsEnv
      });
    }

    console.log("test run complete");

  } catch (err) {
    console.error('Failed to run tests, ', err);
    process.exitCode = 1;
  } finally {
    restoreFixtures(snapshots);
  }
}


runTestSuites();
