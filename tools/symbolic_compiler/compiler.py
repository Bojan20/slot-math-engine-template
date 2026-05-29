"""PHASE 24 — Symbolic Engine Compiler kernel.

Emits a closed-form symbolic derivation of the Bernoulli line-eval RTP
formula for an IR + the exact rational value via `fractions.Fraction`.

Regulator-friendly output:
  RTP = Σ_entry  p(combo) × pays(entry)
  where p(combo) = Π_reel  freq(symbol_i, reel_i) / total(reel_i)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any


@dataclass
class SymbolicTerm:
    combo: list[str]
    pays: float
    symbolic_probability: str
    rational_probability: Fraction = field(default_factory=lambda: Fraction(0))
    contribution_rational: Fraction = field(default_factory=lambda: Fraction(0))


@dataclass
class SymbolicCertificate:
    schema_version: str = "urn:slotmath:symbolic-compiler:v1"
    n_reels: int = 0
    reel_freq_strings: list[str] = field(default_factory=list)
    terms: list[SymbolicTerm] = field(default_factory=list)
    symbolic_rtp: str = ""
    numeric_rtp_rational: Fraction = field(default_factory=lambda: Fraction(0))
    numeric_rtp_float: float = 0.0


# ─── Reel frequency extractor ──────────────────────────────────────────────


def _reel_freq_rationals(ir: dict[str, Any]) -> list[dict[str, Fraction]]:
    reels_block = ir.get("reels") or {}
    base = reels_block.get("base") if isinstance(reels_block, dict) else None
    if not isinstance(base, list) or not base:
        return []
    first = base[0]
    reels = first.get("reels") if isinstance(first, dict) else None
    if not isinstance(reels, list):
        return []
    out: list[dict[str, Fraction]] = []
    for reel in reels:
        weights: dict[str, int] = {}
        total = 0
        if isinstance(reel, list):
            for cell in reel:
                if isinstance(cell, dict):
                    sym = str(cell.get("symbol", ""))
                    w = int(cell.get("weight", 1))
                else:
                    sym = str(cell)
                    w = 1
                weights[sym] = weights.get(sym, 0) + w
                total += w
        if total == 0:
            out.append({})
            continue
        out.append({k: Fraction(v, total) for k, v in weights.items()})
    return out


def _format_reel_string(d: dict[str, Fraction]) -> str:
    parts = sorted(d.items())
    return "{ " + ", ".join(f"{k}: {v}" for k, v in parts) + " }"


# ─── Compile ───────────────────────────────────────────────────────────────


def compile_symbolic(ir: dict[str, Any]) -> SymbolicCertificate:
    reel_freqs = _reel_freq_rationals(ir)
    cert = SymbolicCertificate(
        n_reels=len(reel_freqs),
        reel_freq_strings=[_format_reel_string(d) for d in reel_freqs],
    )
    paytable = ir.get("paytable") or []
    terms: list[SymbolicTerm] = []
    total_rational = Fraction(0)
    symbolic_pieces: list[str] = []
    for entry in paytable:
        if not isinstance(entry, dict):
            continue
        combo = entry.get("combo")
        pay = entry.get("pays")
        if not isinstance(combo, list) or not isinstance(pay, (int, float)):
            continue
        # Compute rational probability
        prob = Fraction(1)
        symbolic_parts: list[str] = []
        valid = True
        for reel_idx, sym in enumerate(combo):
            if reel_idx >= len(reel_freqs):
                valid = False
                break
            if sym in ("--", "*", "", None):
                symbolic_parts.append("1")
                continue
            f = reel_freqs[reel_idx].get(str(sym), Fraction(0))
            if f == 0:
                prob = Fraction(0)
                symbolic_parts.append(f"p_{reel_idx}({sym})=0")
                break
            prob *= f
            symbolic_parts.append(f"p_{reel_idx}({sym})={f}")
        if not valid:
            continue
        sym_prob_str = " * ".join(symbolic_parts) if symbolic_parts else "1"
        try:
            pay_frac = Fraction(pay).limit_denominator(10**9)
        except (OverflowError, ValueError):
            pay_frac = Fraction(0)
        contribution = prob * pay_frac
        terms.append(SymbolicTerm(
            combo=list(combo),
            pays=float(pay),
            symbolic_probability=sym_prob_str,
            rational_probability=prob,
            contribution_rational=contribution,
        ))
        total_rational += contribution
        symbolic_pieces.append(f"({sym_prob_str}) * {pay}")

    cert.terms = terms
    cert.symbolic_rtp = "  +  ".join(symbolic_pieces)
    cert.numeric_rtp_rational = total_rational
    try:
        cert.numeric_rtp_float = float(total_rational)
    except (OverflowError, ZeroDivisionError):
        cert.numeric_rtp_float = 0.0
    return cert


# ─── Markdown emitter ──────────────────────────────────────────────────────


def emit_derivation_markdown(cert: SymbolicCertificate) -> str:
    out: list[str] = []
    out.append("# Symbolic Derivation")
    out.append("")
    out.append(f"> Schema `{cert.schema_version}`")
    out.append("")
    out.append("## Reel symbol frequencies (rational)")
    out.append("")
    out.append("| Reel | Frequencies |")
    out.append("|---|---|")
    for i, fs in enumerate(cert.reel_freq_strings):
        out.append(f"| reel{i} | {fs} |")
    out.append("")
    out.append("## Per-combo contributions")
    out.append("")
    out.append("| Combo | P(combo) | Pay | Contribution |")
    out.append("|---|---|---:|---|")
    for t in cert.terms:
        combo = " ".join(t.combo)
        out.append(f"| {combo} | {t.rational_probability} | {t.pays} | {t.contribution_rational} |")
    out.append("")
    out.append("## Final RTP")
    out.append("")
    out.append(f"- **Symbolic**: `{cert.symbolic_rtp}`")
    out.append(f"- **Rational**: `{cert.numeric_rtp_rational}`")
    out.append(f"- **Float**: `{cert.numeric_rtp_float:.10f}`")
    return "\n".join(out)
