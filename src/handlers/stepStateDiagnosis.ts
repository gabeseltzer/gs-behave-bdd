/**
 * Turns the three counts that describe a workspace's step state into a plain-language
 * diagnosis. Extracted as a pure function so the language-status item, the diagnostic report,
 * and the step-navigation log all say the SAME thing about the same situation - these had
 * started to drift apart, and a status item that disagrees with the log is worse than neither.
 *
 * "Degenerate" states are ones where discovery reported no error, so everything looks healthy,
 * but nothing can possibly resolve. That combination - green "Ready" while ctrl+click does
 * nothing - is exactly what makes users report the extension as broken.
 */
export interface StepStateDiagnosis {
  /** Short label for the language-status item, e.g. "No step definitions" */
  title: string;
  /** One-sentence cause + what to check */
  detail: string;
}


export function diagnoseStepState(
  featureStepCount: number,
  stepDefCount: number,
  mappingCount: number,
): StepStateDiagnosis | undefined {

  if (featureStepCount === 0) {
    return {
      title: "No feature steps found",
      detail: "No steps were parsed from any .feature file. The configured features path probably " +
        "does not contain your feature files - check gs-behave-bdd.featuresPaths, or the \"paths\" " +
        "entry in your behave config file.",
    };
  }

  if (stepDefCount === 0) {
    return {
      title: "No step definitions loaded",
      detail: "Feature steps were found but zero step definitions were loaded, so nothing can match. " +
        "Step definitions must live in a \"steps\" folder under a configured features path. " +
        "Enable gs-behave-bdd.verboseLogging and check the Behave BDD output for details.",
    };
  }

  if (mappingCount === 0) {
    return {
      title: "No steps matched",
      detail: "Feature steps and step definitions both exist, but none of them matched. This is " +
        "usually a step text or parameter mismatch, or step files that failed to load - check the " +
        "Problems pane.",
    };
  }

  return undefined;
}
