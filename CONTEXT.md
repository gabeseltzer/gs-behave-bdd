# Behave Tooling

The domain this VS Code extension operates in: Gherkin feature files, the Python step definitions that implement them, and the mapping between the two that behave resolves at runtime.

## Language

### Steps

**Feature file step**:
A single step line in a `.feature` file, belonging to a Scenario, Scenario Outline, Background or Rule.
_Avoid_: Gherkin line, test step

**Embedded step**:
A step written inside a `context.execute_steps(...)` call in Python, invoking other steps from within a step definition.
_Avoid_: nested step, sub-step

**Step definition**:
A decorated Python function that implements a step. Lives in a steps file.
_Avoid_: step function, step impl, handler

**Step type**:
One of `given`, `when`, `then` or `step`. The keywords `and`, `but` and `*` are not step types — they resolve to the type of the preceding step.
_Avoid_: keyword, step kind

**Undefined step**:
A feature file step or embedded step with no step definition whose match signature it satisfies.
_Avoid_: missing step, unimplemented step, unmatched step

**Step stub**:
A generated step definition with an unimplemented body, produced to resolve an undefined step.
_Avoid_: snippet, skeleton, scaffold

### Matching

**Match signature**:
The identity a step is matched on: its step type together with its text, with every parameter collapsed to a wildcard. Two step definitions sharing a match signature are duplicates, regardless of how their text differs.
_Avoid_: step key, pattern, signature

**Placeholder**:
An `<name>` token in a Scenario Outline step, replaced with a value from the Examples table before matching happens.
_Avoid_: variable, outline param, substitution

**Parameter**:
A `{name}` token in a step definition's text, which captures a value from the step being matched and passes it to the function.
_Avoid_: placeholder, capture group, argument

**Step matcher**:
The syntax a step definition's text is interpreted in — behave's default `parse`, or `cfparse`, or `re`. Selected per file with `use_step_matcher`.
_Avoid_: parser, matching mode

### Layout

**Steps file**:
A Python file under the steps search root. behave loads every one of them, so a step definition is available to all feature files regardless of which steps file it sits in.
_Avoid_: step module, definitions file

**Steps search root**:
The resolved `steps` directory associated with a features path — where the extension looks for steps files.
_Avoid_: steps folder, steps dir, steps path
