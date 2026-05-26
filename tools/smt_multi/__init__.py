"""W79 — Multi-Constraint SMT IR Synthesis.

Generalizes W7.3 from "synthesize one pays scalar to hit target RTP"
to a SIMULTANEOUS multi-constraint solver:

  * target_rtp (equality, ±epsilon)
  * variance bound (≤ var_max — operator volatility cap)
  * max_win cap (≤ win_max — regulator jurisdiction rule)
  * hit_frequency bound (≥ hit_min — anti-cold-streak heuristic)
  * monotonicity: pays[sym, k+1] ≥ pays[sym, k] (higher count pays more)

The solver returns a `ConstraintSatisfaction` carrying:
  * the SAT/UNSAT verdict
  * the satisfying model (if SAT) materialized as scaled paytable
  * a per-constraint "slack" margin (closest bound, useful for
    sensitivity analysis)

Falls back gracefully when z3 is unavailable: a stdlib-only
arithmetic searcher (golden-section + binary search) handles the
1-D scaling case.

Public API:
    from tools.smt_multi import (
        ConstraintSpec, ConstraintSatisfaction,
        synthesize_paytable_scale,
        SmtUnavailable,
    )
"""
from tools.smt_multi.solver import (
    ConstraintSpec,
    ConstraintSatisfaction,
    SlackReport,
    SmtUnavailable,
    synthesize_paytable_scale,
    estimate_rtp,
    estimate_variance,
    estimate_max_win,
    estimate_hit_freq,
)

__all__ = [
    "ConstraintSpec",
    "ConstraintSatisfaction",
    "SlackReport",
    "SmtUnavailable",
    "synthesize_paytable_scale",
    "estimate_rtp",
    "estimate_variance",
    "estimate_max_win",
    "estimate_hit_freq",
]
