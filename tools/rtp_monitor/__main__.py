"""CLI entry for slot-rtp-monitor."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.rtp_monitor.monitor import (
    MonitorState,
    load_jsonl,
    update_from_stream,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-rtp-monitor",
        description=(
            "Consume a JSONL spin log and emit cumulative RTP, rolling-"
            "window RTP, EWMA RTP, drift severity, and anomaly counters."
        ),
    )
    p.add_argument("spin_log", type=Path, help="JSONL file (bet/pay per line)")
    p.add_argument("--target-rtp", type=float, default=None)
    p.add_argument("--rolling", type=int, default=1000,
                   help="rolling window size (default 1000)")
    p.add_argument("--alpha", type=float, default=0.01,
                   help="EWMA alpha (default 0.01)")
    p.add_argument("--anomaly-z", type=float, default=3.0)
    p.add_argument("--json", type=Path, default=None,
                   help="write final snapshot JSON to this path")
    p.add_argument("--last", type=int, default=10,
                   help="number of trailing snapshots to print")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    state = MonitorState(
        target_rtp=args.target_rtp,
        rolling_window=args.rolling,
        ewma_alpha=args.alpha,
        anomaly_z=args.anomaly_z,
    )
    events = load_jsonl(args.spin_log)
    snaps = update_from_stream(state, events)

    if not snaps:
        sys.stderr.write("no spin events found\n")
        return 1

    final = snaps[-1]

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(final.to_dict(), indent=2, sort_keys=True)
        )

    if not args.quiet:
        rolling_str = (
            f"{final.rolling_rtp:.4f}"
            if final.rolling_rtp is not None else "n/a"
        )
        sys.stdout.write(
            f"\n[rtp-monitor] {final.spins} spins · "
            f"RTP={final.cumulative_rtp:.4f} "
            f"rolling={rolling_str} "
            f"ewma={final.ewma_rtp:.4f} · "
            f"drift={final.drift_severity} "
            f"anomalies={final.anomalies}\n"
        )
        sys.stdout.write(
            f"  hit_freq={final.hit_freq:.4f}  "
            f"win_freq={final.win_freq:.4f}\n"
        )
        if args.last > 0:
            tail = snaps[-args.last:]
            sys.stdout.write(
                f"  last {len(tail)} snapshots (cumulative_rtp):\n"
            )
            for s in tail:
                sys.stdout.write(
                    f"    spin {s.spins:6d}  rtp={s.cumulative_rtp:.4f}\n"
                )

    # Exit 1 if drift is red
    return 1 if final.drift_severity == "red" else 0


if __name__ == "__main__":
    raise SystemExit(main())
