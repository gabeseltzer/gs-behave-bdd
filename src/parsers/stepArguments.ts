/**
 * Step argument checking: does the text of a feature file step satisfy the parameter
 * types of the step definition behave would match it to?
 *
 * Terminology follows behave: a *parameter* is a `{name:type}` field in a step definition,
 * an *argument* is the text in a feature file step that fills it (behave.model_type.Argument).
 *
 * The extension's ordinary step mapping collapses every parameter to a wildcard, so
 * `Given I have many cukes` maps to `@given("I have {count:d} cukes")` even though behave
 * reports it undefined. This module re-checks a step against the regexes behave really
 * uses - which discover.py reports per definition (`param_check`) - translated from Python
 * to JavaScript regex syntax.
 *
 * The overriding rule is NO FALSE POSITIVES: anything that can't be translated faithfully
 * makes its definition "unverifiable", and a step that could be matched by an unverifiable
 * definition is "undetermined" - never flagged here (the Python check may still decide it).
 */

import type { StepFileStep } from './stepsParser';
import { convertPatternToTextAsRe } from './stepsParserBehaveAdapter';


/** One literal-or-parameter piece of a parse/cfparse step definition, as discover.py reports it. */
export interface ParamSegment {
  /** literal text segment */
  text?: string;
  /** parameter name ("" for an anonymous `{:d}`) */
  name?: string;
  /** format spec after the colon, e.g. "d", "Color", "Color+" */
  spec?: string;
  /** parse type name, "" for an untyped `{name}` */
  type?: string;
  /** python regex for this one parameter */
  regex?: string;
  custom?: boolean;
  /** false for a custom type registered without a pattern - its regex is `.+?` */
  hasPattern?: boolean;
  /** the converter can raise even when the regex matched, so only Python can be sure */
  needsPython?: boolean;
  /** a custom type's own pattern, for display */
  typePattern?: string;
  /** a repeated parameter name: its argument must equal this earlier segment's */
  repeatOf?: number;
}

/** How behave matches one step definition (discover.py `param_check`). */
export interface ParamCheckInfo {
  /** parse | cfparse | re | re0 | other */
  kind: string;
  /** python re flag names, e.g. ["DOTALL"] */
  flags: string[];
  /** parse/cfparse only */
  segments?: ParamSegment[];
  /** re/re0 only - the complete regex */
  regex?: string;
  needsPython: boolean;
}

/** A step definition as the argument check needs it. */
export interface ArgumentCheckDefinition {
  stepType: string;
  pattern: string;
  filePath: string;
  /** 1-indexed decorator line, as behave reports it */
  lineNumber: number;
  /** undefined = discover.py couldn't describe it (e.g. recovered from source) */
  paramCheck?: ParamCheckInfo;
}

interface CompiledSegment {
  segment: ParamSegment;
  /** anchored regex for this parameter on its own (parameters only) */
  alone?: RegExp;
}

export class CompiledDefinition {
  /** the extension's wildcard regex for this definition - same as its step mapping uses */
  public readonly loose: RegExp;
  /** behave's own regex, translated - undefined when unverifiable */
  public readonly strict?: RegExp;
  /** loose regex with one named group per segment, for locating arguments in a mismatch */
  public readonly looseSegmented?: RegExp;
  public readonly segments: CompiledSegment[] = [];

  /**
   * @param stepFileStep the extension's own record of this definition, for navigation -
   *   undefined when it wasn't stored (the step mapping then falls back to wildcard matching)
   */
  constructor(public readonly definition: ArgumentCheckDefinition, public readonly stepFileStep?: StepFileStep) {
    this.loose = new RegExp(`^${convertPatternToTextAsRe(definition.pattern)}$`);
    const info = definition.paramCheck;
    if (!info)
      return;

    const flags = jsFlags(info.flags);
    if (flags === undefined)
      return;

    if (info.kind === "parse" || info.kind === "cfparse") {
      const compiled = compileSegments(info.segments ?? [], flags, info.flags);
      if (!compiled)
        return;
      this.strict = compiled.strict;
      this.looseSegmented = compiled.looseSegmented;
      this.segments = compiled.segments;
    }
    else if ((info.kind === "re" || info.kind === "re0") && info.regex !== undefined) {
      const source = pyRegexToJs(info.regex, info.flags);
      if (source === undefined)
        return;
      // behave calls regex.match(): anchored at the start only ("re" adds its own ^...$)
      this.strict = tryRegExp(`^(?:${source})`, flags);
    }
  }

  get verifiable() {
    return this.strict !== undefined;
  }

  get needsPython() {
    return this.definition.paramCheck?.needsPython ?? true;
  }
}


/** An argument located in a step's text (offsets are within the text after the keyword). */
export interface LocatedArgument {
  /** index into the definition's segments */
  segmentIndex: number;
  segment: ParamSegment;
  start: number;
  end: number;
  text: string;
}

export type StepArgumentCheck =
  /** behave would match this definition (its converters may still raise - see needsPython) */
  | { status: "matched"; definition: CompiledDefinition; arguments: LocatedArgument[] }
  /** something loosely matches, but no definition's real regex does: behave reports undefined */
  | { status: "mismatch"; definition: CompiledDefinition; badArguments: LocatedArgument[]; arguments: LocatedArgument[] }
  /** an unverifiable definition could be the one behave matches - can't tell from here */
  | { status: "undetermined" }
  /** nothing even loosely matches - an ordinary undefined step, reported elsewhere */
  | { status: "unmatched" };


/**
 * Checks a step's text (after the keyword) the way behave's StepRegistry.find_match does:
 * the step type's definitions in registration order, then the generic `@step` ones, first
 * match wins.
 *
 * `otherLoose` are wildcard regexes for definitions the extension knows about but discover.py
 * did not describe (e.g. cached from a step file that failed to load): if one of those loosely
 * matches, the step is undetermined rather than a mismatch.
 */
export function checkStepText(definitions: readonly CompiledDefinition[], stepType: string, text: string,
  otherLoose: readonly RegExp[] = []): StepArgumentCheck {

  const candidates = getCandidates(definitions, stepType);

  for (const candidate of candidates) {
    if (!candidate.verifiable) {
      // can't tell whether behave would stop here; "re"/"other" definitions' wildcard form
      // isn't meaningful, so for those any candidate is a possible match
      const kind = candidate.definition.paramCheck?.kind;
      const couldMatch = kind === "re" || kind === "re0" || kind === "other" || candidate.loose.test(text);
      if (couldMatch)
        return { status: "undetermined" };
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (candidate.strict!.test(text))
      return { status: "matched", definition: candidate, arguments: locateStrictArguments(candidate, text) };
  }

  if (otherLoose.some(re => re.test(text)))
    return { status: "undetermined" };

  // nothing matches for real - blame the definition the step mapping would pick (the longest
  // wildcard pattern, see _getStepFileStepMatch), so the diagnostic agrees with go-to-definition
  const looseMatches = candidates.filter(c => c.loose.test(text));
  if (looseMatches.length === 0)
    return { status: "unmatched" };
  const blamed = looseMatches.reduce((best, c) => c.loose.source.length > best.loose.source.length ? c : best);
  const located = locateLooseArguments(blamed, text);
  const badArguments = located.filter(a => !argumentFits(blamed, a, located));
  return { status: "mismatch", definition: blamed, badArguments, arguments: located };
}


// behave's candidate order per step type, built once per definitions list: this runs for
// every feature file step whenever step mappings are rebuilt
const candidatesCache = new WeakMap<readonly CompiledDefinition[], Map<string, CompiledDefinition[]>>();

function getCandidates(definitions: readonly CompiledDefinition[], stepType: string) {
  let byType = candidatesCache.get(definitions);
  if (!byType) {
    byType = new Map();
    candidatesCache.set(definitions, byType);
  }
  let candidates = byType.get(stepType);
  if (!candidates) {
    candidates = definitions.filter(d => d.definition.stepType === stepType);
    if (stepType !== "step")
      candidates.push(...definitions.filter(d => d.definition.stepType === "step"));
    byType.set(stepType, candidates);
  }
  return candidates;
}


function argumentFits(definition: CompiledDefinition, arg: LocatedArgument, all: LocatedArgument[]) {
  const repeatOf = arg.segment.repeatOf;
  if (repeatOf !== undefined)
    return all.find(a => a.segmentIndex === repeatOf)?.text === arg.text;
  const alone = definition.segments[arg.segmentIndex].alone;
  return alone ? alone.test(arg.text) : true;
}


function locateWith(definition: CompiledDefinition, re: RegExp | undefined, text: string): LocatedArgument[] {
  if (!re)
    return [];
  const match = re.exec(text);
  if (!match?.groups)
    return [];
  const located: LocatedArgument[] = [];
  let offset = 0;
  definition.segments.forEach((compiled, i) => {
    const value = match.groups?.[`s${i}`] ?? "";
    if (compiled.segment.text === undefined)
      located.push({ segmentIndex: i, segment: compiled.segment, start: offset, end: offset + value.length, text: value });
    offset += value.length;
  });
  return located;
}

function locateStrictArguments(definition: CompiledDefinition, text: string) {
  // segments only exist for parse/cfparse, whose strict regex is segmented
  return definition.segments.length > 0 ? locateWith(definition, definition.strict, text) : [];
}

/** Locates arguments by literal text alone, so a bad argument can still be pointed at. */
export function locateLooseArguments(definition: CompiledDefinition, text: string) {
  return locateWith(definition, definition.looseSegmented, text);
}


// ---------------------------------------------------------------------------
// Building a definition's regexes
// ---------------------------------------------------------------------------

function compileSegments(segments: ParamSegment[], flags: string, pyFlags: string[]) {
  if (segments.length === 0)
    return undefined;

  const strictParts: string[] = [];
  const looseParts: string[] = [];
  const compiled: CompiledSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.text !== undefined) {
      const literal = escapeLiteral(segment.text);
      strictParts.push(`(?<s${i}>${literal})`);
      looseParts.push(`(?<s${i}>${literal})`);
      compiled.push({ segment });
      continue;
    }
    if (segment.repeatOf !== undefined) {
      strictParts.push(`(?<s${i}>\\k<s${segment.repeatOf}>)`);
      looseParts.push(`(?<s${i}>[\\s\\S]*?)`);
      compiled.push({ segment });
      continue;
    }
    // every segment is wrapped in a group of its own, which renumbers groups: a numbered
    // backreference inside a parameter's pattern would point somewhere else
    if (segment.regex === undefined || /\\[1-9]/.test(segment.regex))
      return undefined;
    const source = pyRegexToJs(segment.regex, pyFlags);
    if (source === undefined)
      return undefined;
    const alone = tryRegExp(`^(?:${source})$`, flags);
    if (!alone)
      return undefined;
    strictParts.push(`(?<s${i}>${source})`);
    looseParts.push(`(?<s${i}>[\\s\\S]*?)`);
    compiled.push({ segment, alone });
  }

  const strict = tryRegExp(`^${strictParts.join("")}$`, flags);
  const looseSegmented = tryRegExp(`^${looseParts.join("")}$`, flags);
  if (!strict || !looseSegmented)
    return undefined;
  return { strict, looseSegmented, segments: compiled };
}

function tryRegExp(source: string, flags: string): RegExp | undefined {
  try {
    return new RegExp(source, flags);
  }
  catch {
    return undefined;
  }
}

function escapeLiteral(text: string) {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/** JS flags for python re flags, or undefined if one has no faithful equivalent. */
function jsFlags(pyFlags: string[]): string | undefined {
  let flags = "u";
  for (const flag of pyFlags) {
    switch (flag) {
      case "IGNORECASE": flags += "i"; break;
      case "DOTALL": flags += "s"; break;
      case "MULTILINE": flags += "m"; break;
      case "ASCII": break; // handled during translation (no unicode widening of \w etc.)
      default: return undefined; // VERBOSE, LOCALE, ...
    }
  }
  return flags;
}


// ---------------------------------------------------------------------------
// Python -> JavaScript regex translation
// ---------------------------------------------------------------------------

// python's \w (str patterns) is unicode-aware: letters, numbers and underscore. JS's \w is
// ASCII-only even with the u flag, so widen it explicitly.
const PY_WORD = "\\p{L}\\p{N}_";
const PY_DIGIT = "\\p{Nd}";

/**
 * Translates a python `re` pattern to an equivalent JavaScript (u-flag) pattern source, or
 * returns undefined when it can't be translated faithfully. Deliberately conservative: an
 * undefined result only costs a missed diagnostic, a wrong translation costs a false one.
 */
export function pyRegexToJs(source: string, pyFlags: string[]): string | undefined {
  const ascii = pyFlags.includes("ASCII");
  const word = ascii ? "\\w" : `[${PY_WORD}]`;
  const nonWord = ascii ? "\\W" : `[^${PY_WORD}]`;
  const wordBoundary = ascii ? "\\b"
    : `(?:(?<=[${PY_WORD}])(?![${PY_WORD}])|(?<![${PY_WORD}])(?=[${PY_WORD}]))`;
  const nonWordBoundary = ascii ? "\\B"
    : `(?:(?<=[${PY_WORD}])(?=[${PY_WORD}])|(?<![${PY_WORD}])(?![${PY_WORD}]))`;

  let out = "";
  let i = 0;
  let inClass = false;

  while (i < source.length) {
    const ch = source[i];

    if (ch === "\\") {
      const escaped = translateEscape(source, i, inClass, ascii, { word, nonWord, wordBoundary, nonWordBoundary });
      if (!escaped)
        return undefined;
      out += escaped.js;
      i += escaped.length;
      continue;
    }

    if (inClass) {
      if (ch === "]") {
        inClass = false;
        out += ch;
      }
      else if (ch === "[") {
        // literal in python; JS u-mode accepts it unescaped too, but be explicit
        out += "\\[";
      }
      else {
        out += ch;
      }
      i++;
      continue;
    }

    if (ch === "[") {
      inClass = true;
      out += "[";
      i++;
      if (source[i] === "^") {
        out += "^";
        i++;
      }
      // a "]" straight after the opening bracket is a literal in python, the end of an
      // (empty) class in JS
      if (source[i] === "]") {
        out += "\\]";
        i++;
      }
      continue;
    }

    if (ch === "(" && source[i + 1] === "?") {
      const rest = source.slice(i + 2);
      if (rest.startsWith("P<")) {
        out += "(?<";
        i += 4;
        continue;
      }
      const backref = /^P=(\w+)\)/.exec(rest);
      if (backref) {
        out += `\\k<${backref[1]}>`;
        i += 2 + backref[0].length;
        continue;
      }
      if (rest.startsWith(":") || rest.startsWith("=") || rest.startsWith("!")
        || rest.startsWith("<=") || rest.startsWith("<!")) {
        out += "(?";
        i += 2;
        continue;
      }
      if (rest.startsWith("#")) {
        const end = source.indexOf(")", i);
        if (end === -1)
          return undefined;
        i = end + 1;
        continue;
      }
      // inline flags, atomic groups, conditionals, ...: no faithful JS equivalent
      return undefined;
    }

    // possessive quantifiers (python 3.11+) - JS would read "a*+" as an error anyway, but
    // "{1,2}+" could slip through as a different meaning
    if ((ch === "*" || ch === "+" || ch === "?" || ch === "}") && source[i + 1] === "+")
      return undefined;

    // python accepts "{,n}" as {0,n}; anything brace-shaped that JS reads differently is
    // left to new RegExp() to reject, except this one which JS u-mode also rejects
    out += ch;
    i++;
  }

  if (inClass)
    return undefined;
  return out;
}

interface EscapeTargets { word: string; nonWord: string; wordBoundary: string; nonWordBoundary: string }

function translateEscape(source: string, i: number, inClass: boolean, ascii: boolean, targets: EscapeTargets):
  { js: string; length: number } | undefined {

  const next = source[i + 1];
  if (next === undefined)
    return undefined;

  const classWord = ascii ? "\\w" : PY_WORD;
  switch (next) {
    case "w": return { js: inClass ? classWord : targets.word, length: 2 };
    case "W": return inClass ? (ascii ? { js: "\\W", length: 2 } : undefined) : { js: targets.nonWord, length: 2 };
    case "d": return { js: ascii ? "\\d" : (inClass ? PY_DIGIT : `[${PY_DIGIT}]`), length: 2 };
    case "D": return inClass ? (ascii ? { js: "\\D", length: 2 } : undefined) : { js: ascii ? "\\D" : `[^${PY_DIGIT}]`, length: 2 };
    case "s": case "S": case "n": case "t": case "r": case "f": case "v":
      return { js: `\\${next}`, length: 2 };
    case "b": return { js: inClass ? "\\x08" : targets.wordBoundary, length: 2 };
    case "B": return inClass ? undefined : { js: targets.nonWordBoundary, length: 2 };
    case "A": return inClass ? undefined : { js: "^", length: 2 };
    case "Z": return inClass ? undefined : { js: "$", length: 2 };
    case "a": return { js: "\\x07", length: 2 };
    case "0": return /[0-7]/.test(source[i + 2] ?? "") ? undefined : { js: "\\0", length: 2 };
    case "x": {
      const hex = /^[0-9a-fA-F]{2}/.exec(source.slice(i + 2));
      return hex ? { js: `\\x${hex[0]}`, length: 4 } : undefined;
    }
    case "u": {
      const hex = /^[0-9a-fA-F]{4}/.exec(source.slice(i + 2));
      return hex ? { js: `\\u${hex[0]}`, length: 6 } : undefined;
    }
    case "U": {
      const hex = /^[0-9a-fA-F]{8}/.exec(source.slice(i + 2));
      return hex ? { js: `\\u{${hex[0]}}`, length: 10 } : undefined;
    }
  }

  if (/[1-9]/.test(next)) {
    // numbered backreference: same numbering in both engines (named groups count too)
    if (inClass)
      return undefined;
    const digits = /^[0-9]{1,2}/.exec(source.slice(i + 1));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { js: `\\${digits![0]}`, length: 1 + digits![0].length };
  }

  if (/[A-Za-z0-9]/.test(next))
    return undefined; // \N{...}, \G, \z, ... - nothing faithful

  // escaped punctuation. JS u-mode only allows escaping syntax characters (and "-" in a
  // class); every other punctuation character is the same thing unescaped.
  if ("^$\\.*+?()[]{}|/".includes(next) || (inClass && next === "-"))
    return { js: `\\${next}`, length: 2 };
  return { js: next, length: 2 };
}


// ---------------------------------------------------------------------------
// Describing parameters to the user
// ---------------------------------------------------------------------------

const BUILTIN_TYPE_DESCRIPTIONS: Record<string, string> = {
  "": "any text",
  d: "an integer",
  n: "a number with thousands separators",
  f: "a fixed-point number, e.g. 1.5",
  F: "a decimal number, e.g. 1.5",
  e: "a number in exponent notation, e.g. 1.5e3",
  g: "a number (integer, fixed-point or exponent notation)",
  "%": "a percentage, e.g. 50%",
  b: "a binary number",
  o: "an octal number",
  x: "a hexadecimal number",
  l: "letters",
  w: "letters, numbers and underscores",
  W: "anything except letters, numbers and underscores",
  s: "whitespace",
  S: "anything except whitespace",
  D: "anything except digits",
  ti: "an ISO 8601 date/time",
  te: "an RFC 2822 email date/time",
  tg: "a day/month/year date/time",
  ta: "a month/day/year date/time",
  tc: "a ctime() date/time",
  th: "an HTTP log date/time",
  ts: "a Linux system log date/time",
  tt: "a time",
};

/** The parameter as written in the step definition, e.g. `{count:d}`. */
export function parameterLabel(segment: ParamSegment, definition?: CompiledDefinition): string {
  if (segment.repeatOf !== undefined && definition) {
    const first = definition.segments[segment.repeatOf]?.segment;
    if (first)
      return parameterLabel(first);
  }
  return `{${segment.name ?? ""}${segment.spec ? ":" + segment.spec : ""}}`;
}

/** What a parameter accepts, in words, e.g. "an integer" or "a Color (red|green|blue)". */
export function describeParameterType(segment: ParamSegment): string {
  const type = segment.type ?? "";
  if (segment.custom) {
    const article = /^[aeiou]/i.test(type) ? "an" : "a";
    if (segment.typePattern !== undefined)
      return `${article} ${type} (pattern: ${segment.typePattern})`;
    return `${article} ${type}`;
  }
  return BUILTIN_TYPE_DESCRIPTIONS[type] ?? `a "${type}" value`;
}
