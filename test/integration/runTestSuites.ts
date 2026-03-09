import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  runTests
} from '@vscode/test-electron';
import { getShortPathOnWindows, installMsPythonExtension } from './testRunUtils';


// this code handles `npm run test` or `npm run testinsiders`
// to debug this code, add a breakpoint here, then open package.json and click the "Debug >" link 
// and choose "test" or "testinsiders" from the dropdown
// (to debug the tests themselves, just launch from the usual debug link in vscode and select the suite to run)


async function runTestSuites() {
  try {
    const version = process.argv[2].slice(2);
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');

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

    let launchArgs = [""];
    let extensionTestsPath = "";


    launchArgs = ["example-projects/simple"];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './simple suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/nested project"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './nested project suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/sibling steps folder 1"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './sibling steps folder 1 suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/sibling steps folder 2"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './sibling steps folder 2 suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/sibling steps folder 3"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './sibling steps folder 3 suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/project A"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './project A suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/project B"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './project B suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = ["example-projects/multiroot.code-workspace"];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './multiroot suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = ["example-projects/simple"];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './debug suite'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    launchArgs = [`"example-projects/step library"`];
    extensionTestsPath = getShortPathOnWindows(path.resolve(__dirname, './stepLibraryDiagnostics'));
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });

    console.log("test run complete");

  } catch (err) {
    console.error('Failed to run tests, ', err);
    process.exit(1);
  }
}


runTestSuites();
