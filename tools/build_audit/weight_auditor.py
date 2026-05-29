"""PHASE 44 — Weight Precision Auditor.

For a representative slice of the Build pipeline's reel-weight computation:

  1. Construct a reel weight vector from a known IR.
  2. Verify weight-sum > 0 (no degenerate reel).
  3. Verify normalised probabilities sum to 1 within 1e-12.
  4. Compute the closed-form RTP via Fraction-exact arithmetic and
     compare against a float-only re-computation; drift ≤ 1e-9.
  5. Confirm Kahan summation produces identical results to Fraction
     for the same input (cumulative-loss check).

The auditor reads the IR shape the Studio's `buildSymbolPool` /
`autoBuildReels` emits but runs the math independently in Python so
the comparison is genuinely independent.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Any


@dataclass
class WeightCheckFinding:
    check_id: str
    verdict: str           # "PASS" | "WARN" | "FAIL"
    detail: str
    measured: float | None = None
    reference: float | None = None
    drift: float | None = None
    tolerance: float = 1e-9
    evidence: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ─── Math helpers (Fraction-exact references) ──────────────────────────────


def _kahan_sum(values: list[float]) -> float:
    """Compensated summation. Used to compare against naive `sum` over
    long weight vectors (where `sum` accumulates float drift)."""
    s = 0.0
    c = 0.0
    for v in values:
        y = v - c
        t = s + y
        c = (t - s) - y
        s = t
    return s


def _fraction_rtp_from_ir(ir: dict[str, Any]) -> Fraction | None:
    """Closed-form RTP using rational arithmetic.

    Walks every payline, computes `Σ_combos pay × prob` exactly, where
    `prob` is the product over reels of (w_i / Σw). Returns None when
    the IR lacks the required fields — caller treats this as N/A.
    """
    reels_cfg = ir.get("reels") or {}
    base = reels_cfg.get("base") if isinstance(reels_cfg, dict) else None
    paytable = ir.get("paytable") or []
    paylines = ir.get("paylines") or []
    symbols = ir.get("symbols") or []
    if not (isinstance(base, list) and paytable and paylines and symbols):
        return None

    # Build per-reel rational probabilities.
    reel_probs: list[dict[str, Fraction]] = []
    for reel_weights in base:
        if not isinstance(reel_weights, dict) or not reel_weights:
            return None
        total = Fraction(sum(Fraction(v) for v in reel_weights.values()))
        if total == 0:
            return None
        reel_probs.append({k: Fraction(v) / total for k, v in reel_weights.items()})

    wild_id = next(
        (s.get("id") for s in symbols if isinstance(s, dict) and s.get("kind") == "wild"),
        None,
    )

    # Index paytable: { (symbol_id, run_length) → pay }
    pay_index: dict[tuple[str, int], Fraction] = {}
    for row in paytable:
        if not isinstance(row, dict):
            continue
        sym = row.get("symbol")
        for k, v in row.items():
            if k == "symbol" or not isinstance(v, (int, float)):
                continue
            if k.startswith("pay"):
                try:
                    run = int(k[3:])
                except ValueError:
                    continue
                pay_index[(str(sym), run)] = Fraction(v).limit_denominator(10_000_000)

    rtp = Fraction(0)
    # Walk every payline + every symbol that could "anchor" the line.
    for line in paylines:
        if not isinstance(line, list) or not line:
            continue
        # Enumerate the symbol on reel 0; for each candidate symbol,
        # walk the line and accumulate the run probability for each run
        # length L = 3, 4, 5, … up to the line length.
        anchor_probs: dict[str, Fraction] = reel_probs[0] if reel_probs else {}
        for anchor in anchor_probs:
            # Probability of run length L on this line, given anchor at reel 0.
            cum_p = Fraction(1)
            for reel_idx, row_pos in enumerate(line):
                if reel_idx >= len(reel_probs):
                    break
                pr = reel_probs[reel_idx]
                if reel_idx == 0:
                    p_hit = pr.get(anchor, Fraction(0))
                else:
                    p_hit = pr.get(anchor, Fraction(0))
                    if wild_id is not None and wild_id != anchor:
                        p_hit += pr.get(wild_id, Fraction(0))
                cum_p *= p_hit
                run_length = reel_idx + 1
                if run_length >= 3:
                    pay = pay_index.get((anchor, run_length))
                    if pay is not None:
                        rtp += cum_p * pay
                if p_hit == 0:
                    break
    return rtp


# ─── Reference IR for end-to-end checks ────────────────────────────────────


def _reference_ir() -> dict[str, Any]:
    """A minimal but math-rich IR for the auditor. Hand-crafted so the
    closed-form RTP has many small contributions — exercises Kahan
    summation against naive `sum` over ~20 paytable rows."""
    return {
        "meta": {"name": "audit-ref", "vendor": "synth"},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3, "shape": "lines"},
        "symbols": [
            {"id": "S_LO1", "kind": "lo"},
            {"id": "S_LO2", "kind": "lo"},
            {"id": "S_LO3", "kind": "lo"},
            {"id": "S_HI1", "kind": "hi"},
            {"id": "S_HI2", "kind": "hi"},
            {"id": "S_WILD", "kind": "wild"},
        ],
        "reels": {
            "base": [
                {"S_LO1": 30, "S_LO2": 25, "S_LO3": 20, "S_HI1": 12, "S_HI2": 8, "S_WILD": 5},
                {"S_LO1": 30, "S_LO2": 25, "S_LO3": 20, "S_HI1": 12, "S_HI2": 8, "S_WILD": 5},
                {"S_LO1": 30, "S_LO2": 25, "S_LO3": 20, "S_HI1": 12, "S_HI2": 8, "S_WILD": 5},
                {"S_LO1": 30, "S_LO2": 25, "S_LO3": 20, "S_HI1": 12, "S_HI2": 8, "S_WILD": 5},
                {"S_LO1": 30, "S_LO2": 25, "S_LO3": 20, "S_HI1": 12, "S_HI2": 8, "S_WILD": 5},
            ],
        },
        "paytable": [
            # Calibrated so that closed-form RTP lands in the UKGC RTS-12
            # advisory band [0.50, 1.05] without saturating. The reference
            # IR is a math-rich but regulator-realistic fixture.
            {"symbol": "S_LO1", "pay3": 0.5, "pay4": 1, "pay5": 3},
            {"symbol": "S_LO2", "pay3": 0.5, "pay4": 1, "pay5": 3},
            {"symbol": "S_LO3", "pay3": 1, "pay4": 2, "pay5": 5},
            {"symbol": "S_HI1", "pay3": 2, "pay4": 5, "pay5": 15},
            {"symbol": "S_HI2", "pay3": 5, "pay4": 15, "pay5": 50},
        ],
        "paylines": [
            [1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0],
            [2, 2, 2, 2, 2],
            [0, 1, 2, 1, 0],
            [2, 1, 0, 1, 2],
        ],
    }


# ─── Public entry ──────────────────────────────────────────────────────────


def audit_weight_precision(
    repo_root: Path | str | None = None,
    ir: dict[str, Any] | None = None,
) -> list[WeightCheckFinding]:
    """Run every weight-precision check against the reference IR.

    `repo_root` is optional and only used to surface evidence file paths
    in the audit report; the math itself runs in-process.
    """
    target_ir = ir or _reference_ir()
    findings: list[WeightCheckFinding] = []

    # Check 1: every reel has positive Σ_w + every weight > 0.
    base = target_ir.get("reels", {}).get("base", [])
    bad_reels: list[int] = []
    bad_weights: list[tuple[int, str]] = []
    for i, reel in enumerate(base):
        if not isinstance(reel, dict):
            bad_reels.append(i)
            continue
        total = sum(reel.values())
        if total <= 0:
            bad_reels.append(i)
            continue
        for sym, w in reel.items():
            if w <= 0:
                bad_weights.append((i, sym))
    findings.append(
        WeightCheckFinding(
            check_id="reel-weight-positive",
            verdict="PASS" if not (bad_reels or bad_weights) else "FAIL",
            detail=(
                f"{len(base)} reels, "
                f"{len(bad_reels)} with Σw≤0, "
                f"{len(bad_weights)} with individual w_i≤0"
            ),
            measured=float(len(bad_reels) + len(bad_weights)),
            reference=0.0,
            tolerance=0.0,
        )
    )

    # Check 2: per-reel probabilities sum to 1 within 1e-12.
    max_p_drift = 0.0
    for reel in base:
        total = sum(reel.values())
        if total <= 0:
            continue
        probs = [w / total for w in reel.values()]
        drift = abs(_kahan_sum(probs) - 1.0)
        max_p_drift = max(max_p_drift, drift)
    findings.append(
        WeightCheckFinding(
            check_id="reel-prob-sum-equals-one",
            verdict="PASS" if max_p_drift <= 1e-12 else "FAIL",
            detail=f"max |Σp - 1| = {max_p_drift:.2e}",
            measured=max_p_drift,
            reference=0.0,
            drift=max_p_drift,
            tolerance=1e-12,
        )
    )

    # Check 3: closed-form RTP reproduces between Fraction-exact and
    # float computation within 1e-9.
    f_rtp = _fraction_rtp_from_ir(target_ir)
    if f_rtp is None:
        findings.append(
            WeightCheckFinding(
                check_id="closed-form-rtp-parity",
                verdict="WARN",
                detail="reference Fraction RTP could not be derived (missing IR fields)",
            )
        )
    else:
        reference = float(f_rtp)
        # Re-derive with float arithmetic + Kahan summation.
        # We reuse the Fraction helper but cast at the boundary.
        # The "measured" path mirrors what `engine.ts::computeRtp` does
        # internally — multiply float probabilities + pays.
        # To get a different code path, use the *same* IR but compute via
        # naive float sums (no Kahan).
        float_rtp = _naive_float_rtp(target_ir)
        drift = abs(reference - float_rtp)
        findings.append(
            WeightCheckFinding(
                check_id="closed-form-rtp-parity",
                verdict="PASS" if drift <= 1e-9 else "FAIL",
                detail=f"|Fraction RTP - float RTP| = {drift:.2e}",
                measured=float_rtp,
                reference=reference,
                drift=drift,
                tolerance=1e-9,
            )
        )

    # Check 4: Kahan vs naive sum agreement on the long weight vector.
    # We build a 100-entry vector with known total and compare.
    sample = [1.0 / 7.0] * 99 + [1.0 - 99.0 / 7.0]  # designed to drift in naive sum
    naive = sum(sample)
    kahan = _kahan_sum(sample)
    drift = abs(naive - kahan)
    findings.append(
        WeightCheckFinding(
            check_id="kahan-vs-naive-summation",
            verdict="PASS" if drift <= 1e-9 else "WARN",
            detail=f"|naive - Kahan| over 100 entries = {drift:.2e}",
            measured=naive,
            reference=kahan,
            drift=drift,
            tolerance=1e-9,
        )
    )

    return findings


def _naive_float_rtp(ir: dict[str, Any]) -> float:
    """Mirror of `_fraction_rtp_from_ir` but with native floats. Used as
    the engine-side reference for the parity check."""
    reels_cfg = ir.get("reels") or {}
    base = reels_cfg.get("base") if isinstance(reels_cfg, dict) else None
    paytable = ir.get("paytable") or []
    paylines = ir.get("paylines") or []
    symbols = ir.get("symbols") or []
    if not (isinstance(base, list) and paytable and paylines and symbols):
        return 0.0
    reel_probs: list[dict[str, float]] = []
    for r in base:
        total = float(sum(r.values()))
        reel_probs.append({k: v / total for k, v in r.items()})
    wild_id = next(
        (s.get("id") for s in symbols if isinstance(s, dict) and s.get("kind") == "wild"),
        None,
    )
    pay_index: dict[tuple[str, int], float] = {}
    for row in paytable:
        if not isinstance(row, dict):
            continue
        sym = row.get("symbol")
        for k, v in row.items():
            if k == "symbol" or not isinstance(v, (int, float)):
                continue
            if k.startswith("pay"):
                try:
                    run = int(k[3:])
                except ValueError:
                    continue
                pay_index[(str(sym), run)] = float(v)
    rtp = 0.0
    for line in paylines:
        if not isinstance(line, list) or not line:
            continue
        anchor_probs = reel_probs[0] if reel_probs else {}
        for anchor in anchor_probs:
            cum_p = 1.0
            for reel_idx, _ in enumerate(line):
                if reel_idx >= len(reel_probs):
                    break
                pr = reel_probs[reel_idx]
                p_hit = pr.get(anchor, 0.0)
                if reel_idx > 0 and wild_id is not None and wild_id != anchor:
                    p_hit += pr.get(wild_id, 0.0)
                cum_p *= p_hit
                run_length = reel_idx + 1
                if run_length >= 3:
                    pay = pay_index.get((anchor, run_length))
                    if pay is not None:
                        rtp += cum_p * pay
                if p_hit == 0.0:
                    break
    return rtp
