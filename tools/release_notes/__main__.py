"""CLI entry for slot-release-notes."""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from pathlib import Path

from tools.release_notes.synthesizer import (
    ReleaseNotes,
    parse_commits,
    render_markdown,
)


def _git_log_lines(rev_range: str | None) -> list[str]:
    cmd = ["git", "log", "--oneline"]
    if rev_range:
        cmd.append(rev_range)
    try:
        out = subprocess.check_output(cmd, text=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        sys.stderr.write(f"git log failed: {e}\n")
        return []
    return out.splitlines()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-release-notes",
        description=(
            "Synthesize release notes from git log Conventional Commits."
        ),
    )
    p.add_argument("--title", default="Release Notes")
    p.add_argument("--version", required=True)
    p.add_argument("--range", default=None,
                   help="git revision range e.g. v0.1.0..HEAD")
    p.add_argument("--stats", type=Path, default=None,
                   help="JSON file with stats dict to embed")
    p.add_argument("--md", type=Path, default=None)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    commits = _git_log_lines(args.range)
    entries = parse_commits(commits)
    stats: dict = {}
    if args.stats:
        try:
            stats = json.loads(args.stats.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read stats: {e}\n")
            return 2

    notes = ReleaseNotes(
        title=args.title, version=args.version,
        entries=entries, stats=stats,
    )

    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(render_markdown(notes))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(notes.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[release-notes] {len(notes.entries)} commits  "
            f"breaking={notes.n_breaking}  version={notes.version}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
