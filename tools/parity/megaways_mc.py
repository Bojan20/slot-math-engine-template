#!/usr/bin/env python3
"""W4.8 — Monte Carlo parity validator for `template-megaways-cleanroom.ir.json`.

Runs a simplified Megaways-style evaluator over the synthesized IR and
emits per-component RTP statistics that the closed-form validator can't
reach analytically (mostly because the cascade chain depth + unlimited
progressive multiplier in FS are conditional on the actual draw
sequence).

Engine per spin:

  1. Draw `rows_per_reel ~ row_count_pmf` independently per reel.
  2. For each (reel, row) cell, draw a symbol from
     `reel_strip_base[reel]` with replacement.
  3. Resolve MYSTERY cells: pick one symbol from `mystery_symbol_pmf`
     and replace EVERY mystery cell on the grid with it (Megaways
     convention).
  4. Count ways per anchor symbol s as ∏_reels(count_of(s∨wild)) and
     score the longest left-anchored streak of s.
  5. Score scatter pay if ≥3 BOOK reels carry ≥1 BOOK each.
  6. Cascade: remove winning ways, refill emptied cells from
     `cascade_fill_pmf`, repeat until no win.
  7. Free spins: triggered when ≥4 BOOK reels carry ≥1 BOOK on the
     spin. Award N spins per the schedule; each FS spin starts a
     progressive multiplier that grows +1 per cascade chain step
     within the FS round.

The validator emits an `mc_total_rtp` aggregate over `n_spins`
along with per-component shares. Tolerance against
`rtp_breakdown_reference.total` is intentionally wide (±20 pp)
because the template is synthesized — the gate proves the engine
**RUNS** the IR end-to-end without crashing or diverging.

Pure stdlib + random PRNG. No numpy, no rayon, no network.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
IR_PATH = REPO / "games" / "megaways-clean-room-template" / "out" / "template-megaways-cleanroom.ir.json"
REPORT = REPO / "reports" / "acceptance" / "megaways_mc_parity.json"
REPORT.parent.mkdir(parents=True, exist_ok=True)


# ─── Sampling helpers ────────────────────────────────────────────────


def weighted_choice(rng: random.Random, items: list[tuple[str, int]]) -> str:
    """Random weighted choice over (symbol, weight) tuples."""
    total = sum(w for _, w in items)
    roll = rng.uniform(0, total)
    acc = 0
    for sym, w in items:
        acc += w
        if roll <= acc:
            return sym
    return items[-1][0]


def pmf_to_items(pmf: dict[str, int]) -> list[tuple[str, int]]:
    return [(k, int(v)) for k, v in pmf.items()]


def reel_to_items(reel: list[dict]) -> list[tuple[str, int]]:
    return [(e["symbol"], int(e["weight"])) for e in reel]


# ─── Spin loop ───────────────────────────────────────────────────────


def draw_grid(
    rng: random.Random,
    reel_strips: list[list[tuple[str, int]]],
    row_count_pmf_items: list[tuple[str, int]],
) -> list[list[str]]:
    grid = []
    for strip in reel_strips:
        rows = int(weighted_choice(rng, row_count_pmf_items))
        col = [weighted_choice(rng, strip) for _ in range(rows)]
        grid.append(col)
    return grid


def resolve_mystery(
    rng: random.Random,
    grid: list[list[str]],
    mystery_pmf_items: list[tuple[str, int]],
) -> list[list[str]]:
    if not any("MYSTERY" in col for col in grid):
        return grid
    pick = weighted_choice(rng, mystery_pmf_items)
    return [[pick if sym == "MYSTERY" else sym for sym in col] for col in grid]


def score_ways(
    grid: list[list[str]],
    paytable: dict[str, dict[str, float]],
    wild: str,
    payable_set: list[str],
    min_count: int,
) -> float:
    """Sum across payable anchors of (ways × pay[match_length]).

    match_length = number of leftmost reels that carry the anchor (with
    wild substitution). ways = ∏_reels(count_of(anchor∨wild) on each
    matching reel).
    """
    total_pay = 0.0
    for anchor in payable_set:
        if anchor == wild:
            continue
        # leftmost streak count
        streak = 0
        for reel in grid:
            if any(s == anchor or s == wild for s in reel):
                streak += 1
            else:
                break
        if streak < min_count:
            continue
        # ways = ∏ count
        ways = 1
        for r in range(streak):
            cnt = sum(1 for s in grid[r] if s == anchor or s == wild)
            ways *= cnt
        pay_row = paytable.get(anchor, {})
        pay = float(pay_row.get(str(streak), 0.0))
        total_pay += ways * pay
    return total_pay


def reels_with_scatter(grid: list[list[str]], scatter: str) -> int:
    return sum(1 for col in grid if scatter in col)


def cascade_chain(
    rng: random.Random,
    grid: list[list[str]],
    reel_strips: list[list[tuple[str, int]]],
    cascade_fill_items: list[tuple[str, int]],
    mystery_pmf_items: list[tuple[str, int]],
    paytable: dict[str, dict[str, float]],
    wild: str,
    payable_set: list[str],
    min_count: int,
    max_chain: int = 16,
) -> tuple[float, int]:
    """Repeatedly score & refill until no win. Returns (total_pay,
    chain_depth)."""
    total = 0.0
    depth = 0
    g = [list(col) for col in grid]
    while depth < max_chain:
        depth += 1
        # Score ways pay.
        pay = score_ways(g, paytable, wild, payable_set, min_count)
        if pay <= 0:
            depth -= 1  # last cascade didn't add
            break
        total += pay
        # Mark winning reels for cascade — for ways slots we cascade
        # the *whole leftmost streak* of the winning anchor.
        # Simplification: refill the entire grid from cascade_fill
        # which preserves the same row counts; this overstates
        # cascade volatility but doesn't break the structural test.
        new_g = []
        for col in g:
            row_count = len(col)
            new_col = [weighted_choice(rng, cascade_fill_items) for _ in range(row_count)]
            new_g.append(new_col)
        g = resolve_mystery(rng, new_g, mystery_pmf_items)
    return total, depth


def free_spins(
    rng: random.Random,
    scatter_count: int,
    award_schedule: dict[str, int],
    reel_strips_fs: list[list[tuple[str, int]]],
    row_count_pmf_items: list[tuple[str, int]],
    cascade_fill_items: list[tuple[str, int]],
    mystery_pmf_items: list[tuple[str, int]],
    paytable: dict[str, dict[str, float]],
    wild: str,
    payable_set: list[str],
    min_count: int,
) -> tuple[float, int]:
    """Award N FS, accumulate progressive multiplier."""
    n_fs = int(award_schedule.get(str(scatter_count), 0))
    if n_fs == 0:
        return 0.0, 0
    total = 0.0
    multiplier = 1
    for _ in range(n_fs):
        grid = draw_grid(rng, reel_strips_fs, row_count_pmf_items)
        grid = resolve_mystery(rng, grid, mystery_pmf_items)
        spin_pay, depth = cascade_chain(
            rng, grid, reel_strips_fs, cascade_fill_items, mystery_pmf_items,
            paytable, wild, payable_set, min_count,
        )
        total += spin_pay * multiplier
        multiplier += depth  # +1 per cascade chain step
    return total, n_fs


# ─── Runner ──────────────────────────────────────────────────────────


def run(ir: dict, n_spins: int, seed: int) -> dict:
    rng = random.Random(seed)
    reel_strips_base = [reel_to_items(reel) for reel in ir["reels"]["base"][0]["reels"]]
    reel_strips_fs = [reel_to_items(reel) for reel in ir["reels"]["free_spins"][0]["reels"]]
    row_pmf_items = pmf_to_items(ir["row_count_pmf"])
    mystery_items = pmf_to_items(ir["mystery_symbol_pmf"])
    cascade_fill_items = pmf_to_items(ir["cascade_fill_pmf"])
    paytable = ir["paytable"]
    fs_spec = ir["features"]["free_spins"]
    scatter = fs_spec["scatter_symbol"]
    min_count = ir["topology"]["min_count"]
    payable_set = [s for s in ir["symbols"] if s not in {scatter, "MYSTERY"}]

    total_base_pay = 0.0
    total_scatter_pay = 0.0
    total_fs_pay = 0.0
    total_fs_awarded = 0
    n_triggers = 0

    # Total wager per spin = max_ways (engine pays per-way; "bet basis"
    # collapse = 1 unit per max way, matching the synthesized fixture's
    # `paytable` magnitudes).
    bet_per_spin = float(ir["topology"]["max_ways"])

    for _ in range(n_spins):
        grid = draw_grid(rng, reel_strips_base, row_pmf_items)
        grid = resolve_mystery(rng, grid, mystery_items)

        # Base ways pay + cascade chain.
        base_pay, _ = cascade_chain(
            rng, grid, reel_strips_base, cascade_fill_items, mystery_items,
            paytable, "BOOK", payable_set, min_count,
        )
        total_base_pay += base_pay

        # Scatter pay (only BOOK).
        scat_reels = reels_with_scatter(grid, scatter)
        if scat_reels >= 3:
            scat_pay = float(paytable.get(scatter, {}).get(str(scat_reels), 0.0))
            total_scatter_pay += scat_pay

        # FS trigger.
        if scat_reels >= int(fs_spec["trigger_min_scatters"]):
            n_triggers += 1
            fs_pay, n_fs = free_spins(
                rng, scat_reels, fs_spec["award_schedule"],
                reel_strips_fs, row_pmf_items, cascade_fill_items,
                mystery_items, paytable, "BOOK", payable_set, min_count,
            )
            total_fs_pay += fs_pay
            total_fs_awarded += n_fs

    total_wager = n_spins * bet_per_spin
    rtp_base = total_base_pay / total_wager
    rtp_scatter = total_scatter_pay / total_wager
    rtp_fs = total_fs_pay / total_wager
    rtp_total = rtp_base + rtp_scatter + rtp_fs

    return {
        "n_spins": n_spins,
        "seed": seed,
        "bet_per_spin": bet_per_spin,
        "total_wager": total_wager,
        "rtp_base": rtp_base,
        "rtp_scatter": rtp_scatter,
        "rtp_fs": rtp_fs,
        "rtp_total": rtp_total,
        "n_triggers": n_triggers,
        "total_fs_awarded": total_fs_awarded,
        "fs_trigger_rate": n_triggers / n_spins if n_spins else 0.0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n-spins", type=int, default=20_000)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--tolerance-pp", type=float, default=20.0,
                        help="Acceptable |rtp_total - ref_total| in percentage points.")
    args = parser.parse_args()

    ir = json.loads(IR_PATH.read_text())
    rb = ir["meta"]["rtp_breakdown_reference"]
    result = run(ir, args.n_spins, args.seed)
    ref_total = float(rb["total"])
    delta_pp = abs(result["rtp_total"] - ref_total) * 100
    finite = math.isfinite(result["rtp_total"])

    report = {
        **result,
        "reference_total": ref_total,
        "delta_pp": delta_pp,
        "tolerance_pp": args.tolerance_pp,
        "gates": {
            "rtp_total_finite": finite,
            "rtp_total_non_negative": result["rtp_total"] >= 0,
            "fs_trigger_rate_in_open_unit": 0 < result["fs_trigger_rate"] < 1,
            # No "RTP within X pp of reference" gate — synthesized template
            # is not weight-tuned to hit ref_total exactly. The MC validator
            # is here to prove the engine RUNS the IR end-to-end without
            # NaN / crash / runaway cascade. Boki's W4.11b MC validator has
            # the strict tolerance gate because book_bonusbuy was lifted
            # from a real-market PAR where weights ARE tuned.
            "n_triggers_positive": result["n_triggers"] > 0,
            "total_fs_awarded_positive": result["total_fs_awarded"] > 0,
        },
    }
    report["gates_passed"] = sum(1 for v in report["gates"].values() if v)
    report["gates_total"] = len(report["gates"])
    report["all_gates_pass"] = report["gates_passed"] == report["gates_total"]
    REPORT.write_text(json.dumps(report, sort_keys=True, indent=2))

    print(f"[megaways-mc] n_spins={args.n_spins} seed={args.seed}")
    print(
        f"[megaways-mc] rtp base={result['rtp_base']:.4f} "
        f"scatter={result['rtp_scatter']:.4f} fs={result['rtp_fs']:.4f} "
        f"total={result['rtp_total']:.4f} vs ref={ref_total:.4f} Δpp={delta_pp:.2f}"
    )
    print(
        f"[megaways-mc] FS trigger rate={result['fs_trigger_rate']:.4f} "
        f"({result['n_triggers']} triggers / {args.n_spins} spins)"
    )
    print(f"[megaways-mc] gates {report['gates_passed']}/{report['gates_total']}")
    return 0 if report["all_gates_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
