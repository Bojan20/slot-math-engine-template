"""Multi-IR cohort simulation runner.

Drives a synthetic payout sampler over every discovered IR.

Sampler model
─────────────
Per-spin payout X ∈ ℝ≥0:
  • With probability p_hit, X is drawn from a discrete pay
    distribution scaled so E[X | hit] × p_hit ≈ target_rtp.
  • Otherwise X = 0.
  • Pay distribution: 3-tier (small / medium / large) Pareto-ish,
    parameterized by `volatility_proxy`.

This is engine-free and runs in O(spins × players) per IR.
"""
from __future__ import annotations
import json
import random
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from tools.portfolio.analyzer import metrics_for_ir


# ─── synthetic payout sampler ──────────────────────────────────────


@dataclass
class SyntheticPayoutDistribution:
    """3-tier discrete pay distribution scaled to a target RTP.

    Pays are emitted in `bet_unit` multiples (the player simulator
    treats every spin as 1 bet unit, so RTP = E[X / bet] under the
    sampler).
    """
    p_hit: float
    small_pay: float
    medium_pay: float
    large_pay: float
    p_small: float       # |hit
    p_medium: float      # |hit
    p_large: float       # |hit (1 - small - medium)
    target_rtp: float

    @classmethod
    def from_metrics(
        cls,
        *,
        target_rtp: float,
        hit_freq: float,
        volatility: float,
        bet_unit: float = 1.0,
    ) -> "SyntheticPayoutDistribution":
        if hit_freq <= 0:
            hit_freq = 0.20  # safe default
        # Volatility shapes the tier mix (high vol → more weight on
        # large pay; low vol → small pay dominates).
        vol = max(volatility, 0.5)
        p_large = max(0.005, min(0.10, 0.005 + 0.005 * (vol / 50.0)))
        p_medium = 0.20
        p_small = max(0.01, 1.0 - p_medium - p_large)
        # Set tier values: small ≈ 1×bet, medium ≈ 8×bet, large ≈ vol×bet
        small = bet_unit
        medium = 8 * bet_unit
        large = max(20.0, vol) * bet_unit
        # Conditional expectation if we plugged these in:
        ev_hit = p_small * small + p_medium * medium + p_large * large
        # Now scale to land at the target RTP:
        #   target_rtp = hit_freq × scale × ev_hit (per bet unit)
        #   scale = target_rtp / (hit_freq × ev_hit)
        if ev_hit <= 0:
            scale = 0.0
        else:
            scale = target_rtp / (hit_freq * ev_hit)
        return cls(
            p_hit=hit_freq,
            small_pay=small * scale,
            medium_pay=medium * scale,
            large_pay=large * scale,
            p_small=p_small,
            p_medium=p_medium,
            p_large=p_large,
            target_rtp=target_rtp,
        )

    def sample(self, rng: random.Random) -> float:
        if rng.random() >= self.p_hit:
            return 0.0
        r = rng.random()
        if r < self.p_large:
            return self.large_pay
        if r < self.p_large + self.p_medium:
            return self.medium_pay
        return self.small_pay


def synth_payout_sampler(ir: dict[str, Any], *,
                          target_rtp: float = 0.95,
                          bet_unit: float = 1.0,
                          ) -> SyntheticPayoutDistribution:
    """Build a synthetic sampler whose moments match the IR's
    Bernoulli RTP estimate + Shannon-entropy diversity."""
    m = metrics_for_ir(ir)
    rtp = (m.rtp_estimate if m.rtp_estimate and m.rtp_estimate > 0
           else target_rtp)
    hit = (m.hit_freq_estimate if m.hit_freq_estimate and m.hit_freq_estimate > 0
           else 0.20)
    vol = m.volatility_proxy or 10.0
    return SyntheticPayoutDistribution.from_metrics(
        target_rtp=rtp,
        hit_freq=min(hit, 0.9),
        volatility=vol,
        bet_unit=bet_unit,
    )


# ─── cohort simulation ────────────────────────────────────────────


@dataclass
class CohortRunResult:
    rel_path: str
    players: int
    max_spins: int
    starting_bankroll: float
    bet_unit: float
    bust_rate: float
    median_spins_to_bust: float | None
    median_end_bankroll_pct: float
    mean_total_pay: float
    measured_rtp: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "rel_path": self.rel_path,
            "players": self.players,
            "max_spins": self.max_spins,
            "starting_bankroll": self.starting_bankroll,
            "bet_unit": self.bet_unit,
            "bust_rate": self.bust_rate,
            "median_spins_to_bust": self.median_spins_to_bust,
            "median_end_bankroll_pct": self.median_end_bankroll_pct,
            "mean_total_pay": self.mean_total_pay,
            "measured_rtp": self.measured_rtp,
        }


def _simulate_one_player(
    sampler: SyntheticPayoutDistribution,
    *,
    starting_bankroll: float,
    bet_unit: float,
    max_spins: int,
    rng: random.Random,
) -> tuple[bool, int, float, float]:
    """Return (busted, spins_played, end_bankroll, total_pay)."""
    bankroll = starting_bankroll
    total_pay = 0.0
    for spin in range(1, max_spins + 1):
        if bankroll < bet_unit:
            return True, spin - 1, bankroll, total_pay
        bankroll -= bet_unit
        pay = sampler.sample(rng)
        bankroll += pay
        total_pay += pay
    return False, max_spins, bankroll, total_pay


def _simulate_cohort(
    sampler: SyntheticPayoutDistribution,
    *,
    players: int,
    starting_bankroll: float,
    bet_unit: float,
    max_spins: int,
    seed: int = 42,
) -> dict[str, Any]:
    rng = random.Random(seed)
    busts: list[int] = []
    end_bankrolls: list[float] = []
    total_pays: list[float] = []
    total_bet = 0.0
    total_paid = 0.0
    for i in range(players):
        sub_rng = random.Random(rng.random())
        busted, spins, end, paid = _simulate_one_player(
            sampler,
            starting_bankroll=starting_bankroll,
            bet_unit=bet_unit,
            max_spins=max_spins,
            rng=sub_rng,
        )
        end_bankrolls.append(end)
        total_pays.append(paid)
        total_bet += spins * bet_unit
        total_paid += paid
        if busted:
            busts.append(spins)
    bust_rate = len(busts) / max(players, 1)
    median_bust = (statistics.median(busts) if busts else None)
    median_pct = (
        statistics.median(b / starting_bankroll for b in end_bankrolls) * 100
    )
    measured = total_paid / max(total_bet, 1e-9)
    return {
        "bust_rate": bust_rate,
        "median_spins_to_bust": median_bust,
        "median_end_bankroll_pct": median_pct,
        "mean_total_pay": sum(total_pays) / max(players, 1),
        "measured_rtp": measured,
    }


# ─── portfolio driver ──────────────────────────────────────────────


@dataclass
class PortfolioCohortReport:
    games_root: str
    results: list[CohortRunResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": self.games_root,
            "results": [r.to_dict() for r in self.results],
        }

    def to_markdown(self) -> str:
        lines = [
            "# Cohort Simulation Portfolio Report",
            "",
            f"- games root: `{self.games_root}`",
            f"- IRs simulated: {len(self.results)}",
            "",
            "| IR | players | spins | bust % | med→bust | end % | rtp |",
            "|---|---|---|---|---|---|---|",
        ]
        for r in self.results:
            mb = "—" if r.median_spins_to_bust is None else f"{r.median_spins_to_bust:.0f}"
            lines.append(
                f"| `{r.rel_path}` | {r.players} | {r.max_spins} "
                f"| {r.bust_rate * 100:.1f}% | {mb} "
                f"| {r.median_end_bankroll_pct:.1f}% "
                f"| {r.measured_rtp:.4f} |"
            )
        return "\n".join(lines) + "\n"


DEFAULT_GLOBS = ("**/*.ir.json", "**/ir.json", "**/universal_ir.json")


def _discover_irs(games_root: Path,
                  globs: Iterable[str] = DEFAULT_GLOBS) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


def run_portfolio_cohort(
    games_root: Path,
    *,
    players: int = 500,
    max_spins: int = 1000,
    starting_bankroll: float = 200.0,
    bet_unit: float = 1.0,
    seed: int = 42,
    target_rtp_default: float = 0.95,
) -> PortfolioCohortReport:
    """Run cohort sim for every IR under `games_root`. Engine-free."""
    games_root = Path(games_root)
    paths = _discover_irs(games_root)
    results: list[CohortRunResult] = []
    for p in paths:
        try:
            ir = json.loads(p.read_text())
        except Exception:  # noqa: BLE001
            continue
        try:
            rel = str(p.relative_to(games_root))
        except ValueError:
            rel = str(p)
        sampler = synth_payout_sampler(
            ir, target_rtp=target_rtp_default, bet_unit=bet_unit
        )
        sim = _simulate_cohort(
            sampler,
            players=players,
            starting_bankroll=starting_bankroll,
            bet_unit=bet_unit,
            max_spins=max_spins,
            seed=seed,
        )
        results.append(CohortRunResult(
            rel_path=rel,
            players=players,
            max_spins=max_spins,
            starting_bankroll=starting_bankroll,
            bet_unit=bet_unit,
            **sim,
        ))
    return PortfolioCohortReport(games_root=str(games_root),
                                  results=results)
