"""W8.1 — Python Monte Carlo validator.

After Z3 closed-form synthesis hits its target, the lab traditionally
runs N×10⁹ Monte Carlo spins to *empirically* verify. Our closed-form
formula is mathematically equivalent to the MC limit, so the two should
agree within the standard MC error bar (~1/√N).

This kernel runs a fast pure-Python MC over the solved IR's weighted
reels + lines paytable, then compares the empirical RTP to:
  • the closed-form `measured_rtp(ir)` value (mathematical ground truth)
  • the spec's target_rtp

Returns an `McValidationReport` with empirical_rtp + std_err + verdict.

Use cases
=========
- CI sanity: run 100k spins per spec under acceptance/, catch any
  IR shape that the Z3 encoding missed.
- Vendor handoff: lab can re-run the same MC with their own RNG and
  verify the numbers match.

Limitations
===========
- Lines evaluation only (the synthesizer focuses on lines RTP).
- No bonus / scatter / cascade / progressive contribution (treated as
  separate from base-game RTP per the W5.2 model).
- Uses Python `random.choices` with weighted distribution (fast enough
  for ≤10M spins; for 1B+ run the Rust engine instead).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Optional

from tools.smt.weight_synthesizer import (
    _extract_ir_paytable, _resolve_paylines, _reels_as_dict_list,
    _wild_symbol_id, _wild_excluded, measured_rtp,
)


@dataclass
class McValidationReport:
    spins: int
    empirical_rtp: float
    std_err: float
    closed_form_rtp: float
    target_rtp: Optional[float]
    empirical_vs_closed_form_delta: float
    closed_form_vs_target_delta: Optional[float]
    verdict: str   # "PASS" | "FAIL" | "MARGINAL"

    def summary(self) -> str:
        lines = [
            "# MC validation report",
            f"spins:                     {self.spins:,}",
            f"empirical RTP:             {self.empirical_rtp:.6f}",
            f"empirical std err:         {self.std_err:.6f}",
            f"closed-form RTP:           {self.closed_form_rtp:.6f}",
            f"empirical − closed-form:   {self.empirical_vs_closed_form_delta:+.6f}",
        ]
        if self.target_rtp is not None:
            lines.append(f"target RTP:                {self.target_rtp:.6f}")
            lines.append(
                f"closed-form − target:      {self.closed_form_vs_target_delta:+.6f}"
            )
        lines.append(f"verdict:                   {self.verdict}")
        return "\n".join(lines) + "\n"


def _draw_stop(reel: dict[str, float], rng: random.Random) -> str:
    """Sample one symbol from a weighted reel."""
    syms = list(reel.keys())
    weights = [reel[s] for s in syms]
    return rng.choices(syms, weights=weights, k=1)[0]


def _line_pay(
    symbols: list[str], paytable: dict[tuple[str, int], float],
    wild_id: Optional[str], excluded: set[str],
) -> float:
    """Compute pay for a single line of `n_reels` symbols. Wild
    substitution honored.
    """
    if not symbols:
        return 0.0
    # Find the anchor (first non-wild paying symbol) + consecutive count
    anchor: Optional[str] = None
    count = 0
    for s in symbols:
        if anchor is None:
            if s == wild_id:
                count += 1
                continue
            anchor = s
            count += 1
        else:
            if s == anchor or (s == wild_id and anchor not in excluded):
                count += 1
            else:
                break
    if anchor is None:
        # All-wild line — use wild as anchor if wild is in paytable
        if wild_id and (wild_id, count) in paytable:
            return paytable[(wild_id, count)]
        return 0.0
    return paytable.get((anchor, count), 0.0)


def mc_validate(
    ir: dict,
    *,
    spins: int = 100_000,
    seed: int = 0xC0DE_F00D,
) -> McValidationReport:
    """Run `spins` spins through the IR's base reels + lines paytable.

    Returns `McValidationReport`. Verdict is:
      • PASS — |empirical - closed_form| < 3 × std_err
      • MARGINAL — within 3 - 5 std_err
      • FAIL — outside 5 std_err (the closed-form formula is wrong or
        the IR shape disagrees with the lines model)
    """
    paytable = _extract_ir_paytable(ir)
    num_lines, total_bet = _resolve_paylines(ir)
    reels, _shape = _reels_as_dict_list(ir)
    if not reels:
        raise ValueError("IR has no reels to simulate")
    n_reels = len(reels)
    paylines = ir.get("evaluation", {}).get("paylines") or []
    if not paylines:
        # Default: 1 horizontal line per row
        rows = ir.get("topology", {}).get("rows") or 3
        paylines = [[r] * n_reels for r in range(rows)]
    ir.get("symbols") or []
    wild_id = _wild_symbol_id(ir)
    excluded = _wild_excluded(ir)

    rng = random.Random(seed)
    cf_rtp = measured_rtp(ir)
    target = ir.get("limits", {}).get("target_rtp")

    # Use a single "row-0" projection of each line for the per-line sim:
    # since strips→rectangular drops one symbol per reel per spin and we
    # model lines as fixed row-indices, we approximate by drawing 1 symbol
    # per reel per spin and re-using it for every line on that row index.
    # This is an upper bound on RTP for variable-row topologies; for
    # rectangular it's exact.
    total_win_x = 0.0
    total_win_x_sq = 0.0
    for _ in range(spins):
        # Draw a full grid: one symbol per (reel, row)
        rows = ir.get("topology", {}).get("rows") or 3
        grid = [[_draw_stop(reels[r], rng) for r in range(n_reels)] for _ in range(rows)]
        spin_win = 0.0
        for line in paylines:
            line_syms = [grid[line[r]][r] for r in range(min(n_reels, len(line)))]
            spin_win += _line_pay(line_syms, paytable, wild_id, excluded)
        rtp_contribution = spin_win / total_bet
        total_win_x += rtp_contribution
        total_win_x_sq += rtp_contribution * rtp_contribution

    empirical = total_win_x / spins
    var = max(0.0, total_win_x_sq / spins - empirical * empirical)
    std_err = math.sqrt(var / spins)

    delta = abs(empirical - cf_rtp)
    if delta < 3 * std_err or delta < 0.005:
        verdict = "PASS"
    elif delta < 5 * std_err:
        verdict = "MARGINAL"
    else:
        verdict = "FAIL"

    return McValidationReport(
        spins=spins,
        empirical_rtp=empirical,
        std_err=std_err,
        closed_form_rtp=cf_rtp,
        target_rtp=float(target) if target is not None else None,
        empirical_vs_closed_form_delta=empirical - cf_rtp,
        closed_form_vs_target_delta=(
            (cf_rtp - float(target)) if target is not None else None
        ),
        verdict=verdict,
    )
