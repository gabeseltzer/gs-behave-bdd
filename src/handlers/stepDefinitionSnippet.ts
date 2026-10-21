// Pure text generation for the "create step definition" quick-fixes (no vscode calls, so
// it is unit-testable). Produces behave's own undefined-step snippet shape
// (def step_impl + raise NotImplementedError) adapted to the target steps file: its step
// matcher, decorator style, quote style and behave import.


export interface StepDefinitionSource {
  // resolved step type: given | when | then | step
  stepType: string;
  // step text including its keyword, e.g. "And the user logs in" (used in the raise message)
  stepText: string;
  textWithoutType: string;
  // true for a Scenario Outline step: behave substitutes <name> placeholders before
  // matching, so they become parameters rather than literal text
  inOutline: boolean;
  hasTable: boolean;
  hasDocString: boolean;
}

// An edit to the behave import line: replace an existing line, or insert a new one before `line`.
export interface ImportEdit {
  line: number;
  replace: boolean;
  text: string;
}

export interface StepDefinitionEdits {
  importEdit?: ImportEdit;
  // text appended at the end of the target file
  appendText: string;
  // the raise statement within appendText (callers select it after inserting)
  raiseStatement: string;
}


const STEP_DECORATORS = ["given", "when", "then"];
// the matcher in effect at the end of the file is what applies to an appended definition
const stepMatcherRe = /^\s*(?:use_)?step_matcher\(\s*["'](\w+)["']\s*\)/gm;
const behaveFromImportRe = /^from\s+behave\s+import\s+(.+)$/;
const topLevelImportRe = /^(?:import|from)\s/;
const codeStartRe = /^(?:def|async\s+def|class|@)/;
const outlinePlaceholderRe = /<([^<>]+)>/g;


export function buildStepDefinitionEdits(source: StepDefinitionSource, targetText: string): StepDefinitionEdits {
  const decoratorName = source.stepType.toLowerCase();
  const isRegexMatcher = getActiveStepMatcher(targetText) === "re";
  const quote = getQuoteStyle(targetText);
  const usesBehavePrefix = /^\s*@behave\.(?:step|given|when|then)\(/m.test(targetText) &&
    !/^\s*@(?:step|given|when|then)\(/m.test(targetText);

  const { pattern, params } = buildPattern(source, isRegexMatcher);
  const decorator = `@${usesBehavePrefix ? "behave." : ""}${decoratorName}(${pyString(pattern, quote)})`;
  const raiseStatement = `raise NotImplementedError(${pyString(`STEP: ${source.stepText}`, quote)})`;

  const body: string[] = [decorator, `def step_impl(${["context", ...params].join(", ")}):`];
  if (source.hasTable)
    body.push("    # context.table holds the step's data table");
  if (source.hasDocString)
    body.push("    # context.text holds the step's doc string");
  body.push(`    ${raiseStatement}`);

  const importEdit = usesBehavePrefix ? undefined : buildImportEdit(targetText, decoratorName);

  let separator: string;
  if (targetText.trim() === "" && !importEdit)
    separator = "";
  else if (targetText === "" || targetText.endsWith("\n"))
    separator = "\n\n";
  else
    separator = "\n\n\n";

  return { importEdit, appendText: `${separator}${body.join("\n")}\n`, raiseStatement };
}


// Turns the step text into a decorator pattern for the active matcher, returning the
// function parameters it introduces (outline placeholders).
function buildPattern(source: StepDefinitionSource, isRegexMatcher: boolean): { pattern: string; params: string[] } {
  const params: string[] = [];
  const text = source.textWithoutType.trim();
  const escape = isRegexMatcher
    ? (s: string) => s.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')
    : (s: string) => s.replace(/{/g, "{{").replace(/}/g, "}}"); // parse/cfparse treat braces as fields

  let pattern = "";
  let lastIndex = 0;
  if (source.inOutline) {
    for (const match of text.matchAll(outlinePlaceholderRe)) {
      const name = toPythonIdentifier(match[1]);
      pattern += escape(text.slice(lastIndex, match.index));
      if (params.includes(name))
        pattern += isRegexMatcher ? `(?P=${name})` : `{${name}}`;
      else {
        params.push(name);
        pattern += isRegexMatcher ? `(?P<${name}>.+)` : `{${name}}`;
      }
      lastIndex = (match.index ?? 0) + match[0].length;
    }
  }
  pattern += escape(text.slice(lastIndex));

  return { pattern: isRegexMatcher ? `^${pattern}$` : pattern, params };
}


export function getActiveStepMatcher(targetText: string): string {
  let matcher = "parse";
  for (const match of targetText.matchAll(stepMatcherRe))
    matcher = match[1].toLowerCase();
  return matcher;
}


// Follow the file's existing decorator quoting; default to double quotes.
function getQuoteStyle(targetText: string): '"' | "'" {
  const single = (targetText.match(/^\s*@(?:behave\.)?(?:step|given|when|then)\(\s*u?'/gm) ?? []).length;
  const double = (targetText.match(/^\s*@(?:behave\.)?(?:step|given|when|then)\(\s*u?"/gm) ?? []).length;
  return single > double ? "'" : '"';
}


function pyString(value: string, quote: '"' | "'"): string {
  return quote + value.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`) + quote;
}


function toPythonIdentifier(name: string): string {
  let id = name.trim().replace(/\W+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  if (id === "" || /^\d/.test(id))
    id = `param_${id}`;
  return id;
}


// Makes sure the decorator is imported from behave. Returns undefined when it already is
// (or the import can't be safely extended, e.g. `import *` or a parenthesised import).
function buildImportEdit(targetText: string, decoratorName: string): ImportEdit | undefined {
  const lines = targetText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const match = behaveFromImportRe.exec(lines[i].trimEnd());
    if (!match)
      continue;
    const names = match[1].split("#")[0].trim();
    if (names === "*" || names.startsWith("(") || names.endsWith("\\"))
      return undefined;
    const imported = names.split(",").map(n => n.trim().split(/\s+as\s+/)[0]);
    if (imported.includes(decoratorName))
      return undefined;
    return { line: i, replace: true, text: `from behave import ${names}, ${decoratorName}` };
  }

  // no behave import yet: add one after the leading top-level imports
  const names = [...STEP_DECORATORS];
  if (!names.includes(decoratorName))
    names.push(decoratorName);
  const newImport = `from behave import ${names.join(", ")}`;

  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (codeStartRe.test(lines[i]))
      break;
    if (!topLevelImportRe.test(lines[i]))
      continue;
    // skip past a multi-line import
    let end = i;
    if (lines[i].includes("(") && !lines[i].includes(")")) {
      while (end < lines.length - 1 && !lines[end].includes(")"))
        end++;
    }
    while (end < lines.length - 1 && lines[end].trimEnd().endsWith("\\"))
      end++;
    insertLine = end + 1;
    i = end;
  }

  return { line: insertLine, replace: false, text: newImport };
}
