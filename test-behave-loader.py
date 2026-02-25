"""Discovers all step definitions using behave's step registry."""

import json
import sys
import traceback
from pathlib import Path

from behave import runner_util, step_registry


def load_environment_file(steps_path: str) -> None:
  """Load environment.py if it exists."""
  env_dir = Path(steps_path).resolve().parent
  env_file = env_dir / "environment.py"
  print(f"DEBUG: env_file={env_file}", file=sys.stderr)
  print(f"DEBUG: env_file.exists()={env_file.exists()}", file=sys.stderr)

  if env_file.exists():
    try:
      print("DEBUG: Loading environment.py", file=sys.stderr)
      with open(env_file, encoding="utf-8") as f:
        env_code = compile(f.read(), str(env_file), "exec")
        exec(env_code, {"__name__": "__main__", "__file__": str(env_file)})
      print("DEBUG: environment.py loaded successfully", file=sys.stderr)
    except (OSError, SyntaxError) as env_err:
      print(f"DEBUG: environment.py load failed: {env_err!s}", file=sys.stderr)


def load_step_modules(steps_path: str) -> None:
  """Load step modules from the steps directory."""
  step_dir = Path(steps_path).resolve()
  print(f"DEBUG: step_dir={step_dir}", file=sys.stderr)
  print(f"DEBUG: step_dir.exists()={step_dir.exists()}", file=sys.stderr)

  if not step_dir.exists():
    print("DEBUG: Step directory doesn't exist", file=sys.stderr)
    return

  try:
    print(
      f"DEBUG: Calling runner_util.load_step_modules([{step_dir}])", file=sys.stderr
    )
    runner_util.load_step_modules([str(step_dir)])
    print("DEBUG: load_step_modules completed successfully", file=sys.stderr)
  except (ImportError, AttributeError, OSError) as load_err:
    print(json.dumps({"error": f"Failed to load steps: {load_err!s}"}), file=sys.stderr)
    print(
      f"DEBUG: load_step_modules raised exception: {type(load_err).__name__}: {load_err!s}",
      file=sys.stderr,
    )
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)


def collect_steps_from_registry(registry) -> list:
  """Collect all registered steps from the registry."""
  print(f"DEBUG: registry type={type(registry)}", file=sys.stderr)
  print(
    f"DEBUG: registry.steps={registry.steps if hasattr(registry, 'steps') else 'NO steps attr'}",
    file=sys.stderr,
  )

  steps = []
  for step_type in ["given", "when", "then", "step"]:
    if not (hasattr(registry, "steps") and step_type in registry.steps):
      print(f"DEBUG: No {step_type} steps in registry", file=sys.stderr)
      continue

    print(
      f"DEBUG: Found {len(registry.steps[step_type])} {step_type} steps",
      file=sys.stderr,
    )
    for matcher in registry.steps[step_type]:
      regex_pat = _get_regex_pattern(matcher)
      file_path = _get_file_path(matcher)

      step_info = {
        "step_type": step_type,
        "pattern": matcher.pattern,
        "file": file_path,
        "line": matcher.location.line
        if hasattr(matcher, "location") and matcher.location
        else 0,
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
    steps_path = sys.argv[2] if len(sys.argv) > 2 else "./steps"

    print(f"DEBUG: project_path={project_path}", file=sys.stderr)
    print(f"DEBUG: steps_path={steps_path}", file=sys.stderr)

    if project_path not in sys.path:
      sys.path.insert(0, project_path)

    load_environment_file(steps_path)
    load_step_modules(steps_path)

    registry = step_registry.registry
    steps = collect_steps_from_registry(registry)

    print(f"DEBUG: Total steps collected: {len(steps)}", file=sys.stderr)
    print(json.dumps(steps))
    sys.exit(0)

  except ImportError as e:
    print(json.dumps({"error": f"behave is not installed: {e!s}"}), file=sys.stderr)
    print(f"DEBUG: ImportError: {e!s}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
  except (OSError, ValueError) as e:
    print(json.dumps({"error": f"Unexpected error: {e!s}"}), file=sys.stderr)
    print(f"DEBUG: Exception: {type(e).__name__}: {e!s}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
  main()


if __name__ == "__main__":
  main()
