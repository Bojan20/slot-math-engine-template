"""Drift Alert Hub — rule-based RTP monitor snapshot router."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


# ─── Rule + alert ──────────────────────────────────────────────────


@dataclass
class AlertRule:
    id: str
    field: str
    op: str
    value: Any
    severity: str = "warning"

    def evaluate(self, snapshot: dict[str, Any]) -> bool:
        v = snapshot.get(self.field)
        if v is None:
            return False
        try:
            if self.op == "eq":
                return v == self.value
            if self.op == "ne":
                return v != self.value
            if self.op == "gt":
                return float(v) > float(self.value)
            if self.op == "gte":
                return float(v) >= float(self.value)
            if self.op == "lt":
                return float(v) < float(self.value)
            if self.op == "lte":
                return float(v) <= float(self.value)
        except (TypeError, ValueError):
            return False
        return False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "field": self.field, "op": self.op,
            "value": self.value, "severity": self.severity,
        }


@dataclass
class DriftAlert:
    rule_id: str
    severity: str
    field: str
    observed_value: Any
    threshold_value: Any
    spins: int
    timestamp_utc: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def fingerprint(self) -> tuple[str, int, str]:
        """Identity for deduplication: (rule_id, spins, severity)."""
        return (self.rule_id, self.spins, self.severity)

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "severity": self.severity,
            "field": self.field,
            "observed_value": self.observed_value,
            "threshold_value": self.threshold_value,
            "spins": self.spins,
            "timestamp_utc": self.timestamp_utc,
        }


# ─── Default rule set ──────────────────────────────────────────────


DEFAULT_RULES: list[AlertRule] = [
    AlertRule("rtp_drift_red", "drift_severity", "eq", "red", "critical"),
    AlertRule("rtp_drift_yellow", "drift_severity", "eq", "yellow", "warning"),
    AlertRule("rtp_below_0_80", "cumulative_rtp", "lt", 0.80, "critical"),
    AlertRule("rtp_above_1_10", "cumulative_rtp", "gt", 1.10, "warning"),
    AlertRule("ewma_drift_red", "drift_severity", "eq", "red", "critical"),
]


# ─── Sinks ─────────────────────────────────────────────────────────


@dataclass
class InMemoryAlertSink:
    name: str = "memory"
    alerts: list[DriftAlert] = field(default_factory=list)

    def send(self, alert: DriftAlert) -> None:
        self.alerts.append(alert)


@dataclass
class LogfileAlertSink:
    log_path: Path
    name: str = "logfile"

    def send(self, alert: DriftAlert) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a") as f:
            f.write(json.dumps(alert.to_dict()) + "\n")


@dataclass
class WebhookPayloadSink:
    """Writes a Slack-shape JSON payload to disk per alert. The
    operator wires their own outbound HTTP client to ship these."""
    out_dir: Path
    name: str = "webhook"

    def _slack_payload(self, alert: DriftAlert) -> dict[str, Any]:
        emoji = {
            "critical": ":rotating_light:",
            "warning": ":warning:",
            "info": ":information_source:",
        }.get(alert.severity, ":bell:")
        return {
            "text": (
                f"{emoji} *{alert.severity.upper()}* — rule "
                f"`{alert.rule_id}` — `{alert.field}={alert.observed_value}` "
                f"vs threshold `{alert.threshold_value}` (spins={alert.spins})"
            ),
            "attachments": [
                {
                    "title": alert.rule_id,
                    "fields": [
                        {"title": "field", "value": str(alert.field),
                         "short": True},
                        {"title": "observed", "value": str(alert.observed_value),
                         "short": True},
                        {"title": "threshold",
                         "value": str(alert.threshold_value), "short": True},
                        {"title": "spins", "value": str(alert.spins),
                         "short": True},
                    ],
                    "ts": alert.timestamp_utc,
                }
            ],
        }

    def send(self, alert: DriftAlert) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        ts_safe = alert.timestamp_utc.replace(":", "-").replace(".", "_")
        path = self.out_dir / f"{alert.rule_id}_{ts_safe}.slack.json"
        path.write_text(json.dumps(self._slack_payload(alert), indent=2))


@dataclass
class EmailPayloadSink:
    """Writes an RFC-822-ish .eml payload per alert."""
    out_dir: Path
    sender: str = "drift-bot@slotmath.local"
    recipient: str = "ops@slotmath.local"
    name: str = "email"

    def send(self, alert: DriftAlert) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        ts_safe = alert.timestamp_utc.replace(":", "-").replace(".", "_")
        path = self.out_dir / f"{alert.rule_id}_{ts_safe}.eml"
        body = (
            f"From: {self.sender}\r\n"
            f"To: {self.recipient}\r\n"
            f"Subject: [drift-{alert.severity}] {alert.rule_id}\r\n"
            f"Date: {alert.timestamp_utc}\r\n"
            f"X-Drift-Rule: {alert.rule_id}\r\n"
            f"X-Drift-Severity: {alert.severity}\r\n"
            f"\r\n"
            f"Rule {alert.rule_id} fired.\r\n"
            f"  field = {alert.field}\r\n"
            f"  observed = {alert.observed_value}\r\n"
            f"  threshold = {alert.threshold_value}\r\n"
            f"  spins = {alert.spins}\r\n"
        )
        path.write_text(body)


# ─── Hub ───────────────────────────────────────────────────────────


Sink = Any  # protocol-light: anything with .send(alert)


@dataclass
class AlertHub:
    rules: list[AlertRule] = field(default_factory=list)
    sinks: list[Sink] = field(default_factory=list)
    _seen_fingerprints: set[tuple[str, int, str]] = field(default_factory=set)
    dispatched_count: int = 0

    def register_rule(self, rule: AlertRule) -> None:
        self.rules.append(rule)

    def register_sink(self, sink: Sink) -> None:
        self.sinks.append(sink)

    def dispatch(self, snapshot: dict[str, Any]) -> list[DriftAlert]:
        """Evaluate every rule against `snapshot`; fan-out matching
        alerts to every sink. Returns the list of alerts emitted."""
        emitted: list[DriftAlert] = []
        spins = int(snapshot.get("spins", 0))
        for rule in self.rules:
            if not rule.evaluate(snapshot):
                continue
            alert = DriftAlert(
                rule_id=rule.id,
                severity=rule.severity,
                field=rule.field,
                observed_value=snapshot.get(rule.field),
                threshold_value=rule.value,
                spins=spins,
            )
            fp = alert.fingerprint()
            if fp in self._seen_fingerprints:
                continue
            self._seen_fingerprints.add(fp)
            for sink in self.sinks:
                try:
                    sink.send(alert)
                except Exception:
                    # Sinks must not break the hub
                    continue
            emitted.append(alert)
            self.dispatched_count += 1
        return emitted

    def dispatch_stream(
        self, snapshots: Iterable[dict[str, Any]]
    ) -> list[DriftAlert]:
        out: list[DriftAlert] = []
        for snap in snapshots:
            out.extend(self.dispatch(snap))
        return out
