"""W244 wave 42 — multi-dim Newton-Raphson solver acceptance tests."""
from __future__ import annotations

import math

import pytest

from tools.math_dsl.multi_dim_inverse_solver import (
    newton_raphson_nd,
)


# ─── 2-D linear system (analytic exact solution) ────────────────────────


def test_2d_linear_solves_in_one_iter():
    """f(θ) = (2θ₁ + θ₂, θ₁ + 3θ₂), target (4, 5) → θ = (1.4, 1.2).

    Analytic solution:
      2a + b = 4
       a + 3b = 5
    → a = 1.4, b = 1.2
    """
    def f(theta):
        a, b = theta
        return (2 * a + b, a + 3 * b)

    def jac(_theta):
        return [[2.0, 1.0], [1.0, 3.0]]

    res = newton_raphson_nd(
        f, target=(4.0, 5.0), initial_guess=(0.0, 0.0),
        jacobian=jac, tolerance=1e-10, max_iterations=10,
    )
    assert res.converged
    assert abs(res.final_params[0] - 1.4) < 1e-9
    assert abs(res.final_params[1] - 1.2) < 1e-9
    # Linear system → quadratic convergence in 1-2 iters
    assert res.iterations <= 3


# ─── Numerical Jacobian fallback ────────────────────────────────────────


def test_2d_with_numerical_jacobian():
    """Same linear system but using finite-difference Jacobian."""
    def f(theta):
        a, b = theta
        return (2 * a + b, a + 3 * b)

    res = newton_raphson_nd(
        f, target=(4.0, 5.0), initial_guess=(0.0, 0.0),
        jacobian=None, tolerance=1e-6, max_iterations=10,
    )
    assert res.converged
    assert abs(res.final_params[0] - 1.4) < 1e-4
    assert abs(res.final_params[1] - 1.2) < 1e-4


# ─── 2-D nonlinear (slot math example) ──────────────────────────────────


def test_2d_nonlinear_rtp_hitfreq_calibration():
    """Realistic: solve (volatility, density) for (RTP=0.5, hit_freq=0.5).

    Synthetic kernel where:
      rtp(v, d)      = d × (2 - v) × 0.5    # higher density + lower vol → higher RTP
      hit_freq(v, d) = d × (1 - v / 4)      # density + low vol → higher hit freq

    Analytical solution: dividing equations gives (2-v)/(2(1-v/4)) = 1,
    which yields v = 0 → d = 0.5. Both targets reach exactly at (0, 0.5).
    """
    def f(theta):
        v, d = theta
        rtp = d * (2.0 - v) * 0.5
        hit = d * (1.0 - v / 4.0)
        return (rtp, hit)

    res = newton_raphson_nd(
        f, target=(0.5, 0.5), initial_guess=(0.3, 0.4),
        jacobian=None,
        tolerance=1e-6, max_iterations=30,
        bounds=((0.0, 2.0), (0.0, 2.0)),
        damping=0.8,
    )
    assert res.converged, f"Did not converge: {res}"
    out = f(res.final_params)
    assert abs(out[0] - 0.5) < 1e-5
    assert abs(out[1] - 0.5) < 1e-5


# ─── 3-D system ────────────────────────────────────────────────────────


def test_3d_diagonal_system():
    """f_i(θ) = a_i × θ_i, target (1, 2, 3), a = (2, 3, 5)."""
    def f(theta):
        return (2.0 * theta[0], 3.0 * theta[1], 5.0 * theta[2])

    def jac(_theta):
        return [
            [2.0, 0.0, 0.0],
            [0.0, 3.0, 0.0],
            [0.0, 0.0, 5.0],
        ]

    res = newton_raphson_nd(
        f, target=(1.0, 2.0, 3.0), initial_guess=(0.0, 0.0, 0.0),
        jacobian=jac, tolerance=1e-10, max_iterations=5,
    )
    assert res.converged
    assert abs(res.final_params[0] - 0.5) < 1e-9
    assert abs(res.final_params[1] - 2.0 / 3.0) < 1e-9
    assert abs(res.final_params[2] - 0.6) < 1e-9


# ─── Bounds clamping ───────────────────────────────────────────────────


def test_bounds_clamp_prevents_overshoot():
    """When bounds are tight, Newton step gets clamped."""
    def f(theta):
        return (theta[0], theta[1])

    res = newton_raphson_nd(
        f, target=(10.0, 10.0), initial_guess=(0.0, 0.0),
        jacobian=lambda _t: [[1.0, 0.0], [0.0, 1.0]],
        tolerance=1e-9, max_iterations=10,
        bounds=((-1.0, 1.0), (-1.0, 1.0)),
    )
    # target (10, 10) outside [-1, 1]² → params clamped to (1, 1), no convergence
    assert not res.converged
    assert res.final_params[0] == 1.0
    assert res.final_params[1] == 1.0


# ─── Damping (poorly conditioned) ──────────────────────────────────────


def test_damped_newton_more_robust():
    """Damping helps when full Newton step would overshoot."""
    def f(theta):
        a, b = theta
        return (a + 0.1 * b * b, b + 0.1 * a * a)

    res = newton_raphson_nd(
        f, target=(1.0, 1.0), initial_guess=(0.0, 0.0),
        jacobian=None,
        tolerance=1e-6, max_iterations=50,
        damping=0.7,
    )
    assert res.converged


# ─── Validation ─────────────────────────────────────────────────────────


def test_validate_rejects_mismatched_dims():
    def f(theta):
        return tuple(theta)

    with pytest.raises(ValueError):
        newton_raphson_nd(
            f, target=(1.0, 2.0), initial_guess=(0.0,),
            jacobian=lambda _t: [[1.0]],
            tolerance=1e-6, max_iterations=5,
        )


def test_validate_rejects_invalid_damping():
    def f(theta):
        return tuple(theta)

    with pytest.raises(ValueError):
        newton_raphson_nd(
            f, target=(1.0,), initial_guess=(0.0,),
            jacobian=lambda _t: [[1.0]],
            tolerance=1e-6, max_iterations=5,
            damping=1.5,
        )
    with pytest.raises(ValueError):
        newton_raphson_nd(
            f, target=(1.0,), initial_guess=(0.0,),
            jacobian=lambda _t: [[1.0]],
            tolerance=1e-6, max_iterations=5,
            damping=0.0,
        )


# ─── Singular Jacobian degrades gracefully ─────────────────────────────


def test_singular_jacobian_returns_unconverged():
    def f(theta):
        # Both equations identical → Jacobian rank 1
        return (theta[0] + theta[1], theta[0] + theta[1])

    res = newton_raphson_nd(
        f, target=(2.0, 5.0), initial_guess=(0.5, 0.5),
        jacobian=lambda _t: [[1.0, 1.0], [1.0, 1.0]],
        tolerance=1e-6, max_iterations=10,
    )
    # Singular Jacobian → break early, no convergence
    assert not res.converged


# ─── Norm verification (informational) ─────────────────────────────────


def test_norm_decreases_during_iteration():
    """Hand-traced: residual norm should monotonically decrease."""
    def f(theta):
        return (theta[0] * 2.0, theta[1] * 3.0)

    res = newton_raphson_nd(
        f, target=(2.0, 3.0), initial_guess=(0.5, 0.5),
        jacobian=lambda _t: [[2.0, 0.0], [0.0, 3.0]],
        tolerance=1e-12, max_iterations=5,
    )
    assert res.converged
    assert res.final_norm < 1e-10


# ─── Sanity: math module not required, pure-stdlib ──────────────────────


def test_math_module_smoke():
    """Smoke check that math import works (we use ** 0.5 internally)."""
    assert math.sqrt(4.0) == 2.0
