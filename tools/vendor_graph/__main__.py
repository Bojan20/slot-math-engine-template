"""CLI for the W7.9 federated vendor knowledge graph.

Usage::

    python -m tools.vendor_graph build \\
        --profiles tools/vendor_profiles \\
        --games "games/*/out/*.ir.json" \\
        --out reports/vendor-graph/vendor.sqlite

    python -m tools.vendor_graph features --db reports/vendor-graph/vendor.sqlite \\
        free_spins linear_progressive

    python -m tools.vendor_graph jurisdiction \\
        --db reports/vendor-graph/vendor.sqlite UKGC

    python -m tools.vendor_graph similar \\
        --db reports/vendor-graph/vendor.sqlite --reels 5 --paylines 40
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

from .graph import (
    KnowledgeGraph,
    cross_vendor_feature_query,
    games_by_jurisdiction,
    ingest_repo,
    similar_games,
)


def _cmd_build(args: argparse.Namespace) -> int:
    paths: list[Path] = []
    for pattern in args.games:
        paths.extend(Path(p) for p in sorted(glob.glob(pattern)))
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()
    graph = ingest_repo(
        profiles_dir=Path(args.profiles),
        games_glob=paths,
        db_path=str(out_path),
    )
    print(
        f"vendor_graph: ingested {graph.vendor_count()} vendor(s), "
        f"{graph.game_count()} game(s), {graph.feature_count()} feature row(s) "
        f"→ {out_path}",
        file=sys.stderr,
    )
    graph.close()
    return 0


def _cmd_features(args: argparse.Namespace) -> int:
    graph = KnowledgeGraph(args.db)
    result = cross_vendor_feature_query(graph, args.kinds)
    print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    graph.close()
    return 0


def _cmd_jurisdiction(args: argparse.Namespace) -> int:
    graph = KnowledgeGraph(args.db)
    result = games_by_jurisdiction(graph, args.code)
    print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    graph.close()
    return 0


def _cmd_similar(args: argparse.Namespace) -> int:
    graph = KnowledgeGraph(args.db)
    result = similar_games(graph, n_reels=args.reels, n_paylines=args.paylines)
    print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    graph.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="vendor_graph",
        description="Federated multi-vendor math knowledge graph (W7.9)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_build = sub.add_parser("build", help="Ingest profiles + IRs into SQLite")
    p_build.add_argument("--profiles", default="tools/vendor_profiles")
    p_build.add_argument("--games", action="append", default=[])
    p_build.add_argument("--out", required=True)
    p_build.set_defaults(func=_cmd_build)

    p_feat = sub.add_parser("features", help="Cross-vendor query by feature kinds")
    p_feat.add_argument("--db", required=True)
    p_feat.add_argument("kinds", nargs="+")
    p_feat.set_defaults(func=_cmd_features)

    p_jur = sub.add_parser("jurisdiction", help="Games licensed in <code>")
    p_jur.add_argument("--db", required=True)
    p_jur.add_argument("code")
    p_jur.set_defaults(func=_cmd_jurisdiction)

    p_sim = sub.add_parser("similar", help="Games sharing reels × paylines topology")
    p_sim.add_argument("--db", required=True)
    p_sim.add_argument("--reels", type=int, required=True)
    p_sim.add_argument("--paylines", type=int, required=True)
    p_sim.set_defaults(func=_cmd_similar)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
