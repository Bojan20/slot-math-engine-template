"""CLI entry for slot-config-validate."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.config_validator.validator import validate_repo


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-config-validate",
        description=(
            "Repo configuration cross-reference validator: every IR's "
            "RTP / max_win / min_spin_duration_ms must satisfy every "
            "jurisdiction it claims; vendors registered; features known."
        ),
    )
    p.add_argument("games_root", type=Path)
    p.add_argument("--jurisdiction", action="append", default=None,
                   metavar="ID",
                   help="restrict checks to these profile ids")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--markdown", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = validate_repo(
        args.games_root,
        jurisdictions=args.jurisdiction,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                        sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(report.to_markdown())

    if not args.quiet:
        verdict = "PASS" if report.passed else "FAIL"
        sys.stdout.write(
            f"\n[config-validate] {report.n_games} games · "
            f"{report.n_jurisdictions} jurisdictions · "
            f"{report.n_vendors} vendors · "
            f"errors={report.error_count} warnings={report.warning_count} "
            f"· {verdict}\n"
        )
        for issue in report.issues[:30]:
            tag = "🔴" if issue.severity == "error" else "🟡"
            sys.stdout.write(
                f"  {tag} [{issue.rule}] "
                + (f"{issue.game}: " if issue.game else "")
                + issue.message + "\n"
            )
        if len(report.issues) > 30:
            sys.stdout.write(
                f"  … ({len(report.issues) - 30} more)\n"
            )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
