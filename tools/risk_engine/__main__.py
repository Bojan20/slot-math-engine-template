"""PHASE 23 — `slot-risk-engine` CLI.

Assess a stream of spin events for risk; emit per-session report.

Subcommands:
    assess --stream events.jsonl --out report.json
    interactive  → REPL where each line is a SpinEvent JSON
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.risk_engine.assessor import (
    RiskAssessor,
    RiskPolicy,
    SpinEvent,
)


def _parse_event(obj: dict) -> SpinEvent:
    return SpinEvent(
        session_id=str(obj["session_id"]),
        player_id=str(obj["player_id"]),
        ts_unix=float(obj["ts_unix"]),
        bet_amount=float(obj["bet_amount"]),
        payout_amount=float(obj["payout_amount"]),
        deposit_balance=obj.get("deposit_balance"),
        loss_limit=obj.get("loss_limit"),
    )


def cmd_assess(args: argparse.Namespace) -> int:
    stream_path = Path(args.stream)
    if not stream_path.exists():
        print(f"error: stream not found: {stream_path}", file=sys.stderr)
        return 2

    assessor = RiskAssessor(policy=RiskPolicy.ukgc_default())
    interventions: dict[str, int] = {}
    last_scores: dict[str, dict] = {}
    n_events = 0

    with stream_path.open() as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"skip malformed line: {exc}", file=sys.stderr)
                continue
            event = _parse_event(obj)
            score = assessor.observe(event)
            n_events += 1
            key = f"{score.player_id}:{score.session_id}"
            last_scores[key] = {
                "player_id": score.player_id,
                "session_id": score.session_id,
                "composite_score": score.composite_score,
                "intervention": score.intervention.value,
                "breakdown": score.breakdown,
                "metrics_snapshot": score.metrics_snapshot,
                "suggested_action": score.suggested_action,
            }
            interventions[score.intervention.value] = interventions.get(
                score.intervention.value, 0,
            ) + 1

    report = {
        "schema_version": "urn:slotmath:risk-engine:v1",
        "events_processed": n_events,
        "sessions_seen": len(last_scores),
        "intervention_counts": interventions,
        "last_scores": last_scores,
    }

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2))
    if args.json:
        print(json.dumps(report, indent=2))
    elif not args.quiet:
        print(f"[risk-engine] events={n_events} sessions={len(last_scores)}")
        for level, count in sorted(interventions.items()):
            print(f"  {level}: {count}")
        if args.out:
            print(f"  json saved: {args.out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-risk-engine",
        description="PHASE 23 — Real-Time Player Risk Engine.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_assess = sub.add_parser("assess", help="Assess a JSONL stream.")
    p_assess.add_argument("--stream", required=True,
                           help="Path to JSONL spin events.")
    p_assess.add_argument("--out", help="Persist JSON report.")
    p_assess.add_argument("--json", action="store_true",
                           help="Print full JSON report to stdout.")
    p_assess.add_argument("--quiet", action="store_true")
    p_assess.set_defaults(func=cmd_assess)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
