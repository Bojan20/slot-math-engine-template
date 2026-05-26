"""CLI entry for slot-audit-pin."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.audit_pin.pinner import pin_repo


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-audit-pin",
        description=(
            "Pin canonical SHA-256 into every IR's meta.lock_root_hash. "
            "Use --check to assert pins are current without rewriting."
        ),
    )
    p.add_argument("games_root", type=Path)
    p.add_argument("--check", action="store_true",
                   help="report stale pins without modifying files; exit 1 if stale")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = pin_repo(args.games_root, check_only=args.check)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                         sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[audit-pin] {len(report.results)} IR(s) · "
            f"pinned={report.n_pinned} unchanged={report.n_unchanged} "
            f"errors={report.n_errors}\n"
        )
        for r in report.results:
            tag = {"pinned": "📌", "already_current": "✓",
                    "error": "🔴"}.get(r.action, "?")
            sys.stdout.write(
                f"  {tag} {r.rel_path}"
                + (f"  {r.new_hash[:12]}…" if r.new_hash else "")
                + (f"  ({r.error})" if r.error else "")
                + "\n"
            )

    # Exit 1 if check-mode found stale pins or any errors
    if args.check and (report.n_errors > 0):
        return 1
    return 0 if report.n_errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
