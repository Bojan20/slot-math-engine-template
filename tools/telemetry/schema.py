"""Telemetry event schema + validator.

Pure-Python schema with no external dependencies (jsonschema is NOT
required; we hand-roll the type/required checks because the schema is
small and stable).
"""
from __future__ import annotations
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Iterable


# ─── event taxonomy ─────────────────────────────────────────────────


class EventKind(str, Enum):
    SESSION_STARTED = "slot.session_started"
    SESSION_ENDED = "slot.session_ended"
    SPIN_STARTED = "slot.spin_started"
    SPIN_COMPLETED = "slot.spin_completed"
    WIN_LANDED = "slot.win_landed"
    FREE_SPINS_STARTED = "slot.free_spins_started"
    FREE_SPINS_ENDED = "slot.free_spins_ended"
    BONUS_TRIGGERED = "slot.bonus_triggered"
    CASCADE_TRIGGERED = "slot.cascade_triggered"
    REALITY_CHECK_SHOWN = "slot.reality_check_shown"
    LOSS_LIMIT_BREACHED = "slot.loss_limit_breached"
    RNG_SEED_RESET = "slot.rng_seed_reset"
    HOT_RELOAD = "slot.hot_reload"
    HEARTBEAT = "slot.heartbeat"


EVENT_KINDS = tuple(k.value for k in EventKind)


# Required payload keys per event kind (the schema check enforces
# presence; downstream consumers can ignore extra keys).
KNOWN_PAYLOAD_KEYS: dict[str, tuple[str, ...]] = {
    EventKind.SESSION_STARTED.value: ("player_id", "currency", "stake_unit"),
    EventKind.SESSION_ENDED.value: ("duration_ms", "total_bet", "total_pay"),
    EventKind.SPIN_STARTED.value: ("bet", "stake_unit", "rng_state"),
    EventKind.SPIN_COMPLETED.value: ("bet", "pay", "rng_state"),
    EventKind.WIN_LANDED.value: ("amount", "win_type"),
    EventKind.FREE_SPINS_STARTED.value: ("initial_spins", "trigger_symbol"),
    EventKind.FREE_SPINS_ENDED.value: ("spins_played", "total_pay"),
    EventKind.BONUS_TRIGGERED.value: ("bonus_kind",),
    EventKind.CASCADE_TRIGGERED.value: ("chain_level",),
    EventKind.REALITY_CHECK_SHOWN.value: ("elapsed_ms",),
    EventKind.LOSS_LIMIT_BREACHED.value: ("limit_amount", "current_loss"),
    EventKind.RNG_SEED_RESET.value: ("new_seed_sha256",),
    EventKind.HOT_RELOAD.value: ("from_ir_sha256", "to_ir_sha256"),
    EventKind.HEARTBEAT.value: ("uptime_ms",),
}


# ─── event dataclass ───────────────────────────────────────────────


@dataclass
class TelemetryEvent:
    event_type: str
    event_id: str
    ts_utc: str
    session_id: str
    swid: str
    payload: dict[str, Any] = field(default_factory=dict)
    correlation_id: str | None = None
    seq: int | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "event_type": self.event_type,
            "event_id": self.event_id,
            "ts_utc": self.ts_utc,
            "session_id": self.session_id,
            "swid": self.swid,
            "payload": dict(self.payload),
        }
        if self.correlation_id is not None:
            d["correlation_id"] = self.correlation_id
        if self.seq is not None:
            d["seq"] = self.seq
        return d


# ─── validation ────────────────────────────────────────────────────


@dataclass
class ValidationIssue:
    severity: str   # "error" | "warning"
    message: str
    field: str | None = None
    event_index: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "message": self.message,
            "field": self.field,
            "event_index": self.event_index,
        }


_UUID4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _is_uuid(s: str) -> bool:
    if not isinstance(s, str):
        return False
    return bool(_UUID4_RE.match(s)) or bool(re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        s, re.IGNORECASE,
    ))


def _is_rfc3339(s: str) -> bool:
    if not isinstance(s, str):
        return False
    try:
        # datetime.fromisoformat in py>=3.11 accepts the "Z" suffix
        datetime.fromisoformat(s.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def validate_event(event: dict[str, Any], *,
                    event_index: int | None = None,
                    ) -> list[ValidationIssue]:
    """Check schema conformance for a single event dict."""
    issues: list[ValidationIssue] = []

    def err(msg: str, fld: str | None = None) -> None:
        issues.append(ValidationIssue("error", msg, fld, event_index))

    def warn(msg: str, fld: str | None = None) -> None:
        issues.append(ValidationIssue("warning", msg, fld, event_index))

    if not isinstance(event, dict):
        err("event must be a dict")
        return issues

    for required in ("event_type", "event_id", "ts_utc",
                      "session_id", "swid"):
        if required not in event:
            err(f"missing required field: {required!r}", required)

    et = event.get("event_type")
    if et is not None and et not in EVENT_KINDS:
        warn(f"unknown event_type: {et!r}", "event_type")

    eid = event.get("event_id")
    if eid is not None and not _is_uuid(str(eid)):
        err(f"event_id is not a UUID: {eid!r}", "event_id")

    sid = event.get("session_id")
    if sid is not None and not _is_uuid(str(sid)):
        err(f"session_id is not a UUID: {sid!r}", "session_id")

    ts = event.get("ts_utc")
    if ts is not None and not _is_rfc3339(str(ts)):
        err(f"ts_utc is not RFC 3339: {ts!r}", "ts_utc")

    payload = event.get("payload")
    if payload is None:
        err("missing payload (use {} for events without data)",
            "payload")
    elif not isinstance(payload, dict):
        err("payload must be a dict", "payload")

    if et in KNOWN_PAYLOAD_KEYS and isinstance(payload, dict):
        for key in KNOWN_PAYLOAD_KEYS[et]:
            if key not in payload:
                err(f"payload missing required key {key!r} for "
                    f"event_type {et!r}", f"payload.{key}")

    seq = event.get("seq")
    if seq is not None and not isinstance(seq, int):
        err("seq must be an integer", "seq")

    cor = event.get("correlation_id")
    if cor is not None and not _is_uuid(str(cor)):
        warn(f"correlation_id is not a UUID: {cor!r}", "correlation_id")

    return issues


@dataclass
class TelemetryValidator:
    issues: list[ValidationIssue] = field(default_factory=list)
    total_events: int = 0

    @property
    def passed(self) -> bool:
        return not any(i.severity == "error" for i in self.issues)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "total_events": self.total_events,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "issues": [i.to_dict() for i in self.issues],
        }


def validate_stream(events: Iterable[dict[str, Any]]) -> TelemetryValidator:
    """Validate a stream of events. Also checks per-session monotone
    sequence numbers when `seq` is present on consecutive events."""
    out = TelemetryValidator()
    last_seq_per_session: dict[str, int] = {}
    for i, ev in enumerate(events):
        out.total_events += 1
        ev_issues = validate_event(ev, event_index=i)
        out.issues.extend(ev_issues)
        # Session-level sequence monotonicity
        sid = ev.get("session_id") if isinstance(ev, dict) else None
        seq = ev.get("seq") if isinstance(ev, dict) else None
        if isinstance(sid, str) and isinstance(seq, int):
            prev = last_seq_per_session.get(sid)
            if prev is not None and seq <= prev:
                out.issues.append(ValidationIssue(
                    severity="error",
                    message=(
                        f"session {sid} seq not strictly monotone: "
                        f"{prev} → {seq}"
                    ),
                    field="seq",
                    event_index=i,
                ))
            last_seq_per_session[sid] = seq
    return out


# ─── sample emitter (for tests + docs) ────────────────────────────


def sample_session(
    *,
    swid: str = "DEMO-001",
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Emit a deterministic, schema-conformant 6-event session.

    Useful as a fixture for downstream consumers + as a documentation
    example of expected payload shapes.
    """
    import random

    rng = random.Random(seed)
    session_id = str(uuid.UUID(int=rng.getrandbits(128), version=4))
    base_ts = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    def _eid() -> str:
        return str(uuid.UUID(int=rng.getrandbits(128), version=4))

    def _ts(offset_ms: int) -> str:
        dt = datetime.fromtimestamp(
            base_ts.timestamp() + offset_ms / 1000.0,
            tz=timezone.utc,
        ).replace(microsecond=0)
        # isoformat() already emits "+00:00" suffix for tz-aware datetimes;
        # don't add an extra "Z".
        return dt.isoformat()

    out: list[dict[str, Any]] = []
    seq = 0

    def _emit(kind: EventKind, payload: dict[str, Any],
              offset_ms: int) -> None:
        nonlocal seq
        seq += 1
        out.append({
            "event_type": kind.value,
            "event_id": _eid(),
            "ts_utc": _ts(offset_ms),
            "session_id": session_id,
            "swid": swid,
            "payload": payload,
            "seq": seq,
        })

    _emit(EventKind.SESSION_STARTED, {
        "player_id": "demo-player",
        "currency": "EUR",
        "stake_unit": 0.01,
    }, offset_ms=0)
    _emit(EventKind.SPIN_STARTED, {
        "bet": 1.0,
        "stake_unit": 0.01,
        "rng_state": "abc123",
    }, offset_ms=500)
    _emit(EventKind.WIN_LANDED, {
        "amount": 5.0,
        "win_type": "line",
    }, offset_ms=600)
    _emit(EventKind.SPIN_COMPLETED, {
        "bet": 1.0,
        "pay": 5.0,
        "rng_state": "def456",
    }, offset_ms=700)
    _emit(EventKind.HEARTBEAT, {"uptime_ms": 700}, offset_ms=1000)
    _emit(EventKind.SESSION_ENDED, {
        "duration_ms": 1500,
        "total_bet": 1.0,
        "total_pay": 5.0,
    }, offset_ms=1500)
    return out
