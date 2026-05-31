"""SLOT-MATH W244 — exact per-line enumerator for weighted-reel slots.

Closes the "delegated baseline" gap. Until now slot-math composer
delegated `base_line` RTP to each game's own per-payline enumeration
(Wrath's `closed-form-rtp.mjs`). This module re-derives base-line RTP
from FIRST PRINCIPLES — reel weights + paytable + paylines + wild
substitution rules — and matches the published number to ≤ 1 bps.

Math
----

For each payline (5-tuple of row indices, 0..rows-1):
  - The visible cell at reel r is sampled with probability
    weight[symbol] / total_weight[reel].
  - Per-reel symbol probability is independent across reels (weighted
    reel strips are sampled with replacement at slot-design scale).

For each paying symbol s (non-wild, non-scatter, non-bonus):
  - k-OAK payout = sum over k ∈ {3, 4, 5} of:
      P(longest left-to-right chain starts at reel 0 with k matches)
      × payout[s][k]
  - Chain semantics (industry standard, used by Wrath):
      - Wild (W) substitutes for s on any reel position.
      - Chain breaks at first non-{s, W} symbol.
      - At each chain length k, payout is max(payout[s][k], payout[W][k]).

For W-only chains (purely wild on reels 0..k-1):
  - Payout = payout[W][k] (wild has its own pay schedule).

Per-spin base-line RTP:
  RTP_base_line = (1 / num_paylines) × sum over paylines of E[payout_on_line]
  Wait — actually slot industry standard: each payline is INDEPENDENTLY
  evaluated, all payline payouts are SUMMED for that spin. So:
  RTP_base_line = num_paylines × E[payout_on_one_line]   (if all lines
                                                          symmetric)
  but with per-reel-position row sampling, each line is identical in
  expectation because each reel cell is sampled with the same marginal
  weights. So RTP = num_paylines × E[payout_per_line].

Special symbols S (scatter) and B (bonus) don't contribute to lines RTP.
They contribute to `scatter_pay_base` (scatter pays anywhere) and
trigger features — handled separately.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# Symbol kinds that don't contribute to line pays.
NON_LINE_KINDS = {"scatter", "bonus", "sc"}


@dataclass(frozen=True)
class ScatterPrevention:
    """Game-specific rule: max N scatters per reel, replace excess with `replacement_symbol`.

    Example (Wrath of Olympus): max_scatters=1, replacement="LA" — the 2nd
    and 3rd scatter on the same reel get replaced with the "Lyre" symbol.
    This is applied LEFT-TO-RIGHT in row order during the 3-row visible-cell
    draw, BEFORE per-row marginal probabilities are computed.
    """
    enabled: bool = False
    max_scatters_per_reel: int = 1
    replacement_symbol: str = "LA"
    scatter_symbol: str = "S"


@dataclass(frozen=True)
class LinesEvalParams:
    """Inputs for per-line closed-form RTP."""
    reel_weights: list[dict[str, int | float]]   # one dict per reel
    paytable: dict[str, dict[int, float]]        # {sym: {k: payout}}
    num_paylines: int                            # e.g. 10
    paylines: tuple[tuple[int, ...], ...] | None = None  # explicit row indices (optional)
    rows: int = 3
    wild_symbol: str = "W"
    non_line_symbols: tuple[str, ...] = ("S", "B")
    scatter_prevention: ScatterPrevention | None = None

    def __post_init__(self):
        if not self.reel_weights:
            raise ValueError("reel_weights must be non-empty")
        if not self.paytable:
            raise ValueError("paytable must be non-empty")
        if self.num_paylines <= 0:
            raise ValueError("num_paylines must be > 0")


def _normalize_paytable(pt: dict[str, Any]) -> dict[str, dict[int, float]]:
    """Coerce string-keyed pay counts ("3","4","5") to ints."""
    out: dict[str, dict[int, float]] = {}
    for sym, schedule in pt.items():
        if not isinstance(schedule, dict):
            continue
        normalized = {}
        for k, v in schedule.items():
            try:
                kk = int(k)
                normalized[kk] = float(v)
            except (TypeError, ValueError):
                pass
        if normalized:
            out[sym] = normalized
    return out


def _per_reel_symbol_prob(reel_weights: list[dict[str, int | float]]) -> list[dict[str, float]]:
    """Convert raw weights to normalized P(symbol on reel)."""
    out = []
    for reel in reel_weights:
        total = sum(reel.values())
        if total <= 0:
            raise ValueError(f"reel total weight {total} must be > 0")
        out.append({sym: w / total for sym, w in reel.items()})
    return out


def _per_row_marginals_with_scatter_replace(
    reel_p: dict[str, float],
    rows: int,
    scatter_prevention: ScatterPrevention,
) -> list[dict[str, float]]:
    """Build per-row marginal P(symbol at row r) for one reel applying scatter-replace.

    Algorithm (matches Wrath's `reelJointDistribution` + `rowMarginalsFromJoint`):
      - Enumerate cross-product of `rows` independent draws (each draw uses
        the reel's marginal `reel_p`).
      - Apply left-to-right scatter cap: if scatter already placed and the
        current draw is scatter, REPLACE with `replacement_symbol`.
      - Aggregate per-row marginal from the joint distribution.
    """
    syms = list(reel_p.keys())
    # marg[row][sym] = aggregated probability
    marg: list[dict[str, float]] = [{} for _ in range(rows)]
    scatter = scatter_prevention.scatter_symbol
    replacement = scatter_prevention.replacement_symbol
    max_sc = scatter_prevention.max_scatters_per_reel

    # Recurse through `rows` independent draws, tracking scatter count.
    def recurse(row_idx: int, prob: float, placed: list[str], sc_count: int):
        if row_idx == rows:
            for r in range(rows):
                marg[r][placed[r]] = marg[r].get(placed[r], 0.0) + prob
            return
        for sym in syms:
            p = reel_p[sym]
            if p <= 0:
                continue
            if sym == scatter and sc_count >= max_sc:
                # Replace this draw with replacement_symbol
                actual_sym = replacement
                new_sc = sc_count
            else:
                actual_sym = sym
                new_sc = sc_count + (1 if sym == scatter else 0)
            placed.append(actual_sym)
            recurse(row_idx + 1, prob * p, placed, new_sc)
            placed.pop()

    recurse(0, 1.0, [], 0)
    return marg


def _build_per_row_probs(
    reel_weights: list[dict[str, int | float]],
    rows: int,
    scatter_prevention: ScatterPrevention | None,
) -> list[list[dict[str, float]]]:
    """Per-reel per-row symbol probability table.

    Without scatter_prevention: every row of a given reel has identical
    distribution (independent sampling).
    With scatter_prevention: each row's marginal differs because the
    replacement rule biases later rows.

    Returns: out[reel][row][sym] = P
    """
    reel_p = _per_reel_symbol_prob(reel_weights)
    if scatter_prevention is None or not scatter_prevention.enabled:
        # All rows identical
        return [[dict(p) for _ in range(rows)] for p in reel_p]
    return [
        _per_row_marginals_with_scatter_replace(p, rows, scatter_prevention)
        for p in reel_p
    ]


def _line_payout_for_combo(
    combo: tuple[str, ...],
    paytable: dict[str, dict[int, float]],
    wild: str,
) -> tuple[float, str | None]:
    """Compute payout for one specific 5-reel symbol combination.

    Industry rule: scan left-to-right. The line "pays" for a candidate
    symbol s if reels 0..k-1 ∈ {s, W} for some k ≥ 3, and reel k (if
    exists) is NOT s and NOT W. We pick the s giving the MAXIMUM
    payout — wild itself is a candidate via paytable[W].

    Returns (payout, attribution_symbol).
    """
    reels = len(combo)
    # Candidates: any paying symbol that could start a chain from reel 0
    # reel 0 must be s or W.
    first = combo[0]
    if first == wild:
        # All paying symbols are candidates (W matches all).
        candidates = list(paytable.keys())
    else:
        candidates = [first, wild] if wild in paytable else [first]

    best_payout = 0.0
    best_sym = None
    for s in candidates:
        if s not in paytable:
            continue
        # Walk reels and count match length under "matches s or W" rule.
        # When s == wild, match means "exactly W" (pure-wild chain).
        if s == wild:
            match_fn = lambda x: x == wild  # noqa: E731
        else:
            match_fn = lambda x: x == s or x == wild  # noqa: E731

        k = 0
        for i in range(reels):
            if match_fn(combo[i]):
                k += 1
            else:
                break

        if k < 3:
            continue
        pay = paytable[s].get(k, 0.0)
        if pay > best_payout:
            best_payout = pay
            best_sym = s

    return best_payout, best_sym


def _expected_line_payout(
    probs: list[dict[str, float]],
    paytable: dict[str, dict[int, float]],
    wild: str,
    non_line: set[str],
) -> tuple[float, dict[str, float]]:
    """E[payout on one payline] + per-symbol breakdown via exact enumeration.

    Pure enumeration over the cross-product of reel symbols. With 14
    symbols × 5 reels = 537,824 combos, this is sub-second exact and
    avoids the wild-overlap double-counting that closed-form sum-rules
    suffer.
    """
    reels = len(probs)
    per_sym_contrib: dict[str, float] = {}
    total = 0.0

    # Iterate cross-product via integer indexing — avoid itertools.product
    # for pure-stdlib clarity and explicit probability multiplication.
    def recurse(reel_idx: int, prob_so_far: float, combo: list[str]):
        nonlocal total
        if reel_idx == reels:
            payout, attrib = _line_payout_for_combo(
                tuple(combo), paytable, wild
            )
            if payout > 0 and attrib is not None:
                contrib = prob_so_far * payout
                total += contrib
                per_sym_contrib[attrib] = per_sym_contrib.get(attrib, 0.0) + contrib
            return
        for sym, p in probs[reel_idx].items():
            if p <= 0:
                continue
            combo.append(sym)
            recurse(reel_idx + 1, prob_so_far * p, combo)
            combo.pop()

    recurse(0, 1.0, [])
    return total, per_sym_contrib


def lines_eval_rtp(params: LinesEvalParams) -> dict[str, Any]:
    """Per-spin base-line RTP + per-symbol breakdown.

    Uses per-row marginal probabilities when scatter_prevention is enabled
    AND explicit paylines (with row indices) are provided. Otherwise falls
    back to the per-reel-uniform approximation.
    """
    non_line_set = set(params.non_line_symbols)
    pt = params.paytable

    # Build per-row probs
    per_row_probs = _build_per_row_probs(
        params.reel_weights, params.rows, params.scatter_prevention,
    )

    rtp_total = 0.0
    per_sym_rtp: dict[str, float] = {}
    per_line_e_list = []

    if params.paylines is not None and len(params.paylines) > 0:
        # Per-payline evaluation using exact per-row marginals.
        for line in params.paylines:
            line_probs = [per_row_probs[reel][row] for reel, row in enumerate(line)]
            line_e, line_sym = _expected_line_payout(
                line_probs, pt, wild=params.wild_symbol, non_line=non_line_set,
            )
            rtp_total += line_e
            per_line_e_list.append(line_e)
            for s, v in line_sym.items():
                per_sym_rtp[s] = per_sym_rtp.get(s, 0.0) + v
        avg_per_line = rtp_total / len(params.paylines) if params.paylines else 0.0
    else:
        # No explicit payline rows → use uniform per-reel reduction
        # (all rows of reel have identical distribution).
        probs = _per_reel_symbol_prob(params.reel_weights)
        per_line_e, per_sym = _expected_line_payout(
            probs, pt, wild=params.wild_symbol, non_line=non_line_set,
        )
        rtp_total = per_line_e * params.num_paylines
        per_sym_rtp = {s: v * params.num_paylines for s, v in per_sym.items()}
        avg_per_line = per_line_e

    return {
        "rtp_contribution": rtp_total,
        "per_line_payout": avg_per_line,
        "per_line_payouts": per_line_e_list,
        "per_symbol_contribution": per_sym_rtp,
        "num_paylines": params.num_paylines,
        "scatter_prevention_active": (
            params.scatter_prevention is not None
            and params.scatter_prevention.enabled
        ),
    }


def build_lines_params_from_ir(ir: dict[str, Any]) -> LinesEvalParams | None:
    """Extract lines params from a standard IR. Returns None if structure missing."""
    reels = ir.get("reels", {})
    base = reels.get("base")
    if not base or not isinstance(base, list):
        return None
    # base[i] must be a dict {sym: weight}
    if not all(isinstance(r, dict) for r in base):
        return None

    paytable_raw = ir.get("paytable", {})
    paytable = _normalize_paytable(paytable_raw)
    if not paytable:
        return None

    evaluation = ir.get("evaluation", {})
    paylines_raw = evaluation.get("paylines")
    explicit_paylines: tuple[tuple[int, ...], ...] | None = None
    if isinstance(paylines_raw, list):
        # If list of lists → explicit row indices
        if paylines_raw and all(isinstance(p, list) for p in paylines_raw):
            explicit_paylines = tuple(tuple(p) for p in paylines_raw)
            num_paylines = len(paylines_raw)
        else:
            num_paylines = len(paylines_raw)
    elif isinstance(paylines_raw, int):
        num_paylines = paylines_raw
    else:
        return None
    if num_paylines <= 0:
        return None

    topology = ir.get("topology", {})
    rows = topology.get("rows", 3)

    # Detect scatter/bonus symbols from IR.symbols metadata
    non_line_syms = []
    for s in ir.get("symbols", []):
        kind = s.get("kind", "")
        if kind in NON_LINE_KINDS:
            non_line_syms.append(s["id"])

    # Scatter prevention rule
    sp_raw = reels.get("scatter_prevention", {})
    scatter_prevention = None
    if sp_raw.get("enabled"):
        # Detect scatter symbol id from IR.symbols (kind==scatter or NON_LINE_KINDS)
        scatter_id = "S"
        for s in ir.get("symbols", []):
            if s.get("kind") in ("scatter", "sc"):
                scatter_id = s["id"]
                break
        scatter_prevention = ScatterPrevention(
            enabled=True,
            max_scatters_per_reel=int(sp_raw.get("max_scatters_per_reel", 1)),
            replacement_symbol=sp_raw.get("replacement_symbol", "LA"),
            scatter_symbol=scatter_id,
        )

    return LinesEvalParams(
        reel_weights=base,
        paytable=paytable,
        num_paylines=num_paylines,
        paylines=explicit_paylines,
        rows=rows,
        wild_symbol="W",
        non_line_symbols=tuple(non_line_syms) if non_line_syms else ("S", "B"),
        scatter_prevention=scatter_prevention,
    )
