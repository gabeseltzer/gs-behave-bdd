"""
Discovers step definitions and fixture functions using behave's registry.

Usage: python discover.py <project_path> <steps_paths_json> [--bundled-libs <path>]
  project_path: Absolute path to the project root
  steps_paths_json: JSON array of absolute step directory paths
  --bundled-libs: Optional path to bundled behave libs directory

Outputs JSON object to stdout:
  {"steps": [...], "fixtures": [...], "failed_files": [...], "mocked_modules": [...]}

Degradation model (quiet-by-design):
  - Each step file is syntax-checked (ast.parse) and loaded individually, so one
    broken file only loses its own steps ("failed_files" reports it with a kind).
  - Imports of modules that are not installed are satisfied with inert stubs
    ("mocked_modules" reports them), so an uninstalled third-party dependency
    does not block registration of steps that merely import it at module level.
  - A wholesale "error" (+ "error_kind") is only reported when loading cannot
    proceed at all (e.g. behave itself is broken or the fallback path failed).
"""

from __future__ import annotations

import ast
import importlib.abc
import importlib.machinery
import importlib.util
import inspect
import json
import re as _re
import sys
import traceback
import types
from pathlib import Path
from typing import Any

# behave imports are deferred to function bodies after sys.path setup


# ---------------------------------------------------------------------------
# Missing-import stubbing (G+)
# ---------------------------------------------------------------------------

# Full names of modules that were satisfied with a stub because they are not
# installed in the interpreter. Reported to the extension for hint diagnostics.
MOCKED_MODULES: set[str] = set()

# Per-file attribution: resolved step-file path -> modules first stubbed while
# executing that file. Captures TRANSITIVE missing imports (e.g. a local helper
# the file imports that itself imports an uninstalled library), which a scan of
# the file's own import statements cannot see. Used to name the module the user
# must fix when a stub corrupts the file's step registration.
STUBBED_DURING_FILE: dict[str, list[str]] = {}

# Never stub these prefixes: behave must fail loudly if absent (the extension
# falls back to its bundled copy), and stubbing it would silently yield 0 steps.
_STUB_BLOCKLIST_PREFIXES = ("behave", "_pytest", "pytest")

# Marker embedded in every stub's repr. If it shows up in a step pattern (either
# because a stub object was used directly as the pattern, or interpolated into an
# f-string), the step's name came from a missing import - the registration is
# garbage and the file must be reported as a failed import, not silently kept.
_STUB_REPR_MARKER = "gs-behave-bdd stub "


class _StubObject:
  """An inert attribute-chain stub standing in for anything from a missing module."""

  def __init__(self, name: str) -> None:
    object.__setattr__(self, "_stub_name", name)

  def __getattr__(self, item: str) -> _StubObject:
    if item.startswith("__") and item.endswith("__"):
      raise AttributeError(item)
    return _StubObject(f"{object.__getattribute__(self, '_stub_name')}.{item}")

  def __call__(self, *args: Any, **kwargs: Any) -> Any:
    # Decorator passthrough: behave derives a step's file/line from
    # func.__code__ at registration time, so a stubbed third-party decorator
    # must hand back the real function it was applied to, not another stub.
    if len(args) == 1 and not kwargs and callable(args[0]):
      return args[0]
    return _StubObject(object.__getattribute__(self, "_stub_name") + "()")

  def __mro_entries__(self, bases: Any) -> tuple[type, ...]:
    # Allow "class Foo(stub.Base):" at module level
    return (object,)

  def __getitem__(self, item: Any) -> _StubObject:
    return _StubObject(object.__getattribute__(self, "_stub_name") + "[...]")

  def __iter__(self) -> Any:
    return iter(())

  def __repr__(self) -> str:
    return f"<{_STUB_REPR_MARKER}{object.__getattribute__(self, '_stub_name')}>"


class _StubModule(types.ModuleType):
  def __getattr__(self, item: str) -> Any:
    # Unlike _StubObject, stub even dunder attributes: explicit accesses like
    # "lib.__version__" are common in top-level version checks, and implicit
    # protocol lookups go through the type (never this instance __getattr__),
    # so nothing protocol-critical can be affected. Import-machinery attributes
    # (__path__, __spec__, __name__...) live in the module __dict__ already and
    # never reach __getattr__.
    return _StubObject(f"{self.__name__}.{item}")


def _import_is_from_third_party() -> bool:
  """
  True if the import currently being resolved was triggered from third-party
  library code (site-packages / dist-packages), not the user's project.

  Such libraries routinely probe for OPTIONAL dependencies with
  `try: import optional_dep / except ImportError: ...` and then use the result
  assuming a real module (e.g. urllib3 reads `zstandard.__version__`). Stubbing
  the optional dep defeats that: the library sees the import succeed, then fails
  using the stub - which is a genuinely-working install (requests) breaking ONLY
  because discovery stubbed a dependency it never needed. So never stub imports
  that originate inside third-party code; let them fail as they normally would.
  """
  try:
    frame: Any = sys._getframe(1)  # noqa: SLF001  # the finder's own frame
  except (AttributeError, ValueError):
    return False  # no stack introspection available: keep prior (stub) behaviour
  while frame is not None:
    filename = frame.f_code.co_filename
    # Skip our own finder frames and the import machinery; the first frame below
    # them is the code that actually executed the `import` statement.
    if filename == __file__ or filename.startswith("<frozen") or "importlib" in filename:
      frame = frame.f_back
      continue
    norm = filename.replace("\\", "/")
    return "/site-packages/" in norm or "/dist-packages/" in norm
  return False


class _MissingModuleStubFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
  """
  Appended (never prepended) to sys.meta_path, so it is only consulted after
  every real finder has failed - it can never shadow an installed package.
  """

  def find_spec(
    self, fullname: str, _path: Any = None, _target: Any = None
  ) -> importlib.machinery.ModuleSpec | None:
    top_level = fullname.split(".", maxsplit=1)[0]
    if top_level in _STUB_BLOCKLIST_PREFIXES:
      return None
    # Only stub imports coming from the user's own project code. A third-party
    # library importing a missing OPTIONAL dependency must be allowed to fail so
    # its own try/except ImportError handling runs (otherwise installed packages
    # like requests break because urllib3's optional zstandard got stubbed).
    if _import_is_from_third_party():
      return None
    # is_package=True gives the stub a submodule_search_locations, so
    # "import matplotlib.pyplot" resolves (the submodule stubs too).
    return importlib.util.spec_from_loader(fullname, self, is_package=True)

  def create_module(self, spec: importlib.machinery.ModuleSpec) -> types.ModuleType:
    MOCKED_MODULES.add(spec.name)
    return _StubModule(spec.name)

  def exec_module(self, module: types.ModuleType) -> None:
    pass


def install_missing_import_stubs() -> None:
  """
  Install the stub finder. MUST be called only after every behave import this
  script needs has already executed (see _import_behave_modules), otherwise a
  missing behave would be stubbed instead of reported.
  """
  if not any(isinstance(f, _MissingModuleStubFinder) for f in sys.meta_path):
    sys.meta_path.append(_MissingModuleStubFinder())


# ---------------------------------------------------------------------------
# Per-file failure reporting (D + G)
# ---------------------------------------------------------------------------


def _failure_entry(file_path: str, err: BaseException) -> dict[str, Any]:
  """Build a failed_files entry from an exception, with best-effort line info."""
  tb = ""
  if isinstance(err, SyntaxError):
    kind = "syntax"
    line = err.lineno or 0
    col = err.offset or 0
    msg = err.msg or str(err)
  else:
    kind = "import" if isinstance(err, ImportError) else "error"
    msg = f"{type(err).__name__}: {err!s}"
    line = 0
    col = 0
    # Find the deepest traceback frame inside the failing file itself
    resolved = str(Path(file_path).resolve())
    for frame in traceback.extract_tb(err.__traceback__):
      try:
        if str(Path(frame.filename).resolve()) == resolved:
          line = frame.lineno or 0
      except (OSError, ValueError):
        continue
    # Full traceback: the deepest frame names the real culprit (e.g. the exact
    # missing module and where it was imported), which the one-line msg can hide.
    tb = "".join(traceback.format_exception(type(err), err, err.__traceback__))
  entry = {
    "file": str(Path(file_path).resolve()),
    "line": line,
    "col": col,
    "error": msg,
    "kind": kind,
  }
  if tb:
    entry["traceback"] = tb
  return entry


def preflight_syntax_check(py_files: list[str]) -> list[dict[str, Any]]:
  """ast.parse each file; return failed_files entries for files that don't compile."""
  failures: list[dict[str, Any]] = []
  for file_path in py_files:
    try:
      source = Path(file_path).read_text(encoding="utf-8", errors="replace")
      ast.parse(source, filename=file_path)
    except SyntaxError as e:
      failures.append(_failure_entry(file_path, e))
    except OSError:
      continue  # unreadable file: let the exec stage (or its absence) handle it
  return failures


_STEP_DECORATORS = frozenset({"given", "when", "then", "step"})


def _decorator_step_type(decorator: ast.expr) -> str | None:
  """If an AST decorator is @given/@when/@then/@step (or @behave.given etc.), return its type."""
  target = decorator.func if isinstance(decorator, ast.Call) else decorator
  if isinstance(target, ast.Name):
    name = target.id
  elif isinstance(target, ast.Attribute):
    name = target.attr  # e.g. behave.given -> "given"
  else:
    return None
  return name.lower() if name.lower() in _STEP_DECORATORS else None


def recover_literal_steps_via_ast(file_path: str) -> list[dict[str, Any]]:
  """
  Best-effort step recovery for a file behave could NOT load (e.g. a missing
  import raised at module import time, before any step registered). Parses the
  source and extracts step decorators whose pattern is a plain string literal -
  those steps are fully known without running the file, so they can still be
  navigated and matched. Steps with a computed/interpolated pattern are skipped
  (their text genuinely depends on the unavailable import).

  This is a deliberate, narrow fallback to home-rolled parsing, used only when
  behave's own load failed - so the "just works" path stays behave-faithful while
  a single bad import no longer costs a file every one of its steps.
  """
  try:
    source = Path(file_path).read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(source, filename=file_path)
  except (OSError, SyntaxError):
    return []

  resolved = str(Path(file_path).resolve())
  steps: list[dict[str, Any]] = []
  for node in ast.walk(tree):
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
      continue
    for decorator in node.decorator_list:
      step_type = _decorator_step_type(decorator)
      if step_type is None or not isinstance(decorator, ast.Call) or not decorator.args:
        continue
      first = decorator.args[0]
      if not (isinstance(first, ast.Constant) and isinstance(first.value, str)):
        continue  # computed pattern - can't recover its text without the import
      steps.append(
        {
          "step_type": step_type,
          "pattern": first.value,
          "file": resolved,
          "line": decorator.lineno,
          "regex_pattern": first.value,
        }
      )
  return steps


def _is_fixture_decorator(decorator: ast.expr) -> bool:
  """True for @fixture / @fixture(...) / @behave.fixture (with or without a call)."""
  target = decorator.func if isinstance(decorator, ast.Call) else decorator
  if isinstance(target, ast.Name):
    return target.id == "fixture"
  if isinstance(target, ast.Attribute):
    return target.attr == "fixture"  # e.g. behave.fixture
  return False


def recover_fixtures_via_ast(file_path: str) -> list[dict[str, Any]]:
  """
  Best-effort @fixture recovery for an environment file behave could NOT load
  (mirrors recover_literal_steps_via_ast). A fixture's name and location are
  fully known from source, so a missing import at module load no longer hides
  the file's fixtures from tag validation / navigation.
  """
  try:
    source = Path(file_path).read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(source, filename=file_path)
  except (OSError, SyntaxError):
    return []

  resolved = str(Path(file_path).resolve())
  fixtures: list[dict[str, Any]] = []
  seen: set[str] = set()
  for node in ast.walk(tree):
    if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
      continue
    if node.name in seen or not any(
      _is_fixture_decorator(d) for d in node.decorator_list
    ):
      continue
    seen.add(node.name)
    decorator_line = next(
      (d.lineno for d in node.decorator_list if _is_fixture_decorator(d)), node.lineno
    )
    fixtures.append(
      {
        "function_name": node.name,
        "file": resolved,
        "decorator_line": decorator_line,
        "def_line": node.lineno,  # ast: FunctionDef.lineno is the `def` line (3.8+)
      }
    )
  return fixtures


def load_environment_files(
  steps_paths: list[str],
) -> tuple[list[types.ModuleType], list[dict[str, Any]], list[str]]:
  """
  Load environment.py files from step directory parents.
  Returns (loaded modules, failed_files entries, successfully loaded file paths).
  """
  loaded_env_files: set[str] = set()
  loaded_modules: list[types.ModuleType] = []
  failures: list[dict[str, Any]] = []
  loaded_paths: list[str] = []
  for sp in steps_paths:
    env_dir = Path(sp).resolve().parent
    env_file = env_dir / "environment.py"
    if env_file.exists() and str(env_file) not in loaded_env_files:
      loaded_env_files.add(str(env_file))
      syntax_failures = preflight_syntax_check([str(env_file)])
      if syntax_failures:
        failures.extend(syntax_failures)
        continue
      try:
        spec = importlib.util.spec_from_file_location("environment", env_file)
        if spec and spec.loader:
          env_module = importlib.util.module_from_spec(spec)
          spec.loader.exec_module(env_module)
          loaded_modules.append(env_module)
          loaded_paths.append(str(env_file))
      except Exception as env_err:  # noqa: BLE001  # any env failure is per-file, never fatal
        failures.append(_failure_entry(str(env_file), env_err))
  return loaded_modules, failures, loaded_paths


class StepLoadError(Exception):
  """Raised when step loading fails wholesale, carrying the original error message."""


class _IsolationUnavailable(Exception):
  """Raised when behave's internals don't match what the isolated loader needs."""


def _list_step_files(step_dirs: list[str]) -> list[str]:
  """Enumerate step files exactly like behave's load_step_modules: *.py in each dir root, sorted."""
  files: list[str] = []
  for path in step_dirs:
    try:
      # behave sorts os.listdir() names; sorting Path entries by name matches that
      entries = sorted(Path(path).iterdir(), key=lambda p: p.name)
    except OSError:
      continue
    files.extend(str(p) for p in entries if p.name.endswith(".py"))
  return files


def _load_step_files_isolated(
  step_dirs: list[str], skip_files: set[str]
) -> tuple[list[dict[str, Any]], list[str]]:
  """
  Replicate behave's load_step_modules() (behave/runner_util.py) with one
  change: exec each step file inside try/except so one broken file only loses
  its own steps. Same decorator globals, same PathManager, same sorted load
  order, same matcher reset between files.

  Returns (failed_files entries, successfully executed file paths).

  Raises _IsolationUnavailable if behave's internals have drifted from what
  this replication needs (caller falls back to the real load_step_modules).
  """
  try:
    from behave import runner_util  # noqa: PLC0415
    from behave.api.step_matchers import (  # noqa: PLC0415
      step_matcher,
      use_default_step_matcher,
      use_step_matcher,
    )
    from behave.matchers import use_current_step_matcher_as_default  # noqa: PLC0415
    from behave.step_registry import setup_step_decorators  # noqa: PLC0415

    path_manager = runner_util.PathManager
    exec_file = runner_util.exec_file
  except (ImportError, AttributeError) as e:
    raise _IsolationUnavailable(str(e)) from e

  step_globals: dict[str, Any] = {
    "use_step_matcher": use_step_matcher,
    "step_matcher": step_matcher,
  }
  setup_step_decorators(step_globals)

  failures: list[dict[str, Any]] = []
  loaded: list[str] = []
  with path_manager(step_dirs):
    use_current_step_matcher_as_default()
    for file_path in _list_step_files(step_dirs):
      resolved = str(Path(file_path).resolve())
      if resolved in skip_files:
        use_default_step_matcher()
        continue
      stubbed_before = set(MOCKED_MODULES)
      try:
        step_module_globals = step_globals.copy()
        exec_file(file_path, step_module_globals)
        loaded.append(resolved)
      except Exception as e:  # noqa: BLE001  # per-file isolation is the whole point
        failures.append(_failure_entry(file_path, e))
      finally:
        use_default_step_matcher()
        newly_stubbed = MOCKED_MODULES - stubbed_before
        if newly_stubbed:
          STUBBED_DURING_FILE[resolved] = sorted(newly_stubbed)
  return failures, loaded


def load_step_directories(
  steps_paths: list[str],
) -> tuple[list[dict[str, Any]], list[str]]:
  """
  Load step modules from all step directories, isolating failures per file.

  Returns (failed_files entries, successfully executed file paths). The loaded
  list lets the extension distinguish "this file loaded and its steps really
  are gone" from "this file's steps are missing because its importer failed".
  Falls back to behave's own all-or-nothing load_step_modules if the isolated
  replication is unavailable; in that case a failure raises StepLoadError.
  """
  from behave import runner_util  # noqa: PLC0415  # deferred until sys.path setup

  step_dirs = [
    str(Path(p).resolve()) for p in steps_paths if Path(p).resolve().exists()
  ]
  if not step_dirs:
    return [], []

  # D: syntax pre-flight - precise line/col, and skip exec of files that can't compile
  syntax_failures = preflight_syntax_check(_list_step_files(step_dirs))
  skip_files = {f["file"] for f in syntax_failures}

  try:
    exec_failures, loaded = _load_step_files_isolated(step_dirs, skip_files)
    return syntax_failures + exec_failures, loaded
  except _IsolationUnavailable:
    pass

  # Fallback: behave API drift - use behave's own loader (all-or-nothing)
  try:
    runner_util.load_step_modules(step_dirs)
  except Exception as load_err:
    raise StepLoadError(str(load_err)) from load_err
  loaded = [
    str(Path(f).resolve())
    for f in _list_step_files(step_dirs)
    if str(Path(f).resolve()) not in skip_files
  ]
  return syntax_failures, loaded


def _is_stub_pattern(pattern: Any) -> bool:
  """
  True if a step pattern originated from a stubbed (missing) import - either the
  stub object was used directly as the pattern (not a str), or it was interpolated
  into an f-string (a str carrying the stub marker). Such a step's name is garbage.
  """
  if not isinstance(pattern, str):
    return True
  return _STUB_REPR_MARKER in pattern


def collect_steps_from_registry(
  registry: Any, exclude_files: set[str] | None = None
) -> tuple[list[dict[str, Any]], set[str]]:
  """
  Collect all registered steps from the registry.

  exclude_files: resolved paths of files that failed to load - their registry
  state is partial/unreliable, so the caller recovers their literal steps from
  source (see _recover_literal_steps_via_ast) instead.

  Returns (steps, corrupt_files). corrupt_files registered at least one step
  whose pattern came from a stubbed missing import; only those GARBAGE steps are
  skipped - every valid (real-string) step in the file is still collected, so a
  single unresolved import no longer costs a file all of its steps.
  """
  exclude_files = exclude_files or set()
  step_types = ["given", "when", "then", "step"]

  corrupt_files: set[str] = set()
  steps: list[dict[str, Any]] = []
  for step_type in step_types:
    for matcher in registry.steps.get(step_type, []):
      file_path = _get_file_path(matcher)

      if file_path in exclude_files:
        continue

      # Skip only THIS garbage step (its name came from a missing import), not the
      # whole file - the file's other steps are valid and worth keeping.
      if _is_stub_pattern(matcher.pattern):
        corrupt_files.add(file_path)
        continue

      step_info = {
        "step_type": step_type,
        "pattern": matcher.pattern,
        "file": file_path,
        "line": (
          matcher.location.line
          if hasattr(matcher, "location") and matcher.location
          else 0
        ),
        "regex_pattern": _get_regex_pattern(matcher),
      }
      steps.append(step_info)

  return steps, corrupt_files


def collect_fixtures_from_modules(
  env_modules: list[types.ModuleType],
) -> list[dict[str, Any]]:
  """Collect all @fixture-decorated functions from loaded environment modules."""
  fixtures: list[dict[str, Any]] = []
  seen: set[int] = set()  # Track by id() to avoid duplicates from re-exports

  for module in env_modules:
    for _name, obj in inspect.getmembers(module, callable):
      if id(obj) in seen:
        continue
      if not getattr(obj, "behave_fixture", False):
        continue
      seen.add(id(obj))

      try:
        source_file = str(Path(inspect.getfile(obj)).resolve())
      except (TypeError, OSError):
        continue

      decorator_line = 0
      def_line = 0
      try:
        source_lines, start_line = inspect.getsourcelines(obj)
        decorator_line = start_line
        def_line = start_line
        for i, line in enumerate(source_lines):
          stripped = line.strip()
          if stripped.startswith("def ") and "(" in stripped:
            def_line = start_line + i
            break
      except (OSError, TypeError):
        pass

      fixtures.append(
        {
          "function_name": obj.__name__,
          "file": source_file,
          "decorator_line": decorator_line,
          "def_line": def_line,
        }
      )

  return fixtures


# Matches @given("..."), @when('...'), @behave.step("..."), etc.
_DECORATOR_RE = _re.compile(
  r"^\s*@(?:behave\.)?(step|given|when|then)\(\s*u?(?:\"|')(.+?)(?:\"|')",
  _re.IGNORECASE,
)


def _collect_step_patterns(
  steps_paths: list[str],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
  """Collect all step decorator patterns from step files."""
  pattern_locations: dict[tuple[str, str], list[dict[str, Any]]] = {}

  for sp in steps_paths:
    steps_dir = Path(sp).resolve()
    if not steps_dir.exists():
      continue
    for py_file in steps_dir.glob("*.py"):
      try:
        lines = py_file.read_text(encoding="utf-8", errors="replace").splitlines()
      except OSError:
        continue
      for line_no, line in enumerate(lines, start=1):
        m = _DECORATOR_RE.match(line)
        if not m:
          continue
        step_type = m.group(1).lower()
        pattern = m.group(2)
        entry = {
          "file": str(py_file),
          "line": line_no,
          "step_type": step_type,
          "pattern": pattern,
        }
        pattern_locations.setdefault((step_type, pattern), []).append(entry)
        # @step matches all types, so also register under a wildcard key
        if step_type == "step":
          for alias in ("given", "when", "then"):
            pattern_locations.setdefault((alias, pattern), []).append(entry)

  return pattern_locations


def find_duplicate_steps(steps_paths: list[str]) -> list[dict[str, Any]]:
  """
  Scan step files with regex to find duplicate step decorator patterns.

  Returns a list of duplicate entries, where each entry represents one
  occurrence of a pattern that appears more than once across all step files.
  """
  pattern_locations = _collect_step_patterns(steps_paths)

  # Filter to patterns with 2+ occurrences (deduplicate entries by file+line)
  duplicates: list[dict[str, Any]] = []
  seen: set[tuple[str, int]] = set()
  for _key, locations in pattern_locations.items():
    if len(locations) < 2:
      continue
    for loc in locations:
      ident = (loc["file"], loc["line"])
      if ident not in seen:
        seen.add(ident)
        duplicates.append(loc)

  return duplicates


def _get_regex_pattern(matcher: Any) -> str:
  """Extract regex pattern from matcher."""
  regex_pat = getattr(matcher, "regex_pattern", None)
  if regex_pat is None and hasattr(matcher, "regex"):
    regex_pat = matcher.regex.pattern
  if regex_pat is None:
    regex_pat = matcher.pattern
  return str(regex_pat)


def _get_file_path(matcher: Any) -> str:
  """Get file path from matcher and convert to absolute path."""
  file_path = (
    matcher.location.filename
    if hasattr(matcher, "location") and matcher.location
    else "unknown"
  )
  if file_path != "unknown":
    file_path = str(Path(file_path).resolve())
  return file_path


def _setup_sys_path(
  project_path: str,
  steps_paths: list[str],
  bundled_libs: str | None,
) -> None:
  """Configure sys.path for behave imports."""
  if bundled_libs:
    sys.path.insert(0, bundled_libs)

  if project_path not in sys.path:
    sys.path.insert(0, project_path)

  # Add parent directories of step paths so that modules living alongside the
  # features directory (e.g. lib/) can be imported.  Step paths are like
  # ".../subproject/features/steps", so grandparent is ".../subproject".
  for sp in steps_paths:
    features_dir = str(Path(sp).resolve().parent)
    behave_project_dir = str(Path(features_dir).parent)
    if behave_project_dir not in sys.path:
      sys.path.insert(0, behave_project_dir)


def _parse_bundled_libs() -> str | None:
  """Parse the optional --bundled-libs argument from sys.argv."""
  if "--bundled-libs" in sys.argv:
    idx = sys.argv.index("--bundled-libs")
    if idx + 1 < len(sys.argv):
      return sys.argv[idx + 1]
  return None


def _import_behave_modules() -> Any:
  """
  Import every behave module this script needs, BEFORE the stub finder is
  installed - a missing behave must be reported, never stubbed.
  Returns the step registry module.
  """
  from behave import runner_util, step_registry  # noqa: PLC0415, F401

  try:
    import behave.api.step_matchers  # noqa: PLC0415
    import behave.matchers  # noqa: PLC0415, F401  # pre-load before stub finder installs
  except ImportError:
    pass  # older behave: the isolated loader will fall back to load_step_modules

  return step_registry


def _build_wholesale_error_result(
  load_error: str, steps_paths: list[str]
) -> dict[str, Any]:
  """Result for a wholesale load failure (fallback loader path) - scan for duplicates."""
  result: dict[str, Any] = {
    "steps": [],
    "fixtures": [],
    "error": load_error,
    "error_kind": "code",
  }
  duplicates = find_duplicate_steps(steps_paths)
  if duplicates:
    result["duplicates"] = duplicates
  return result


def _stubbed_imports_in_file(file_path: str) -> list[str]:
  """
  Module names imported by a file whose top-level package was stubbed because it
  is not installed / not importable. Used to turn a cryptic stub-induced failure
  ("TypeError: expected string or bytes-like object") into an actionable message
  that names the module the user actually needs to fix.
  """
  if not MOCKED_MODULES:
    return []
  stubbed_tops = {m.split(".", maxsplit=1)[0] for m in MOCKED_MODULES}
  try:
    source = Path(file_path).read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(source, filename=file_path)
  except (OSError, SyntaxError):
    return []
  found: set[str] = set()
  for node in ast.walk(tree):
    if isinstance(node, ast.Import):
      for alias in node.names:
        if alias.name.split(".", maxsplit=1)[0] in stubbed_tops:
          found.add(alias.name)
    elif isinstance(node, ast.ImportFrom) and node.module:
      if node.module.split(".", maxsplit=1)[0] in stubbed_tops:
        found.add(node.module)
  return sorted(found)


def _missing_import_note(file_path: str) -> str | None:
  """
  A human-readable 'could not import X' note naming the missing module(s) behind
  a stub-induced failure. Prefers per-file exec tracking (which sees transitive
  imports - a helper the file imports that itself imports a missing library) and
  falls back to scanning the file's own import statements.
  """
  mods = STUBBED_DURING_FILE.get(file_path) or _stubbed_imports_in_file(file_path)
  if not mods:
    return None
  names = ", ".join(f"'{m}'" for m in mods)
  return (
    f"could not import {names} (not installed in the selected Python interpreter, "
    f"or not importable from this project)"
  )


def _attribute_stub_failures(
  failed_files: list[dict[str, Any]],
  failed_paths: set[str],
  corrupt_files: set[str],
) -> None:
  """
  Turn stub-induced problems into clear, actionable failures (in place):
  - a file whose step pattern came from a stubbed import (corrupt_files) becomes
    a failed import naming the missing module, instead of a garbage "<stub>" step;
  - existing exec failures caused by a stub (e.g. the pattern reached re during
    registration -> "TypeError: expected string...") get the module name appended.
  """
  for corrupt_file in corrupt_files:
    if corrupt_file in failed_paths:
      continue
    note = _missing_import_note(corrupt_file)
    failed_files.append(
      {
        "file": corrupt_file,
        "line": 0,
        "col": 0,
        "error": note or "a value from a missing import was used as a step name",
        "kind": "import",
      }
    )
    failed_paths.add(corrupt_file)

  for failure in failed_files:
    if failure["kind"] in ("import", "error"):
      note = _missing_import_note(failure["file"])
      if note and note not in failure["error"]:
        failure["error"] = f"{failure['error']} — {note}"


def _prune_mocked_modules(surviving_files: list[str]) -> None:
  """
  Keep only mocked_modules that a SURVIVING (loaded, non-failed) file imports.
  A module that only broke a failed file would otherwise get a misleading
  "stubbed OK, tests will run" hint on top of that file's "could not import".
  """
  used_tops: set[str] = set()
  for survivor in surviving_files:
    for mod in _stubbed_imports_in_file(survivor):
      used_tops.add(mod.split(".", maxsplit=1)[0])
  MOCKED_MODULES.difference_update(
    {m for m in MOCKED_MODULES if m.split(".", maxsplit=1)[0] not in used_tops}
  )


def _build_success_result(
  step_registry: Any,
  env_modules: list[types.ModuleType],
  failed_files: list[dict[str, Any]],
  loaded_files: list[str],
  steps_paths: list[str],
) -> dict[str, Any]:
  """Result for a (possibly partially) successful load."""
  failed_paths = {f["file"] for f in failed_files}
  steps, corrupt_files = collect_steps_from_registry(
    step_registry.registry, exclude_files=failed_paths
  )
  fixtures = collect_fixtures_from_modules(env_modules)
  _attribute_stub_failures(failed_files, failed_paths, corrupt_files)

  # Recover literal-pattern steps from files behave could NOT load at all (a
  # missing import raised at import time, before any step registered). Their text
  # is a plain string literal in source, so they remain navigable/matchable even
  # though the file cannot execute. Only for files that contributed no steps yet
  # (corrupt-but-loaded files already kept their valid steps above).
  files_with_steps = {s["file"] for s in steps}
  for failure in failed_files:
    fp = failure["file"]
    if fp in files_with_steps:
      continue
    recovered = recover_literal_steps_via_ast(fp)
    if recovered:
      steps.extend(recovered)
      files_with_steps.add(fp)

  # Same for @fixture functions: an environment file that failed to load (e.g. a
  # missing import raised at module level) would otherwise hide all its fixtures.
  # collect_fixtures_from_modules only sees SUCCESSFULLY loaded env modules, so
  # recover the rest from source.
  files_with_fixtures = {f["file"] for f in fixtures}
  for failure in failed_files:
    fp = failure["file"]
    if fp in files_with_fixtures:
      continue
    recovered_fixtures = recover_fixtures_via_ast(fp)
    if recovered_fixtures:
      fixtures.extend(recovered_fixtures)
      files_with_fixtures.add(fp)

  result: dict[str, Any] = {"steps": steps, "fixtures": fixtures}
  if failed_files:
    result["failed_files"] = failed_files
    # loaded_files lets the extension tell "this file loaded and its steps really
    # are gone" from "this file's steps are missing because its importer failed"
    # (library files are never exec'd directly, so appear in neither list). Files
    # whose steps we recovered from source have fresh steps in `steps`, and the
    # extension's cache merge prefers fresh steps over cache, so they need no
    # special handling here.
    surviving = [f for f in loaded_files if f not in failed_paths]
    result["loaded_files"] = surviving
    _prune_mocked_modules(surviving)

    # A failed file may hide a duplicate-definition problem (AmbiguousStep);
    # the regex scan is cheap and lets the extension keep its duplicates UI.
    if any(
      "already" in f["error"].lower() or "ambiguous" in f["error"].lower()
      for f in failed_files
    ):
      duplicates = find_duplicate_steps(steps_paths)
      if duplicates:
        result["duplicates"] = duplicates
  return result


def main() -> None:
  """Main entry point for step and fixture discovery."""
  try:
    project_path = sys.argv[1] if len(sys.argv) > 1 else "."
    steps_paths_json = sys.argv[2] if len(sys.argv) > 2 else "[]"
    steps_paths = json.loads(steps_paths_json)

    _setup_sys_path(project_path, steps_paths, _parse_bundled_libs())

    step_registry = _import_behave_modules()

    # G+: from here on, imports of modules that aren't installed resolve to
    # inert stubs (recorded in MOCKED_MODULES) instead of failing the file.
    install_missing_import_stubs()

    env_modules, env_failures, env_loaded = load_environment_files(steps_paths)

    try:
      step_failures, step_loaded = load_step_directories(steps_paths)
      failed_files = env_failures + step_failures
      result = _build_success_result(
        step_registry, env_modules, failed_files, env_loaded + step_loaded, steps_paths
      )
    except StepLoadError as e:
      result = _build_wholesale_error_result(str(e), steps_paths)

    if MOCKED_MODULES:
      result["mocked_modules"] = sorted(MOCKED_MODULES)
    # When anything failed, attach the environment so the user can see exactly
    # which interpreter and search paths discovery used, and compare against a
    # working "behave" run - the usual cause is a different interpreter (wrong
    # virtualenv) or a project path that is not on sys.path.
    if result.get("failed_files") or result.get("error"):
      result["diagnostics"] = {
        "python_executable": sys.executable,
        "sys_path": [p for p in sys.path if p],
      }
    print(json.dumps(result))
    sys.exit(0)

  except ImportError as e:
    print(json.dumps({"error": f"behave is not installed: {e!s}"}), file=sys.stderr)
    sys.exit(1)
  except (OSError, ValueError, json.JSONDecodeError) as e:
    print(json.dumps({"error": f"Unexpected error: {e!s}"}), file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
  main()
