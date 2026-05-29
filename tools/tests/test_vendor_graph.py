"""W7.9 — Federated Multi-Vendor Math Knowledge Graph tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.vendor_graph.graph import (
    KnowledgeGraph,
    _parse_minimal_yaml,
    cross_vendor_feature_query,
    games_by_jurisdiction,
    ingest_repo,
    similar_games,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── Schema / insert basics ─────────────────────────────────────────


def test_empty_graph_starts_with_zero_counts() -> None:
    g = KnowledgeGraph()
    assert g.vendor_count() == 0
    assert g.game_count() == 0
    assert g.feature_count() == 0
    g.close()


def test_add_vendor_returns_id() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="igt", display_name="IGT", profile_version=2, repo_path="x")
    assert vid > 0
    assert g.vendor_count() == 1
    g.close()


def test_add_vendor_upserts_on_duplicate_code() -> None:
    g = KnowledgeGraph()
    g.add_vendor(code="lw", display_name="LW", profile_version=1, repo_path="a")
    g.add_vendor(code="lw", display_name="LW v2", profile_version=2, repo_path="b")
    assert g.vendor_count() == 1
    rows = g.query("SELECT profile_version, repo_path FROM vendor WHERE code='lw'").rows
    assert rows[0] == (2, "b")
    g.close()


def test_add_game_and_feature() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="igt", display_name="IGT", profile_version=2, repo_path="x")
    gid = g.add_game(
        vendor_id=vid, name="Fortune Coin", swid="200-1581-001", n_reels=5,
        n_rows=3, n_paylines=20, left_to_right_only=True, ir_repo_path="y",
    )
    g.add_feature(game_id=gid, kind="free_spins", params={"min_scatters": 3})
    g.add_feature(game_id=gid, kind="multiplier_ladder", params={"max_mult": 100})
    assert g.game_count() == 1
    assert g.feature_count() == 2
    g.close()


def test_jurisdiction_link() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="igt", display_name="IGT", profile_version=2, repo_path="x")
    gid = g.add_game(
        vendor_id=vid, name="x", swid="1", n_reels=5, n_rows=3, n_paylines=20,
        left_to_right_only=True, ir_repo_path="y",
    )
    jid = g.add_jurisdiction("UKGC")
    g.link_jurisdiction(game_id=gid, jurisdiction_id=jid)
    rows = g.query(
        "SELECT j.code FROM game_jurisdiction gj JOIN jurisdiction j ON j.id = gj.jurisdiction_id "
        "WHERE gj.game_id = ?",
        (gid,),
    ).rows
    assert rows == [("UKGC",)]
    g.close()


# ─── YAML helper ────────────────────────────────────────────────────


def test_parse_minimal_yaml_scalar_keys() -> None:
    text = """
# comment
vendor: igt
display_name: International Game Technology
profile_version: 2
"""
    out = _parse_minimal_yaml(text)
    assert out["vendor"] == "igt"
    assert out["display_name"] == "International Game Technology"
    assert out["profile_version"] == 2


def test_parse_minimal_yaml_strips_quotes() -> None:
    text = 'vendor: "igt"\ndisplay_name: \'IGT\'\n'
    out = _parse_minimal_yaml(text)
    assert out["vendor"] == "igt"
    assert out["display_name"] == "IGT"


# ─── Query helpers ──────────────────────────────────────────────────


def test_cross_vendor_feature_query_returns_only_full_matches() -> None:
    g = KnowledgeGraph()
    vid_a = g.add_vendor(code="a", display_name="A", profile_version=1, repo_path="")
    vid_b = g.add_vendor(code="b", display_name="B", profile_version=1, repo_path="")
    gA = g.add_game(vendor_id=vid_a, name="GameA", swid="A1", n_reels=5, n_rows=3,
                    n_paylines=20, left_to_right_only=True, ir_repo_path="")
    gB = g.add_game(vendor_id=vid_b, name="GameB", swid="B1", n_reels=5, n_rows=3,
                    n_paylines=20, left_to_right_only=True, ir_repo_path="")
    g.add_feature(game_id=gA, kind="free_spins", params={})
    g.add_feature(game_id=gA, kind="multiplier_ladder", params={})
    g.add_feature(game_id=gB, kind="free_spins", params={})
    # Only GameA has BOTH free_spins AND multiplier_ladder.
    result = cross_vendor_feature_query(g, ["free_spins", "multiplier_ladder"])
    assert [r[1] for r in result.rows] == ["GameA"]
    g.close()


def test_cross_vendor_feature_query_empty_kinds_returns_all() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="x", display_name="X", profile_version=1, repo_path="")
    g.add_game(vendor_id=vid, name="One", swid="1", n_reels=5, n_rows=3,
               n_paylines=20, left_to_right_only=True, ir_repo_path="")
    g.add_game(vendor_id=vid, name="Two", swid="2", n_reels=5, n_rows=3,
               n_paylines=20, left_to_right_only=True, ir_repo_path="")
    result = cross_vendor_feature_query(g, [])
    assert len(result.rows) == 2
    g.close()


def test_games_by_jurisdiction_filters_correctly() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="x", display_name="X", profile_version=1, repo_path="")
    g1 = g.add_game(vendor_id=vid, name="G1", swid="1", n_reels=5, n_rows=3,
                    n_paylines=20, left_to_right_only=True, ir_repo_path="")
    g2 = g.add_game(vendor_id=vid, name="G2", swid="2", n_reels=5, n_rows=3,
                    n_paylines=20, left_to_right_only=True, ir_repo_path="")
    ukgc = g.add_jurisdiction("UKGC")
    mga = g.add_jurisdiction("MGA")
    g.link_jurisdiction(game_id=g1, jurisdiction_id=ukgc)
    g.link_jurisdiction(game_id=g2, jurisdiction_id=mga)
    result = games_by_jurisdiction(g, "UKGC")
    assert [r[1] for r in result.rows] == ["G1"]
    g.close()


def test_similar_games_filters_by_topology() -> None:
    g = KnowledgeGraph()
    vid = g.add_vendor(code="x", display_name="X", profile_version=1, repo_path="")
    g.add_game(vendor_id=vid, name="Five20", swid="1", n_reels=5, n_rows=3,
               n_paylines=20, left_to_right_only=True, ir_repo_path="")
    g.add_game(vendor_id=vid, name="Six40", swid="2", n_reels=6, n_rows=4,
               n_paylines=40, left_to_right_only=True, ir_repo_path="")
    result = similar_games(g, n_reels=5, n_paylines=20)
    assert [r[1] for r in result.rows] == ["Five20"]
    g.close()


# ─── Ingest from synthetic repo ─────────────────────────────────────


def test_ingest_repo_picks_up_profiles_and_irs(tmp_path: Path) -> None:
    # Synthetic vendor profile.
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "alpha.yaml").write_text("""
vendor: alpha
display_name: Alpha Studios
profile_version: 1
""")
    (profiles / "beta.yaml").write_text("""
vendor: beta
display_name: Beta Inc
profile_version: 2
""")
    # Synthetic IRs (one per vendor).
    games = tmp_path / "games"
    games.mkdir()
    alpha_ir = games / "alpha.123-001.ir.json"
    alpha_ir.write_text(json.dumps({
        "meta": {
            "name": "Alpha One",
            "swid": "123-001",
            "reels": 5,
            "rows": 3,
            "lines": 20,
            "left_to_right_only": True,
        },
        "features": [{"kind": "free_spins", "params": {"min_scatters": 3}}],
        "jurisdictions": ["UKGC", "MGA"],
    }))
    beta_ir = games / "beta.999-001.ir.json"
    beta_ir.write_text(json.dumps({
        "meta": {
            "name": "Beta One",
            "swid": "999-001",
            "reels": 6,
            "rows": 4,
            "lines": 40,
        },
        "features": [{"kind": "megaways"}],
        "jurisdictions": ["MGA"],
    }))
    g = ingest_repo(
        profiles_dir=profiles,
        games_glob=[alpha_ir, beta_ir],
    )
    assert g.vendor_count() == 2
    assert g.game_count() == 2
    # Each game has at least 1 feature (free_spins / megaways).
    assert g.feature_count() >= 2
    g.close()


def test_ingest_skips_ir_without_vendor_registration(tmp_path: Path) -> None:
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "alpha.yaml").write_text("vendor: alpha\nprofile_version: 1\n")
    games = tmp_path / "games"
    games.mkdir()
    # File whose vendor prefix "gamma" doesn't exist in profiles.
    orphan = games / "gamma.111-111.ir.json"
    orphan.write_text(json.dumps({"meta": {"name": "x", "swid": "111-111"}}))
    g = ingest_repo(profiles_dir=profiles, games_glob=[orphan])
    assert g.game_count() == 0
    g.close()


def test_ingest_handles_invalid_json_gracefully(tmp_path: Path) -> None:
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "alpha.yaml").write_text("vendor: alpha\nprofile_version: 1\n")
    games = tmp_path / "games"
    games.mkdir()
    bad = games / "alpha.001.ir.json"
    bad.write_text("{ not json")
    g = ingest_repo(profiles_dir=profiles, games_glob=[bad])
    assert g.game_count() == 0
    g.close()


# ─── CLI smoke ──────────────────────────────────────────────────────


def test_cli_build_then_features(tmp_path: Path) -> None:
    from tools.vendor_graph.__main__ import main as cli_main  # noqa: PLC0415
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "alpha.yaml").write_text("vendor: alpha\nprofile_version: 1\n")
    games = tmp_path / "games"
    games.mkdir()
    ir = games / "alpha.001.ir.json"
    ir.write_text(json.dumps({
        "meta": {"name": "Alpha", "swid": "001", "reels": 5, "rows": 3, "lines": 20},
        "features": [{"kind": "free_spins"}, {"kind": "multiplier_ladder"}],
    }))
    db = tmp_path / "graph.sqlite"
    rc = cli_main([
        "build", "--profiles", str(profiles),
        "--games", str(ir), "--out", str(db),
    ])
    assert rc == 0
    assert db.exists()

    # Re-open and query through CLI features subcommand.
    rc = cli_main([
        "features", "--db", str(db), "free_spins", "multiplier_ladder",
    ])
    assert rc == 0


# ─── Live repo smoke (best effort) ──────────────────────────────────


def test_live_repo_ingest_smoke() -> None:
    """If the repo's own profiles + game IRs exist, ingesting them must
    succeed and yield non-zero vendor count."""
    profiles_dir = REPO_ROOT / "tools" / "vendor_profiles"
    if not profiles_dir.exists():
        pytest.skip("no vendor_profiles dir")
    g = ingest_repo(profiles_dir=profiles_dir, games_glob=[])
    assert g.vendor_count() >= 1
    g.close()
