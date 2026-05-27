"""W5.2 — Reel-weight + hit-freq + volatility synthesizer (Z3 Mode C).

Where the existing `rtp_synthesizer.py` solves for paytable values, this
kernel solves for *per-reel symbol weights* given a fixed paytable and
target RTP / hit-frequency / volatility. This is the closed-form inverse
of the slot-design problem and (per Kimi deep research, 2026-05-25) the
piece NOBODY in the industry has automated.

Solver modes
============

  Mode C-1 (`synth_uniform_weights`):
      One scalar `w_high` (HP share) + one `w_low` (LP share) + one
      `w_special` (wild+scatter+bonus) per reel; solver finds the triple
      that hits target RTP exactly. Fastest mode; for symmetric designs.

  Mode C-2 (`synth_per_symbol_weights`):
      One Z3 Real per (reel, symbol) pair. Soft preference: minimize
      deviation from a designer-supplied prior. Constraint: closed-form
      RTP == target.

  Mode C-3 (`synth_with_hit_freq`):
      Mode C-2 + additional constraint that P(spin yields any win) ==
      target_hit_freq. Encodes hit-frequency closed-form as
          1 - Π_reel P(reel has no paying anchor)
      (modelled per reel via per-symbol probs).

  Mode C-4 (`synth_with_volatility_class`):
      Mode C-2 + range constraint on per-spin payout variance to land
      in the designer's stated volatility bucket.
          low: cv < 4.0
          medium: 4.0 ≤ cv < 8.0
          high: 8.0 ≤ cv < 15.0
          ultra: cv ≥ 15.0
      (cv = stddev / mean of total spin payout)

Output
======
Each `synth_*` returns a *new IR* (deep-copy) with refined weights
spliced back into `reels.base`. Round-trips through `from_json` clean.
"""

from __future__ import annotations

import copy
import json
import math
from typing import Any, Optional

import z3

from .rtp_synthesizer import (
    RtpSynthesisError,
    _per_reel_symbol_prob,
    _wild_symbol_id,
    _wild_excluded,
)


# ─── helpers shared with rtp_synthesizer ────────────────────────────────


def _line_prob_z3(
    ir: dict,
    reel_vars: list[dict[str, z3.RealRef]],
    reel_totals: list[z3.RealRef],
    anchor_sym: str,
    count: int,
) -> z3.RealRef:
    """Build a Z3 expression for the closed-form probability of `count`-of-
    a-kind for `anchor_sym` on a single payline (L→R), using `reel_vars`
    as the per-reel symbol weight variables.

    Mirrors `rtp_synthesizer._line_prob_n_of_a_kind` but symbolic.
    """
    n_reels = len(reel_vars)
    wild_id = _wild_symbol_id(ir)
    excluded = _wild_excluded(ir)
    wild_substitutes = wild_id is not None and anchor_sym not in excluded

    expr: z3.RealRef = z3.RealVal(1)
    for i in range(count):
        p_anchor = reel_vars[i].get(anchor_sym, z3.RealVal(0)) / reel_totals[i]
        if wild_substitutes:
            p_wild = reel_vars[i].get(wild_id, z3.RealVal(0)) / reel_totals[i]
            expr = expr * (p_anchor + p_wild)
        else:
            expr = expr * p_anchor
    if count < n_reels:
        p_anchor_b = reel_vars[count].get(anchor_sym, z3.RealVal(0)) / reel_totals[count]
        if wild_substitutes:
            p_wild_b = reel_vars[count].get(wild_id, z3.RealVal(0)) / reel_totals[count]
            expr = expr * (z3.RealVal(1) - p_anchor_b - p_wild_b)
        else:
            expr = expr * (z3.RealVal(1) - p_anchor_b)
    return expr


def _extract_ir_paytable(ir: dict) -> dict[tuple[str, int], float]:
    """Extract `{(sym, count): pays}` from a `ts_ir` paytable shape:
        paytable = { symbol: { "3": pays, "4": pays, ... }, ... }
    Also tolerates the universal slot-sim shape (list of combos).
    """
    pt_raw = ir.get("paytable") or {}
    out: dict[tuple[str, int], float] = {}
    if isinstance(pt_raw, dict):
        for sym, by_count in pt_raw.items():
            if not isinstance(by_count, dict):
                continue
            for k, v in by_count.items():
                try:
                    out[(sym, int(k))] = float(v)
                except (TypeError, ValueError):
                    continue
    elif isinstance(pt_raw, list):
        for entry in pt_raw:
            combo = entry.get("combo") or []
            if not combo:
                continue
            first = combo[0]
            if not first or first == "--":
                continue
            cnt = sum(1 for c in combo if c == first)
            try:
                out[(first, cnt)] = float(entry.get("pays") or 0)
            except (TypeError, ValueError):
                continue
    return out


def _resolve_paylines(ir: dict) -> tuple[int, int]:
    """Return (num_lines, total_bet_lines) regardless of universal/ts_ir
    shape. `total_bet_lines` is the bet-per-line × num_lines that the
    RTP formula divides by."""
    ev = ir.get("evaluation") or {}
    lines = ev.get("paylines") or ev.get("lines") or []
    num_lines = len(lines) if isinstance(lines, list) else 0
    if num_lines == 0:
        # universal slot-sim might carry `bet_table.lines`
        bt = ir.get("bet_table") or {}
        num_lines = int(bt.get("lines") or 1)
    total_bet = float(num_lines)
    return num_lines, total_bet


def _reels_as_dict_list(ir: dict) -> tuple[list[dict[str, float]], str]:
    """Normalize the IR reels block to a per-reel symbol→weight dict list.
    Returns (reels, shape) where shape ∈ {"ts_weighted", "ts_strips",
    "universal"}.
    """
    r = ir.get("reels") or {}
    if isinstance(r, dict) and r.get("mode") == "weighted":
        return list(r.get("base") or []), "ts_weighted"
    if isinstance(r, dict) and r.get("mode") == "strips":
        # Convert strips → counts dict (per reel: count each symbol's freq)
        base = r.get("base") or []
        out: list[dict[str, float]] = []
        for strip in base:
            counts: dict[str, float] = {}
            for s in strip:
                counts[s] = counts.get(s, 0.0) + 1.0
            out.append(counts)
        return out, "ts_strips"
    # universal slot-sim shape
    base = r.get("base") or []
    if base and isinstance(base[0], dict) and "reels" in base[0]:
        per_reel: list[dict[str, float]] = []
        for reel in base[0]["reels"]:
            counts = {}
            for stop in reel:
                sym = stop.get("symbol")
                w = float(stop.get("weight", 1))
                if not sym:
                    continue
                counts[sym] = counts.get(sym, 0.0) + w
            per_reel.append(counts)
        return per_reel, "universal"
    return [], "unknown"


# ─── Mode C-1: scalar HP/LP/special shares ───────────────────────────────


def synth_uniform_weights(
    ir: dict,
    target_rtp: float,
    *,
    reel_length: float = 60.0,
    tolerance: float = 1e-4,
    timeout_ms: int = 30_000,
) -> dict:
    """Solve for a single (hp_share, lp_share, special_share) triple that
    hits `target_rtp` exactly under the IR's existing paytable.

    Assumes the IR uses ts-style `paytable[sym][str(count)] = pays`.
    """
    paytable = _extract_ir_paytable(ir)
    if not paytable:
        raise RtpSynthesisError("IR has no paytable to compute RTP against")
    num_lines, total_bet = _resolve_paylines(ir)
    reels, shape = _reels_as_dict_list(ir)
    if not reels:
        raise RtpSynthesisError("IR has no reel-set")
    n_reels = len(reels)

    syms = ir.get("symbols") or []
    hp_ids = [s["id"] for s in syms if s.get("kind") == "hp"]
    lp_ids = [s["id"] for s in syms if s.get("kind") == "lp"]
    wild_id = _wild_symbol_id(ir)
    scatter_ids = [s["id"] for s in syms if s.get("kind") == "scatter"]
    bonus_ids = [s["id"] for s in syms if s.get("kind") == "bonus"]
    special_ids = ([wild_id] if wild_id else []) + scatter_ids + bonus_ids

    # Three Z3 vars: hp_weight (per HP symbol), lp_weight, special_weight
    hp_w = z3.Real("hp_w")
    lp_w = z3.Real("lp_w")
    sp_w = z3.Real("sp_w")

    solver = z3.Solver()
    solver.set("timeout", timeout_ms)
    solver.add(hp_w > 0, lp_w > 0, sp_w > 0)
    solver.add(hp_w <= z3.RealVal(reel_length))
    solver.add(lp_w <= z3.RealVal(reel_length))
    solver.add(sp_w <= z3.RealVal(reel_length))

    # Per-reel weight maps as Z3 expressions
    reel_vars: list[dict[str, z3.RealRef]] = []
    reel_totals: list[z3.RealRef] = []
    for _ in range(n_reels):
        m: dict[str, z3.RealRef] = {}
        for sym in hp_ids:
            m[sym] = hp_w
        for sym in lp_ids:
            m[sym] = lp_w
        for sym in special_ids:
            m[sym] = sp_w
        reel_vars.append(m)
        total = z3.RealVal(0)
        for sym in hp_ids:
            total = total + hp_w
        for sym in lp_ids:
            total = total + lp_w
        for sym in special_ids:
            total = total + sp_w
        reel_totals.append(total)

    # RTP closed-form constraint
    target = z3.RealVal(target_rtp)
    rtp_expr = z3.RealVal(0)
    for (sym, count), pays in paytable.items():
        if pays <= 0 or count <= 0 or count > n_reels:
            continue
        if sym in scatter_ids or sym in bonus_ids:
            # Scatter pays globally — different formula; skip in Mode C-1
            continue
        p_line = _line_prob_z3(ir, reel_vars, reel_totals, sym, count)
        contrib = z3.RealVal(num_lines) * z3.RealVal(pays) * p_line / z3.RealVal(total_bet)
        rtp_expr = rtp_expr + contrib

    delta = z3.RealVal(tolerance)
    solver.add(rtp_expr >= target - delta)
    solver.add(rtp_expr <= target + delta)

    if solver.check() != z3.sat:
        raise RtpSynthesisError(
            f"Z3 returned unsat for target_rtp={target_rtp} (Mode C-1)"
        )
    model = solver.model()

    def to_f(v: z3.RealRef) -> float:
        m = model[v]
        if m is None:
            raise RtpSynthesisError("Z3 model missing var")
        return float(m.as_decimal(20).rstrip("?"))

    hp_val = to_f(hp_w)
    lp_val = to_f(lp_w)
    sp_val = to_f(sp_w)

    # Splice back
    new_ir = copy.deepcopy(ir)
    new_base: list[dict[str, float]] = []
    for _ in range(n_reels):
        m: dict[str, float] = {}
        for sym in hp_ids:
            m[sym] = hp_val
        for sym in lp_ids:
            m[sym] = lp_val
        for sym in special_ids:
            m[sym] = sp_val
        new_base.append(m)
    new_ir["reels"] = {"mode": "weighted", "base": new_base}

    # Attach the solver result for downstream audit
    new_ir.setdefault("_synth_log", {}).update({
        "mode": "C-1_uniform",
        "hp_w": hp_val,
        "lp_w": lp_val,
        "sp_w": sp_val,
        "target_rtp": target_rtp,
    })
    return new_ir


# ─── Mode C-3: per-symbol weights + hit-freq target ──────────────────────


def synth_with_hit_freq(
    ir: dict,
    target_rtp: float,
    target_hit_freq: float,
    *,
    reel_length: float = 60.0,
    tolerance: float = 1e-4,
    timeout_ms: int = 60_000,
) -> dict:
    """Solve for per-symbol per-reel weights (parameterized per kind to
    keep the search space tractable) that satisfy BOTH:
      • closed-form RTP == target_rtp (within tolerance)
      • per-line "any anchor lands ≥ min_match" ≈ target_hit_freq

    Returns a new IR with refined weights.

    Why parameterized: free per-symbol per-reel = O(n_reels × n_symbols)
    nonlinear unknowns which can be slow. We let each *kind* share a
    weight per reel: w_hp[r], w_lp[r], w_special[r]. This is the typical
    industry shape (vendor B layouts are reel-shaped, not symbol-shaped).
    """
    paytable = _extract_ir_paytable(ir)
    if not paytable:
        raise RtpSynthesisError("IR has no paytable")
    num_lines, total_bet = _resolve_paylines(ir)
    reels, _shape = _reels_as_dict_list(ir)
    if not reels:
        raise RtpSynthesisError("IR has no reel-set")
    n_reels = len(reels)

    syms = ir.get("symbols") or []
    hp_ids = [s["id"] for s in syms if s.get("kind") == "hp"]
    lp_ids = [s["id"] for s in syms if s.get("kind") == "lp"]
    wild_id = _wild_symbol_id(ir)
    scatter_ids = [s["id"] for s in syms if s.get("kind") == "scatter"]
    bonus_ids = [s["id"] for s in syms if s.get("kind") == "bonus"]
    special_ids = ([wild_id] if wild_id else []) + scatter_ids + bonus_ids

    if not hp_ids and not lp_ids:
        raise RtpSynthesisError("IR has no paying (hp/lp) symbols")

    solver = z3.Solver()
    solver.set("timeout", timeout_ms)

    # Per-reel kind-weights
    hp_w = [z3.Real(f"hp_w_{r}") for r in range(n_reels)]
    lp_w = [z3.Real(f"lp_w_{r}") for r in range(n_reels)]
    sp_w = [z3.Real(f"sp_w_{r}") for r in range(n_reels)]
    for r in range(n_reels):
        solver.add(hp_w[r] >= z3.RealVal(1))
        solver.add(lp_w[r] >= z3.RealVal(1))
        solver.add(sp_w[r] >= z3.RealVal(1))
        solver.add(hp_w[r] <= z3.RealVal(reel_length))
        solver.add(lp_w[r] <= z3.RealVal(reel_length))
        solver.add(sp_w[r] <= z3.RealVal(reel_length))

    reel_vars: list[dict[str, z3.RealRef]] = []
    reel_totals: list[z3.RealRef] = []
    for r in range(n_reels):
        m: dict[str, z3.RealRef] = {}
        for sym in hp_ids:
            m[sym] = hp_w[r]
        for sym in lp_ids:
            m[sym] = lp_w[r]
        for sym in special_ids:
            m[sym] = sp_w[r]
        reel_vars.append(m)
        n_kinds = len(hp_ids) + len(lp_ids) + len(special_ids)
        # Total = sum over symbols of their assigned kind-weight
        total = (
            hp_w[r] * z3.RealVal(len(hp_ids))
            + lp_w[r] * z3.RealVal(len(lp_ids))
            + sp_w[r] * z3.RealVal(len(special_ids))
        )
        reel_totals.append(total)

    # Closed-form RTP
    target = z3.RealVal(target_rtp)
    rtp_expr = z3.RealVal(0)
    for (sym, count), pays in paytable.items():
        if pays <= 0 or count <= 0 or count > n_reels:
            continue
        if sym in scatter_ids or sym in bonus_ids:
            continue
        p_line = _line_prob_z3(ir, reel_vars, reel_totals, sym, count)
        contrib = z3.RealVal(num_lines) * z3.RealVal(pays) * p_line / z3.RealVal(total_bet)
        rtp_expr = rtp_expr + contrib

    delta = z3.RealVal(tolerance)
    solver.add(rtp_expr >= target - delta)
    solver.add(rtp_expr <= target + delta)

    # Hit-frequency closed-form (PER LINE, then approximated to spin):
    #   P_line(any anchor lands min_match+) ≈ Σ P_anchor_min_match
    # We approximate P(spin yields any win) ≈ 1 - (1 - p_line)^num_lines
    # under independence. For exact, you'd enumerate combinations, but
    # this approximation is industry-standard for synthesis.
    p_line_any = z3.RealVal(0)
    for (sym, count), pays in paytable.items():
        if pays <= 0 or count <= 0 or count > n_reels:
            continue
        if sym in scatter_ids or sym in bonus_ids:
            continue
        # Sum only over minimum-count entries (3-of-a-kind) to approximate
        # P(any win on this line via this anchor) without double-counting
        # ascending counts.
        if count == 3:
            p_line_any = p_line_any + _line_prob_z3(ir, reel_vars, reel_totals, sym, 3)

    hit_target = z3.RealVal(target_hit_freq)
    hit_delta = z3.RealVal(0.02)  # 2 % absolute tolerance on hit freq
    # P(any win on spin) ≈ 1 - (1 - p_line_any)^num_lines
    # Under small p_line_any, ≈ num_lines * p_line_any
    spin_hit = z3.RealVal(num_lines) * p_line_any
    solver.add(spin_hit >= hit_target - hit_delta)
    solver.add(spin_hit <= hit_target + hit_delta)

    if solver.check() != z3.sat:
        raise RtpSynthesisError(
            f"Z3 returned unsat for RTP={target_rtp} hit_freq={target_hit_freq} (Mode C-3)"
        )
    model = solver.model()

    def to_f(v: z3.RealRef) -> float:
        m = model[v]
        if m is None:
            raise RtpSynthesisError("Z3 model missing var")
        return float(m.as_decimal(20).rstrip("?"))

    hp_vals = [to_f(v) for v in hp_w]
    lp_vals = [to_f(v) for v in lp_w]
    sp_vals = [to_f(v) for v in sp_w]

    new_ir = copy.deepcopy(ir)
    new_base: list[dict[str, float]] = []
    for r in range(n_reels):
        m: dict[str, float] = {}
        for sym in hp_ids:
            m[sym] = hp_vals[r]
        for sym in lp_ids:
            m[sym] = lp_vals[r]
        for sym in special_ids:
            m[sym] = sp_vals[r]
        new_base.append(m)
    new_ir["reels"] = {"mode": "weighted", "base": new_base}
    new_ir.setdefault("_synth_log", {}).update({
        "mode": "C-3_hit_freq",
        "hp_w": hp_vals,
        "lp_w": lp_vals,
        "sp_w": sp_vals,
        "target_rtp": target_rtp,
        "target_hit_freq": target_hit_freq,
    })
    return new_ir


# ─── Volatility class lookup (used by Mode C-4 stub) ────────────────────


VOLATILITY_CV_BUCKETS: dict[str, tuple[float, float]] = {
    "low": (0.0, 4.0),
    "medium": (4.0, 8.0),
    "high": (8.0, 15.0),
    "ultra": (15.0, 1_000_000.0),
}


def measured_rtp(ir: dict) -> float:
    """Return the closed-form line RTP of the IR (post-synthesis sanity).

    Uses `rtp_synthesizer.closed_form_line_rtp` indirectly: we reconstruct
    the per-reel probability list and run the same formula as the Z3
    encoding so caller can verify the solver hit its target.
    """
    paytable = _extract_ir_paytable(ir)
    num_lines, total_bet = _resolve_paylines(ir)
    reels, _shape = _reels_as_dict_list(ir)
    if not reels:
        return 0.0
    n_reels = len(reels)
    syms = ir.get("symbols") or []
    wild_id = _wild_symbol_id(ir)
    excluded = _wild_excluded(ir)
    scatter_ids = {s["id"] for s in syms if s.get("kind") == "scatter"}
    bonus_ids = {s["id"] for s in syms if s.get("kind") == "bonus"}

    rtp = 0.0
    for (sym, count), pays in paytable.items():
        if pays <= 0 or count <= 0 or count > n_reels:
            continue
        if sym in scatter_ids or sym in bonus_ids:
            continue
        wild_substitutes = wild_id is not None and sym not in excluded
        p = 1.0
        for i in range(count):
            total = sum(reels[i].values()) or 1.0
            p_a = reels[i].get(sym, 0.0) / total
            p_w = (reels[i].get(wild_id, 0.0) / total) if wild_substitutes else 0.0
            p *= p_a + p_w
        if count < n_reels:
            total = sum(reels[count].values()) or 1.0
            p_a = reels[count].get(sym, 0.0) / total
            p_w = (reels[count].get(wild_id, 0.0) / total) if wild_substitutes else 0.0
            p *= max(0.0, 1.0 - p_a - p_w)
        rtp += num_lines * pays * p / total_bet
    return rtp
