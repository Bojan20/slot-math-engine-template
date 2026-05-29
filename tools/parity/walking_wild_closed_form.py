#!/usr/bin/env python3
"""W4.12 — Closed-form parity verifier for `template-walking-wild-cleanroom.ir.json`.

Computes, from the IR alone:

* Per-reel BOOK scatter probability + the FS trigger probability for
  3 / 4 / 5 scatter outcomes.
* Per-reel WILD landing probability — drives sticky-wild lock cadence.
* Sticky Wild expected TTL (E[TTL] = Σ k·P(TTL=k)).
* Walking Wild expected steps (E[steps] = Σ k·P(steps=k)) and
  evaporate probability per reel position.
* Structural-validity gates only — synthesized fixture, not a vendor
  PAR, so this validator confirms the IR is engine-usable, not that
  the reel weights hit a precise RTP target.

Pure stdlib.
"""

from __future__ import annotations

import json
import math
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
IR_PATH = REPO / "games" / "walking-wild-clean-room-template" / "out" / "template-walking-wild-cleanroom.ir.json"
REPORT = REPO / "reports" / "acceptance" / "walking_wild_parity.json"
REPORT.parent.mkdir(parents=True, exist_ok=True)


def reel_probabilities(strip: list[dict]) -> dict[str, float]:
    total = sum(int(e["weight"]) for e in strip)
    assert total > 0
    return {e["symbol"]: int(e["weight"]) / total for e in strip}


def normalize_int_pmf(pmf: dict[str, int]) -> dict[int, float]:
    total = sum(int(w) for w in pmf.values())
    return {int(k): int(v) / total for k, v in pmf.items()}


def normalize_str_pmf(pmf: dict[str, int]) -> dict[str, float]:
    total = sum(int(w) for w in pmf.values())
    return {k: int(v) / total for k, v in pmf.items()}


def expected_pmf(pmf: dict[int, float]) -> float:
    return sum(k * v for k, v in pmf.items())


def variance_pmf(pmf: dict[int, float]) -> float:
    mu = expected_pmf(pmf)
    return sum((k - mu) ** 2 * v for k, v in pmf.items())


def p_at_least_n_across_reels(
    per_reel_q: list[float],
    n: int,
) -> float:
    """Given P(scatter present on reel r) for each reel, exact P(≥n
    reels show ≥1 scatter) via 2^R enumeration."""
    R = len(per_reel_q)
    total = 0.0
    for mask in range(1 << R):
        bits = bin(mask).count("1")
        if bits < n:
            continue
        p = 1.0
        for r in range(R):
            p *= per_reel_q[r] if (mask & (1 << r)) else (1.0 - per_reel_q[r])
        total += p
    return total


def verify() -> dict:
    ir = json.loads(IR_PATH.read_text())
    base_reels = ir["reels"]["base"][0]["reels"]
    per_reel_p = [reel_probabilities(reel) for reel in base_reels]
    rows = ir["topology"]["rows"]
    rb = ir["meta"]["rtp_breakdown_reference"]

    # ── Scatter trigger probabilities ────────────────────────────
    p_scatter_per_reel = [p.get("BOOK", 0.0) for p in per_reel_p]
    q_scatter_per_reel = [1.0 - (1.0 - p) ** rows for p in p_scatter_per_reel]
    p_trigger = {
        f"≥{k}": p_at_least_n_across_reels(q_scatter_per_reel, k)
        for k in (3, 4, 5)
    }

    # ── Wild landing probabilities (sticky/walking trigger) ─────
    p_wild_per_reel = [p.get("WILD", 0.0) for p in per_reel_p]
    q_wild_per_reel = [1.0 - (1.0 - p) ** rows for p in p_wild_per_reel]
    # E[number of reels with ≥1 wild per spin] = Σ q_r
    e_wilds_per_spin = sum(q_wild_per_reel)

    # ── Sticky Wild state machine stats ──────────────────────────
    ttl_pmf = normalize_int_pmf(ir["features"]["sticky_wild"]["ttl_pmf"])
    e_ttl = expected_pmf(ttl_pmf)
    var_ttl = variance_pmf(ttl_pmf)

    # ── Walking Wild state machine stats ─────────────────────────
    steps_pmf = normalize_int_pmf(ir["features"]["walking_wild"]["steps_pmf"])
    direction_pmf = normalize_str_pmf(ir["features"]["walking_wild"]["direction_pmf"])
    e_steps = expected_pmf(steps_pmf)
    var_steps = variance_pmf(steps_pmf)

    # E[walking distance traveled before evaporation] = E[steps] but
    # capped at grid edge. For a 5-reel grid with starting reel ~middle,
    # the cap is ~2-4 steps, so E[distance | starting reel] ≈ E[steps]
    # for reels 2..3 and less for edge reels.
    grid_width = ir["topology"]["reels"]
    e_distance_per_reel = {}
    for start_reel in range(grid_width):
        # Symmetric direction → average over left/right.
        max_left = start_reel  # steps available going left
        max_right = grid_width - 1 - start_reel
        # E[steps capped at K] = Σ min(k, K) * P(steps=k)
        def cap(K: int) -> float:
            return sum(min(k, K) * v for k, v in steps_pmf.items())
        avg = direction_pmf.get("left", 0.0) * cap(max_left) + \
              direction_pmf.get("right", 0.0) * cap(max_right)
        e_distance_per_reel[str(start_reel)] = avg

    # ── FS award schedule contribution ───────────────────────────
    fs = ir["features"]["free_spins"]
    fs_awards = {k: int(v) for k, v in fs["award_schedule"].items()}
    e_fs_awarded = sum(
        p_trigger[f"≥{k}"] * v for k, v in fs_awards.items() if f"≥{k}" in p_trigger
    )

    # ── Structural gates ────────────────────────────────────────
    rb_components = ("base_game", "sticky_walking_bonus", "free_spins")
    rb_sum = sum(rb[k] for k in rb_components)
    rb_components_consistent = abs(rb_sum - rb["total"]) < 1e-9

    report = {
        "ir_path": str(IR_PATH.relative_to(REPO)),
        "reel_count": len(per_reel_p),
        "rows": rows,
        "p_scatter_per_reel": p_scatter_per_reel,
        "p_wild_per_reel": p_wild_per_reel,
        "q_scatter_per_reel_per_spin": q_scatter_per_reel,
        "q_wild_per_reel_per_spin": q_wild_per_reel,
        "p_fs_trigger": p_trigger,
        "expected_wilds_per_spin": e_wilds_per_spin,
        "sticky_wild": {
            "ttl_pmf": {str(k): v for k, v in ttl_pmf.items()},
            "expected_ttl": e_ttl,
            "variance_ttl": var_ttl,
        },
        "walking_wild": {
            "steps_pmf": {str(k): v for k, v in steps_pmf.items()},
            "direction_pmf": direction_pmf,
            "expected_steps": e_steps,
            "variance_steps": var_steps,
            "expected_walking_distance_per_start_reel": e_distance_per_reel,
        },
        "free_spins": {
            "award_schedule": fs_awards,
            "expected_fs_per_spin": e_fs_awarded,
        },
        "rtp_breakdown_components_sum": rb_sum,
        "rtp_breakdown_total": rb["total"],
        "gates": {
            "scatter_trigger_3_in_open_unit": 0.0 < p_trigger["≥3"] < 1.0,
            "scatter_trigger_4_lt_3": p_trigger["≥4"] <= p_trigger["≥3"],
            "scatter_trigger_5_lt_4": p_trigger["≥5"] <= p_trigger["≥4"],
            "expected_wilds_finite": math.isfinite(e_wilds_per_spin) and e_wilds_per_spin > 0,
            "sticky_ttl_positive": e_ttl > 0 and math.isfinite(e_ttl),
            "walking_steps_positive": e_steps > 0 and math.isfinite(e_steps),
            "walking_direction_sums_to_one": abs(sum(direction_pmf.values()) - 1.0) < 1e-9,
            "rtp_breakdown_components_consistent": rb_components_consistent,
            "expected_walking_distance_non_negative": all(
                v >= 0 for v in e_distance_per_reel.values()
            ),
        },
    }
    report["gates_passed"] = sum(1 for g in report["gates"].values() if g)
    report["gates_total"] = len(report["gates"])
    report["all_gates_pass"] = report["gates_passed"] == report["gates_total"]
    return report


def main() -> int:
    report = verify()
    REPORT.write_text(json.dumps(report, sort_keys=True, indent=2))
    print(f"[walking-wild-parity] wrote {REPORT.relative_to(REPO)}")
    print(
        f"[walking-wild-parity] FS trigger ≥3={report['p_fs_trigger']['≥3']:.4f} "
        f"≥4={report['p_fs_trigger']['≥4']:.4f} ≥5={report['p_fs_trigger']['≥5']:.6f}"
    )
    print(
        f"[walking-wild-parity] E[wilds/spin]={report['expected_wilds_per_spin']:.4f} "
        f"E[TTL]={report['sticky_wild']['expected_ttl']:.2f} "
        f"E[steps]={report['walking_wild']['expected_steps']:.2f}"
    )
    print(f"[walking-wild-parity] gates {report['gates_passed']}/{report['gates_total']}")
    return 0 if report["all_gates_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
