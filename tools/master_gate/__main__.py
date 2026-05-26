"""W74 — slot-master-gate CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.master_gate.gate import run_master_gate


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-master-gate",
        description="Repo-wide master pipeline gate that aggregates "
                    "every existing CI gate into one verdict.",
    )
    p.add_argument("--repo-root", type=Path, required=True)
    p.add_argument("--games-root", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    report = run_master_gate(
        repo_root=args.repo_root,
        games_root=args.games_root,
        out_dir=args.out,
    )
    payload = report.to_dict()
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(
            f"[master-gate] {report.verdict.value.upper()} "
            f"(exit {report.exit_code()})\n"
        )
        for s in report.steps:
            sys.stdout.write(f"  - {s.status:5s} · {s.name}: {s.detail}\n")
    return report.exit_code()


if __name__ == "__main__":
    sys.exit(main())
