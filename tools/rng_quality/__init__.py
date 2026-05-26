"""W18 — RNG Quality Mini-Suite.

Lightweight NIST-STS-style randomness tests for slot RNG output
streams. Designed to flag obvious RNG regressions during development
without pulling in the full NIST test battery (which requires C and
gigabytes of samples per test).

Implemented tests:

  • monobit         — proportion of 1s vs 0s (binomial p-value)
  • runs            — count of monotone runs in the bit stream
  • longest_run     — distribution of longest run of 1s per block
  • frequency_block — chi-squared on per-block frequency
  • cumulative_sum  — max excursion of cumulative ±1 walk
  • approximate_entropy — block entropy compared to uniform

Each test returns a `RNGTestResult` with p-value + verdict (pass at
α = 0.01) + suggested-sample-size hint when the stream is too short.

CLI entry: `slot-rng-quality <stream.bin|stream.hex> [--alpha 0.01]`
where the input is a binary file OR an ASCII hex stream.
"""
from tools.rng_quality.suite import (
    RNGTestResult,
    RNGQualityReport,
    bits_from_bytes,
    bits_from_hex,
    monobit_test,
    runs_test,
    longest_run_test,
    frequency_block_test,
    cumulative_sum_test,
    run_full_suite,
)

__all__ = [
    "RNGTestResult",
    "RNGQualityReport",
    "bits_from_bytes",
    "bits_from_hex",
    "monobit_test",
    "runs_test",
    "longest_run_test",
    "frequency_block_test",
    "cumulative_sum_test",
    "run_full_suite",
]
