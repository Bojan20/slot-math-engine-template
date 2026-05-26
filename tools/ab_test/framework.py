"""A/B comparison framework for two slot IR variants.

Uses W17 synthetic cohort sampler so it's engine-binary-free and
runs in CI.

Statistical test: Welch's two-sample t-test on per-player end-bankroll
percentages. Reports p-value and effect size (Cohen's d).
"""
from __future__ import annotations
import math
import random
import statistics
from dataclasses import dataclass, field
from typing import Any

from tools.cohort_runner import synth_payout_sampler


@dataclass
class ABVariantResult:
    label: str
    players: int
    max_spins: int
    starting_bankroll: float
    bust_rate: float
    mean_end_bankroll_pct: float
    measured_rtp: float
    end_bankrolls: list[float] = field(default_factory=list)
    spins_played: list[int] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "players": self.players,
            "max_spins": self.max_spins,
            "starting_bankroll": self.starting_bankroll,
            "bust_rate": self.bust_rate,
            "mean_end_bankroll_pct": self.mean_end_bankroll_pct,
            "measured_rtp": self.measured_rtp,
        }


@dataclass
class ABComparison:
    variant_a: ABVariantResult
    variant_b: ABVariantResult
    p_value: float
    cohen_d: float
    verdict: str          # "A wins" | "B wins" | "tie"
    alpha: float = 0.05

    @property
    def significant(self) -> bool:
        return self.p_value < self.alpha

    def to_dict(self) -> dict[str, Any]:
        return {
            "variant_a": self.variant_a.to_dict(),
            "variant_b": self.variant_b.to_dict(),
            "p_value": self.p_value,
            "cohen_d": self.cohen_d,
            "verdict": self.verdict,
            "alpha": self.alpha,
            "significant": self.significant,
        }


# ─── simulation ────────────────────────────────────────────────────


def _simulate_variant(
    ir: dict,
    *,
    label: str,
    players: int,
    max_spins: int,
    starting_bankroll: float,
    bet_unit: float,
    target_rtp: float,
    seed: int,
) -> ABVariantResult:
    sampler = synth_payout_sampler(ir, target_rtp=target_rtp,
                                     bet_unit=bet_unit)
    rng = random.Random(seed)
    end_bankrolls: list[float] = []
    spins_played: list[int] = []
    busts = 0
    total_bet = 0.0
    total_pay = 0.0
    for _ in range(players):
        sub_rng = random.Random(rng.random())
        bankroll = starting_bankroll
        spins = 0
        for spin_idx in range(max_spins):
            if bankroll < bet_unit:
                busts += 1
                break
            bankroll -= bet_unit
            pay = sampler.sample(sub_rng)
            bankroll += pay
            total_bet += bet_unit
            total_pay += pay
            spins = spin_idx + 1
        end_bankrolls.append(bankroll)
        spins_played.append(spins)
    return ABVariantResult(
        label=label,
        players=players,
        max_spins=max_spins,
        starting_bankroll=starting_bankroll,
        bust_rate=busts / max(players, 1),
        mean_end_bankroll_pct=(
            statistics.mean(b / starting_bankroll for b in end_bankrolls) * 100
        ),
        measured_rtp=total_pay / max(total_bet, 1e-12),
        end_bankrolls=end_bankrolls,
        spins_played=spins_played,
    )


# ─── statistics ────────────────────────────────────────────────────


def _welch_t_p(xs: list[float], ys: list[float]) -> float:
    """Two-sample Welch's t-test → p-value via normal approximation
    (no scipy)."""
    if len(xs) < 2 or len(ys) < 2:
        return 1.0
    mx, my = statistics.mean(xs), statistics.mean(ys)
    vx = statistics.variance(xs)
    vy = statistics.variance(ys)
    nx, ny = len(xs), len(ys)
    se = math.sqrt(vx / nx + vy / ny)
    if se <= 0:
        return 1.0
    t = (mx - my) / se
    # Normal approx (df large)
    return math.erfc(abs(t) / math.sqrt(2))


def _cohen_d(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2 or len(ys) < 2:
        return 0.0
    mx, my = statistics.mean(xs), statistics.mean(ys)
    vx = statistics.variance(xs)
    vy = statistics.variance(ys)
    nx, ny = len(xs), len(ys)
    pooled = math.sqrt(
        ((nx - 1) * vx + (ny - 1) * vy) / max(nx + ny - 2, 1)
    )
    if pooled <= 0:
        return 0.0
    return (mx - my) / pooled


# ─── top-level ─────────────────────────────────────────────────────


def compare_irs(
    ir_a: dict,
    ir_b: dict,
    *,
    players: int = 500,
    max_spins: int = 1000,
    starting_bankroll: float = 200.0,
    bet_unit: float = 1.0,
    target_rtp_a: float = 0.95,
    target_rtp_b: float = 0.95,
    seed: int = 42,
    alpha: float = 0.05,
    label_a: str = "A",
    label_b: str = "B",
) -> ABComparison:
    a = _simulate_variant(
        ir_a, label=label_a, players=players, max_spins=max_spins,
        starting_bankroll=starting_bankroll, bet_unit=bet_unit,
        target_rtp=target_rtp_a, seed=seed,
    )
    b = _simulate_variant(
        ir_b, label=label_b, players=players, max_spins=max_spins,
        starting_bankroll=starting_bankroll, bet_unit=bet_unit,
        target_rtp=target_rtp_b, seed=seed + 1,   # different seed slice
    )
    a_pct = [x / starting_bankroll for x in a.end_bankrolls]
    b_pct = [x / starting_bankroll for x in b.end_bankrolls]
    p = _welch_t_p(a_pct, b_pct)
    d = _cohen_d(a_pct, b_pct)
    if p >= alpha:
        verdict = "tie"
    elif a.mean_end_bankroll_pct > b.mean_end_bankroll_pct:
        verdict = f"{label_a} wins"
    else:
        verdict = f"{label_b} wins"
    return ABComparison(
        variant_a=a, variant_b=b,
        p_value=p, cohen_d=d, verdict=verdict, alpha=alpha,
    )
