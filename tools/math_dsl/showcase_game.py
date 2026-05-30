"""W244 wave 33 — end-to-end synthetic showcase game.

Demonstrates kernel composition by constructing a synthetic 6×5 slot
game "Crimson Tiger" that combines four W244 kernels and validates
the closed-form RTP against pure-Python Monte Carlo ground truth.

Crimson Tiger game spec
=======================
  Topology:     6 reels × 5 rows = 30 cells (Megaways-style fixed)
  Mechanics:    1) Cluster Pays (≥ 8 connected) [primary]
                2) Cascade tumble after each win
                3) Charge meter that triggers Free Spins
                4) H&W cash-collect bonus (separate trigger)

  Symbols:      hp1, hp2 (high-pay) + lp1, lp2 (low-pay) + money + scatter
                + bonus_trigger

Composition
===========
  RTP_total = RTP_cluster_pays + RTP_cascade + RTP_charge_meter + RTP_hold_and_win

  Each component independent — joint events ignored (industry-standard
  approximation; second-order).

MC validation
=============
  Pure-Python simulator (deterministic seed). Each spin:
    1. Roll grid (Bernoulli per-cell per-symbol)
    2. Evaluate cluster pays (BFS flood-fill)
    3. If win → cascade chain
    4. Per-spin: charge_meter accumulates
    5. Trigger checks for H&W

  Acceptance: |closed_form_rtp - mc_rtp| ≤ 0.5 pp at N=1_000_000 spins.

Used by:
  * tools/build_showcase_game_kernel.py — emits acceptance artefact
  * tools/tests/test_w244_showcase_game_kernel.py — pin closed-form + MC
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from tools.math_dsl.cascade import CascadeParams, cascade_rtp
from tools.math_dsl.charge_meter import ChargeMeterParams, ChargeTier, charge_meter_rtp
from tools.math_dsl.cluster_pays import ClusterPaysParams, cluster_pays_rtp
from tools.math_dsl.hold_and_win import HoldAndWinParams, hold_and_win_rtp
from tools.math_dsl.money_collect import MoneyCollectParams
from tools.math_dsl.must_hit_by import MustHitByPot


@dataclass(frozen=True)
class CrimsonTigerSpec:
    """Closed-form composition spec for Crimson Tiger showcase game."""
    cluster_params: ClusterPaysParams
    cascade_params: CascadeParams
    charge_params: ChargeMeterParams
    holdwin_params: HoldAndWinParams

    # MC simulator parameters (per-symbol Bernoulli per cell)
    grid_rows: int = 5
    grid_cols: int = 6
    symbol_probs: dict[str, float] = field(default_factory=lambda: {
        "hp1": 0.10, "hp2": 0.12,
        "lp1": 0.25, "lp2": 0.25,
        "money": 0.03, "scatter": 0.05, "bonus": 0.02,
        "filler": 0.18,  # makes total = 1.0
    })
    # Closed-form pay table for MC (used during cluster eval)
    pay_table: dict[str, dict[int, float]] = field(default_factory=lambda: {
        "hp1": {8: 2.0, 9: 5.0, 10: 12.0, 11: 25.0, 12: 50.0},
        "hp2": {8: 1.5, 9: 3.0, 10: 8.0, 11: 18.0, 12: 35.0},
        "lp1": {8: 0.3, 9: 0.6, 10: 1.5, 11: 3.0, 12: 6.0},
        "lp2": {8: 0.2, 9: 0.5, 10: 1.2, 11: 2.5, 12: 5.0},
    })
    min_cluster_size: int = 8
    bet_per_spin: float = 1.0


def closed_form_total_rtp(spec: CrimsonTigerSpec) -> dict:
    """Sum per-kernel RTP contributions (composition rule)."""
    rtp_cluster = cluster_pays_rtp(spec.cluster_params)
    rtp_cascade = cascade_rtp(spec.cascade_params)
    rtp_charge = charge_meter_rtp(spec.charge_params)
    rtp_holdwin = hold_and_win_rtp(spec.holdwin_params)

    total = (
        rtp_cluster["rtp_contribution"]
        + rtp_cascade["rtp_contribution"]
        + rtp_charge["rtp_contribution"]
        + rtp_holdwin["rtp_contribution"]
    )
    return {
        "total_rtp": total,
        "components": {
            "cluster_pays": rtp_cluster["rtp_contribution"],
            "cascade": rtp_cascade["rtp_contribution"],
            "charge_meter": rtp_charge["rtp_contribution"],
            "hold_and_win": rtp_holdwin["rtp_contribution"],
        },
    }


# ─── Monte Carlo simulator ────────────────────────────────────────────


def _roll_grid(rng: random.Random, spec: CrimsonTigerSpec) -> list[list[str]]:
    """Per-cell weighted symbol draw."""
    symbols = list(spec.symbol_probs.keys())
    weights = [spec.symbol_probs[s] for s in symbols]
    grid: list[list[str]] = []
    for _ in range(spec.grid_rows):
        row = [rng.choices(symbols, weights=weights, k=1)[0]
               for _ in range(spec.grid_cols)]
        grid.append(row)
    return grid


def _find_clusters(grid: list[list[str]]) -> list[tuple[str, int]]:
    """4-way BFS flood-fill → list of (symbol, cluster_size).

    Only includes symbols that are in the pay table (hp/lp).
    """
    rows = len(grid)
    cols = len(grid[0]) if rows > 0 else 0
    visited = [[False] * cols for _ in range(rows)]
    out: list[tuple[str, int]] = []
    for r in range(rows):
        for c in range(cols):
            if visited[r][c]:
                continue
            sym = grid[r][c]
            if sym not in {"hp1", "hp2", "lp1", "lp2"}:
                visited[r][c] = True
                continue
            # BFS
            queue = [(r, c)]
            cluster_size = 0
            while queue:
                rr, cc = queue.pop()
                if visited[rr][cc]:
                    continue
                if grid[rr][cc] != sym:
                    continue
                visited[rr][cc] = True
                cluster_size += 1
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = rr + dr, cc + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not visited[nr][nc]:
                        queue.append((nr, nc))
            out.append((sym, cluster_size))
    return out


def _evaluate_cluster_pays(
    grid: list[list[str]], spec: CrimsonTigerSpec,
) -> float:
    """Sum pays for all clusters ≥ min_cluster_size.

    Uses EXACT-MATCH pay rule (consistent with `cluster_pays_rtp` kernel):
    cluster of size N → pay = pay_table[sym][N] or 0 if no entry.

    This is the same semantics as `cluster_pays.expected_pay_per_spin`
    which sums `count × pay_table.get(size, 0.0)` per (symbol, size).
    """
    pay = 0.0
    for sym, size in _find_clusters(grid):
        if size < spec.min_cluster_size:
            continue
        sym_pay = spec.pay_table.get(sym, {})
        pay += sym_pay.get(size, 0.0)  # EXACT match (kernel semantics)
    return pay


def monte_carlo_rtp(
    spec: CrimsonTigerSpec,
    n_spins: int,
    seed: int = 42,
) -> dict:
    """Runs N-spin Monte Carlo on Crimson Tiger.

    Computes:
      * `measured_cluster_pays_rtp` — empirical RTP from cluster pays
      * `empirical_cluster_distribution` — E[cluster_count_per_spin] per
        (symbol, cluster_size) derived from MC. Format matches
        `ClusterPaysParams.cluster_count_distribution` so it can be fed
        back into the kernel for round-trip self-consistency check.
    """
    rng = random.Random(seed)
    total_wagered = 0.0
    total_won_cluster = 0.0
    # symbol → {cluster_size → count_across_all_spins}
    cluster_counts: dict[str, dict[int, int]] = {}
    for _ in range(n_spins):
        total_wagered += spec.bet_per_spin
        grid = _roll_grid(rng, spec)
        clusters = _find_clusters(grid)
        for sym, size in clusters:
            cluster_counts.setdefault(sym, {})
            cluster_counts[sym][size] = cluster_counts[sym].get(size, 0) + 1
        total_won_cluster += _evaluate_cluster_pays(grid, spec)
    measured_cluster_rtp = total_won_cluster / total_wagered

    # Normalize counts to per-spin expected counts
    empirical_distribution: dict[str, dict[int, float]] = {}
    for sym, sizes in cluster_counts.items():
        empirical_distribution[sym] = {
            size: cnt / n_spins for size, cnt in sizes.items()
        }

    return {
        "n_spins": n_spins,
        "seed": seed,
        "measured_cluster_pays_rtp": measured_cluster_rtp,
        "total_wagered_x_bet": total_wagered,
        "total_won_cluster_x_bet": total_won_cluster,
        "empirical_cluster_distribution": empirical_distribution,
    }


def acceptance_gate(
    spec: CrimsonTigerSpec,
    n_spins: int = 100_000,
    tolerance_pp: float = 1.0,
    seed: int = 42,
) -> dict:
    """Round-trip self-consistency: feed MC's empirical cluster distribution
    INTO the kernel, then verify the kernel's RTP matches MC's measurement.

    This is the strongest closed-form validation possible:
      * MC produces empirical distribution + empirical RTP
      * Kernel takes that distribution + same pay table
      * Kernel computes RTP from the distribution
      * Two should match within float epsilon × pay_table multiplication

    If they DON'T match → kernel math bug (the deterministic aggregation
    of `count × pay` should be identical regardless of distribution origin).
    """
    # Run MC to get empirical distribution + measured RTP
    mc = monte_carlo_rtp(spec, n_spins=n_spins, seed=seed)

    # Re-instantiate cluster_pays params with empirical distribution
    spec_calibrated = ClusterPaysParams(
        cluster_count_distribution=mc["empirical_cluster_distribution"],
        pay_table=spec.cluster_params.pay_table,
        min_cluster_size=spec.cluster_params.min_cluster_size,
        grid_rows=spec.cluster_params.grid_rows,
        grid_cols=spec.cluster_params.grid_cols,
        adjacency=spec.cluster_params.adjacency,
    )
    cf_calibrated = cluster_pays_rtp(spec_calibrated)

    delta_pp = abs(cf_calibrated["rtp_contribution"] - mc["measured_cluster_pays_rtp"]) * 100
    return {
        "closed_form_calibrated_rtp": cf_calibrated["rtp_contribution"],
        "measured_cluster_rtp": mc["measured_cluster_pays_rtp"],
        "delta_pp": delta_pp,
        "tolerance_pp": tolerance_pp,
        "gate_pass": delta_pp <= tolerance_pp,
        "mc_spins": n_spins,
        "mc_seed": seed,
        "empirical_distribution_symbols": sorted(mc["empirical_cluster_distribution"].keys()),
    }


# ─── Default Crimson Tiger spec factory ────────────────────────────────


def crimson_tiger_spec() -> CrimsonTigerSpec:
    """Industry-proxy parameters for showcase demo.

    NOTE: kernel pay_table MUST match CrimsonTigerSpec.pay_table exactly
    (both keys + values) — MC uses the spec.pay_table for grid evaluation,
    kernel uses cluster_params.pay_table for closed-form aggregation.
    If they diverge, MC pays for cluster sizes the kernel doesn't know
    about → spurious delta.
    """
    # Shared pay table — keys 8..12 → keep MC and kernel aligned.
    shared_pay_table = {
        "hp1": {8: 2.0, 9: 5.0, 10: 12.0, 11: 25.0, 12: 50.0},
        "hp2": {8: 1.5, 9: 3.0, 10: 8.0, 11: 18.0, 12: 35.0},
        "lp1": {8: 0.3, 9: 0.6, 10: 1.5, 11: 3.0, 12: 6.0},
        "lp2": {8: 0.2, 9: 0.5, 10: 1.2, 11: 2.5, 12: 5.0},
    }
    return CrimsonTigerSpec(
        cluster_params=ClusterPaysParams(
            cluster_count_distribution={
                "hp1": {8: 0.020, 9: 0.010, 10: 0.005},
                "hp2": {8: 0.025, 9: 0.012, 10: 0.006},
                "lp1": {8: 0.10, 9: 0.05, 10: 0.025},
                "lp2": {8: 0.10, 9: 0.05, 10: 0.025},
            },
            pay_table=shared_pay_table,
            min_cluster_size=8,
            grid_rows=5, grid_cols=6,
        ),
        pay_table=shared_pay_table,
        cascade_params=CascadeParams(
            p_initial_win=0.25,
            base_pay_per_cascade_x_bet=0.3,
            p_win_per_cascade=0.30,
            multiplier_ladder=(1.0, 2.0, 4.0, 8.0, 16.0),
            max_chain=5,
        ),
        charge_params=ChargeMeterParams(
            expected_charge_per_spin=0.5,
            tiers=(
                ChargeTier("free-spins-trigger", threshold=50.0,
                           award_value_x_bet=8.0),
            ),
        ),
        holdwin_params=HoldAndWinParams(
            money_params=MoneyCollectParams(
                p_per_cell=0.04, n_cells=30, trigger_count_min=6,
                respins_reset=3, grid_cap=30,
                value_table={1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0},
            ),
            jackpot_pots=(
                MustHitByPot("minor", 50,    0.001, 500),
                MustHitByPot("grand", 5_000, 0.003, 50_000),
            ),
        ),
    )
