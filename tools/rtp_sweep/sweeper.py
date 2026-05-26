"""RTP curve sweeper — parameter sweep over a closed-form kernel."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class SweepPoint:
    x: float
    y: float

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}


@dataclass
class SweepResult:
    param_name: str
    points: list[SweepPoint] = field(default_factory=list)

    @property
    def y_min(self) -> float:
        return min((p.y for p in self.points), default=0.0)

    @property
    def y_max(self) -> float:
        return max((p.y for p in self.points), default=0.0)

    @property
    def y_range(self) -> float:
        return self.y_max - self.y_min

    def to_dict(self) -> dict[str, Any]:
        return {
            "param_name": self.param_name,
            "n_points": len(self.points),
            "y_min": self.y_min,
            "y_max": self.y_max,
            "y_range": self.y_range,
            "points": [p.to_dict() for p in self.points],
        }


def _linspace(start: float, stop: float, n: int) -> list[float]:
    if n <= 0:
        return []
    if n == 1:
        return [start]
    step = (stop - start) / (n - 1)
    return [start + step * i for i in range(n)]


def sweep(
    fn: Callable[[float], float],
    *,
    param_name: str,
    start: float,
    stop: float,
    n: int = 21,
    xs: list[float] | None = None,
) -> SweepResult:
    """Sweep `fn(x)` over xs (or linspace start..stop, n points)."""
    if xs is None:
        xs = _linspace(start, stop, n)
    pts: list[SweepPoint] = []
    for x in xs:
        try:
            y = float(fn(x))
        except Exception:
            y = float("nan")
        pts.append(SweepPoint(x=x, y=y))
    return SweepResult(param_name=param_name, points=pts)


def ascii_chart(result: SweepResult, *, width: int = 50, height: int = 12) -> str:
    if not result.points:
        return "(empty sweep)\n"
    y_min = result.y_min
    y_max = result.y_max
    if y_max == y_min:
        y_max = y_min + 1.0
    x_min = min(p.x for p in result.points)
    x_max = max(p.x for p in result.points)
    if x_max == x_min:
        x_max = x_min + 1.0
    grid = [[" "] * width for _ in range(height)]
    for p in result.points:
        col = int((p.x - x_min) / (x_max - x_min) * (width - 1))
        row = (height - 1) - int(
            (p.y - y_min) / (y_max - y_min) * (height - 1)
        )
        if 0 <= row < height and 0 <= col < width:
            grid[row][col] = "•"
    lines = [
        f"  RTP sweep — {result.param_name}",
        f"  y_max = {y_max:.6f}",
    ]
    for row in grid:
        lines.append("  | " + "".join(row))
    lines.append(f"  y_min = {y_min:.6f}")
    lines.append(f"  x: [{x_min:.4f} … {x_max:.4f}]")
    return "\n".join(lines) + "\n"
