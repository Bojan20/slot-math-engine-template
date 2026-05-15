# Optimizer Reproductions Targets

W152 Wave 16. These are **synthetic fixtures designed for reel-weight-only
optimisation reproduction** — not the full `tests/fixtures/reference/*.json`
suite, which contains paytable-dominated configs that need `parTuner`
non-linear payout scaling instead of `ReelStripOptimizer`'s gradient
descent on weights.

Each fixture here:
* Lines or Ways evaluation, 3-4 reel topology.
* 4-symbol palette (LP1, LP2, HP1, WLD) — one HP with a real payout, two
  LPs with small payouts, wild substitution.
* Initial weights deliberately *off-target* so the optimizer has measurable
  work to do (5-15 % RTP gap from `limits.target_rtp`).
* `limits.target_rtp` set such that the OPTIMUM exists strictly within the
  weight bounds [1, 1000] — no edge-of-feasibility traps.

The reproductions script (`scripts/optimizer-reproductions.mjs`) loads
every `*.json` here and runs `ReelStripOptimizer` against it. Pass
criterion: |finalRtp − targetRtp| ≤ 0.005 AND |crossValRtp − targetRtp|
≤ 0.005 at 50 000 spins under a different seed (overfit guard).
