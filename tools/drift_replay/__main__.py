"""CLI entry for slot-drift-replay."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.rtp_monitor.monitor import MonitorState
from tools.drift_alert_hub.hub import (
    AlertHub,
    DEFAULT_RULES,
    LogfileAlertSink,
)
from tools.drift_replay.theatre import replay_file


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-drift-replay",
        description=(
            "Throttled historical NDJSON spin replay through the "
            "telemetry bridge → drift hub stack."
        ),
    )
    p.add_argument("--feed", type=Path, required=True)
    p.add_argument("--speedup", type=float, default=0.0,
                   help="0 = no throttle; 60 = 1min event time → 1s wall")
    p.add_argument("--target-rtp", type=float, default=0.95)
    p.add_argument("--rolling-window", type=int, default=2000)
    p.add_argument("--log-out", type=Path, default=None,
                   help="LogfileAlertSink NDJSON path for alerts")
    p.add_argument("--tick-log", type=Path, default=None,
                   help="NDJSON tick log for UI scrubbing")
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
    hub = AlertHub(rules=list(DEFAULT_RULES))
    if args.log_out:
        hub.register_sink(LogfileAlertSink(args.log_out))

    report = replay_file(
        args.feed, state=state, hub=hub,
        speedup=args.speedup, tick_log_path=args.tick_log,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        br = report.bridge_report
        sys.stdout.write(
            f"\n[drift-replay] ticks={len(report.ticks)}  "
            f"spins={br.spins_consumed}  alerts={len(br.alerts_dispatched)}  "
            f"wall={report.total_wall_seconds:.3f}s  speedup={report.speedup}\n"
        )
    crit = any(
        a.severity == "critical" for a in report.bridge_report.alerts_dispatched
    )
    return 1 if crit else 0


if __name__ == "__main__":
    raise SystemExit(main())
