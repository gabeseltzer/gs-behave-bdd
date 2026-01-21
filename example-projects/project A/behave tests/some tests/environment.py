# ruff: noqa
from behave import fixture, model


def before_scenario(context, scenario: model.Scenario):
    if "skip" in scenario.effective_tags:
        scenario.skip("Marked with @skip")


@fixture
def disable_sensors(context):
    """Disables all sensor readings during the test"""
    context.sensors_enabled = False
    yield
    context.sensors_enabled = True


@fixture
def mock_database(context):
    """Provides a mock database connection for testing"""
    context.db = "wow"
    yield
    context.db.close()
