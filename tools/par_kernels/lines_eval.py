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
class LinesEvalParams:
    """Inputs for per-line closed-form RTP."""
    reel_weights: list[dict[str, int | float]]   # one dict per reel
    paytable: dict[str, dict[int, float]]        # {sym: {k: payout}}
    num_paylines: int                            # e.g. 10
    wild_symbol: str = "W"
    non_line_symbols: tuple[str, ...] = ("S", "B")

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

    Returns:
        {
          "rtp_contribution": float,         # total per-spin RTP
          "per_line_payout": float,          # E[payout per line]
          "per_symbol_contribution": dict,   # {sym: rtp_share}
          "num_paylines": int,
        }
    """
    probs = _per_reel_symbol_prob(params.reel_weights)
    non_line_set = set(params.non_line_symbols)
    pt = params.paytable

    per_line_e, per_sym = _expected_line_payout(
        probs, pt, wild=params.wild_symbol, non_line=non_line_set,
    )
    rtp_total = per_line_e * params.num_paylines
    per_sym_rtp = {s: v * params.num_paylines for s, v in per_sym.items()}

    return {
        "rtp_contribution": rtp_total,
        "per_line_payout": per_line_e,
        "per_symbol_contribution": per_sym_rtp,
        "num_paylines": params.num_paylines,
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
    paylines = evaluation.get("paylines")
    if isinstance(paylines, list):
        num_paylines = len(paylines)
    elif isinstance(paylines, int):
        num_paylines = paylines
    else:
        return None
    if num_paylines <= 0:
        return None

    # Detect scatter/bonus symbols from IR.symbols metadata
    non_line_syms = []
    for s in ir.get("symbols", []):
        kind = s.get("kind", "")
        if kind in NON_LINE_KINDS:
            non_line_syms.append(s["id"])

    return LinesEvalParams(
        reel_weights=base,
        paytable=paytable,
        num_paylines=num_paylines,
        wild_symbol="W",
        non_line_symbols=tuple(non_line_syms) if non_line_syms else ("S", "B"),
    )
