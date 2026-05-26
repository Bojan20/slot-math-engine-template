"""W50 — slot-rgs-connector CLI.

Two subcommands:

  • ``tail <path>``  — follow an NDJSON log file (or read once-through)
  • ``serve <host> <port>`` — bind a TCP socket and ingest NDJSON

Both feed events into a shared `MonitorState` and emit per-spin
snapshots to stdout (or a `--snapshot-log` JSONL file).
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Any

from tools.rgs_connector.connector import (
    ConnectorReport,
    serve_tcp,
    tail_jsonl_stream,
)
from tools.rtp_monitor.monitor import MonitorState, RtpSnapshot


def _make_state(args) -> MonitorState:
    return MonitorState(
        target_rtp=args.target_rtp,
        rolling_window=args.rolling_window,
        ewma_alpha=args.ewma_alpha,
        anomaly_z=args.anomaly_z,
    )


def _snapshot_writer(path: Path | None):
    if path is None:
        return None
    fh = path.open("w", encoding="utf-8")

    def _on(_event: dict[str, Any], snap: RtpSnapshot) -> None:
        fh.write(json.dumps(snap.to_dict(), separators=(",", ":")) + "\n")
        fh.flush()

    return _on


def _add_monitor_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--target-rtp", type=float, default=None)
    p.add_argument("--rolling-window", type=int, default=1000)
    p.add_argument("--ewma-alpha", type=float, default=0.01)
    p.add_argument("--anomaly-z", type=float, default=3.0)
    p.add_argument("--snapshot-log", type=Path, default=None)
    p.add_argument("--summary-json", type=Path, default=None)
    p.add_argument("--max-events", type=int, default=None)
    p.add_argument("--quiet", action="store_true")


def cmd_tail(args) -> int:
    state = _make_state(args)
    report = ConnectorReport()
    sink = _snapshot_writer(args.snapshot_log)
    for _event, snap in tail_jsonl_stream(
        Path(args.path),
        state=state,
        follow=args.follow,
        stop_when_empty=not args.follow,
        max_events=args.max_events,
        report=report,
        on_snapshot=sink,
    ):
        if snap is not None and not args.quiet:
            print(json.dumps(snap.to_dict(), separators=(",", ":")))
    if args.summary_json is not None:
        args.summary_json.write_text(json.dumps(report.to_dict(), indent=2))
    return 0


def cmd_serve(args) -> int:
    state = _make_state(args)
    report = ConnectorReport()
    sink = _snapshot_writer(args.snapshot_log)
    serve_tcp(
        args.host,
        args.port,
        state,
        max_events=args.max_events,
        on_snapshot=sink,
        report=report,
    )
    if args.summary_json is not None:
        args.summary_json.write_text(json.dumps(report.to_dict(), indent=2))
    if not args.quiet:
        print(json.dumps(report.to_dict(), indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="slot-rgs-connector",
        description="Live RGS telemetry → rtp_monitor bridge (W50).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    p_tail = sub.add_parser("tail", help="follow an NDJSON log file")
    p_tail.add_argument("path", help="path to NDJSON file")
    p_tail.add_argument(
        "--follow",
        action="store_true",
        help="tail -F semantics; without this, stops at EOF",
    )
    _add_monitor_args(p_tail)
    p_tail.set_defaults(func=cmd_tail)

    p_serve = sub.add_parser("serve", help="TCP NDJSON listener")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, required=True)
    _add_monitor_args(p_serve)
    p_serve.set_defaults(func=cmd_serve)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
