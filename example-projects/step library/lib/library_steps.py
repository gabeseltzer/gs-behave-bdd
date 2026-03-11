"""Shared step definitions library."""

from behave import given, when, then


@given('there is a calculator')
def step_calculator_exists(context):
    """Initialize a calculator for testing."""
    context.calculator = {'value': 0}


@when('I add {a:d} and {b:d}')
def step_add_numbers(context, a, b):
    """Add two numbers using the calculator."""
    context.calculator['result'] = a + b


@then('the result should be {expected:d}')
def step_check_result(context, expected):
    """Verify the calculator result."""
    assert context.calculator['result'] == expected, \
        f"Expected {expected}, got {context.calculator['result']}"
