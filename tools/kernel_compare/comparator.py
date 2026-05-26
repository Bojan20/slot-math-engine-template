"""Kernel comparator — pointwise + proportionality tests."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class KernelComparisonResult:
    n_points: int
    max_abs_diff: float
    max_rel_diff: float
    proportionality_ratio: float | None
    equivalent: bool
    proportional: bool
    points: list[tuple[float, float, float]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_points": self.n_points,
            "max_abs_diff": self.max_abs_diff,
            "max_rel_diff": self.max_rel_diff,
            "proportionality_ratio": self.proportionality_ratio,
            "equivalent": self.equivalent,
            "proportional": self.proportional,
            "points": [list(p) for p in self.points],
        }


def compare_kernels(
    fn_a: Callable[[float], float],
    fn_b: Callable[[float], float],
    *,
    xs: list[float],
    abs_tolerance: float = 1e-6,
    rel_tolerance: float = 1e-4,
) -> KernelComparisonResult:
    """Point-by-point compare two kernels f_a(x) vs f_b(x) across xs."""
    max_abs = 0.0
    max_rel = 0.0
    pts: list[tuple[float, float, float]] = []
    for x in xs:
        a = float(fn_a(x))
        b = float(fn_b(x))
        delta = abs(a - b)
        rel = delta / max(abs(a), 1e-12)
        max_abs = max(max_abs, delta)
        max_rel = max(max_rel, rel)
        pts.append((x, a, b))
    equiv = max_abs <= abs_tolerance or max_rel <= rel_tolerance
    return KernelComparisonResult(
        n_points=len(xs),
        max_abs_diff=max_abs,
        max_rel_diff=max_rel,
        proportionality_ratio=None,
        equivalent=equiv,
        proportional=False,
        points=pts,
    )


def proportionality_test(
    fn_a: Callable[[float], float],
    fn_b: Callable[[float], float],
    *,
    xs: list[float],
    rel_tolerance: float = 0.01,
) -> KernelComparisonResult:
    """Check whether f_a(x) = k · f_b(x) for some constant k across xs."""
    ratios: list[float] = []
    pts: list[tuple[float, float, float]] = []
    max_abs = 0.0
    max_rel = 0.0
    for x in xs:
        a = float(fn_a(x))
        b = float(fn_b(x))
        pts.append((x, a, b))
        if abs(b) < 1e-12:
            continue
        ratios.append(a / b)
        max_abs = max(max_abs, abs(a - b))
        max_rel = max(max_rel, abs(a - b) / max(abs(a), 1e-12))
    if not ratios:
        return KernelComparisonResult(
            n_points=len(xs), max_abs_diff=max_abs, max_rel_diff=max_rel,
            proportionality_ratio=None,
            equivalent=False, proportional=False,
            points=pts,
        )
    mean_ratio = sum(ratios) / len(ratios)
    # Check ratios are stable to within rel_tolerance
    spread = max(abs(r - mean_ratio) for r in ratios) / abs(mean_ratio) if mean_ratio != 0 else 0
    is_prop = spread <= rel_tolerance
    return KernelComparisonResult(
        n_points=len(xs), max_abs_diff=max_abs, max_rel_diff=max_rel,
        proportionality_ratio=mean_ratio if is_prop else None,
        equivalent=False,
        proportional=is_prop,
        points=pts,
    )
