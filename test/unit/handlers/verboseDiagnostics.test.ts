// Tests for the verbose diagnostic logging added for "the extension silently does nothing"
// bug reports:
// - Logger.logVerbose writes to the output channel only when verboseLogging is on
// - verboseLoggingEnabled() never throws, even when settings are broken
// - logStepResolutionContext explains WHY a step failed to resolve

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import {
  Logger, pruneOldSessionLogs, SESSION_LOG_RETENTION_DAYS, verboseLoggingEnabled,
} from '../../../src/logger';
import * as configModule from '../../../src/configuration';
import * as loggerModule from '../../../src/logger';
import * as commonModule from '../../../src/common';
import * as stepsParserModule from '../../../src/parsers/stepsParser';
import * as stepMappingsModule from '../../../src/parsers/stepMappings';
import * as featureParserModule from '../../../src/parsers/featureParser';
import {
  logStepResolutionContext, validateAndGetStepInfo, _resetNavLogDedup,
} from '../../../src/handlers/providerHelpers';
import {
  buildDiagnosticReport, diagnosticReportFileName, diagnosticReportHandler,
} from '../../../src/handlers/diagnosticReportHandler';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode');


function stubVerboseLogging(enabled: boolean) {
  sinon.stub(configModule.config, 'globalSettings').get(() => ({
    multiRootRunWorkspacesInParallel: true,
    xRay: false,
    verboseLogging: enabled,
    logEnvVarPresetContents: false,
  }));
}


suite('verbose diagnostic logging', () => {

  // Every Logger opens a real session log file on disk (that is the point - see logger.ts), so
  // any test that constructs one must go through newLogger() to get it cleaned up afterwards.
  const loggers: Logger[] = [];

  function newLogger(): Logger {
    const logger = new Logger();
    loggers.push(logger);
    return logger;
  }

  teardown(() => {
    for (const logger of loggers) {
      const p = logger.getSessionLogPath();
      logger.dispose();
      try { if (p) fs.unlinkSync(p); } catch { /* already gone, or never created */ }
    }
    loggers.length = 0;
    sinon.restore();
  });


  suite('verboseLoggingEnabled', () => {

    test('returns false when verboseLogging is off', () => {
      stubVerboseLogging(false);
      assert.strictEqual(verboseLoggingEnabled(), false);
    });

    test('returns true when verboseLogging is on', () => {
      stubVerboseLogging(true);
      assert.strictEqual(verboseLoggingEnabled(), true);
    });

    test('returns false (does not throw) when settings cannot be read', () => {
      // a broken user config makes the globalSettings getter throw - a logging call must
      // never be the thing that surfaces that
      sinon.stub(configModule.config, 'globalSettings').get(() => { throw new Error("bad config"); });
      assert.strictEqual(verboseLoggingEnabled(), false);
    });

  });


  suite('Logger.logVerbose', () => {

    const wkspUri = vscode.Uri.file('/fake/workspace');
    let appended: string[];

    setup(() => {
      appended = [];
      sinon.stub(vscode.window, 'createOutputChannel').returns({
        append: () => { /* unused */ },
        appendLine: (t: string) => appended.push(t),
        clear: () => { /* unused */ },
        show: () => { /* unused */ },
        hide: () => { /* unused */ },
        dispose: () => { /* unused */ },
        replace: () => { /* unused */ },
        name: 'Behave BDD',
      });
    });

    test('writes nothing when verboseLogging is off', () => {
      stubVerboseLogging(false);
      newLogger().logVerbose("should not appear", wkspUri);
      assert.deepStrictEqual(appended, []);
    });

    test('writes to the workspace output channel with a [verbose] prefix when on', () => {
      stubVerboseLogging(true);
      newLogger().logVerbose("step navigation: gave up", wkspUri);
      assert.deepStrictEqual(appended, ["[verbose] step navigation: gave up"]);
    });

    test('does not throw when no wkspUri is supplied and no channels exist', () => {
      stubVerboseLogging(true);
      assert.doesNotThrow(() => newLogger().logVerbose("no channels yet"));
    });

  });


  suite('Logger session log capture', () => {

    // real fs is used here on purpose - the point of the session log is that it survives
    // arbitrary volume by living on disk, which an fs mock would not exercise
    const wkspUri = vscode.Uri.file('/fake/workspace');

    async function readSessionLog(logger: Logger): Promise<string> {
      await logger.flushSessionLog();
      const p = logger.getSessionLogPath();
      assert.ok(p, 'expected a session log path');
      return fs.readFileSync(p!, 'utf8');
    }

    setup(() => {
      sinon.stub(vscode.window, 'createOutputChannel').returns({
        append: () => { /* unused */ },
        appendLine: () => { /* unused */ },
        clear: () => { /* unused */ },
        show: () => { /* unused */ },
        hide: () => { /* unused */ },
        dispose: () => { /* unused */ },
        replace: () => { /* unused */ },
        name: 'Behave BDD',
      });
    });

    test('captures logInfo output to the session log, prefixed with the workspace name', async () => {
      stubVerboseLogging(false);
      const logger = newLogger();
      logger.logInfo("Searching for step definitions...", wkspUri);

      assert.strictEqual(await readSessionLog(logger), "[workspace] Searching for step definitions...\n");
    });

    test('captures verbose lines so they reach the diagnostic report file', async () => {
      stubVerboseLogging(true);
      const logger = newLogger();
      logger.logVerbose("step navigation: gave up", wkspUri);

      assert.ok((await readSessionLog(logger)).includes('[verbose] step navigation: gave up'));
    });

    test('does not capture verbose lines when verboseLogging is off', () => {
      stubVerboseLogging(false);
      const logger = newLogger();
      logger.logVerbose("should not be captured", wkspUri);

      // nothing was logged at all, so no log file should have been opened
      assert.strictEqual(logger.getSessionLogPath(), undefined);
    });

    test('keeps every line - the log is unbounded, nothing is dropped or truncated', async () => {
      stubVerboseLogging(false);
      const logger = newLogger();
      const lineCount = 20000;
      for (let i = 0; i < lineCount; i++)
        logger.logInfo(`line ${i}`, wkspUri);

      const captured = (await readSessionLog(logger)).split("\n").filter(l => l.length > 0);
      assert.strictEqual(captured.length, lineCount);
      assert.ok(captured[0].endsWith('line 0'), 'the FIRST line must survive');
      assert.ok(captured[lineCount - 1].endsWith(`line ${lineCount - 1}`), 'the last line must survive');
    });

    test('a log file that cannot be opened degrades to no capture instead of throwing', () => {
      stubVerboseLogging(false);
      sinon.stub(fs, 'mkdirSync').throws(new Error('EROFS: read-only file system'));
      const logger = newLogger();

      assert.doesNotThrow(() => logger.logInfo("still logs to the output channel", wkspUri));
      assert.strictEqual(logger.getSessionLogPath(), undefined);
    });

  });


  suite('hover-path cost (validateAndGetStepInfo)', () => {

    // validateAndGetStepInfo backs BOTH the definition provider and the hover provider, so it
    // runs on every mouse-rest anywhere in a feature file. These pin the two things that keep
    // that affordable.

    const featureUri = vscode.Uri.file('/fake/workspace/features/thing.feature');

    function makeDoc(lineText: string) {
      return {
        uri: featureUri,
        lineAt: () => ({ text: lineText }),
      };
    }

    setup(() => {
      _resetNavLogDedup();
      sinon.stub(commonModule, 'getWorkspaceUriForFile').returns(vscode.Uri.file('/fake/workspace'));
    });

    test('builds no message at all when verboseLogging is off', async () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(false);
      const logVerbose = sinon.stub(configModule.config.logger, 'logVerbose');

      // a comment line - the "not a step line" branch, i.e. most hovers in a real file
      await validateAndGetStepInfo(makeDoc('# just a comment') as never, { line: 3 } as never);

      assert.strictEqual(logVerbose.callCount, 0);
    });

    test('collapses a hover storm over one line into a single entry', async () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      const logVerbose = sinon.stub(configModule.config.logger, 'logVerbose');

      const doc = makeDoc('# just a comment');
      for (let i = 0; i < 25; i++)
        await validateAndGetStepInfo(doc as never, { line: 3 } as never);

      assert.strictEqual(logVerbose.callCount, 1, 'repeat hovers over the same line must not re-log');
    });

    test('still logs when the user moves to a different line', async () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      const logVerbose = sinon.stub(configModule.config.logger, 'logVerbose');

      const doc = makeDoc('# just a comment');
      await validateAndGetStepInfo(doc as never, { line: 3 } as never);
      await validateAndGetStepInfo(doc as never, { line: 4 } as never);

      assert.strictEqual(logVerbose.callCount, 2);
    });

  });


  suite('pruneOldSessionLogs', () => {

    let dir: string;

    setup(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-behave-bdd-prune-test-'));
    });

    teardown(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function writeLog(name: string, ageDays: number) {
      const full = path.join(dir, name);
      fs.writeFileSync(full, 'x');
      const when = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
      fs.utimesSync(full, when, when);
    }

    test('deletes session logs older than the retention window', () => {
      writeLog('session-old.log', SESSION_LOG_RETENTION_DAYS + 1);
      writeLog('session-recent.log', 1);

      pruneOldSessionLogs(dir);

      assert.deepStrictEqual(fs.readdirSync(dir), ['session-recent.log']);
    });

    test('never touches files it did not create', () => {
      writeLog('something-else.txt', 999);
      writeLog('session-old.log', 999);

      pruneOldSessionLogs(dir);

      assert.deepStrictEqual(fs.readdirSync(dir), ['something-else.txt']);
    });

    test('does not throw on a missing directory', () => {
      assert.doesNotThrow(() => pruneOldSessionLogs(path.join(dir, 'nope')));
    });

    test('drops oldest-first when recent logs still exceed the total size budget', () => {
      // age alone does not bound disk - several windows running large suites can blow the
      // budget well inside the retention window
      const big = 'x'.repeat(1024);
      for (let i = 0; i < 4; i++) {
        const full = path.join(dir, `session-${i}.log`);
        fs.writeFileSync(full, big);
        const when = new Date(Date.now() - (10 - i) * 60 * 1000); // 0 = oldest
        fs.utimesSync(full, when, when);
      }

      // budget of ~2 files
      sinon.stub(loggerModule, 'SESSION_LOG_TOTAL_BYTES_LIMIT').value(2 * 1024);
      pruneOldSessionLogs(dir);

      const left = fs.readdirSync(dir).sort();
      assert.deepStrictEqual(left, ['session-2.log', 'session-3.log'], 'newest two should survive');
    });

    test('never deletes the running session, even when over budget', () => {
      const keep = path.join(dir, 'session-current.log');
      fs.writeFileSync(keep, 'x'.repeat(4096));
      fs.writeFileSync(path.join(dir, 'session-old.log'), 'x'.repeat(4096));

      sinon.stub(loggerModule, 'SESSION_LOG_TOTAL_BYTES_LIMIT').value(1);
      pruneOldSessionLogs(dir, Date.now(), keep);

      assert.deepStrictEqual(fs.readdirSync(dir), ['session-current.log']);
    });

  });


  suite('logStepResolutionContext', () => {

    const featureUri = vscode.Uri.file('/fake/workspace/features/thing.feature');

    // WorkspaceSettings-shaped stub; only the fields the helper reads are populated
    function makeWkspSettings(opts: { fileInFeatures: boolean }) {
      return {
        projectUri: vscode.Uri.file('/fake/workspace'),
        featuresUris: [vscode.Uri.file('/fake/workspace/features')],
        featuresUri: vscode.Uri.file('/fake/workspace/features'),
        discoverySource: 'behave.ini',
        configFileUri: vscode.Uri.file('/fake/workspace/behave.ini'),
        isFileInFeatures: () => opts.fileInFeatures,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }

    test('returns an empty string when verboseLogging is off (callers pay nothing)', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(false);
      assert.strictEqual(logStepResolutionContext(featureUri), "");
    });

    test('reports missing workspace settings', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(undefined);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('no workspace settings for this file'), detail);
    });

    test('names a features-path misconfiguration when the file is outside every features path', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: false }));

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('NOT inside any configured features path'), detail);
      assert.ok(detail.includes('featuresPaths'), detail);
    });

    test('calls out zero loaded step definitions', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: true }));
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('ZERO step definitions were loaded'), detail);
    });

    test('points at a pattern mismatch when definitions exist but none matched', () => {
      sinon.stub(loggerModule, 'verboseLoggingEnabled').returns(true);
      sinon.stub(commonModule, 'getWorkspaceSettingsForFile').returns(makeWkspSettings({ fileInFeatures: true }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([['k', {} as any]]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const detail = logStepResolutionContext(featureUri);
      assert.ok(detail.includes('step definitions ARE loaded but none matched'), detail);
      assert.ok(detail.includes('step definitions loaded: 1'), detail);
    });

  });


  suite('buildDiagnosticReport', () => {

    const wkspUri = vscode.Uri.file('/fake/workspace');

    setup(() => {
      stubVerboseLogging(false);
    });

    test('warns loudly when no workspace folder was recognised as a behave project', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('===== Behave BDD diagnostic report ====='), report);
      assert.ok(report.includes('No workspace folder was recognised as a behave project'), report);
      // ms-python is absent from the mock, and that is fatal for this extension - say so
      assert.ok(report.includes('NOT INSTALLED'), report);
    });

    test('reports resolved paths and calls out zero loaded step definitions', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
      sinon.stub(configModule.config, 'isWorkspaceSettingsFailed').returns(false);
      sinon.stub(configModule.config, 'getPythonExecutable').resolves('/usr/bin/python3');
      sinon.stub(configModule.config, 'workspaceSettings').get(() => ({
        [wkspUri.path]: {
          name: 'fake',
          projectUri: wkspUri,
          discoverySource: 'behave.ini',
          configFileUri: vscode.Uri.file('/fake/workspace/behave.ini'),
          featuresUris: [vscode.Uri.file('/fake/workspace/features')],
          featuresUri: vscode.Uri.file('/fake/workspace/features'),
          stepsSearchUris: [vscode.Uri.file('/fake/workspace/features')],
          importStrategy: 'useBundled',
          stepDefinitionSearchTimeout: 20,
          activeEnvVarPreset: '',
          envVarPresets: {},
        },
      }));
      sinon.stub(featureParserModule, 'getFeatureFileSteps').returns([['k', {}]] as never);
      sinon.stub(stepsParserModule, 'getStepFileSteps').returns([]);
      sinon.stub(stepMappingsModule, 'getStepMappings').returns([]);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('/usr/bin/python3'), report);
      assert.ok(report.includes('discovery source:  behave.ini'), report);
      assert.ok(report.includes('loaded step definitions:   0'), report);
      assert.ok(report.includes('ZERO step definitions loaded'), report);
      // the report is useful without verboseLogging, but should say it gets better with it
      assert.ok(report.includes('turn on gs-behave-bdd.verboseLogging'), report);
    });

    test('surfaces a workspace whose settings failed to load', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([wkspUri]);
      sinon.stub(configModule.config, 'isWorkspaceSettingsFailed').returns(true);

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('settings FAILED to load for this workspace'), report);
    });

    test('ends with the captured-log header, which the handler appends the log after', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);

      const report = await buildDiagnosticReport();

      assert.ok(report.trimEnd().endsWith('===== captured log (full session, unbounded) ====='), report);
    });

    test('names the session log file so a reader can find the live log', async () => {
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);
      sinon.stub(configModule.config.logger, 'getSessionLogPath').returns('/tmp/gs-behave-bdd-logs/session-x.log');

      const report = await buildDiagnosticReport();

      assert.ok(report.includes('session log:      /tmp/gs-behave-bdd-logs/session-x.log'), report);
    });

  });


  suite('diagnosticReportHandler', () => {

    test('file name is timestamped and contains no characters illegal on Windows', () => {
      const name = diagnosticReportFileName(new Date(Date.UTC(2026, 6, 30, 14, 5, 33, 123)));
      assert.strictEqual(name, 'gs-behave-bdd-diagnostics-2026-07-30T14-05-33.log');
      assert.ok(!/[:*?"<>|]/.test(name), 'must be a legal Windows filename');
    });

    test('writes summary + full session log to a .log file and opens it', async () => {
      stubVerboseLogging(false);
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);
      const showDocStub = sinon.stub(vscode.window, 'showTextDocument').resolves({});
      const openDocStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({});

      // a real session log on disk, so the file-to-file append path is exercised
      const sessionLog = path.join(os.tmpdir(), `gs-behave-bdd-session-test-${process.pid}.log`);
      fs.writeFileSync(sessionLog, '[verbose] step navigation: gave up\n');
      sinon.stub(configModule.config.logger, 'getSessionLogPath').returns(sessionLog);
      sinon.stub(configModule.config.logger, 'flushSessionLog').resolves();

      try {
        await diagnosticReportHandler();

        assert.strictEqual(openDocStub.callCount, 1);
        const reportPath = openDocStub.firstCall.args[0].fsPath;
        assert.ok(reportPath.endsWith('.log'), reportPath);

        const written = fs.readFileSync(reportPath, 'utf8');
        assert.ok(written.includes('===== Behave BDD diagnostic report ====='));
        assert.ok(written.includes('[verbose] step navigation: gave up'), 'session log must be appended');
        assert.ok(written.trimEnd().endsWith('===== end of diagnostic report ====='), written.slice(-200));
        assert.strictEqual(showDocStub.callCount, 1, 'the report file should be opened for review');

        fs.unlinkSync(reportPath);
      }
      finally {
        fs.unlinkSync(sessionLog);
      }
    });

    test('notes the absence of a session log rather than failing', async () => {
      stubVerboseLogging(false);
      sinon.stub(commonModule, 'getUrisOfWkspFoldersWithFeatures').returns([]);
      sinon.stub(vscode.window, 'showTextDocument').resolves({});
      const openDocStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({});
      sinon.stub(configModule.config.logger, 'getSessionLogPath').returns(undefined);
      sinon.stub(configModule.config.logger, 'flushSessionLog').resolves();

      await diagnosticReportHandler();

      const reportPath = openDocStub.firstCall.args[0].fsPath;
      assert.ok(fs.readFileSync(reportPath, 'utf8').includes('(no session log was captured)'));
      fs.unlinkSync(reportPath);
    });

  });

});
