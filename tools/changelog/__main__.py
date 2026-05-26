"""CLI entry for slot-changelog."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.changelog.generator import build_changelog


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-changelog",
        description=(
            "Generate a structured CHANGELOG.md from git log over a "
            "subtree. Groups by wave id (W4.9, W11, …) when conventional-"
            "commit scope encodes one; falls back to commit type."
        ),
    )
    p.add_argument("repo_root", type=Path, nargs="?", default=Path("."))
    p.add_argument("--path", action="append", default=None,
                   help="repeatable; subtrees to filter (default tools/)")
    p.add_argument("--max-commits", type=int, default=1000)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--markdown", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    cl = build_changelog(
        args.repo_root,
        paths=args.path or ("tools/",),
        max_commits=args.max_commits,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(cl.to_dict(), indent=2,
                                         sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(cl.to_markdown())

    if not args.quiet:
        sys.stdout.write(
            f"\n[changelog] {len(cl.entries)} commits · "
            f"{len(cl.by_scope())} scopes\n"
        )
        # Show top 10 most recent
        for e in cl.entries[:10]:
            sys.stdout.write(
                f"  {e.commit_hash[:7]}  {e.iso_date[:10]}  "
                f"{e.type:8s}  {e.subject}\n"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
