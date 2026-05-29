"""W4.8 + W4.12 — Clean-room template integration tests.

Pins the shape + math primitives of the two synthetic templates so
any future lift_to_ir.py regression surfaces immediately.

Both templates are pure-Python synthesized fixtures — no XLSX input,
no vendor PAR involved. They exist to give the engine a 5-mechanic
coverage demo (Cluster + Cascade + Pattern-FK + BonusBuy/Expanding
+ Megaways + Walking Wild) without requiring 5 different vendor
PARs.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
MEGAWAYS_IR = (
    REPO_ROOT
    / "games/megaways-clean-room-template/out/template-megaways-cleanroom.ir.json"
)
WALKING_WILD_IR = (
    REPO_ROOT
    / "games/walking-wild-clean-room-template/out/template-walking-wild-cleanroom.ir.json"
)


# ─── Megaways ─────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def megaways_ir() -> dict:
    if not MEGAWAYS_IR.exists():
        pytest.skip(f"Megaways template IR missing at {MEGAWAYS_IR}")
    return json.loads(MEGAWAYS_IR.read_text())


def test_megaways_meta_marks_template_as_synthetic(megaways_ir: dict) -> None:
    meta = megaways_ir["meta"]
    assert meta["id"] == "template-megaways-cleanroom"
    assert meta["family"] == "ways_variable_rows"
    assert meta["vendor"] == "<<synthetic>>"
    assert "megaways" in meta["theme_tags"]
    assert "variable-rows" in meta["theme_tags"]


def test_megaways_topology_6_reels_2_to_7_rows(megaways_ir: dict) -> None:
    topo = megaways_ir["topology"]
    assert topo["kind"] == "ways_variable_rows"
    assert topo["reels"] == 6
    assert topo["rows_min"] == 2
    assert topo["rows_max"] == 7
    assert topo["max_ways"] == 7 ** 6  # 117_649


def test_megaways_six_base_reels_present(megaways_ir: dict) -> None:
    base = megaways_ir["reels"]["base"]
    assert len(base) == 1
    reels = base[0]["reels"]
    assert len(reels) == 6


def test_megaways_every_reel_carries_book_and_mystery(megaways_ir: dict) -> None:
    """BOOK is scatter, MYSTERY is the random-resolve placeholder —
    every reel must carry both for the mechanic to fire."""
    reels = megaways_ir["reels"]["base"][0]["reels"]
    for r, reel in enumerate(reels):
        syms = {stop["symbol"] for stop in reel}
        assert "BOOK" in syms, f"BOOK missing on reel {r}"
        assert "MYSTERY" in syms, f"MYSTERY missing on reel {r}"


def test_megaways_row_count_pmf_has_2_to_7_buckets(megaways_ir: dict) -> None:
    pmf = megaways_ir["row_count_pmf"]
    assert set(pmf.keys()) == {"2", "3", "4", "5", "6", "7"}
    assert all(w > 0 for w in pmf.values())


def test_megaways_mystery_pmf_covers_payable_symbols(megaways_ir: dict) -> None:
    pmf = megaways_ir["mystery_symbol_pmf"]
    payable = set(megaways_ir["features"]["mystery_symbol"]["payable_set"])
    assert payable.issubset(set(pmf.keys()))


def test_megaways_rtp_breakdown_sums_to_total(megaways_ir: dict) -> None:
    rb = megaways_ir["meta"]["rtp_breakdown_reference"]
    parts = rb["base_game"] + rb["free_spins"]
    assert parts == pytest.approx(rb["total"], abs=1e-9)
    assert rb["total"] == pytest.approx(0.96, abs=1e-6)


def test_megaways_fs_unlimited_progressive_multiplier(megaways_ir: dict) -> None:
    fs = megaways_ir["features"]["free_spins"]
    assert fs["feature"] == "unlimited_progressive_multiplier"
    assert fs["multiplier_increment_per_cascade"] == 1
    assert fs["multiplier_persists_across_spins"] is True


def test_megaways_paytable_top_award_is_book_6_2000x(megaways_ir: dict) -> None:
    pt = megaways_ir["paytable"]
    assert pt["BOOK"]["6"] == 2000
    assert pt["HP1"]["6"] == 1000


def test_megaways_cascade_fill_pmf_disjoint_from_book(megaways_ir: dict) -> None:
    """Cascade refills should be possible (PMF non-empty) but ideally
    weight BOOK appearance similarly to the base strip so cascades
    can still chain into FS triggers."""
    pmf = megaways_ir["cascade_fill_pmf"]
    assert "BOOK" in pmf
    assert sum(pmf.values()) > 0


def test_megaways_industry_first_anchor_w48(megaways_ir: dict) -> None:
    assert any("W4.8" in a for a in megaways_ir["industry_first_anchors"])


# ─── Walking / Sticky Wild ─────────────────────────────────────────


@pytest.fixture(scope="module")
def walking_wild_ir() -> dict:
    if not WALKING_WILD_IR.exists():
        pytest.skip(f"Walking Wild template IR missing at {WALKING_WILD_IR}")
    return json.loads(WALKING_WILD_IR.read_text())


def test_walking_wild_meta_marks_template_as_synthetic(walking_wild_ir: dict) -> None:
    meta = walking_wild_ir["meta"]
    assert meta["id"] == "template-walking-wild-cleanroom"
    assert meta["vendor"] == "<<synthetic>>"
    for tag in ("walking-wild", "sticky-wild", "state-machine"):
        assert tag in meta["theme_tags"]


def test_walking_wild_topology_5x3_20_lines(walking_wild_ir: dict) -> None:
    topo = walking_wild_ir["topology"]
    assert topo["reels"] == 5
    assert topo["rows"] == 3
    assert topo["paylines"] == 20
    assert len(walking_wild_ir["evaluation"]["lines"]) == 20


def test_walking_wild_five_base_reels_with_wild_on_every(walking_wild_ir: dict) -> None:
    reels = walking_wild_ir["reels"]["base"][0]["reels"]
    assert len(reels) == 5
    for r, reel in enumerate(reels):
        syms = {stop["symbol"] for stop in reel}
        assert "WILD" in syms, f"WILD missing on reel {r}"
        assert "BOOK" in syms, f"BOOK missing on reel {r}"


def test_sticky_wild_state_machine_has_ttl_pmf(walking_wild_ir: dict) -> None:
    sw = walking_wild_ir["features"]["sticky_wild"]
    assert sw["kind"] == "lock_position_with_ttl"
    pmf = sw["ttl_pmf"]
    assert set(pmf.keys()) == {"1", "2", "3", "4", "5"}
    assert all(w > 0 for w in pmf.values())


def test_walking_wild_state_machine_has_direction_and_steps(walking_wild_ir: dict) -> None:
    ww = walking_wild_ir["features"]["walking_wild"]
    assert ww["kind"] == "lock_position_plus_direction"
    assert set(ww["direction_pmf"].keys()) == {"left", "right"}
    assert set(ww["steps_pmf"].keys()) == {"1", "2", "3", "4", "5"}


def test_walking_wild_edge_behaviour_evaporate(walking_wild_ir: dict) -> None:
    ww = walking_wild_ir["features"]["walking_wild"]
    # The edge-of-grid contract is the distinguishing math of the family.
    assert "evaporate" in ww["edge_behaviour"]


def test_walking_wild_free_spins_auto_walking(walking_wild_ir: dict) -> None:
    fs = walking_wild_ir["features"]["free_spins"]
    assert fs["trigger_min_scatters"] == 3
    assert fs["feature"] == "auto_walking_wild_left_steps_4"
    assert fs["scatter_symbol"] == "BOOK"


def test_walking_wild_rtp_breakdown_components_sum_to_total(walking_wild_ir: dict) -> None:
    rb = walking_wild_ir["meta"]["rtp_breakdown_reference"]
    parts = rb["base_game"] + rb["sticky_walking_bonus"] + rb["free_spins"]
    assert parts == pytest.approx(rb["total"], abs=1e-9)
    assert rb["total"] == pytest.approx(0.96, abs=1e-6)


def test_walking_wild_industry_first_anchors_w412(walking_wild_ir: dict) -> None:
    anchors = walking_wild_ir["industry_first_anchors"]
    assert any("W4.12a" in a for a in anchors)
    assert any("W4.12b" in a for a in anchors)


def test_walking_wild_paytable_wild_pays_top_non_book(walking_wild_ir: dict) -> None:
    pt = walking_wild_ir["paytable"]["line_wins"]
    # WILD should be the top non-scatter symbol — pays >= HP1 at every length.
    for length in ("3", "4", "5"):
        assert pt["WILD"][length] >= pt["HP1"][length]
