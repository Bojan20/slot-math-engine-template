"""PHASE 41 — RNG Quality Extended Battery.

Augments W18 NIST STS subset (monobit/frequency_block/runs/longest_run/
cumulative_sum) with three additional tests:

  - approximate_entropy (NIST §2.12)
  - serial_test           (NIST §2.11)
  - block_frequency_var   (variance-of-block-frequencies sanity)

Pure stdlib (math + collections). Independent of W18 codebase so the
two batteries can be diffed for cross-implementation drift.

Public API:
    from tools.rng_extended import (
        BitStream,
        approximate_entropy,
        serial_test,
        block_frequency_var,
        run_extended_battery,
    )
"""

from __future__ import annotations

from tools.rng_extended.battery import (
    BitStream,
    BatteryResult,
    approximate_entropy,
    serial_test,
    block_frequency_var,
    run_extended_battery,
)

__all__ = [
    "BitStream",
    "BatteryResult",
    "approximate_entropy",
    "serial_test",
    "block_frequency_var",
    "run_extended_battery",
]
