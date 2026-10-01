// Parity between the TypeScript step argument check and behave itself.
//
// The TypeScript check translates behave's python regexes to JavaScript, so it can drift from
// what behave really does. This suite runs real behave (bundled) over a corpus of step
// definitions and step texts and asserts the TypeScript verdict never contradicts behave's:
// - "matched" must be behave's own pick (same definition), and behave must not call it undefined
// - "mismatch" / "unmatched" must be steps behave reports undefined
// "undetermined" makes no claim, so it is always allowed - but the corpus pins how often it
// may happen, so a translation regression can't hide behind it.
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
// configuration first: loading behaveLoader on its own trips the logger <-> configuration import cycle
import '../../../src/configuration';
import { checkStepsWithBehave, loadFromBehave, StepCheckResult } from '../../../src/parsers/behaveLoader';
import { checkStepText, CompiledDefinition } from '../../../src/parsers/stepArguments';

function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'src', 'python', 'discover.py')))
      return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Could not find project root containing src/python/discover.py');
}

const ENVIRONMENT_PY = `
import parse
from behave import register_type
from parse_type import TypeBuilder


@parse.with_pattern(r"red|green|blue")
def parse_color(text):
    return text


def parse_even(text):
    n = int(text)
    if n % 2:
        raise ValueError(f"{n} is odd")
    return n


register_type(
    Color=parse_color,
    Even=parse_even,
    YesNo=TypeBuilder.make_enum({"yes": True, "no": False}),
)
`;

const PARSE_STEPS_PY = `
from behave import given, step


@given("I have {count:d} cukes")
def s1(c, count): pass

@given("the price is {p:f}")
def s2(c, p): pass

@given("the word {w:w} here")
def s3(c, w): pass

@given("count {n:n} things")
def s4(c, n): pass

@given("ratio {r:%} done")
def s5(c, r): pass

@given("letters {l:l} only")
def s6(c, l): pass

@given("a {c:Color} car")
def s7(c, c2): pass

@given("answer {a:YesNo} now")
def s8(c, a): pass

@given("an even {n:Even} number")
def s9(c, n): pass

@given("repeat {x:d} and {x:d}")
def s10(c, x): pass

@given("padded {n:4d} end")
def s11(c, n): pass

@given("braces {{x}} {v}")
def s12(c, v): pass

@given("order {a:d} x")
def s13(c, a): pass

@given("order {b} x")
def s14(c, b): pass

@given("hello {name}")
def s15(c, name): pass

@step("generic {g:d} step")
def s16(c, g): pass

@given("hex {h:x} value")
def s17(c, h): pass
`;

const CFPARSE_STEPS_PY = `
from behave import given, use_step_matcher

use_step_matcher("cfparse")


@given("colors {cs:Color+} chosen")
def c1(c, cs): pass

@given("maybe {m:Color?} items")
def c2(c, m): pass
`;

const RE_STEPS_PY = `
from behave import given, use_step_matcher

use_step_matcher("re")


@given(r"regex (?P<num>\\d+) things")
def r1(c, num): pass

@given(r"word \\w+ here too")
def r2(c): pass

@given(r"opt(ional)? thing")
def r3(c, o): pass

@given(r"[Cc]ase (?:one|two)")
def r4(c): pass
`;

// [step type, text]
const CORPUS: [string, string][] = [
  ["given", "I have 5 cukes"],
  ["given", "I have -3 cukes"],
  ["given", "I have 0x1F cukes"],
  ["given", "I have many cukes"],
  ["given", "I have 5.5 cukes"],
  ["given", "I have 1,000 cukes"],
  ["given", "I have  5 cukes"],
  ["given", "the price is 1.5"],
  ["given", "the price is 3"],
  ["given", "the price is .5"],
  ["given", "the price is -2.25"],
  ["given", "the price is abc"],
  ["given", "the word café here"],
  ["given", "the word hello_1 here"],
  ["given", "the word two words here"],
  ["given", "the word naïve here"],
  ["given", "the word ½ here"],
  ["given", "count 1,000 things"],
  ["given", "count 1000 things"],
  ["given", "count 1.000.000 things"],
  ["given", "ratio 50% done"],
  ["given", "ratio 50 done"],
  ["given", "letters abc only"],
  ["given", "letters ab1 only"],
  ["given", "a red car"],
  ["given", "a purple car"],
  ["given", "a Red car"],
  ["given", "answer yes now"],
  ["given", "answer YES now"],
  ["given", "an even 4 number"],
  ["given", "an even 3 number"],
  ["given", "an even x number"],
  ["given", "repeat 1 and 1"],
  ["given", "repeat 1 and 2"],
  ["given", "padded 12 end"],
  ["given", "padded 12345 end"],
  ["given", "braces {x} hello"],
  ["given", "braces x hello"],
  ["given", "order 5 x"],
  ["given", "order z x"],
  ["given", "hello bob"],
  ["given", "generic 1 step"],
  ["when", "generic 1 step"],
  ["then", "generic many step"],
  ["given", "hex ff value"],
  ["given", "hex zz value"],
  ["given", "colors red chosen"],
  ["given", "colors red, green chosen"],
  ["given", "colors red,purple chosen"],
  ["given", "maybe red items"],
  ["given", "maybe purple items"],
  ["given", "maybe  items"],
  ["given", "regex 42 things"],
  ["given", "regex ٣ things"],
  ["given", "regex many things"],
  ["given", "word ünïcode here too"],
  ["given", "optional thing"],
  ["given", "opt thing"],
  ["given", "Case two"],
  ["given", "case three"],
  ["when", "I have 5 cukes"],
  ["given", "something nobody defined"],
];


suite('step arguments - parity with behave', function () {
  // spawns python twice (discovery, then the check)
  this.timeout(60000);

  let tmpDir: string;
  let definitions: CompiledDefinition[];
  let behaveVerdicts: Map<string, StepCheckResult>;

  suiteSetup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'behave-vsc-args-'));
    const stepsDir = path.join(tmpDir, 'features', 'steps');
    fs.mkdirSync(stepsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'features', 'environment.py'), ENVIRONMENT_PY);
    fs.writeFileSync(path.join(stepsDir, 'a_parse_steps.py'), PARSE_STEPS_PY);
    fs.writeFileSync(path.join(stepsDir, 'b_cfparse_steps.py'), CFPARSE_STEPS_PY);
    fs.writeFileSync(path.join(stepsDir, 'c_re_steps.py'), RE_STEPS_PY);

    const bundledLibs = path.join(findProjectRoot(), 'bundled', 'libs');
    const discovery = await loadFromBehave('python', tmpDir, [stepsDir], bundledLibs, 30000);
    assert.strictEqual(discovery.error, undefined, `discovery failed: ${discovery.error}`);
    assert.strictEqual(discovery.failedFiles, undefined, `step files failed: ${JSON.stringify(discovery.failedFiles)}`);
    definitions = discovery.steps.map(d => new CompiledDefinition(d));

    const { checks } = await checkStepsWithBehave('python', tmpDir, [stepsDir],
      CORPUS.map(([stepType, text]) => ({ stepType, text })), bundledLibs, 30000);
    behaveVerdicts = new Map(checks.map(c => [`${c.stepType}\n${c.text}`, c]));
  });

  suiteTeardown(() => {
    if (tmpDir)
      fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('every corpus definition was described by discover.py', () => {
    const undescribed = definitions.filter(d => !d.definition.paramCheck).map(d => d.definition.pattern);
    assert.deepStrictEqual(undescribed, []);
  });

  test('every corpus definition translates to a JavaScript regex', () => {
    const unverifiable = definitions.filter(d => !d.verifiable).map(d => d.definition.pattern);
    assert.deepStrictEqual(unverifiable, []);
  });

  for (const [stepType, text] of CORPUS) {
    test(`${stepType} "${text}" agrees with behave`, () => {
      const behave = behaveVerdicts.get(`${stepType}\n${text}`);
      assert.ok(behave, 'behave returned a verdict');
      const ours = checkStepText(definitions, stepType, text);

      switch (ours.status) {
        case "matched":
          assert.notStrictEqual(behave.status, "undefined", `we matched "${ours.definition.definition.pattern}", behave says undefined`);
          assert.strictEqual(path.resolve(behave.filePath ?? ""), path.resolve(ours.definition.definition.filePath));
          assert.strictEqual(behave.lineNumber, ours.definition.definition.lineNumber,
            `we picked "${ours.definition.definition.pattern}", behave picked line ${behave.lineNumber}`);
          break;
        case "mismatch":
        case "unmatched":
          assert.strictEqual(behave.status, "undefined", `we said ${ours.status}, behave says ${behave.status} (${behave.error ?? ""})`);
          break;
        case "undetermined":
          assert.fail("every corpus definition is verifiable, so nothing should be undetermined");
      }
    });
  }

  test('the corpus exercises every verdict (TypeScript / behave)', () => {
    const verdicts = CORPUS.map(([stepType, text]) =>
      `${stepType} ${text} => ${checkStepText(definitions, stepType, text).status} / ${behaveVerdicts.get(`${stepType}\n${text}`)?.status}`);
    assert.deepStrictEqual(verdicts, [
      "given I have 5 cukes => matched / matched",
      "given I have -3 cukes => matched / matched",
      "given I have 0x1F cukes => matched / matched",
      "given I have many cukes => mismatch / undefined",
      "given I have 5.5 cukes => mismatch / undefined",
      "given I have 1,000 cukes => mismatch / undefined",
      "given I have  5 cukes => matched / matched",
      "given the price is 1.5 => matched / matched",
      "given the price is 3 => mismatch / undefined",
      "given the price is .5 => matched / matched",
      "given the price is -2.25 => matched / matched",
      "given the price is abc => mismatch / undefined",
      "given the word café here => matched / matched",
      "given the word hello_1 here => matched / matched",
      "given the word two words here => mismatch / undefined",
      "given the word naïve here => matched / matched",
      "given the word ½ here => matched / matched",
      "given count 1,000 things => matched / matched",
      "given count 1000 things => mismatch / undefined",
      "given count 1.000.000 things => matched / matched",
      "given ratio 50% done => matched / matched",
      "given ratio 50 done => mismatch / undefined",
      "given letters abc only => matched / matched",
      "given letters ab1 only => mismatch / undefined",
      "given a red car => matched / matched",
      "given a purple car => mismatch / undefined",
      "given a Red car => mismatch / undefined",
      "given answer yes now => matched / matched",
      "given answer YES now => mismatch / undefined",
      "given an even 4 number => matched / matched",
      "given an even 3 number => matched / error",
      "given an even x number => matched / error",
      "given repeat 1 and 1 => matched / matched",
      "given repeat 1 and 2 => mismatch / undefined",
      "given padded 12 end => matched / matched",
      "given padded 12345 end => mismatch / undefined",
      "given braces {x} hello => matched / matched",
      "given braces x hello => unmatched / undefined",
      "given order 5 x => matched / matched",
      "given order z x => matched / matched",
      "given hello bob => matched / matched",
      "given generic 1 step => matched / matched",
      "when generic 1 step => matched / matched",
      "then generic many step => mismatch / undefined",
      "given hex ff value => matched / matched",
      "given hex zz value => mismatch / undefined",
      "given colors red chosen => matched / matched",
      "given colors red, green chosen => matched / matched",
      "given colors red,purple chosen => mismatch / undefined",
      "given maybe red items => matched / matched",
      "given maybe purple items => mismatch / undefined",
      "given maybe  items => matched / matched",
      "given regex 42 things => matched / matched",
      "given regex ٣ things => matched / matched",
      "given regex many things => unmatched / undefined",
      "given word ünïcode here too => matched / matched",
      "given optional thing => matched / matched",
      "given opt thing => matched / matched",
      "given Case two => matched / matched",
      "given case three => unmatched / undefined",
      "when I have 5 cukes => unmatched / undefined",
      "given something nobody defined => unmatched / undefined",
    ]);
  });

  test('converter errors are behave-only: matched by regex, error by behave', () => {
    const ours = checkStepText(definitions, "given", "an even 3 number");
    assert.strictEqual(ours.status, "matched");
    assert.ok(ours.status === "matched" && ours.definition.needsPython, "a pattern-less custom type needs python");
    const behave = behaveVerdicts.get("given\nan even 3 number");
    assert.strictEqual(behave?.status, "error");
    assert.match(behave?.error ?? "", /ValueError: 3 is odd/);
    assert.strictEqual(behave?.arguments?.[0].error, "ValueError: 3 is odd");
  });

  test('a mismatch points at the argument that does not fit', () => {
    const ours = checkStepText(definitions, "given", "I have many cukes");
    assert.strictEqual(ours.status, "mismatch");
    if (ours.status !== "mismatch")
      return;
    assert.deepStrictEqual(ours.badArguments.map(a => [a.text, a.start, a.end]), [["many", 7, 11]]);
  });

  test('definitions sharing a wildcard pattern are told apart by type, in registration order', () => {
    const digits = checkStepText(definitions, "given", "order 5 x");
    const word = checkStepText(definitions, "given", "order z x");
    assert.ok(digits.status === "matched" && digits.definition.definition.pattern === "order {a:d} x");
    assert.ok(word.status === "matched" && word.definition.definition.pattern === "order {b} x");
  });

  test('behave reports converted values for matched arguments', () => {
    const behave = behaveVerdicts.get("given\nanswer yes now");
    assert.strictEqual(behave?.status, "matched");
    assert.deepStrictEqual(behave?.arguments?.map(a => [a.original, a.value, a.valueType]), [["yes", "True", "bool"]]);
  });
});
