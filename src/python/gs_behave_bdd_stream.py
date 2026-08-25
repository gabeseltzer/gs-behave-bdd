"""
Streams behave test events to the gs-behave-bdd VS Code extension as NDJSON.

Registered by the extension as an extra formatter alongside behave's own, e.g.

  behave -f pretty -o - -f gs_behave_bdd_stream:StreamFormatter -o <events.ndjson>

Why this exists: behave's JUnit reporter writes one XML file per feature, and only
after the whole feature has finished (runner.py -> reporter.feature(feature) ->
reporter/junit.py). Reading results from JUnit therefore cannot report a scenario
before its entire feature is done. This formatter emits one JSON object per event
as it happens, so the Test Explorer can resolve each scenario the moment behave
finishes it.

Latency: on_scenario_end fires from BaseFormatter2._finish_current_scenario(),
which is called when the NEXT scenario starts and from eof(). So a scenario's
result is emitted during the gap before the following scenario - milliseconds -
and a feature's last scenario is emitted at feature end. Do not try to infer
scenario completion from step counts; this interface already provides it.

Output contract: one JSON object per line, flushed immediately, UTF-8.
Every event carries "event", and scenario/step events carry the feature file and
a line number, which together identify the item without matching on names.
Unknown fields should be ignored by readers, so fields can be added safely.
"""

from __future__ import annotations

import json
from typing import Any

from behave.formatter.base2 import BaseFormatter2

# Bumped when the event shape changes incompatibly. The extension checks it and
# falls back to JUnit rather than misreporting results.
PROTOCOL_VERSION = 1


def _status_name(obj: Any) -> str | None:
  """Emit a status as its plain name ("passed", "failed", ...) rather than the enum."""
  status = getattr(obj, "status", None)
  if status is None:
    return None
  return str(getattr(status, "name", status))


def _location(obj: Any) -> tuple[str | None, int | None]:
  location = getattr(obj, "location", None)
  if location is None:
    return None, None
  filename = getattr(location, "filename", None)
  line = getattr(location, "line", None)
  return (str(filename) if filename is not None else None, line)


def _duration(obj: Any) -> float | None:
  duration = getattr(obj, "duration", None)
  if duration is None:
    return None
  try:
    return round(float(duration), 6)
  except (TypeError, ValueError):
    return None


class StreamFormatter(BaseFormatter2):  # type: ignore[misc]
  """Emits one NDJSON event per behave lifecycle callback."""

  name = "gs-behave-bdd-stream"
  description = "Streams test events as NDJSON for the gs-behave-bdd extension."

  def __init__(self, stream_opener: Any, config: Any) -> None:
    super().__init__(stream_opener, config)
    # stream_opener.stream is None until open() is called - PrettyFormatter does
    # the same in its __init__. Without this, the first write raises
    # AttributeError on None and behave swallows it as a formatter error.
    self.stream = self.open()
    self._emit({"event": "testrun", "phase": "start", "protocol": PROTOCOL_VERSION})

  # -- OUTPUT ---------------------------------------------------------------

  def _emit(self, event: dict[str, Any]) -> None:
    # Flush per event: the extension tails this file while behave is running, so
    # buffering here would reintroduce exactly the latency this formatter removes.
    self.stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
    self.stream.flush()

  # -- INTERFACE FOR: IFormatter2 -------------------------------------------

  def on_feature_start(self, this_feature: Any) -> None:
    filename, line = _location(this_feature)
    self._emit(
      {
        "event": "feature",
        "phase": "start",
        "file": filename,
        "line": line,
        "name": getattr(this_feature, "name", None),
      }
    )

  def on_feature_end(self, this_feature: Any) -> None:
    filename, line = _location(this_feature)
    self._emit(
      {
        "event": "feature",
        "phase": "end",
        "file": filename,
        "line": line,
        "name": getattr(this_feature, "name", None),
        "status": _status_name(this_feature),
        "duration": _duration(this_feature),
      }
    )

  def on_scenario_start(self, this_scenario: Any) -> None:
    self._emit(self._scenario_event(this_scenario, "start"))

  def on_scenario_end(self, this_scenario: Any) -> None:
    self._emit(self._scenario_event(this_scenario, "end"))

  def on_step_end(self, this_step: Any) -> None:
    filename, line = _location(this_step)
    error = getattr(this_step, "error_message", None)
    self._emit(
      {
        "event": "step",
        "phase": "end",
        "file": filename,
        "line": line,
        "keyword": getattr(this_step, "keyword", None),
        "name": getattr(this_step, "name", None),
        "status": _status_name(this_step),
        "duration": _duration(this_step),
        "error": str(error) if error else None,
      }
    )

  def on_testrun_end(self) -> None:
    self._emit({"event": "testrun", "phase": "end"})

  # -- SPECIFIC -------------------------------------------------------------

  def _scenario_event(self, this_scenario: Any, phase: str) -> dict[str, Any]:
    filename, line = _location(this_scenario)
    event: dict[str, Any] = {
      "event": "scenario",
      "phase": phase,
      "file": filename,
      "line": line,
      "name": getattr(this_scenario, "name", None),
    }

    # A Scenario Outline example row is a generated Scenario whose location is the
    # row, not the outline. Emit the outline's own line too, so the extension can
    # resolve either the row item or the outline item it belongs to.
    outline = getattr(this_scenario, "_row", None)
    if outline is not None:
      event["row_id"] = getattr(outline, "id", None)
    container = getattr(this_scenario, "feature", None)
    if container is not None:
      event["feature_name"] = getattr(container, "name", None)

    if phase == "end":
      event["status"] = _status_name(this_scenario)
      event["duration"] = _duration(this_scenario)

    return event
