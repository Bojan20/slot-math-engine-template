"""PHASE 41 — RNG quality extended battery kernel."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True)
class BitStream:
    """Wrap a bit sequence (list of 0/1 ints)."""
    bits: tuple[int, ...]

    def __post_init__(self) -> None:
        for b in self.bits:
            if b not in (0, 1):
                raise ValueError(f"bit must be 0 or 1; got {b!r}")

    def __len__(self) -> int:
        return len(self.bits)


@dataclass
class BatteryResult:
    schema_version: str = "urn:slotmath:rng-extended:v1"
    n_bits: int = 0
    approximate_entropy_value: float = 0.0
    approximate_entropy_pass: bool = False
    serial_test_phi_m: float = 0.0
    serial_test_phi_m_minus_1: float = 0.0
    serial_test_chi_sq: float = 0.0
    block_frequency_variance: float = 0.0
    summary_all_passed: bool = False


# ─── approximate entropy ──────────────────────────────────────────────────


def approximate_entropy(bits: BitStream, m: int = 2) -> float:
    """NIST §2.12: ApEn(m) ≈ φ_m − φ_{m+1}.

    Returns a non-negative value; for a truly random stream ApEn ≈ ln 2 ≈ 0.693.
    """
    if m < 1:
        raise ValueError("m must be ≥ 1")
    n = len(bits)
    if n < m + 1:
        return 0.0

    def _phi(block_len: int) -> float:
        # Circular blocks per NIST recommendation
        seq = bits.bits + bits.bits[: block_len - 1]
        counts: Counter[tuple[int, ...]] = Counter()
        for i in range(n):
            counts[tuple(seq[i:i + block_len])] += 1
        return sum((c / n) * math.log(c / n) for c in counts.values())

    return _phi(m) - _phi(m + 1)


# ─── serial test ───────────────────────────────────────────────────────────


def serial_test(bits: BitStream, m: int = 3) -> tuple[float, float, float]:
    """NIST §2.11 serial test.

    Returns (ψ²_m, ψ²_{m-1}, Δψ² = ψ²_m − 2·ψ²_{m-1} + ψ²_{m-2}).
    Lower Δψ² → closer to uniform.
    """
    if m < 2:
        raise ValueError("m must be ≥ 2")
    n = len(bits)
    if n < m:
        return 0.0, 0.0, 0.0

    def _psi_sq(block_len: int) -> float:
        if block_len < 1:
            return 0.0
        seq = bits.bits + bits.bits[: block_len - 1]
        counts: Counter[tuple[int, ...]] = Counter()
        for i in range(n):
            counts[tuple(seq[i:i + block_len])] += 1
        s = sum(c * c for c in counts.values())
        return (s * (2 ** block_len) / n) - n

    psi_m = _psi_sq(m)
    psi_m_minus_1 = _psi_sq(m - 1)
    psi_m_minus_2 = _psi_sq(m - 2)
    delta = psi_m - 2 * psi_m_minus_1 + psi_m_minus_2
    return psi_m, psi_m_minus_1, delta


# ─── block frequency variance ────────────────────────────────────────────


def block_frequency_var(bits: BitStream, block_size: int = 128) -> float:
    """Variance of per-block ones-fraction; small for uniform streams."""
    if block_size < 1:
        raise ValueError("block_size must be ≥ 1")
    n = len(bits)
    if n < block_size:
        return 0.0
    n_blocks = n // block_size
    fractions: list[float] = []
    for b in range(n_blocks):
        block = bits.bits[b * block_size : (b + 1) * block_size]
        fractions.append(sum(block) / block_size)
    if not fractions:
        return 0.0
    mean = sum(fractions) / len(fractions)
    var = sum((f - mean) ** 2 for f in fractions) / len(fractions)
    return var


# ─── battery driver ───────────────────────────────────────────────────────


def run_extended_battery(
    bits: BitStream,
    *,
    apen_min: float = 0.55,       # below ln(2) but reasonable lower bound
    serial_delta_max: float = 50.0,
    block_var_max: float = 0.10,
) -> BatteryResult:
    """Run all three extended tests + emit aggregate pass/fail."""
    result = BatteryResult(n_bits=len(bits))
    apen = approximate_entropy(bits, m=2)
    psi_m, psi_m1, delta = serial_test(bits, m=3)
    var_bf = block_frequency_var(bits, block_size=min(128, max(1, len(bits) // 10)))
    result.approximate_entropy_value = apen
    result.approximate_entropy_pass = apen >= apen_min
    result.serial_test_phi_m = psi_m
    result.serial_test_phi_m_minus_1 = psi_m1
    result.serial_test_chi_sq = delta
    result.block_frequency_variance = var_bf
    result.summary_all_passed = (
        result.approximate_entropy_pass
        and abs(delta) <= serial_delta_max
        and var_bf <= block_var_max
    )
    return result
