# Step definitions that import from a sibling lib module
from lib import LIBRARY_LOADED  # noqa: F401
from behave import given  # type: ignore


@given("the nested library is loaded")
def step_impl(context):
  assert LIBRARY_LOADED
