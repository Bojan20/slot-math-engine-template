"""W17 — Multi-IR Cohort Simulation Runner.

For every IR under `games/`, runs an engine-free synthetic cohort
simulation (M players × N spins per cohort) using the IR's Bernoulli
RTP + hit-frequency estimate as the payout-sampler seed. Aggregates
per-game survival metrics:

  • mean bust rate (% players bankroll → 0 before max_spins)
  • median spins-to-bust
  • median end-bankroll (% of start)
  • per-strategy comparison (flat-bet / martingale / kelly)

Emits cohort-report.json + Markdown table + HTML dashboard.

Engine-free design means this runs in CI without needing slot-sim
to be built — useful as a "behavioral smoke test" across the entire
portfolio. Real-engine cohort sim remains available via
`slot-player-sim` for per-game deep dives.
"""
from tools.cohort_runner.runner import (
    CohortRunResult,
    PortfolioCohortReport,
    SyntheticPayoutDistribution,
    run_portfolio_cohort,
    synth_payout_sampler,
)

__all__ = [
    "CohortRunResult",
    "PortfolioCohortReport",
    "SyntheticPayoutDistribution",
    "run_portfolio_cohort",
    "synth_payout_sampler",
]
