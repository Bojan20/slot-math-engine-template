"""W7.3 — Player emulator implementation."""

from __future__ import annotations

import dataclasses
import math
import random
from typing import Iterable

from tools.symbolic_slot_math.model import RtpModel


# ─── Archetypes ─────────────────────────────────────────────────────


@dataclasses.dataclass
class PlayerArchetype:
    """Static profile of a behavioral class."""

    name: str
    initial_bankroll: float
    base_bet: float
    risk_tolerance: float
    """Probability the player accepts the *bet_up* action when the
    policy proposes it. Higher = more aggressive."""
    quit_threshold_loss: float
    """Player quits if cumulative losses ≥ this fraction of starting bankroll."""
    quit_threshold_win: float
    """Player quits if cumulative wins ≥ this fraction of starting bankroll."""
    max_session_spins: int


def casual_archetype() -> PlayerArchetype:
    return PlayerArchetype(
        name="casual",
        initial_bankroll=100.0,
        base_bet=1.0,
        risk_tolerance=0.2,
        quit_threshold_loss=0.4,
        quit_threshold_win=0.8,
        max_session_spins=300,
    )


def chaser_archetype() -> PlayerArchetype:
    return PlayerArchetype(
        name="chaser",
        initial_bankroll=100.0,
        base_bet=1.0,
        risk_tolerance=0.85,
        quit_threshold_loss=1.0,  # plays until bust
        quit_threshold_win=2.0,
        max_session_spins=1500,
    )


def volatility_seeker_archetype() -> PlayerArchetype:
    return PlayerArchetype(
        name="volatility_seeker",
        initial_bankroll=100.0,
        base_bet=2.0,
        risk_tolerance=0.6,
        quit_threshold_loss=0.7,
        quit_threshold_win=1.5,
        max_session_spins=800,
    )


# ─── Q-learning policy ──────────────────────────────────────────────


ACTIONS = ("continue", "bet_up", "bet_down", "quit")


@dataclasses.dataclass
class QLearningPolicy:
    """Tabular Q-policy over (bankroll_bucket, streak_state, last_action).

    States and actions are small enough that we keep the table in a
    plain dict; convergence on the simple slot loop happens in a few
    hundred episodes.
    """

    epsilon_start: float = 0.4
    epsilon_min: float = 0.02
    epsilon_decay: float = 0.995
    learning_rate: float = 0.1
    discount: float = 0.92
    seed: int = 12345

    bankroll_buckets: int = 10
    streak_buckets: int = 5

    table: dict[tuple, dict[str, float]] = dataclasses.field(default_factory=dict)
    epsilon: float = 0.0

    def __post_init__(self) -> None:
        self.epsilon = self.epsilon_start
        self._rng = random.Random(self.seed)

    def discretize(
        self, bankroll: float, initial: float, streak: int
    ) -> tuple:
        if initial <= 0:
            return (0, 0)
        ratio = max(0.0, min(2.0, bankroll / initial))
        b = min(self.bankroll_buckets - 1, int(ratio / (2.0 / self.bankroll_buckets)))
        s = max(-self.streak_buckets, min(self.streak_buckets, streak))
        return (b, s)

    def _q(self, state: tuple) -> dict[str, float]:
        if state not in self.table:
            self.table[state] = {a: 0.0 for a in ACTIONS}
        return self.table[state]

    def choose(self, state: tuple) -> str:
        q = self._q(state)
        if self._rng.random() < self.epsilon:
            return self._rng.choice(ACTIONS)
        best = max(q, key=q.get)
        return best

    def update(
        self,
        state: tuple,
        action: str,
        reward: float,
        next_state: tuple,
        done: bool,
    ) -> None:
        q = self._q(state)
        q_next = self._q(next_state)
        target = reward
        if not done:
            target += self.discount * max(q_next.values())
        q[action] += self.learning_rate * (target - q[action])

    def decay_epsilon(self) -> None:
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)


# ─── Session simulator ──────────────────────────────────────────────


@dataclasses.dataclass
class SessionTrace:
    archetype_name: str
    initial_bankroll: float
    final_bankroll: float
    spins_played: int
    total_wagered: float
    total_won: float
    busted: bool
    quit_voluntarily: bool
    bankroll_curve: list[float] = dataclasses.field(default_factory=list)

    @property
    def ltv(self) -> float:
        """Lifetime value (net loss to the house)."""
        return self.total_wagered - self.total_won

    @property
    def hold_pct(self) -> float:
        if self.total_wagered <= 0:
            return 0.0
        return (self.total_wagered - self.total_won) / self.total_wagered

    def to_dict(self) -> dict:
        return {
            "archetype": self.archetype_name,
            "initial_bankroll": self.initial_bankroll,
            "final_bankroll": self.final_bankroll,
            "spins_played": self.spins_played,
            "total_wagered": self.total_wagered,
            "total_won": self.total_won,
            "busted": self.busted,
            "quit_voluntarily": self.quit_voluntarily,
            "ltv": self.ltv,
            "hold_pct": self.hold_pct,
            "bankroll_curve_len": len(self.bankroll_curve),
        }


@dataclasses.dataclass
class SessionSimulator:
    """Drives one PlayerArchetype against a slot model.

    The slot is modeled by its closed-form RTP + CV (via
    :class:`RtpModel`). Per-spin win is sampled from a heavy-tail
    log-normal whose mean = bet × RTP and stddev = bet × RTP × CV
    (with a small-probability "big-win" mass added on top to mimic
    the bonus / scatter tail).
    """

    archetype: PlayerArchetype
    model: RtpModel
    policy: QLearningPolicy
    big_win_p: float = 0.005
    big_win_mult: float = 100.0
    rng_seed: int = 42

    def simulate(self, *, train: bool = True) -> SessionTrace:
        rng = random.Random(self.rng_seed)
        bankroll = self.archetype.initial_bankroll
        initial = bankroll
        bet = self.archetype.base_bet
        streak = 0
        wagered = 0.0
        won = 0.0
        curve: list[float] = [bankroll]
        rtp = self.model.rtp()
        cv = max(self.model.volatility_cv(), 0.1)
        quit_voluntarily = False
        busted = False
        spins = 0

        while spins < self.archetype.max_session_spins:
            if bankroll < bet:
                busted = True
                break
            if (
                initial - bankroll
                >= initial * self.archetype.quit_threshold_loss
            ):
                quit_voluntarily = True
                break
            if bankroll - initial >= initial * self.archetype.quit_threshold_win:
                quit_voluntarily = True
                break

            state = self.policy.discretize(bankroll, initial, streak)
            action = self.policy.choose(state)

            # Translate action to bet adjustment (risk-tolerance gates).
            if action == "quit":
                quit_voluntarily = True
                break
            if action == "bet_up" and rng.random() < self.archetype.risk_tolerance:
                bet = min(bankroll, bet * 1.5)
            elif action == "bet_down":
                bet = max(0.25, bet * 0.75)

            # Sample a spin payout.
            payout = _sample_spin(
                rng, bet=bet, rtp=rtp, cv=cv,
                big_win_p=self.big_win_p, big_win_mult=self.big_win_mult,
            )
            bankroll -= bet
            bankroll += payout
            wagered += bet
            won += payout
            spins += 1
            curve.append(bankroll)
            streak = streak + 1 if payout > bet else streak - 1

            if train:
                next_state = self.policy.discretize(bankroll, initial, streak)
                reward = (payout - bet) / max(initial, 1e-6)
                done = (
                    bankroll < bet
                    or initial - bankroll
                    >= initial * self.archetype.quit_threshold_loss
                )
                self.policy.update(state, action, reward, next_state, done)

        if train:
            self.policy.decay_epsilon()

        return SessionTrace(
            archetype_name=self.archetype.name,
            initial_bankroll=initial,
            final_bankroll=bankroll,
            spins_played=spins,
            total_wagered=wagered,
            total_won=won,
            busted=busted,
            quit_voluntarily=quit_voluntarily,
            bankroll_curve=curve,
        )


def _sample_spin(
    rng: random.Random,
    *,
    bet: float,
    rtp: float,
    cv: float,
    big_win_p: float,
    big_win_mult: float,
) -> float:
    """Sample one spin's payout from a log-normal with a heavy-tail spike.

    Mean = bet × rtp; CV = closed-form CV; with `big_win_p` probability
    add a `big_win_mult × bet` jackpot bonus to mimic bonus / scatter
    tails.
    """
    mean = max(0.0, bet * rtp)
    if mean == 0.0:
        return 0.0
    sigma = math.sqrt(math.log(1.0 + cv * cv))
    mu = math.log(mean) - 0.5 * sigma * sigma
    base = math.exp(mu + sigma * rng.gauss(0.0, 1.0))
    if rng.random() < big_win_p:
        base += big_win_mult * bet
    return max(0.0, base)


# ─── KPI aggregation ────────────────────────────────────────────────


@dataclasses.dataclass
class KPIReport:
    archetype: str
    sessions: int
    avg_ltv: float
    p50_ltv: float
    p99_ltv: float
    bust_rate: float
    voluntary_quit_rate: float
    avg_spins: float
    avg_hold_pct: float

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


def _quantile(xs: list[float], q: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    if len(s) == 1:
        return s[0]
    idx = q * (len(s) - 1)
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    if lo == hi:
        return s[lo]
    frac = idx - lo
    return s[lo] * (1.0 - frac) + s[hi] * frac


def aggregate_kpis(traces: Iterable[SessionTrace]) -> KPIReport:
    traces = list(traces)
    if not traces:
        return KPIReport(
            archetype="<none>", sessions=0,
            avg_ltv=0.0, p50_ltv=0.0, p99_ltv=0.0,
            bust_rate=0.0, voluntary_quit_rate=0.0,
            avg_spins=0.0, avg_hold_pct=0.0,
        )
    arch = traces[0].archetype_name
    n = len(traces)
    ltvs = [t.ltv for t in traces]
    busts = sum(1 for t in traces if t.busted)
    quits = sum(1 for t in traces if t.quit_voluntarily)
    return KPIReport(
        archetype=arch,
        sessions=n,
        avg_ltv=sum(ltvs) / n,
        p50_ltv=_quantile(ltvs, 0.5),
        p99_ltv=_quantile(ltvs, 0.99),
        bust_rate=busts / n,
        voluntary_quit_rate=quits / n,
        avg_spins=sum(t.spins_played for t in traces) / n,
        avg_hold_pct=sum(t.hold_pct for t in traces) / n,
    )


def run_cohort(
    archetype: PlayerArchetype,
    model: RtpModel,
    *,
    n_players: int = 20,
    sessions_per_player: int = 5,
    train: bool = True,
    base_seed: int = 12345,
) -> tuple[KPIReport, list[SessionTrace]]:
    """Train+evaluate a cohort. Returns (aggregated KPIs, all traces)."""
    if n_players < 1 or sessions_per_player < 1:
        raise ValueError("n_players and sessions_per_player must be >= 1")
    policy = QLearningPolicy(seed=base_seed)
    traces: list[SessionTrace] = []
    sess_id = 0
    for _player in range(n_players):
        for _ in range(sessions_per_player):
            sim = SessionSimulator(
                archetype=archetype,
                model=model,
                policy=policy,
                rng_seed=base_seed + sess_id,
            )
            traces.append(sim.simulate(train=train))
            sess_id += 1
    kpi = aggregate_kpis(traces)
    return kpi, traces
