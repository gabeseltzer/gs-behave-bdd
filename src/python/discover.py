"""
Discovers step definitions and fixture functions using behave's registry.

Usage: python discover.py <project_path> <steps_paths_json> [--bundled-libs <path>]
  project_path: Absolute path to the project root
  steps_paths_json: JSON array of absolute step directory paths
  --bundled-libs: Optional path to bundled behave libs directory

Outputs JSON object to stdout:
  {"steps": [...], "fixtures": [...]}
"""

from __future__ import annotations

import importlib.util
import inspect
import json
import sys
import types
from pathlib import Path
from typing import Any

# behave imports are deferred to function bodies after sys.path setup


def load_environment_files(steps_paths: list[str]) -> list[types.ModuleType]:
  """Load environment.py files from step directory parents. Returns loaded modules."""
  loaded_env_files: set[str] = set()
  loaded_modules: list[types.ModuleType] = []
  for sp in steps_paths:
    env_dir = Path(sp).resolve().parent
    env_file = env_dir / "environment.py"
    if env_file.exists() and str(env_file) not in loaded_env_files:
      loaded_env_files.add(str(env_file))
      try:
        spec = importlib.util.spec_from_file_location("environment", env_file)
        if spec and spec.loader:
          env_module = importlib.util.module_from_spec(spec)
          spec.loader.exec_module(env_module)
          loaded_modules.append(env_module)
      except (ImportError, AttributeError, OSError) as env_err:
        print(
          json.dumps({"warning": f"Failed to load environment.py: {env_err!s}"}),
          file=sys.stderr,
        )
  return loaded_modules


class StepLoadError(Exception):
  """Raised when step loading fails, carrying the original error message."""


def load_step_directories(steps_paths: list[str]) -> None:
  """Load step modules from all step directories.

  Raises StepLoadError instead of exiting, so the caller can attempt
  duplicate detection before producing output.
  """
  from behave import runner_util  # noqa: PLC0415  # deferred until sys.path setup

  step_dirs = [
    str(Path(p).resolve()) for p in steps_paths if Path(p).resolve().exists()
  ]
  if not step_dirs:
    return

  try:
    runner_util.load_step_modules(step_dirs)
  except Exception as load_err:
    raise StepLoadError(str(load_err)) from load_err


def collect_steps_from_registry(registry: Any) -> list[dict[str, Any]]:
  """Collect all registered steps from the registry."""
  steps: list[dict[str, Any]] = []
  for step_type in ["given", "when", "then", "step"]:
    if step_type not in registry.steps:
      continue

    for matcher in registry.steps[step_type]:
      regex_pat = _get_regex_pattern(matcher)
      file_path = _get_file_path(matcher)

      step_info = {
        "step_type": step_type,
        "pattern": matcher.pattern,
        "file": file_path,
        "line": (
          matcher.location.line
          if hasattr(matcher, "location") and matcher.location
          else 0
        ),
        "regex_pattern": regex_pat,
      }
      steps.append(step_info)

  return steps


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


import re as _re

# Matches @given("..."), @when('...'), @behave.step("..."), etc.
_DECORATOR_RE = _re.compile(
  r"^\s*@(?:behave\.)?(step|given|when|then)\(\s*u?(?:\"|')(.+?)(?:\"|')",
  _re.IGNORECASE,
)


def find_duplicate_steps(steps_paths: list[str]) -> list[dict[str, Any]]:
  """Scan step files with regex to find duplicate step decorator patterns.

  Returns a list of duplicate entries, where each entry represents one
  occurrence of a pattern that appears more than once across all step files.
  """
  # Collect all (step_type, pattern) -> [(file, line), ...]
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
        key = (step_type, pattern)
        entry = {"file": str(py_file), "line": line_no, "step_type": step_type, "pattern": pattern}
        pattern_locations.setdefault(key, []).append(entry)
        # @step matches all types, so also register under a wildcard key
        if step_type == "step":
          for alias in ("given", "when", "then"):
            alias_key = (alias, pattern)
            pattern_locations.setdefault(alias_key, []).append(entry)

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


def main() -> None:
  """Main entry point for step and fixture discovery."""
  try:
    project_path = sys.argv[1] if len(sys.argv) > 1 else "."
    steps_paths_json = sys.argv[2] if len(sys.argv) > 2 else "[]"
    steps_paths = json.loads(steps_paths_json)

    # Parse optional --bundled-libs argument
    bundled_libs = None
    if "--bundled-libs" in sys.argv:
      idx = sys.argv.index("--bundled-libs")
      if idx + 1 < len(sys.argv):
        bundled_libs = sys.argv[idx + 1]

    # Insert bundled libs path before importing behave
    if bundled_libs:
      sys.path.insert(0, bundled_libs)

    if project_path not in sys.path:
      sys.path.insert(0, project_path)

    # Add parent directories of step paths to sys.path so that modules living
    # alongside the features directory (e.g. lib/) can be imported.
    # Step paths are like ".../subproject/features/steps", so grandparent is
    # ".../subproject" which is typically where behave.ini and importable modules live.
    for sp in steps_paths:
      features_dir = str(Path(sp).resolve().parent)
      behave_project_dir = str(Path(features_dir).parent)
      if behave_project_dir not in sys.path:
        sys.path.insert(0, behave_project_dir)

    from behave import step_registry  # noqa: PLC0415  # deferred until sys.path setup

    env_modules = load_environment_files(steps_paths)

    load_error: str | None = None
    try:
      load_step_directories(steps_paths)
    except StepLoadError as e:
      load_error = str(e)

    if load_error is not None:
      # Step loading failed — scan files to detect duplicates
      duplicates = find_duplicate_steps(steps_paths)
      result: dict[str, Any] = {
        "steps": [],
        "fixtures": [],
        "error": load_error,
      }
      if duplicates:
        result["duplicates"] = duplicates
      print(json.dumps(result))
      sys.exit(0)

    registry = step_registry.registry
    steps = collect_steps_from_registry(registry)
    fixtures = collect_fixtures_from_modules(env_modules)

    print(json.dumps({"steps": steps, "fixtures": fixtures}))
    sys.exit(0)

  except ImportError as e:
    print(json.dumps({"error": f"behave is not installed: {e!s}"}), file=sys.stderr)
    sys.exit(1)
  except (OSError, ValueError, json.JSONDecodeError) as e:
    print(json.dumps({"error": f"Unexpected error: {e!s}"}), file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
  main()
