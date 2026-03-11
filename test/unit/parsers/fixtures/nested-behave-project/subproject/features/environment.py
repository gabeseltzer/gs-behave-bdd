# environment.py that imports from a sibling lib module
# This simulates a real behave project where environment.py uses shared libraries
from lib import LIBRARY_LOADED  # noqa: F401


def before_all(context):
    context.library_loaded = LIBRARY_LOADED
