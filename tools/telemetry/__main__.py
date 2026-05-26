"""CLI entry for slot-telemetry-validate.

Validate a JSON / JSONL telemetry stream against the schema.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.telemetry import sample_session, validate_stream


def _load_events(p: Path) -> list[dict]:
    txt = p.read_text()
    if p.suffix == ".jsonl":
        return [json.loads(line) for line in txt.splitlines() if line.strip()]
    data = json.loads(txt)
    if isinstance(data, list):
        return data
    return [data]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-telemetry-validate",
        description=(
            "Validate a JSON or JSONL telemetry stream against the W19 "
            "schema. Detects unknown event kinds, missing required "
            "payload keys, malformed UUIDs/timestamps, non-monotone "
            "per-session sequence numbers."
        ),
    )
    p.add_argument("stream", type=Path, nargs="?",
                   help="JSON or JSONL telemetry file")
    p.add_argument("--sample", action="store_true",
                   help="emit a fixture 6-event session to stdout")
    p.add_argument("--json", action="store_true",
                   help="emit full JSON validation report")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if args.sample:
        evs = sample_session()
        sys.stdout.write(json.dumps(evs, indent=2) + "\n")
        return 0

    if not args.stream:
        p.error("either --sample or <stream> path required")

    try:
        events = _load_events(args.stream)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to load stream: {e}\n")
        return 2

    rep = validate_stream(events)
    if args.json:
        sys.stdout.write(json.dumps(rep.to_dict(), indent=2,
                                      sort_keys=True) + "\n")
    elif not args.quiet:
        verdict = "PASS" if rep.passed else "FAIL"
        sys.stdout.write(
            f"\n[telemetry] {rep.total_events} events · "
            f"errors={rep.error_count} warnings={rep.warning_count} "
            f"· verdict={verdict}\n"
        )
        for issue in rep.issues[:20]:
            tag = "🔴" if issue.severity == "error" else "🟡"
            loc = f"[#{issue.event_index}]" if issue.event_index is not None else ""
            sys.stdout.write(f"  {tag} {loc} {issue.message}\n")
        if len(rep.issues) > 20:
            sys.stdout.write(
                f"  … ({len(rep.issues) - 20} more)\n"
            )
    return 0 if rep.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
