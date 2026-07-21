from behave import given, when, then


@given("the machine is primed")
def step_machine_primed(context):
    context.primed = True


@given("the machine is ready")
def step_machine_ready(context):
    # compound step: invokes another step via behave's execute_steps API
    context.execute_steps(u"""
        Given the machine is primed
    """)
    context.ready = True


@when("the machine runs")
def step_machine_runs(context):
    assert context.primed
    context.ran = True


@then("the machine reports success")
def step_machine_reports_success(context):
    assert context.ran
