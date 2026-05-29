"""W7.6 — Symbolic Differentiation Slot Math implementation.

Symbolic-ish closed-form RTP model with gradient + solver primitives.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
from typing import Sequence


@dataclasses.dataclass
class RtpModel:
    """Closed-form RTP for a left-anchored lines slot.

    The model is **continuously differentiable** in `weights` whenever
    the per-reel totals are positive, which is the only regime
    designers care about.
    """

    n_reels: int
    n_symbols: int
    paytable: list[list[float]]
    min_match: int
    paylines: int
    anchor: int
    weights: list[list[float]]

    def validate(self) -> None:
        if self.n_reels < 3:
            raise ValueError("n_reels must be >= 3")
        if self.anchor < 0 or self.anchor >= self.n_symbols:
            raise ValueError(f"anchor index {self.anchor} out of range")
        if len(self.weights) != self.n_reels:
            raise ValueError("weights row count must equal n_reels")
        for r, reel in enumerate(self.weights):
            if len(reel) != self.n_symbols:
                raise ValueError(
                    f"reel {r} has {len(reel)} weights, expected {self.n_symbols}"
                )
            if any(w < 0 for w in reel):
                raise ValueError(f"reel {r} contains a negative weight")

    def rtp(self) -> float:
        """Closed-form RTP (unit fraction; 0.96 = 96%)."""
        totals = [sum(r) for r in self.weights]
        if any(t <= 0 for t in totals):
            return 0.0
        p_anchor = [
            self.weights[r][self.anchor] / totals[r] for r in range(self.n_reels)
        ]
        prefix = 1.0
        ev_per_line = 0.0
        for k in range(self.n_reels):
            prefix *= p_anchor[k]
            if k + 1 == self.n_reels:
                p_exact_k = prefix
            else:
                p_exact_k = prefix * (1.0 - p_anchor[k + 1])
            ev_per_line += p_exact_k * self._paytable_payout(k + 1)
        return ev_per_line

    def volatility_cv(self) -> float:
        """Coefficient of variation = stddev / mean of per-spin payout."""
        totals = [sum(r) for r in self.weights]
        if any(t <= 0 for t in totals):
            return 0.0
        p_anchor = [
            self.weights[r][self.anchor] / totals[r] for r in range(self.n_reels)
        ]
        prefix = 1.0
        ev = 0.0
        ev2 = 0.0
        for k in range(self.n_reels):
            prefix *= p_anchor[k]
            if k + 1 == self.n_reels:
                p_exact_k = prefix
            else:
                p_exact_k = prefix * (1.0 - p_anchor[k + 1])
            pay = self._paytable_payout(k + 1)
            ev += p_exact_k * pay
            ev2 += p_exact_k * pay * pay
        if ev <= 0:
            return 0.0
        var = ev2 - ev * ev
        return math.sqrt(max(var, 0.0)) / ev

    def _paytable_payout(self, run_len: int) -> float:
        if run_len < self.min_match:
            return 0.0
        row = self.paytable[self.anchor]
        col = run_len - self.min_match
        if col < 0 or col >= len(row):
            return 0.0
        return max(row[col], 0.0)

    def clone(self) -> "RtpModel":
        return RtpModel(
            n_reels=self.n_reels,
            n_symbols=self.n_symbols,
            paytable=[list(r) for r in self.paytable],
            min_match=self.min_match,
            paylines=self.paylines,
            anchor=self.anchor,
            weights=[list(r) for r in self.weights],
        )

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ─── Partial derivative (central difference) ─────────────────────────


def partial_derivative(
    model: RtpModel,
    reel: int,
    symbol: int,
    *,
    eps: float = 1e-4,
    metric: str = "rtp",
) -> float:
    """Central-difference ∂metric/∂weight_{reel,symbol}.

    Uses a 4th-order central stencil for numerical stability:
        f'(x) ≈ (-f(x+2h) + 8 f(x+h) - 8 f(x-h) + f(x-2h)) / (12 h)

    `metric` is one of `"rtp"`, `"cv"`.
    """
    if metric not in {"rtp", "cv"}:
        raise ValueError(f"unknown metric {metric!r}")
    if reel < 0 or reel >= model.n_reels:
        raise IndexError(f"reel {reel} out of range")
    if symbol < 0 or symbol >= model.n_symbols:
        raise IndexError(f"symbol {symbol} out of range")
    if eps <= 0:
        raise ValueError("eps must be positive")

    def eval_at(delta: float) -> float:
        probe = model.clone()
        probe.weights[reel][symbol] = max(0.0, probe.weights[reel][symbol] + delta)
        return probe.rtp() if metric == "rtp" else probe.volatility_cv()

    # 4th-order central stencil — minimizes truncation error vs simple
    # central difference for the same eps.
    f_2h = eval_at(2 * eps)
    f_h = eval_at(eps)
    f_m_h = eval_at(-eps)
    f_m_2h = eval_at(-2 * eps)
    return (-f_2h + 8 * f_h - 8 * f_m_h + f_m_2h) / (12 * eps)


# ─── Solver: target RTP via Newton-Raphson on a single knob ─────────


@dataclasses.dataclass
class SolveReport:
    converged: bool
    iterations: int
    final_value: float
    final_metric: float
    target_metric: float
    final_residual: float
    history: list[tuple[float, float]] = dataclasses.field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


def solve_for_target_rtp(
    model: RtpModel,
    target_rtp: float,
    *,
    reel: int,
    symbol: int,
    weight_min: float = 0.01,
    weight_max: float = 1e6,
    tol: float = 1e-6,
    max_iter: int = 64,
    eps: float = 1e-4,
) -> SolveReport:
    """Newton-Raphson dial of a single (reel, symbol) weight to hit target_rtp.

    The model is mutated in-place — the final weight is stored back
    into ``model.weights[reel][symbol]`` when the solver converges.
    """
    if not (0.0 <= target_rtp <= 100.0):
        raise ValueError("target_rtp must be in [0, 100] (unit-fraction)")
    history: list[tuple[float, float]] = []
    for it in range(max_iter):
        current = model.rtp()
        residual = current - target_rtp
        history.append((model.weights[reel][symbol], current))
        if abs(residual) <= tol:
            return SolveReport(
                converged=True,
                iterations=it,
                final_value=model.weights[reel][symbol],
                final_metric=current,
                target_metric=target_rtp,
                final_residual=residual,
                history=history,
            )
        grad = partial_derivative(model, reel, symbol, eps=eps, metric="rtp")
        if abs(grad) < 1e-18:
            # Vanishing gradient — bail out; designer should pick a
            # different knob.
            break
        step = -residual / grad
        # Damping: cap step at ±50% of current weight to avoid wild
        # over-shoots near the boundary.
        cap = max(0.5 * abs(model.weights[reel][symbol]), 1e-3)
        if abs(step) > cap:
            step = math.copysign(cap, step)
        new_w = model.weights[reel][symbol] + step
        new_w = max(weight_min, min(weight_max, new_w))
        model.weights[reel][symbol] = new_w
    final = model.rtp()
    return SolveReport(
        converged=False,
        iterations=max_iter,
        final_value=model.weights[reel][symbol],
        final_metric=final,
        target_metric=target_rtp,
        final_residual=final - target_rtp,
        history=history,
    )


# ─── Solver: target CV via gradient descent ──────────────────────────


def optimize_for_volatility(
    model: RtpModel,
    target_cv: float,
    *,
    reel: int,
    symbol: int,
    weight_min: float = 0.01,
    weight_max: float = 1e6,
    tol: float = 1e-4,
    max_iter: int = 128,
    learning_rate: float = 0.5,
    eps: float = 1e-4,
) -> SolveReport:
    """Gradient descent on a single weight until the model's CV matches target."""
    history: list[tuple[float, float]] = []
    for it in range(max_iter):
        current = model.volatility_cv()
        residual = current - target_cv
        history.append((model.weights[reel][symbol], current))
        if abs(residual) <= tol:
            return SolveReport(
                converged=True,
                iterations=it,
                final_value=model.weights[reel][symbol],
                final_metric=current,
                target_metric=target_cv,
                final_residual=residual,
                history=history,
            )
        grad = partial_derivative(model, reel, symbol, eps=eps, metric="cv")
        if abs(grad) < 1e-18:
            break
        step = -learning_rate * residual / grad
        cap = max(0.5 * abs(model.weights[reel][symbol]), 1e-3)
        if abs(step) > cap:
            step = math.copysign(cap, step)
        new_w = model.weights[reel][symbol] + step
        new_w = max(weight_min, min(weight_max, new_w))
        model.weights[reel][symbol] = new_w
    final = model.volatility_cv()
    return SolveReport(
        converged=False,
        iterations=max_iter,
        final_value=model.weights[reel][symbol],
        final_metric=final,
        target_metric=target_cv,
        final_residual=final - target_cv,
        history=history,
    )


# ─── Derivative manifest (regulator deliverable) ─────────────────────


@dataclasses.dataclass
class DerivativeManifest:
    """Per-weight ∂RTP/∂w + ∂CV/∂w at the fitted weights, plus a SHA-256
    fingerprint over the whole document so it can be pinned in a cert
    bundle and re-verified by an auditor without re-running the
    optimizer."""

    model_rtp: float
    model_cv: float
    drtp: list[list[float]]
    dcv: list[list[float]]
    sha256_hex: str

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


def build_derivative_manifest(model: RtpModel) -> DerivativeManifest:
    drtp: list[list[float]] = []
    dcv: list[list[float]] = []
    for r in range(model.n_reels):
        drtp_row = []
        dcv_row = []
        for s in range(model.n_symbols):
            drtp_row.append(partial_derivative(model, r, s, metric="rtp"))
            dcv_row.append(partial_derivative(model, r, s, metric="cv"))
        drtp.append(drtp_row)
        dcv.append(dcv_row)
    payload = {
        "model_rtp": model.rtp(),
        "model_cv": model.volatility_cv(),
        "drtp": drtp,
        "dcv": dcv,
        "weights": model.weights,
        "paytable": model.paytable,
    }
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    fp = hashlib.sha256(payload_bytes).hexdigest()
    return DerivativeManifest(
        model_rtp=payload["model_rtp"],
        model_cv=payload["model_cv"],
        drtp=drtp,
        dcv=dcv,
        sha256_hex=fp,
    )
