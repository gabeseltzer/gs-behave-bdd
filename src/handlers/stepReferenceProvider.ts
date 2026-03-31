import * as vscode from 'vscode';
import { isStepsFile, isFeatureFile, getWorkspaceUriForFile, couldBePythonStepsFile } from '../common';
import { getStepMappingsForStepsFileFunction, getStepFileStepForFeatureFileStep } from '../parsers/stepMappings';
import { config } from '../configuration';

export class StepReferenceProvider implements vscode.ReferenceProvider {
    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        context: vscode.ReferenceContext
    ): Promise<vscode.Location[] | undefined> {
        try {
            if (isFeatureFile(document.uri)) {
                return this.getReferencesFromFeatureFile(document.uri, position);
            } else if (isStepsFile(document.uri) || couldBePythonStepsFile(document.uri)) {
                // Support both regular steps files (/steps/) and library files (imported .py files)
                return this.getReferencesFromStepsFile(document.uri, position);
            }
            return undefined;
        } catch (e) {
            try {
                const wkspUri = getWorkspaceUriForFile(document.uri);
                config.logger.showError(e, wkspUri);
            }
            catch {
                config.logger.showError(e);
            }
            return undefined;
        }
    }

    private getReferencesFromStepsFile(uri: vscode.Uri, position: vscode.Position): vscode.Location[] {
        // Find mappings for the step function at the current line
        const stepMappings = getStepMappingsForStepsFileFunction(uri, position.line);

        return stepMappings.map(sm => new vscode.Location(sm.featureFileStep.uri, sm.featureFileStep.range));
    }

    private getReferencesFromFeatureFile(uri: vscode.Uri, position: vscode.Position): vscode.Location[] {
        // 1. Find the step definition (Python) for the current feature step
        const stepFileStep = getStepFileStepForFeatureFileStep(uri, position.line);

        if (!stepFileStep) {
            return [];
        }

        // 2. Find all other feature steps that map to this same step definition
        const stepMappings = getStepMappingsForStepsFileFunction(stepFileStep.uri, stepFileStep.functionDefinitionRange.start.line);

        const locations = stepMappings.map(sm => new vscode.Location(sm.featureFileStep.uri, sm.featureFileStep.range));

        return locations;
    }
}
