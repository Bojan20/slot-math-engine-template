"""W7.6 — Symbolic Differentiation Slot Math.

Treats the slot's RTP as a **differentiable function** of its reel
weights and exposes:

* ``RtpModel`` — symbolic-ish closed-form RTP for left-anchored lines
  slots, with named parameters per reel.
* ``partial_derivative(model, target, eps)`` — central-difference
  gradient ∂RTP/∂weight_{r,s} for any weight on any reel.
* ``solve_for_target_rtp(model, target_rtp, knob, ...)`` — Newton-
  Raphson root-finder that dials a single knob (or a vector of
  knobs) until RTP matches a target.
* ``optimize_for_volatility(model, target_cv)`` — gradient-descent
  CV tuner using the same machinery.

The whole module is pure Python stdlib — no SymPy / numpy / scipy.
The "symbolic" framing lives at the API level: designers describe
the slot as an algebraic object and ask for gradients / solves
without touching the underlying Monte Carlo loop.

Why this is a regulator-grade primitive: every fitted reel-weight
configuration ships with a SHA-256-pinned **derivative manifest**
(per-weight ∂RTP/∂w at the fitted point). Lab auditors can
sanity-check the solver's convergence claim without re-running the
optimizer — they look up the gradient, check the local Newton step
is small, and accept the configuration.

Industry-first per Kimi W181 research: no incumbent vendor ships a
gradient-aware reel tuner with auditable derivative manifests.
"""

from .model import (
    DerivativeManifest,
    RtpModel,
    SolveReport,
    build_derivative_manifest,
    optimize_for_volatility,
    partial_derivative,
    solve_for_target_rtp,
)

__all__ = [
    "DerivativeManifest",
    "RtpModel",
    "SolveReport",
    "build_derivative_manifest",
    "optimize_for_volatility",
    "partial_derivative",
    "solve_for_target_rtp",
]
