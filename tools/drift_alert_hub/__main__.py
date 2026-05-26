"""CLI entry for slot-drift-alert-hub."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.drift_alert_hub.hub import (
    AlertHub,
    AlertRule,
    DEFAULT_RULES,
    EmailPayloadSink,
    LogfileAlertSink,
    WebhookPayloadSink,
)


def _load_rules(path: Path) -> list[AlertRule]:
    raw = json.loads(path.read_text())
    return [
        AlertRule(
            id=str(r["id"]),
            field=str(r["field"]),
            op=str(r["op"]),
            value=r["value"],
            severity=str(r.get("severity", "warning")),
        )
        for r in raw
    ]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-drift-alert-hub",
        description=(
            "Replay an NDJSON snapshot stream through the drift "
            "alert hub. Outputs JSON of all dispatched alerts."
        ),
    )
    p.add_argument("--snapshots", type=Path, required=True,
                   help="NDJSON file with one RtpSnapshot dict per line")
    p.add_argument("--rules", type=Path, default=None,
                   help="JSON list of rule dicts; defaults to DEFAULT_RULES")
    p.add_argument("--log-out", type=Path, default=None,
                   help="LogfileAlertSink target NDJSON path")
    p.add_argument("--webhook-out-dir", type=Path, default=None,
                   help="WebhookPayloadSink directory")
    p.add_argument("--email-out-dir", type=Path, default=None,
                   help="EmailPayloadSink directory")
    p.add_argument("--json", type=Path, default=None,
                   help="JSON output of all dispatched alerts")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.snapshots.exists():
        sys.stderr.write(f"snapshots not found: {args.snapshots}\n")
        return 2

    rules = _load_rules(args.rules) if args.rules else list(DEFAULT_RULES)

    hub = AlertHub(rules=rules)
    if args.log_out:
        hub.register_sink(LogfileAlertSink(args.log_out))
    if args.webhook_out_dir:
        hub.register_sink(WebhookPayloadSink(args.webhook_out_dir))
    if args.email_out_dir:
        hub.register_sink(EmailPayloadSink(args.email_out_dir))

    snapshots = []
    for line in args.snapshots.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            snapshots.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    alerts = hub.dispatch_stream(snapshots)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps([a.to_dict() for a in alerts], indent=2, sort_keys=True)
        )

    if not args.quiet:
        sys.stdout.write(
            f"\n[drift-alert-hub] snapshots={len(snapshots)}  "
            f"rules={len(rules)}  sinks={len(hub.sinks)}  "
            f"alerts_emitted={len(alerts)}\n"
        )
        for a in alerts:
            tag = {"critical": "🔴", "warning": "🟡", "info": "ℹ️"}.get(
                a.severity, "🔔"
            )
            sys.stdout.write(
                f"  {tag} {a.rule_id}  {a.field}={a.observed_value} "
                f"vs {a.threshold_value} (spins={a.spins})\n"
            )

    return 0 if not any(a.severity == "critical" for a in alerts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
