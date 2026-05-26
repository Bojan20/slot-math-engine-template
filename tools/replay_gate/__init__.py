"""W21 — Replay Determinism Gate.

Given (IR + seed + canonical spin log of expected outputs), re-run
the synthetic Bernoulli sampler with the same seed and verify the
output stream is bit-identical to the recorded log.

Use cases:
  • Studio publishes a spin-log fixture alongside an IR (replay.json
    with seed + bet + spin_outputs). RGS verifies it on load — if the
    output stream doesn't reproduce, the IR was tampered.
  • CI gate: every IR is run with a fixed seed; first run captures
    baseline (`--update`); subsequent runs assert determinism.
"""
from tools.replay_gate.gate import (
    ReplayBaseline,
    ReplayResult,
    record_baseline,
    replay_check,
    save_baseline,
    load_baseline,
)

__all__ = [
    "ReplayBaseline",
    "ReplayResult",
    "record_baseline",
    "replay_check",
    "save_baseline",
    "load_baseline",
]
