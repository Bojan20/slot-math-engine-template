"""CLI entry for slot-telemetry-bridge."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.rtp_monitor.monitor import MonitorState
from tools.drift_alert_hub.hub import (
    AlertHub,
    AlertRule,
    DEFAULT_RULES,
    EmailPayloadSink,
    LogfileAlertSink,
    WebhookPayloadSink,
)
from tools.telemetry_bridge.bridge import bridge_file


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
        prog="slot-telemetry-bridge",
        description=(
            "Consume an NDJSON telemetry feed, push each spin through "
            "rtp_monitor, and fan emitted snapshots into the drift "
            "alert hub."
        ),
    )
    p.add_argument("--feed", type=Path, required=True,
                   help="NDJSON spin feed file")
    p.add_argument("--target-rtp", type=float, default=0.95)
    p.add_argument("--rolling-window", type=int, default=2000)
    p.add_argument("--rules", type=Path, default=None,
                   help="JSON list of rule dicts; defaults to DEFAULT_RULES")
    p.add_argument("--log-out", type=Path, default=None)
    p.add_argument("--webhook-out-dir", type=Path, default=None)
    p.add_argument("--email-out-dir", type=Path, default=None)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.feed.exists():
        sys.stderr.write(f"feed not found: {args.feed}\n")
        return 2

    state = MonitorState(
        target_rtp=args.target_rtp,
        rolling_window=args.rolling_window,
    )
    rules = _load_rules(args.rules) if args.rules else list(DEFAULT_RULES)
    hub = AlertHub(rules=rules)
    if args.log_out:
        hub.register_sink(LogfileAlertSink(args.log_out))
    if args.webhook_out_dir:
        hub.register_sink(WebhookPayloadSink(args.webhook_out_dir))
    if args.email_out_dir:
        hub.register_sink(EmailPayloadSink(args.email_out_dir))

    report = bridge_file(args.feed, state=state, hub=hub)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[telemetry-bridge] events={report.events_received}  "
            f"spins={report.spins_consumed}  "
            f"non_spin={report.non_spin_skipped}  "
            f"decode_err={report.decode_errors}  "
            f"snapshots={report.snapshots_emitted}  "
            f"alerts={len(report.alerts_dispatched)}\n"
        )
        for a in report.alerts_dispatched:
            tag = {"critical": "🔴", "warning": "🟡", "info": "ℹ️"}.get(
                a.severity, "🔔"
            )
            sys.stdout.write(
                f"  {tag} {a.rule_id} {a.field}={a.observed_value} "
                f"vs {a.threshold_value} (spins={a.spins})\n"
            )

    crit = any(a.severity == "critical" for a in report.alerts_dispatched)
    return 1 if crit else 0


if __name__ == "__main__":
    raise SystemExit(main())
