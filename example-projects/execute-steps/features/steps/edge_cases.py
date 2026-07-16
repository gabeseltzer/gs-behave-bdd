"""Diagnostics playground: none of these steps are invoked by the feature files,
so their bodies never run. Each execute_steps call exercises one scanner case."""
from behave import step


@step("an undefined embedded step is used")
def step_undefined_embedded(context):
    context.execute_steps("""
        Given the machine is primed
        Given this step does not exist anywhere
    """)


@step("invalid content is used")
def step_invalid_content(context):
    context.execute_steps("""
        Given the machine is primed
        Scenario: not valid inside execute_steps
    """)


@step("a leading And is used")
def step_leading_and(context):
    context.execute_steps("""
        And a leading and-step always raises a ParserError
    """)


@step("a format placeholder is used")
def step_format_placeholder(context):
    context.execute_steps("""
        Given the machine is primed
        Given a machine named {name}
    """.format(name="alpha"))


@step("an f-string is used")
def step_f_string(context):
    name = "beta"
    context.execute_steps(f"""
        Given a machine named {name}
    """)
