"""W19 — Telemetry Event Schema.

Canonical event schema for RGS / engine telemetry emission. Every
event the engine emits during play (or replay) MUST conform to this
schema so downstream cohort analyzers, jurisdiction compliance
loggers, and player-protection dashboards can consume a stable stream.

Schema covers:
  • Session lifecycle  (session_started / session_ended)
  • Spin lifecycle     (spin_started / spin_completed / win_landed)
  • Feature triggers   (free_spins_started / free_spins_ended /
                         bonus_triggered / cascade_triggered)
  • Player protection  (reality_check_shown / loss_limit_breached)
  • Audit              (rng_seed_reset / hot_reload / heartbeat)

Each event has:
  • `event_type`  — namespaced kind (e.g. "slot.spin_completed")
  • `event_id`    — UUID v4
  • `ts_utc`      — RFC 3339 timestamp
  • `session_id`  — UUID linking the event to a player session
  • `swid`        — IR SWID identifier
  • `payload`     — event-specific dict
  • optional `correlation_id` — link related events
  • optional `seq` — monotonically increasing per-session sequence
"""
from tools.telemetry.schema import (
    EventKind,
    EVENT_KINDS,
    KNOWN_PAYLOAD_KEYS,
    TelemetryEvent,
    TelemetryValidator,
    ValidationIssue,
    validate_event,
    validate_stream,
    sample_session,
)

__all__ = [
    "EventKind",
    "EVENT_KINDS",
    "KNOWN_PAYLOAD_KEYS",
    "TelemetryEvent",
    "TelemetryValidator",
    "ValidationIssue",
    "validate_event",
    "validate_stream",
    "sample_session",
]
