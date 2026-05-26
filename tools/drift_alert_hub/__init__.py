"""W54 — Real-time Drift Alert Hub.

Sits between W50 RGS connector / W29 rtp_monitor and an outbound
notification sink. Each RtpSnapshot from the monitor is evaluated
against a configurable threshold ladder; matching rules emit a
``DriftAlert`` which is dispatched to ALL registered sinks.

Sinks are PURE INTERFACES — no actual SMTP / HTTP calls. The bundled
sinks:

  * ``InMemoryAlertSink`` — collects alerts in a list (for tests).
  * ``LogfileAlertSink`` — appends NDJSON lines to a file.
  * ``WebhookPayloadSink`` — pre-formats a Slack-shape JSON payload
    and writes it to disk (without dispatching). Operator wires their
    own HTTP shipper.
  * ``EmailPayloadSink`` — emits an RFC-822-shape ``.eml`` file.

Rule shape (per row):

    {
      "id": "rtp_red_alert",
      "field": "drift_severity" | "cumulative_rtp" | "ewma_rtp" | "spins",
      "op": "eq" | "ne" | "gt" | "gte" | "lt" | "lte",
      "value": ...,
      "severity": "info" | "warning" | "critical"
    }

The hub is cooperative-stop friendly: ``dispatch`` is idempotent on
repeated identical snapshots (same spins value + same severity) to
avoid duplicate notification floods.
"""
from tools.drift_alert_hub.hub import (
    DriftAlert,
    AlertRule,
    AlertHub,
    InMemoryAlertSink,
    LogfileAlertSink,
    WebhookPayloadSink,
    EmailPayloadSink,
    DEFAULT_RULES,
)

__all__ = [
    "DriftAlert",
    "AlertRule",
    "AlertHub",
    "InMemoryAlertSink",
    "LogfileAlertSink",
    "WebhookPayloadSink",
    "EmailPayloadSink",
    "DEFAULT_RULES",
]
