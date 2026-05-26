"""RNG Quality Mini-Suite — NIST-STS-style randomness tests.

Each test returns an `RNGTestResult` with the test name, p-value,
verdict (pass / fail / inconclusive), and any diagnostic counters.

References:
  NIST SP 800-22 — A Statistical Test Suite for Random and
  Pseudorandom Number Generators for Cryptographic Applications.

Inputs are bit lists (each int 0 or 1). Helpers convert from
common formats (bytes, hex string).
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Sequence


DEFAULT_ALPHA = 0.01


# ─── data shapes ────────────────────────────────────────────────────


@dataclass
class RNGTestResult:
    name: str
    p_value: float
    passed: bool
    statistic: float
    diagnostic: dict = field(default_factory=dict)
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "p_value": self.p_value,
            "passed": self.passed,
            "statistic": self.statistic,
            "diagnostic": dict(self.diagnostic),
            "note": self.note,
        }


@dataclass
class RNGQualityReport:
    results: list[RNGTestResult] = field(default_factory=list)
    n_bits: int = 0
    alpha: float = DEFAULT_ALPHA

    @property
    def passed_all(self) -> bool:
        return all(r.passed for r in self.results)

    def to_dict(self) -> dict:
        return {
            "n_bits": self.n_bits,
            "alpha": self.alpha,
            "passed_all": self.passed_all,
            "results": [r.to_dict() for r in self.results],
        }

    def to_markdown(self) -> str:
        lines = [
            "# RNG Quality Report",
            "",
            f"- n_bits: {self.n_bits}",
            f"- alpha: {self.alpha}",
            f"- overall: {'✅ PASS' if self.passed_all else '🔴 FAIL'}",
            "",
            "| test | p-value | statistic | passed |",
            "|---|---|---|---|",
        ]
        for r in self.results:
            verd = "✅" if r.passed else "🔴"
            lines.append(
                f"| {r.name} | {r.p_value:.4f} | {r.statistic:.4f} | {verd} |"
            )
        return "\n".join(lines) + "\n"


# ─── input conversion ──────────────────────────────────────────────


def bits_from_bytes(data: bytes) -> list[int]:
    out: list[int] = []
    for b in data:
        for i in range(8):
            out.append((b >> (7 - i)) & 1)
    return out


def bits_from_hex(s: str) -> list[int]:
    s = s.strip().replace(" ", "").replace("\n", "")
    if len(s) % 2 == 1:
        s = "0" + s
    return bits_from_bytes(bytes.fromhex(s))


# ─── helpers ───────────────────────────────────────────────────────


def _erfc(x: float) -> float:
    """math.erfc shim — direct delegate."""
    return math.erfc(x)


def _igamc(s: float, x: float) -> float:
    """Regularized upper incomplete gamma function Q(s, x) by series
    fallback. Sufficient for the small s values used here (s ≤ K/2
    where K is the longest-run categories ≈ 6)."""
    if x < 0 or s <= 0:
        return 0.0
    if x == 0:
        return 1.0
    # Use continued fraction expansion (Lentz's algorithm) — converges
    # quickly for x > s + 1; for x < s + 1 series expansion is faster.
    if x < s + 1:
        # Series: P(s, x) = e^{-x} x^s / Γ(s) × Σ Γ(s) / Γ(s + 1 + n) x^n
        # Then Q = 1 - P.
        term = 1.0 / s
        total = term
        n = 1
        while n < 1000:
            term *= x / (s + n)
            total += term
            if abs(term) < abs(total) * 1e-15:
                break
            n += 1
        return 1.0 - math.exp(-x + s * math.log(x) - math.lgamma(s)) * total
    # Continued fraction
    b = x + 1 - s
    c = 1.0 / 1e-300
    d = 1.0 / b
    h = d
    for i in range(1, 1000):
        an = -i * (i - s)
        b += 2
        d = an * d + b
        if abs(d) < 1e-300:
            d = 1e-300
        c = b + an / c
        if abs(c) < 1e-300:
            c = 1e-300
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-15:
            break
    return math.exp(-x + s * math.log(x) - math.lgamma(s)) * h


# ─── tests ─────────────────────────────────────────────────────────


def monobit_test(bits: Sequence[int], *,
                 alpha: float = DEFAULT_ALPHA) -> RNGTestResult:
    """NIST SP 800-22 §2.1 — frequency (monobit) test."""
    n = len(bits)
    if n == 0:
        return RNGTestResult(
            name="monobit", p_value=0.0, passed=False, statistic=0.0,
            note="empty input",
        )
    s = sum(1 if b else -1 for b in bits)
    s_obs = abs(s) / math.sqrt(n)
    p = _erfc(s_obs / math.sqrt(2))
    return RNGTestResult(
        name="monobit",
        p_value=p,
        passed=p >= alpha,
        statistic=s_obs,
        diagnostic={"n": n, "sum_pm": s},
    )


def runs_test(bits: Sequence[int], *,
              alpha: float = DEFAULT_ALPHA) -> RNGTestResult:
    """NIST SP 800-22 §2.3 — runs test."""
    n = len(bits)
    if n < 100:
        return RNGTestResult(
            name="runs", p_value=0.0, passed=False, statistic=0.0,
            note="need ≥ 100 bits",
        )
    pi = sum(bits) / n
    tau = 2.0 / math.sqrt(n)
    if abs(pi - 0.5) >= tau:
        return RNGTestResult(
            name="runs",
            p_value=0.0,
            passed=False,
            statistic=abs(pi - 0.5),
            diagnostic={"pi": pi, "tau": tau},
            note="monobit imbalance — runs test inapplicable",
        )
    v = 1
    for i in range(1, n):
        if bits[i] != bits[i - 1]:
            v += 1
    p = _erfc(
        abs(v - 2 * n * pi * (1 - pi))
        / (2 * math.sqrt(2 * n) * pi * (1 - pi))
    )
    return RNGTestResult(
        name="runs",
        p_value=p,
        passed=p >= alpha,
        statistic=float(v),
        diagnostic={"n": n, "pi": pi, "v": v},
    )


def frequency_block_test(bits: Sequence[int], *,
                          block_size: int = 128,
                          alpha: float = DEFAULT_ALPHA) -> RNGTestResult:
    """NIST SP 800-22 §2.2 — block-frequency test."""
    n = len(bits)
    if n < block_size * 2:
        return RNGTestResult(
            name="frequency_block",
            p_value=0.0, passed=False, statistic=0.0,
            note=f"need ≥ {block_size * 2} bits",
        )
    N = n // block_size
    chi_sq = 0.0
    for i in range(N):
        block = bits[i * block_size:(i + 1) * block_size]
        pi_i = sum(block) / block_size
        chi_sq += (pi_i - 0.5) ** 2
    chi_sq *= 4 * block_size
    p = _igamc(N / 2, chi_sq / 2)
    return RNGTestResult(
        name="frequency_block",
        p_value=p,
        passed=p >= alpha,
        statistic=chi_sq,
        diagnostic={"n": n, "block_size": block_size, "blocks": N},
    )


def longest_run_test(bits: Sequence[int], *,
                      alpha: float = DEFAULT_ALPHA) -> RNGTestResult:
    """NIST SP 800-22 §2.4 — longest run of 1s in a block.

    Uses M = 128, N = ⌊n / M⌋, K = 5 categories per NIST spec
    (v ≤ 4, 5, 6, 7, 8, v ≥ 9).
    """
    n = len(bits)
    M = 128
    if n < M * 49:  # NIST guideline
        return RNGTestResult(
            name="longest_run",
            p_value=0.0, passed=False, statistic=0.0,
            note=f"need ≥ {M * 49} bits ({M * 49 // 8} bytes)",
        )
    N = n // M
    # Category buckets per NIST table 2-4 (K = 5)
    pi = [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124]
    cats = [0] * 6
    for i in range(N):
        block = bits[i * M:(i + 1) * M]
        longest = 0
        cur = 0
        for b in block:
            if b == 1:
                cur += 1
                if cur > longest:
                    longest = cur
            else:
                cur = 0
        if longest <= 4:
            cats[0] += 1
        elif longest == 5:
            cats[1] += 1
        elif longest == 6:
            cats[2] += 1
        elif longest == 7:
            cats[3] += 1
        elif longest == 8:
            cats[4] += 1
        else:
            cats[5] += 1
    chi_sq = 0.0
    for i, c in enumerate(cats):
        expected = N * pi[i]
        if expected > 0:
            chi_sq += (c - expected) ** 2 / expected
    p = _igamc(5 / 2, chi_sq / 2)
    return RNGTestResult(
        name="longest_run",
        p_value=p,
        passed=p >= alpha,
        statistic=chi_sq,
        diagnostic={"n": n, "blocks": N, "categories": cats},
    )


def cumulative_sum_test(bits: Sequence[int], *,
                         alpha: float = DEFAULT_ALPHA) -> RNGTestResult:
    """NIST SP 800-22 §2.13 — cumulative sums (forward direction)."""
    n = len(bits)
    if n < 100:
        return RNGTestResult(
            name="cumulative_sum",
            p_value=0.0, passed=False, statistic=0.0,
            note="need ≥ 100 bits",
        )
    s = 0
    max_excursion = 0
    for b in bits:
        s += 1 if b == 1 else -1
        if abs(s) > max_excursion:
            max_excursion = abs(s)
    # P-value uses tail approximation: Φ(z) where
    # z = max_excursion / sqrt(n). We use erfc-based two-tailed
    # equivalent: p ≈ erfc(z / sqrt(2)).
    z = max_excursion / math.sqrt(n)
    p = _erfc(z / math.sqrt(2))
    return RNGTestResult(
        name="cumulative_sum",
        p_value=p,
        passed=p >= alpha,
        statistic=z,
        diagnostic={"n": n, "max_excursion": max_excursion},
    )


# ─── full suite ────────────────────────────────────────────────────


def run_full_suite(bits: Sequence[int], *,
                    alpha: float = DEFAULT_ALPHA,
                    block_size: int = 128) -> RNGQualityReport:
    """Run every test and return the consolidated report."""
    results = [
        monobit_test(bits, alpha=alpha),
        frequency_block_test(bits, alpha=alpha, block_size=block_size),
        runs_test(bits, alpha=alpha),
        longest_run_test(bits, alpha=alpha),
        cumulative_sum_test(bits, alpha=alpha),
    ]
    return RNGQualityReport(results=results, n_bits=len(bits), alpha=alpha)
