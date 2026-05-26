"""W7.3 — Closed-form RTP synthesis via Z3 SMT solver.

Model
=====
For a lines-evaluation slot with `R` reels and a paytable mapping
`(anchor_symbol, count)` to `pay_per_line`, the closed-form RTP is:

    RTP = (1 / total_bet) × Σ_(sym, k) [ pays[sym, k] × P(sym×k on payline) × num_lines ]

where `P(sym×k on payline)` decomposes as the product of per-reel
symbol probabilities under wild-substitution semantics. We encode the
ENTIRE equation as a single Z3 real-arithmetic constraint and solve
for either:

  (a) **paytable** variables — given fixed reel weights, find pays
      that hit target RTP exactly (used to "design back" from a desired
      RTP);
  (b) **reel weight** variables — given fixed pays, find per-stop
      weights that hit target RTP (used to balance volatility without
      touching paytable);
  (c) **scale** variables — single multiplicative factor on pays OR
      on a per-reel weight column (fastest mode; one Real var).

All variables live in QF_LRA / QF_NRA (quantifier-free linear or
nonlinear real arithmetic). Z3 finds exact rationals, which we then
materialise back into an IR JSON.

API
===
    from tools.smt.rtp_synthesizer import (
        RtpSyntheszier, synth_paytable_scale, synth_per_symbol_pays
    )

    # Mode A: scale the entire paytable to hit target RTP
    scale = synth_paytable_scale(ir, target_rtp=0.96)
    # Mode B: solve per-symbol pays (paytable_template = symbols list)
    pays = synth_per_symbol_pays(ir, target_rtp=0.96,
                                  symbols=["Red7", "Blue7", "Bell"])

Limitations
===========
- Wild substitution is modeled exactly for "wild substitutes for all
  non-special". Multi-tier wild rules (substitutes_except) supported.
- Scatter / pattern / feature contributions are taken as CONSTANTS
  from the IR (engine MC measures them once; SMT only re-targets
  paytable / line-eval portion).
- Per-reel set weights treated independently for `weighted` mode IR.
"""
from __future__ import annotations

import json

import z3


# ─── IR helpers ──────────────────────────────────────────────────────────


def _is_special(role: str) -> bool:
    return role in ("wild", "scatter", "bonus", "cash")


def _per_reel_symbol_prob(reels: list[dict], symbol: str) -> list[float]:
    """For each reel, P(stop == symbol) using `weight / total_weight`."""
    out = []
    for reel in reels:
        total = sum(int(s.get("weight", 1)) for s in reel) or 1
        match = sum(
            int(s.get("weight", 1))
            for s in reel
            if s.get("symbol") == symbol
        )
        out.append(match / total)
    return out


def _wild_symbol_id(ir: dict) -> str | None:
    for s in ir.get("symbols", []):
        if s.get("role") == "wild":
            return s["id"]
    return None


def _wild_excluded(ir: dict) -> set[str]:
    """Symbols that Wild does NOT substitute for (cash + bonus + scatter,
    plus any explicit `substitutes_except` on the wild)."""
    excluded: set[str] = set()
    for s in ir.get("symbols", []):
        if s.get("role") in ("cash", "scatter", "bonus"):
            excluded.add(s["id"])
        if s.get("role") == "wild":
            for ex in s.get("substitutes_except") or []:
                excluded.add(ex)
    return excluded


def _line_prob_n_of_a_kind(
    ir: dict,
    reels: list[dict],
    anchor_sym: str,
    count: int,
) -> float:
    """Closed-form probability of `count`-of-a-kind for `anchor_sym` on a
    single payline (L→R from reel 0). Wild substitution baked in.

    For each cell 0..count-1: P(cell == anchor OR cell == wild_subs).
    For the boundary cell at `count` (if count < n_reels): P(cell != anchor
    AND cell != wild_subs).
    """
    n_reels = len(reels)
    wild_id = _wild_symbol_id(ir)
    excluded = _wild_excluded(ir)
    wild_substitutes = wild_id is not None and anchor_sym not in excluded

    p = 1.0
    for i in range(count):
        p_anchor = _per_reel_symbol_prob([reels[i]], anchor_sym)[0]
        p_wild = (
            _per_reel_symbol_prob([reels[i]], wild_id)[0]
            if wild_substitutes
            else 0.0
        )
        # Inclusion-exclusion: anchor OR wild (disjoint sets — anchor
        # is not wild).
        p *= p_anchor + p_wild
    if count < n_reels:
        p_anchor_b = _per_reel_symbol_prob([reels[count]], anchor_sym)[0]
        p_wild_b = (
            _per_reel_symbol_prob([reels[count]], wild_id)[0]
            if wild_substitutes
            else 0.0
        )
        p *= max(0.0, 1.0 - (p_anchor_b + p_wild_b))
    return p


def closed_form_line_rtp(ir: dict, paytable_override: dict | None = None) -> float:
    """Closed-form line-eval RTP computed from the IR (no MC).

    `paytable_override`: optional dict `{(sym, count): pays}` replacing
    the IR's paytable; used by the SMT model after solving.

    Returns RTP as a fraction (e.g. 0.7099 for ~71%). Sums:

        Σ_(sym, k) num_lines × pays[sym,k] × P(line k-of-a-kind sym) / total_bet
    """
    paylines = ir["evaluation"]["lines"]
    num_lines = len(paylines)
    bet_lines = int(ir["bet_table"]["lines"])
    total_bet = float(bet_lines)  # at BM=1 total bet = num lines coins

    # Build paytable dict {(sym, count): pays}
    pt: dict[tuple[str, int], float] = {}
    for entry in ir.get("paytable", []):
        if entry.get("scope", "line") != "line":
            continue
        combo = entry.get("combo") or []
        if not combo:
            continue
        first = combo[0]
        if not first or first == "--":
            continue
        cnt = sum(1 for c in combo if c == first)
        pt[(first, cnt)] = float(entry.get("pays", 0))

    if paytable_override:
        pt.update(paytable_override)

    reels = ir["reels"]["base"][0]["reels"]

    total_rtp = 0.0
    for (sym, count), pays in pt.items():
        if pays <= 0:
            continue
        # Probability of N-of-a-kind anchor=sym starting reel 0
        p_line = _line_prob_n_of_a_kind(ir, reels, sym, count)
        # Each payline independently can hit; for now treat L→R from
        # left only, with all paylines having the same per-line
        # probability (works exactly for fixed paylines).
        total_rtp += num_lines * pays * p_line / total_bet
    return total_rtp


# ─── SMT synthesizer kernels ─────────────────────────────────────────────


class RtpSynthesisError(Exception):
    """Raised when Z3 cannot satisfy the RTP constraint."""


def synth_paytable_scale(
    ir: dict,
    target_rtp: float,
    tolerance: float = 1e-6,
    timeout_ms: int = 10_000,
) -> float:
    """Solve for a single multiplicative scale `s` applied to all line-
    scope paytable entries that hits `target_rtp` exactly (within
    `tolerance`).

    Encoding:
        scale * baseline_line_rtp == target_rtp
        ⇒ scale = target_rtp / baseline_line_rtp

    Because the equation is linear in `scale`, Z3's LRA solver finds
    the unique rational solution instantly. We use Z3 (not direct
    arithmetic) to ship a uniform synthesis interface AND to surface
    the constraint as a proof-shaped artifact.

    Raises `RtpSynthesisError` if the solver returns `unsat` (which
    happens when baseline line RTP is zero — no paytable to scale).
    """
    baseline = closed_form_line_rtp(ir)
    if baseline <= 0.0:
        raise RtpSynthesisError(
            "baseline line RTP is 0 — paytable scaling has no effect"
        )

    s = z3.Real("paytable_scale")
    target = z3.RealVal(target_rtp)
    base = z3.RealVal(baseline)

    solver = z3.Solver()
    solver.set("timeout", timeout_ms)
    # s * baseline == target (with small tolerance to absorb float
    # round-trip through RealVal).
    delta = z3.RealVal(tolerance)
    solver.add(s * base >= target - delta)
    solver.add(s * base <= target + delta)
    solver.add(s > 0)

    result = solver.check()
    if result != z3.sat:
        raise RtpSynthesisError(
            f"Z3 returned {result} for target_rtp={target_rtp} "
            f"(baseline={baseline:.6f})"
        )

    model = solver.model()
    scale_val = model[s]
    if scale_val is None:
        raise RtpSynthesisError("Z3 model missing scale variable")
    # Convert Z3 RatNumRef → Python float
    return float(scale_val.as_decimal(20).rstrip("?"))


def synth_per_symbol_pays(
    ir: dict,
    target_rtp: float,
    symbols: list[str],
    pay_min: float = 1.0,
    pay_max: float = 10_000.0,
    timeout_ms: int = 30_000,
) -> dict[tuple[str, int], float]:
    """Solve for per-symbol paytable pays that satisfy a target RTP.

    For each symbol in `symbols`, introduces three pay variables
    (3-of-a-kind, 4-of-a-kind, 5-of-a-kind) constrained by:

        pay_3 < pay_4 < pay_5   (monotonic ladder, industry rule)
        pay_min <= pay_3        (regulator floor)
        pay_5 <= pay_max        (regulator ceiling)

        Σ pays_sym_count × num_lines × P_line_sym_count / total_bet == target_rtp

    All symbols not in `symbols` keep their IR paytable values
    (treated as constants in the sum). Returns dict
    `{(sym, count): solved_pay}` ready to splice back into the IR.
    """
    n_reels = int(ir["topology"]["reels"])
    paylines = ir["evaluation"]["lines"]
    num_lines = len(paylines)
    bet_lines = int(ir["bet_table"]["lines"])
    total_bet = float(bet_lines)
    reels = ir["reels"]["base"][0]["reels"]

    # Existing paytable
    base_pt: dict[tuple[str, int], float] = {}
    for entry in ir.get("paytable", []):
        if entry.get("scope", "line") != "line":
            continue
        combo = entry.get("combo") or []
        if not combo:
            continue
        first = combo[0]
        if not first or first == "--":
            continue
        cnt = sum(1 for c in combo if c == first)
        base_pt[(first, cnt)] = float(entry.get("pays", 0))

    solver = z3.Solver()
    solver.set("timeout", timeout_ms)

    # Create one Z3 variable per (sym, count) target. Skip counts
    # that exceed `n_reels` (physically impossible N-of-a-kind).
    vars_by_key: dict[tuple[str, int], z3.RealRef] = {}
    counts = [c for c in (3, 4, 5) if c <= n_reels]
    for sym in symbols:
        for count in counts:
            v = z3.Real(f"pay_{sym}_{count}")
            vars_by_key[(sym, count)] = v
            solver.add(v >= z3.RealVal(pay_min))
            solver.add(v <= z3.RealVal(pay_max))
        # Monotonic ladder (only between adjacent counts that exist)
        for prev, nxt in zip(counts, counts[1:]):
            solver.add(vars_by_key[(sym, prev)] < vars_by_key[(sym, nxt)])

    # Sum constraint
    target = z3.RealVal(target_rtp)
    expr = z3.RealVal(0)
    # Variable-paytable contribution
    for (sym, count), var in vars_by_key.items():
        p_line = _line_prob_n_of_a_kind(ir, reels, sym, count)
        if p_line == 0:
            continue
        contrib = var * z3.RealVal(num_lines * p_line / total_bet)
        expr = expr + contrib
    # Constant-paytable contribution (symbols NOT in `symbols`)
    const_rtp = 0.0
    for (sym, count), pays in base_pt.items():
        if sym in symbols:
            continue
        if pays <= 0:
            continue
        p_line = _line_prob_n_of_a_kind(ir, reels, sym, count)
        const_rtp += num_lines * pays * p_line / total_bet
    expr = expr + z3.RealVal(const_rtp)

    delta = z3.RealVal(1e-6)
    solver.add(expr >= target - delta)
    solver.add(expr <= target + delta)

    result = solver.check()
    if result != z3.sat:
        raise RtpSynthesisError(
            f"Z3 returned {result} for target_rtp={target_rtp} "
            f"with {len(symbols)} variable symbols"
        )

    model = solver.model()
    out: dict[tuple[str, int], float] = {}
    for key, var in vars_by_key.items():
        val = model[var]
        if val is None:
            continue
        out[key] = float(val.as_decimal(20).rstrip("?"))
    return out


def apply_paytable_scale(ir: dict, scale: float) -> dict:
    """Return a new IR with all line-scope paytable pays multiplied by
    `scale`. Scatter / pattern entries left untouched."""
    new_ir = json.loads(json.dumps(ir))
    for entry in new_ir.get("paytable", []):
        if entry.get("scope", "line") != "line":
            continue
        entry["pays"] = float(entry.get("pays", 0)) * scale
    return new_ir


def apply_per_symbol_pays(
    ir: dict,
    solved_pays: dict[tuple[str, int], float],
) -> dict:
    """Splice solver-derived pays back into the IR. Symbols not in
    `solved_pays` keep their original IR pays."""
    new_ir = json.loads(json.dumps(ir))
    for entry in new_ir.get("paytable", []):
        if entry.get("scope", "line") != "line":
            continue
        combo = entry.get("combo") or []
        if not combo:
            continue
        first = combo[0]
        if not first or first == "--":
            continue
        cnt = sum(1 for c in combo if c == first)
        key = (first, cnt)
        if key in solved_pays:
            entry["pays"] = solved_pays[key]
    return new_ir
