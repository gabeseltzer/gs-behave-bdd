"""
Discovers all step definitions using behave's step registry.

Usage: python get_steps.py <project_path> <steps_paths_json>
  project_path: Absolute path to the project root
  steps_paths_json: JSON array of absolute step directory paths

Outputs JSON array to stdout:
  [{"step_type": "given", "pattern": "...", "file": "...", "line": 1, "regex_pattern": "..."}, ...]
"""

import importlib.util
import json
import sys
from pathlib import Path

from behave import runner_util, step_registry


def load_environment_files(steps_paths: list[str]) -> None:
  """Load environment.py files from step directory parents."""
  loaded_env_files = set()
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
      except (ImportError, AttributeError, OSError) as env_err:
        print(
          json.dumps({"warning": f"Failed to load environment.py: {env_err!s}"}),
          file=sys.stderr,
        )


def load_step_directories(steps_paths: list[str]) -> None:
  """Load step modules from all step directories."""
  step_dirs = [
    str(Path(p).resolve()) for p in steps_paths if Path(p).resolve().exists()
  ]
  if not step_dirs:
    return

  try:
    runner_util.load_step_modules(step_dirs)
  except (ImportError, AttributeError, OSError) as load_err:
    print(json.dumps({"error": f"Failed to load steps: {load_err!s}"}), file=sys.stderr)
    sys.exit(1)


def collect_steps_from_registry(registry) -> list:
  """Collect all registered steps from the registry."""
  steps = []
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


def _get_regex_pattern(matcher):
  """Extract regex pattern from matcher."""
  regex_pat = getattr(matcher, "regex_pattern", None)
  if regex_pat is None and hasattr(matcher, "regex"):
    regex_pat = matcher.regex.pattern
  if regex_pat is None:
    regex_pat = matcher.pattern
  return regex_pat


def _get_file_path(matcher) -> str:
  """Get file path from matcher and convert to absolute path."""
  file_path = (
    matcher.location.filename
    if hasattr(matcher, "location") and matcher.location
    else "unknown"
  )
  if file_path != "unknown":
    file_path = str(Path(file_path).resolve())
  return file_path


def main():
  """Main entry point for step discovery."""
  try:
    project_path = sys.argv[1] if len(sys.argv) > 1 else "."
    steps_paths_json = sys.argv[2] if len(sys.argv) > 2 else "[]"
    steps_paths = json.loads(steps_paths_json)

    if project_path not in sys.path:
      sys.path.insert(0, project_path)

    load_environment_files(steps_paths)
    load_step_directories(steps_paths)

    registry = step_registry.registry
    steps = collect_steps_from_registry(registry)

    print(json.dumps(steps))
    sys.exit(0)

  except ImportError as e:
    print(json.dumps({"error": f"behave is not installed: {e!s}"}), file=sys.stderr)
    sys.exit(1)
  except (OSError, ValueError, json.JSONDecodeError) as e:
    print(json.dumps({"error": f"Unexpected error: {e!s}"}), file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
  main()


if __name__ == "__main__":
  main()
