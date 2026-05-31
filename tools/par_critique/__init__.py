"""SLOT-MATH Faza 6.5 — PAR critique (NOT auto-design).

Quality review of canonical PAR. Catches anti-patterns BEFORE math goes
to MC sweep. Reports issues like:

  - Dead symbols (0% RTP contribution)
  - Unreachable features (trigger probability < 1e-9 over whole session)
  - Imbalanced paytable (1 symbol = 99% of RTP)
  - Volatility class mismatch (declared LOW but computed HIGH)
  - Hit-freq inconsistent with paytable density
  - Wild substitution rules conflict with paytable

Heuristic only — no LLM call. Designed for offline / regulator audit.
LLM hook is OPTIONAL future enhancement.
"""
from tools.par_critique.rules import (
    CritiqueFinding,
    CritiqueSeverity,
    critique_par,
)

__all__ = [
    "CritiqueFinding",
    "CritiqueSeverity",
    "critique_par",
]
