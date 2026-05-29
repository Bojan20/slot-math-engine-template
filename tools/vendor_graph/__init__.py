"""W7.9 — Federated Multi-Vendor Math Knowledge Graph.

Ingests every vendor profile (``tools/vendor_profiles/*.yaml``) and
every shipping IR (``games/*/out/*.ir.json``) into an in-memory
knowledge graph backed by SQLite. Lets designers / operators run
cross-vendor pattern queries::

    "Show every game with Megaways + multiplier ladder"
    "List all SWIDs that share a paytable shape with Fortune Coin"
    "Group games by jurisdiction"

The "federated" part is the schema design: vendors live as plugin
**rows** in the ``vendor`` table; new vendor profiles drop in
without any code change. The schema covers:

* ``vendor(id, display_name, profile_version, repo_path)``
* ``game(id, vendor_id, name, swid, n_reels, n_rows, n_paylines,
         left_to_right_only, ir_repo_path)``
* ``feature(id, game_id, kind, params_json)``
* ``jurisdiction(id, code, max_rtp_pct, ...)``  (light placeholder
  for now; W9.1 already covers jurisdiction adaptation)
* ``game_jurisdiction(game_id, jurisdiction_id)``

Pure Python stdlib + SQLite — no external graph DB, no Neo4j, no
LangGraph. Determinism: the same input dirs produce identical row
counts and identical IDs (auto-increment is stable per ingest).
"""

from .graph import (
    KnowledgeGraph,
    QueryResult,
    cross_vendor_feature_query,
    games_by_jurisdiction,
    ingest_repo,
    similar_games,
)

__all__ = [
    "KnowledgeGraph",
    "QueryResult",
    "cross_vendor_feature_query",
    "games_by_jurisdiction",
    "ingest_repo",
    "similar_games",
]
