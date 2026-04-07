import * as vscode from 'vscode';
import { parseFeatureContent } from './featureParser';
import { uriId, isFeatureFile } from '../common';
import { config } from "../configuration";
import { WorkspaceSettings } from "../settings";
import { diagLog } from '../logger';

let generationCounter = 0;
export type TestData = WeakMap<vscode.TestItem, BehaveTestData>;


export class TestFile {
  public didResolve = false;

  private addDuplicateScenarioDiagnostics(featureUri: vscode.Uri, scenarioRanges: Map<string, vscode.Range[]>) {
    const existingDiagnostics = config.diagnostics.get(featureUri) || [];
    const newDiagnostics = [...existingDiagnostics];

    for (const [scenarioName, ranges] of scenarioRanges) {
      if (ranges.length > 1) {
        diagLog(`Duplicate scenario detected: "${scenarioName}"`);

        for (const range of ranges) {
          const diagnostic = new vscode.Diagnostic(
            range,
            `Duplicate scenario name: "${scenarioName}". Each scenario in a feature file must have a unique name.`,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.code = "duplicate-scenario";
          diagnostic.source = "gs-behave-bdd";
          newDiagnostics.push(diagnostic);
        }
      }
    }
    config.diagnostics.set(featureUri, newDiagnostics);
  }

  public async createScenarioTestItemsFromFeatureFileContent(wkspSettings: WorkspaceSettings, content: string, testData: TestData,
    controller: vscode.TestController, item: vscode.TestItem, caller: string) {
    if (!item.uri)
      throw new Error("missing test item uri");
    if (!isFeatureFile(item.uri))
      throw new Error(`${item.uri.path} is not a feature file`);

    item.error = undefined;

    const featureUri = item.uri;
    const featureName = item.label;
    const featureFileWkspRelativePath = vscode.workspace.asRelativePath(featureUri, false);
    const featureFilename = featureUri.path.split('/').pop();
    if (featureFilename === undefined)
      throw new Error("featureFilename is undefined");

    const thisGeneration = generationCounter++;
    const ancestors: { item: vscode.TestItem, children: vscode.TestItem[] }[] = [];
    const scenarioRanges = new Map<string, vscode.Range[]>();
    this.didResolve = true;

    // Tracks the current Scenario Outline and current Examples group for building the tree
    let currentOutlineItem: { item: vscode.TestItem, children: vscode.TestItem[] } | undefined;
    let currentGroupItem: { item: vscode.TestItem, children: vscode.TestItem[] } | undefined;

    // Clear any existing diagnostics for this file
    const existingDiagnostics = config.diagnostics.get(featureUri) || [];
    const nonDuplicateDiagnostics = existingDiagnostics.filter(d => d.code !== "duplicate-scenario");
    config.diagnostics.set(featureUri, nonDuplicateDiagnostics);

    const ascend = (depth: number) => {
      while (ancestors.length > depth) {
        const finished = ancestors.pop();
        if (finished === undefined)
          throw new Error("finished is undefined");
        try {
          finished.item.children.replace(finished.children);
        }
        catch (e: unknown) {
          const err = (e as Error).toString();
          if (err.includes("duplicate test item")) {
            this.addDuplicateScenarioDiagnostics(featureUri, scenarioRanges);
          }
          else
            throw e;
        }
      }
    };

    const flushGroupChildren = () => {
      if (currentGroupItem) {
        currentGroupItem.item.children.replace(currentGroupItem.children);
        currentGroupItem = undefined;
      }
    };

    const flushOutlineChildren = () => {
      flushGroupChildren();
      if (currentOutlineItem) {
        currentOutlineItem.item.children.replace(currentOutlineItem.children);
        currentOutlineItem = undefined;
      }
    };

    const onScenarioLine = (range: vscode.Range, scenarioName: string, isOutline: boolean) => {
      flushOutlineChildren();
      const parent = ancestors[ancestors.length - 1];

      // Track scenario name and range for duplicate detection
      const ranges = scenarioRanges.get(scenarioName) || [];
      ranges.push(range);
      scenarioRanges.set(scenarioName, ranges);

      const data = new Scenario(featureFilename, featureFileWkspRelativePath, featureName, scenarioName, thisGeneration, isOutline);
      const id = `${uriId(featureUri)}/${data.getLabel()}`;
      const tcase = controller.createTestItem(id, data.getLabel(), featureUri);
      testData.set(tcase, data);
      tcase.range = range;
      parent.item.label = featureName;
      parent.children.push(tcase);
      diagLog(`created child test item scenario ${tcase.id} from ${featureUri.path}`);

      if (isOutline) {
        currentOutlineItem = { item: tcase, children: [] };
      }
    }

    const onFeatureLine = (range: vscode.Range) => {
      item.range = range;
      ancestors.push({ item: item, children: [] });
    }

    const onExamplesGroup = (range: vscode.Range, outlineName: string, tableIndex: number, examplesNameStr: string) => {
      if (!currentOutlineItem)
        return;
      flushGroupChildren();
      const groupData = new ScenarioExamplesGroup(featureFilename, featureFileWkspRelativePath, featureName, outlineName, examplesNameStr, tableIndex);
      const label = groupData.getLabel();
      const id = `${currentOutlineItem.item.id}/${label}-${tableIndex}`;
      const tcase = controller.createTestItem(id, label, featureUri);
      testData.set(tcase, groupData);
      tcase.range = range;
      currentOutlineItem.children.push(tcase);
      currentGroupItem = { item: tcase, children: [] };
      diagLog(`created examples group test item ${tcase.id} from ${featureUri.path}`);
    }

    const onExampleRow = (range: vscode.Range, outlineName: string, tableIndex: number, rowIndex: number, examplesNameStr: string, values: string[]) => {
      const parent = currentGroupItem ?? currentOutlineItem;
      if (!parent)
        return;
      const junitName = `${outlineName} -- @${tableIndex}.${rowIndex}${examplesNameStr ? ' ' + examplesNameStr : ''}`;
      const exampleRow: ExampleRow = { tableIndex, rowIndex, examplesName: examplesNameStr, values, junitName };
      const data = new Scenario(featureFilename, featureFileWkspRelativePath, featureName, outlineName, thisGeneration, false, exampleRow);
      const label = data.getLabel();
      const id = `${parent.item.id}/${label}`;
      const tcase = controller.createTestItem(id, label, featureUri);
      testData.set(tcase, data);
      tcase.range = range;
      parent.children.push(tcase);
      diagLog(`created example row test item ${tcase.id} from ${featureUri.path}`);
    }

    parseFeatureContent(wkspSettings, featureUri, content, caller, onScenarioLine, onFeatureLine, onExampleRow, onExamplesGroup);

    flushOutlineChildren(); // ensure last outline/group children are set
    ascend(0); // assign children for all remaining items
  }

}


export interface ExampleRow {
  tableIndex: number;    // 1-based index of the Examples table within this outline
  rowIndex: number;      // 1-based index of the data row within the table
  examplesName: string;  // text after "Examples:" (may be empty)
  values: string[];      // cell values for this row
  /** Full behave junit-style name: "<outlineName> -- @<tableIndex>.<rowIndex> <examplesName>" */
  junitName: string;
}

export class Scenario {
  public result: string | undefined;
  constructor(
    public readonly featureFileName: string,
    public readonly featureFileWorkspaceRelativePath: string,
    public readonly featureName: string,
    public scenarioName: string,
    public generation: number,
    public readonly isOutline: boolean,
    public readonly exampleRow?: ExampleRow,
  ) { }

  getLabel() {
    if (this.exampleRow) {
      const valuesStr = this.exampleRow.values.join(' | ');
      return `@${this.exampleRow.tableIndex}.${this.exampleRow.rowIndex} ${valuesStr}`;
    }
    return `${this.scenarioName}`;
  }
}


export class ScenarioExamplesGroup {
  constructor(
    public readonly featureFileName: string,
    public readonly featureFileWorkspaceRelativePath: string,
    public readonly featureName: string,
    public readonly scenarioName: string,
    public readonly examplesName: string,
    public readonly tableIndex: number,
  ) { }

  getLabel() {
    return this.examplesName || 'Examples';
  }
}

export type BehaveTestData = TestFile | Scenario | ScenarioExamplesGroup;




