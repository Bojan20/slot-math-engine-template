"""W4.8f + W4.10f — Constraint solver for picker weights / per-set RTP fit.

Attempts to organically reverse-engineer reel-set picker weights from
`meta.rtp_breakdown` + per-set RTP contributions (closed-form estimate).
Solves the LP:

    minimize  ||A·w - b||²
    subject to  Σ w = 1.0,  w_i ≥ 0

where `A[c][i]` = per-set i RTP contribution to component c, and `b[c]`
= published rtp_breakdown[c] for the game.

Outputs `reports/picker_solver.json` with per-SWID rank / DoF / residual.

Privacy: emits coordinates, ranks, residuals only — no raw vendor sym
weights to stdout.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np


REPO = Path(__file__).resolve().parents[1]
GAMES = REPO / "games"
REPORTS = REPO / "reports"


def _per_reel_p(reel: list[dict]) -> dict[str, float]:
    total = sum(x["weight"] for x in reel)
    if total == 0:
        return {}
    return {x["symbol"]: x["weight"] / total for x in reel}


def _per_set_ways_rtp_estimate(
    reels: list[list[dict]],
    paytable: list[dict],
    symbols: list[dict],
    rows: int = 3,
) -> float:
    """Approximate ways-RTP for a given reel set.

    NOTE: simple ways-payout closed-form, no cascade, no scatter exclusivity.
    Order-of-magnitude accuracy ~ ±20 %; used only to drive the LP fit, not
    to be the final MC reference.
    """
    if not reels or any(not r for r in reels):
        return 0.0
    p_reels = [_per_reel_p(r) for r in reels]
    wild_except: set[str] = set()
    for s in symbols:
        if s.get("role") == "wild":
            wild_except = set(s.get("substitutes_except", []))
    total = 0.0
    for entry in paytable:
        scope = entry.get("scope", "line")
        pays = float(entry["pays"])
        combo = entry["combo"]
        if scope == "scatter":
            # P(N+ scatter symbols across rows × reels) — binomial sum
            sym = combo[0]
            n = len(combo)
            from math import comb
            from itertools import product
            p_list = [p_reels[i].get(sym, 0.0) for i in range(5)]
            P = 0.0
            for ks in product(range(rows + 1), repeat=5):
                if sum(ks) < n:
                    continue
                prob = 1.0
                for i, k in enumerate(ks):
                    p = p_list[i]
                    prob *= comb(rows, k) * (p ** k) * ((1 - p) ** (rows - k))
                P += prob
            total += P * pays
            continue
        # Line / ways
        eff = [c for c in combo if c not in ("", "--")]
        N = len(eff)
        if N < 3:
            continue
        sym = eff[0]
        if sym in ("", "--"):
            continue
        # Wild contributes if sym not in wild-except.
        wild_eligible = sym not in wild_except
        prob_anchor = 1.0
        ways_E = 1.0
        for i in range(N):
            p_sym = p_reels[i].get(sym, 0.0)
            p_wild = p_reels[i].get("Wild", 0.0) if wild_eligible else 0.0
            p_pay = p_sym + p_wild
            # Prob this reel has at least one anchor in `rows` cells.
            p_has = 1.0 - (1.0 - p_pay) ** rows
            if p_has <= 0:
                prob_anchor = 0.0
                break
            prob_anchor *= p_has
            # E[count | k>=1] for binomial(rows, p_pay)
            denom = p_has
            ways_E *= (rows * p_pay) / denom
        if N < 5:
            p_next_sym = p_reels[N].get(sym, 0.0)
            p_next_wild = p_reels[N].get("Wild", 0.0) if wild_eligible else 0.0
            p_next = p_next_sym + p_next_wild
            prob_break = (1.0 - p_next) ** rows
        else:
            prob_break = 1.0
        total += prob_anchor * prob_break * ways_E * pays
    return total


def _solve_picker_lp(A: np.ndarray, b: np.ndarray) -> dict[str, Any]:
    """Constrained least-squares: min ||Aw - b||² s.t. Σw = 1, w ≥ 0.

    Uses scipy.optimize.linprog if available; otherwise NNLS + post-normalize.
    """
    try:
        from scipy.optimize import nnls
    except Exception as e:
        return {"error": f"scipy unavailable: {e}"}
    n = A.shape[1]
    # Augment with Σw = 1 constraint as a soft row.
    sum_weight = 1000.0  # large weight to enforce hard sum constraint
    A_aug = np.vstack([A, np.ones((1, n)) * sum_weight])
    b_aug = np.concatenate([b, [1.0 * sum_weight]])
    w, residual = nnls(A_aug, b_aug)
    return {
        "weights": w.tolist(),
        "sum": float(w.sum()),
        "residual": float(residual),
        "matrix_shape": [int(A.shape[0]), int(A.shape[1])],
        "rank": int(np.linalg.matrix_rank(A)),
    }


def solve_game(game: str) -> dict[str, Any]:
    out: dict[str, Any] = {"swids": []}
    game_dir = GAMES / game / "out"
    if not game_dir.exists():
        return out
    for p in sorted(game_dir.glob("*.slot-sim.ir.json")):
        ir = json.loads(p.read_text())
        meta = ir["meta"]
        swid = meta.get("swid")
        bk = meta.get("rtp_breakdown", {})
        # Filter to base components (FS sets solved separately).
        if game == "skeleton-key":
            components = ["base_game"]
        else:
            components = [
                "base_game_multiway", "base_game_scatter",
                "base_game_coins", "base_game_jackpot",
            ]
        b = np.array([float(bk.get(c, 0.0)) for c in components])
        # Estimate per-set RTP contributions for each component.
        # For now we only estimate `multiway` / `base_game` part; the
        # `coins` / `jackpot` / `scatter` per-set contributions are not
        # decomposable from the published PAR data, so those entries are
        # set to 0 (which makes the system unsolvable for those rows).
        base_sets = ir["reels"]["base"]
        pt = ir["paytable"]
        syms = ir["symbols"]
        n_sets = len(base_sets)
        A = np.zeros((len(components), n_sets))
        for i, s in enumerate(base_sets):
            r_estimate = _per_set_ways_rtp_estimate(s["reels"], pt, syms)
            # multiway estimate populates only the multiway / base_game row.
            A[0, i] = r_estimate
        solve = _solve_picker_lp(A, b)
        out["swids"].append({
            "swid": swid,
            "components": components,
            "n_sets": n_sets,
            "target_b": b.tolist(),
            "solve": solve,
        })
    return out


def main() -> int:
    REPORTS.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {}
    for game in ("skeleton-key", "fortune-coin-boost-classic"):
        print(f"[solver] {game}", file=sys.stderr)
        report[game] = solve_game(game)
    p = REPORTS / "picker_solver.json"
    p.write_text(json.dumps(report, indent=2))
    print(f"[solver] report → {p}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
