"""
Step parameter introspection for argument diagnostics.

Two jobs, both answered with behave's own objects so the extension never has to
guess how behave interprets a step definition:

- describe_matcher(): break a step definition into literal text and parameters,
  each parameter carrying the regex behave will match it with. The extension
  uses this to check arguments in feature files as you type.
- check_steps(): run behave's real step matching (type converters included) for
  concrete step texts. Only this can catch a converter that raises, e.g. a
  custom type registered without a pattern.

Terminology follows behave: a *parameter* is the `{name:type}` field in a step
definition, an *argument* is the text in a feature file step that fills it
(behave.model_type.Argument).
"""

from __future__ import annotations

import re
from typing import Any

# parse types whose converters cannot raise once their regex has matched. Any
# other type (custom, datetime "t*", strftime-style "%Y...") must be run through
# Python to be sure.
_SAFE_TYPES = {
  "",
  "d",
  "n",
  "f",
  "F",
  "e",
  "g",
  "w",
  "W",
  "s",
  "S",
  "D",
  "l",
  "b",
  "o",
  "x",
  "%",
}

_FLAG_NAMES = {
  re.IGNORECASE: "IGNORECASE",
  re.DOTALL: "DOTALL",
  re.MULTILINE: "MULTILINE",
  re.VERBOSE: "VERBOSE",
  re.ASCII: "ASCII",
}

_MAX_VALUE_REPR = 120


def _flag_names(flags: int) -> list[str]:
  return [name for bit, name in _FLAG_NAMES.items() if flags & bit]


def _matcher_kind(matcher: Any) -> str:
  """Name the matcher kind: parse, cfparse, re, re0 or other."""
  try:
    from behave import matchers  # noqa: PLC0415

    cfparse_cls = getattr(matchers, "CFParseMatcher", None)
    if cfparse_cls is not None and isinstance(matcher, cfparse_cls):
      return "cfparse"
    parse_cls = getattr(matchers, "ParseMatcher", None)
    if parse_cls is not None and isinstance(matcher, parse_cls):
      return "parse"
    simplified_cls = getattr(matchers, "SimplifiedRegexMatcher", None)
    if simplified_cls is not None and isinstance(matcher, simplified_cls):
      return "re"
    regex_cls = getattr(matchers, "RegexMatcher", None)
    if regex_cls is not None and isinstance(matcher, regex_cls):
      return "re0"
  except ImportError:
    pass
  return "other"


def _describe_field(
  name: str, spec: str, field_parser: Any, extra_types: dict[str, Any]
) -> dict[str, Any]:
  """One parameter segment: its type, regex, and whether Python must check it."""
  import parse  # noqa: PLC0415

  type_name = (
    (parse.extract_format(spec, extra_types).get("type") or "") if spec else ""
  )
  converter = extra_types.get(type_name) if type_name else None
  custom = converter is not None
  type_pattern = getattr(converter, "pattern", None) if custom else None

  segment: dict[str, Any] = {
    "name": name,
    "spec": spec,
    "type": type_name,
    "regex": field_parser._expression,  # noqa: SLF001
    "custom": custom,
    "has_pattern": type_pattern is not None if custom else True,
    "needs_python": custom or type_name not in _SAFE_TYPES,
  }
  if isinstance(type_pattern, str):
    segment["type_pattern"] = type_pattern
  return segment


def _field_segments(matcher: Any) -> list[dict[str, Any]] | None:
  """
  Split a parse/cfparse step definition into literal and parameter segments,
  the same way parse.Parser._generate_expression does. Each parameter segment
  gets its own single-field parser (same parser class, types and flags as the
  matcher), so its regex is exactly what behave would use for that field.

  Returns None when the definition can't be described faithfully.
  """
  import parse  # noqa: PLC0415

  parser = matcher.parser
  parser_cls = type(parser)
  extra_types = getattr(parser, "_extra_types", None) or {}
  re_flags = getattr(parser, "_re_flags", re.DOTALL)
  case_sensitive = not re_flags & re.IGNORECASE
  fmt = getattr(parser, "_format", matcher.pattern)

  segments: list[dict[str, Any]] = []
  first_field_by_name: dict[str, int] = {}

  def add_text(text: str) -> None:
    if segments and "text" in segments[-1]:
      segments[-1]["text"] += text
    else:
      segments.append({"text": text})

  for part in parse.PARSE_RE.split(fmt):
    if not part:
      continue
    if part in ("{{", "}}"):
      add_text(part[0])
      continue
    if not (part[0] == "{" and part[-1] == "}"):
      add_text(part)
      continue

    name, _, spec = part[1:-1].partition(":")
    if name and name in first_field_by_name:
      # parse emits a backreference for a repeated name - the argument must equal
      # the first one
      segments.append({"name": name, "repeat_of": first_field_by_name[name]})
      continue

    field_parser = parser_cls(
      "{f" + str(len(segments)) + (":" + spec if spec else "") + "}",
      extra_types=extra_types,
      case_sensitive=case_sensitive,
    )
    if name:
      first_field_by_name[name] = len(segments)
    segments.append(_describe_field(name, spec, field_parser, extra_types))

  return segments


def describe_matcher(matcher: Any) -> dict[str, Any] | None:
  """
  Describe how behave matches a step definition, for the extension's argument
  check. None means "can't be described" - the extension then treats the
  definition as unverifiable and never flags its arguments by itself.
  """
  kind = _matcher_kind(matcher)
  try:
    if kind in ("parse", "cfparse"):
      segments = _field_segments(matcher)
      if segments is None:
        return None
      flags = getattr(matcher.parser, "_re_flags", re.DOTALL)
      return {
        "kind": kind,
        "flags": _flag_names(flags),
        "segments": segments,
        "needs_python": any(s.get("needs_python") for s in segments),
      }
    if kind in ("re", "re0"):
      regex = matcher.regex
      return {
        "kind": kind,
        "flags": _flag_names(regex.flags),
        "regex": regex.pattern,
        "needs_python": False,
      }
  except Exception:  # noqa: BLE001  # introspection is best-effort, never fatal
    return None
  return {"kind": "other", "needs_python": True}


def _value_repr(value: Any) -> str:
  try:
    text = repr(value)
  except Exception:  # noqa: BLE001
    text = f"<{type(value).__name__}>"
  if len(text) > _MAX_VALUE_REPR:
    text = text[: _MAX_VALUE_REPR - 3] + "..."
  return text


def _error_text(err: BaseException) -> str:
  message = str(err)
  return f"{type(err).__name__}: {message}" if message else type(err).__name__


def _segment_arguments(matcher: Any, text: str) -> list[dict[str, Any]] | None:
  """
  Locate each parameter's argument in `text` and run that parameter's converter
  on its own, so a conversion failure can be pinned on the argument that caused
  it. Only for parse/cfparse definitions; None if the text can't be split.
  """
  segments = _field_segments(matcher)
  if segments is None:
    return None
  pieces = []
  for i, seg in enumerate(segments):
    if "text" in seg:
      body = re.escape(seg["text"])
    elif "repeat_of" in seg:
      body = f"(?P=s{seg['repeat_of']})"
    else:
      body = seg["regex"]
    pieces.append(f"(?P<s{i}>{body})")
  flags = getattr(matcher.parser, "_re_flags", re.DOTALL)
  m = re.fullmatch("".join(pieces), text, flags)
  if not m:
    return None

  parser_cls = type(matcher.parser)
  extra_types = getattr(matcher.parser, "_extra_types", None) or {}
  case_sensitive = not flags & re.IGNORECASE
  arguments = []
  for i, seg in enumerate(segments):
    if "text" in seg or "repeat_of" in seg:
      continue
    original = m.group(f"s{i}")
    arg: dict[str, Any] = {
      "segment": i,
      "start": m.start(f"s{i}"),
      "end": m.end(f"s{i}"),
      "original": original,
    }
    try:
      spec = seg["spec"]
      field_parser = parser_cls(
        "{v" + (":" + spec if spec else "") + "}",
        extra_types=extra_types,
        case_sensitive=case_sensitive,
      )
      result = field_parser.parse(original)
      if result is None:
        arg["error"] = "does not match the parameter's pattern"
      else:
        value = result.named.get("v")
        arg["value"] = _value_repr(value)
        arg["value_type"] = type(value).__name__
    except Exception as e:  # noqa: BLE001  # a converter may raise anything
      arg["error"] = _error_text(e)
    arguments.append(arg)
  return arguments


def _candidates(registry: Any, step_type: str) -> list[Any]:
  """Same candidate order as behave's StepRegistry.find_match."""
  candidates = list(registry.steps.get(step_type, []))
  if step_type != "step":
    candidates += registry.steps.get("step", [])
  return candidates


def _location(matcher: Any) -> tuple[str, int]:
  location = getattr(matcher, "location", None)
  if not location:
    return "unknown", 0
  from pathlib import Path  # noqa: PLC0415

  return str(Path(location.filename).resolve()), location.line


def _match_step(registry: Any, step_type: str, text: str, entry: dict[str, Any]) -> Any:
  """
  Return the definition behave would pick for this step (first match wins, a
  converter error included), recording its status/error in `entry`; None when
  no definition matches.
  """
  for matcher in _candidates(registry, step_type):
    try:
      match = matcher.match(text)
    except Exception as e:  # noqa: BLE001  # e.g. a bad regex - behave would raise too
      entry["status"] = "error"
      entry["error"] = _error_text(e)
      return matcher
    if match:
      stored_error = getattr(match, "stored_error", None)
      if stored_error is not None:
        entry["status"] = "error"
        entry["error"] = _error_text(stored_error)
      else:
        entry["status"] = "matched"
      return matcher
  return None


def check_steps(registry: Any, requests: list[dict[str, str]]) -> list[dict[str, Any]]:
  """
  Match each requested (step_type, text) exactly as behave would at run time.

  status: "matched" - a definition matched and every converter succeeded
          "error"   - the first matching definition's converter raised; behave
                      will error this step (StepParseError)
          "undefined" - no definition matched
  """
  results = []
  for req in requests:
    step_type = req.get("step_type", "")
    text = req.get("text", "")
    entry: dict[str, Any] = {"step_type": step_type, "text": text}
    chosen = _match_step(registry, step_type, text, entry)
    if chosen is None:
      entry["status"] = "undefined"
    else:
      entry["file"], entry["line"] = _location(chosen)
      if _matcher_kind(chosen) in ("parse", "cfparse"):
        try:
          arguments = _segment_arguments(chosen, text)
        except Exception:  # noqa: BLE001
          arguments = None
        if arguments is not None:
          entry["arguments"] = arguments
    results.append(entry)
  return results
