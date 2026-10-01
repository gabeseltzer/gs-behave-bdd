import * as assert from 'assert';
import { checkStepText, CompiledDefinition, describeParameterType, parameterLabel, ParamCheckInfo, pyRegexToJs }
  from '../../../src/parsers/stepArguments';

const INT_RE = "(?P<f1>[-+ ]?[-+ ]?[0-9]+|[-+ ]?0[xX][0-9a-fA-F]+|[-+ ]?0[bB][01]+|[-+ ]?0[oO][0-7]+)";

function parseDef(pattern: string, segments: ParamCheckInfo["segments"], stepType = "given", needsPython = false) {
  return new CompiledDefinition({
    stepType, pattern, filePath: "/steps/steps.py", lineNumber: 1,
    paramCheck: { kind: "parse", flags: ["DOTALL"], segments, needsPython },
  });
}

const cukes = () => parseDef("I have {count:d} cukes", [
  { text: "I have " },
  { name: "count", spec: "d", type: "d", regex: INT_RE, custom: false, hasPattern: true, needsPython: false },
  { text: " cukes" },
]);


suite('stepArguments - pyRegexToJs', () => {

  const translates = (py: string, js: string) => assert.strictEqual(pyRegexToJs(py, []), js, py);
  const refuses = (py: string) => assert.strictEqual(pyRegexToJs(py, []), undefined, py);
  const behaves = (py: string, text: string, expected: boolean) =>
    assert.strictEqual(new RegExp(`^(?:${pyRegexToJs(py, [])})$`, "u").test(text), expected, `${py} on "${text}"`);

  test('named groups and backreferences', () => {
    translates("(?P<n>\\d+)-(?P=n)", "(?<n>[\\p{Nd}]+)-\\k<n>");
  });

  test('anchors \\A and \\Z', () => {
    translates("\\Aabc\\Z", "^abc$");
  });

  test('\\w and \\d are unicode-aware like python, not ASCII like JS', () => {
    behaves("\\w+", "café", true);
    behaves("\\w+", "½", true);
    behaves("\\w+", "a-b", false);
    behaves("\\d+", "٣", true);
    behaves("[\\w-]+", "naïve-x", true);
  });

  test('ASCII flag keeps \\w ASCII', () => {
    assert.strictEqual(pyRegexToJs("\\w+", ["ASCII"]), "\\w+");
  });

  test('\\b follows python word characters', () => {
    behaves(".*\\bcafé\\b.*", "a café b", true);
    behaves(".*\\bfé\\b.*", "café", false);
  });

  test('escaped punctuation JS u-mode rejects is passed through unescaped', () => {
    translates("a\\!b\\ c\\'", "a!b c'");
    translates("\\.\\(\\)", "\\.\\(\\)");
  });

  test('a leading ] in a class is a literal, as in python', () => {
    behaves("[]a]+", "]a]", true);
  });

  test('constructs with no faithful JS equivalent are refused', () => {
    refuses("(?i)abc");
    refuses("(?i:abc)");
    refuses("(?>abc)");
    refuses("a*+");
    refuses("(?(1)a|b)");
    refuses("\\N{DASH}");
    refuses("\\G");
    refuses("[\\W]");
    refuses("[abc");
  });

  test('comments are dropped', () => {
    translates("a(?#note)b", "ab");
  });
});


suite('stepArguments - checkStepText', () => {

  test('matched: the argument is located', () => {
    const result = checkStepText([cukes()], "given", "I have 5 cukes");
    assert.strictEqual(result.status, "matched");
    assert.ok(result.status === "matched");
    assert.deepStrictEqual(result.arguments.map(a => [a.text, a.start, a.end]), [["5", 7, 8]]);
  });

  test('mismatch: the bad argument is located', () => {
    const result = checkStepText([cukes()], "given", "I have many cukes");
    assert.ok(result.status === "mismatch");
    assert.deepStrictEqual(result.badArguments.map(a => [a.text, a.start, a.end]), [["many", 7, 11]]);
  });

  test('unmatched when nothing even loosely matches', () => {
    assert.strictEqual(checkStepText([cukes()], "given", "something else").status, "unmatched");
  });

  test('step type: then-steps only see given definitions through @step', () => {
    assert.strictEqual(checkStepText([cukes()], "then", "I have 5 cukes").status, "unmatched");
    const generic = parseDef("I have {count:d} cukes", cukes().definition.paramCheck?.segments, "step");
    assert.strictEqual(checkStepText([generic], "then", "I have 5 cukes").status, "matched");
  });

  test('a definition without param info is unverifiable - steps it could match are undetermined', () => {
    const undescribed = new CompiledDefinition({ stepType: "given", pattern: "I have {count:d} cukes", filePath: "/s.py", lineNumber: 1 });
    assert.strictEqual(undescribed.verifiable, false);
    assert.strictEqual(checkStepText([undescribed], "given", "I have many cukes").status, "undetermined");
  });

  test('an untranslatable custom pattern makes its definition unverifiable', () => {
    const def = parseDef("a {c:Color} car", [
      { text: "a " },
      { name: "c", spec: "Color", type: "Color", regex: "(?P<f1>(?i)red)", custom: true, hasPattern: true, needsPython: true },
      { text: " car" },
    ]);
    assert.strictEqual(def.verifiable, false);
    assert.strictEqual(checkStepText([def], "given", "a purple car").status, "undetermined");
  });

  test('an unverifiable regex-matcher definition makes any step undetermined if nothing earlier matched', () => {
    const re = new CompiledDefinition({
      stepType: "given", pattern: "^(?i)anything$", filePath: "/s.py", lineNumber: 2,
      paramCheck: { kind: "re", flags: [], regex: "^(?i)anything$", needsPython: false },
    });
    assert.strictEqual(checkStepText([cukes(), re], "given", "I have many cukes").status, "undetermined");
    assert.strictEqual(checkStepText([cukes(), re], "given", "I have 5 cukes").status, "matched");
  });

  test('a cached definition discover.py did not describe makes a mismatch undetermined', () => {
    const cached = /^I have .* cukes$/;
    assert.strictEqual(checkStepText([cukes()], "given", "I have many cukes", [cached]).status, "undetermined");
  });

  test('IGNORECASE from python is honoured', () => {
    const def = new CompiledDefinition({
      stepType: "given", pattern: "hello", filePath: "/s.py", lineNumber: 1,
      paramCheck: { kind: "parse", flags: ["IGNORECASE", "DOTALL"], segments: [{ text: "hello" }], needsPython: false },
    });
    assert.strictEqual(checkStepText([def], "given", "HELLO").status, "matched");
  });

  test('an unknown python flag makes the definition unverifiable', () => {
    const def = new CompiledDefinition({
      stepType: "given", pattern: "hello", filePath: "/s.py", lineNumber: 1,
      paramCheck: { kind: "parse", flags: ["VERBOSE"], segments: [{ text: "hello" }], needsPython: false },
    });
    assert.strictEqual(def.verifiable, false);
  });
});


suite('stepArguments - describing parameters', () => {
  test('labels and type descriptions', () => {
    const [, count] = cukes().segments;
    assert.strictEqual(parameterLabel(count.segment), "{count:d}");
    assert.strictEqual(describeParameterType(count.segment), "an integer");
    assert.strictEqual(describeParameterType({ name: "c", spec: "Color", type: "Color", custom: true, typePattern: "red|green" }),
      "a Color (pattern: red|green)");
    assert.strictEqual(describeParameterType({ name: "x", spec: "", type: "" }), "any text");
  });
});
