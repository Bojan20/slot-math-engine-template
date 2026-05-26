"""W77 / P7.5 — Public Benchmark Suite.

Head-to-head benchmark against published commercial slot studio
metrics (Pragmatic, Push Gaming, NoLimit City, Hacksaw, BTG). For each
of our shipped game templates we emit:

  * our analytical RTP estimate (closed-form kernel)
  * the closest published reference game + its public RTP
  * |delta| RTP gap + accuracy band (green <0.5 %, yellow <1 %, red ≥1 %)
  * our build-time vs the industry standard 6-12 month dev cycle

Output: `benchmark.json` + `benchmark.md` + per-band Markdown table.
"""
from tools.public_benchmark.benchmark import (
    BenchmarkEntry,
    BenchmarkReport,
    build_benchmark,
    emit_benchmark,
)

__all__ = [
    "BenchmarkEntry",
    "BenchmarkReport",
    "build_benchmark",
    "emit_benchmark",
]
