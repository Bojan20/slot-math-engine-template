"""Synthetic spin event generator."""
from __future__ import annotations
import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class GeneratorConfig:
    n_players: int = 30
    spins_per_player: int = 100
    target_rtp: float = 0.96
    cv: float = 2.5            # volatility (stddev/mean of per-spin pay)
    bet_distribution: list[float] = field(
        default_factory=lambda: [1.0, 5.0, 25.0],  # bets per cohort tier
    )
    cohort_weights: list[float] = field(
        default_factory=lambda: [0.6, 0.3, 0.1],
    )
    seed: int = 42
    start_ts: float = 1_700_000_000.0


BUST_RATE: float = 0.30


def _sample_pay(rng: random.Random, bet: float, mean_rtp: float,
                cv: float) -> float:
    """Sample a per-spin pay aligning to mean_rtp ± cv·mean variance.

    A `BUST_RATE` fraction of spins return 0; the remaining spins are
    log-normal samples scaled so that the OVERALL mean matches
    `mean_rtp * bet` despite the busts.
    """
    if mean_rtp <= 0 or bet <= 0:
        return 0.0
    if rng.random() < BUST_RATE:
        return 0.0
    # Conditional mean on non-bust must compensate for bust drag.
    non_bust = max(1.0 - BUST_RATE, 1e-9)
    mean = (mean_rtp * bet) / non_bust
    sigma2 = math.log(1 + cv ** 2)
    mu = math.log(mean) - sigma2 / 2
    return rng.lognormvariate(mu, math.sqrt(sigma2))


def generate_events(cfg: GeneratorConfig) -> list[dict[str, Any]]:
    rng = random.Random(cfg.seed)
    if not cfg.bet_distribution or not cfg.cohort_weights:
        raise ValueError("bet_distribution and cohort_weights must be non-empty")
    if len(cfg.bet_distribution) != len(cfg.cohort_weights):
        raise ValueError("bet_distribution / cohort_weights length mismatch")
    if abs(sum(cfg.cohort_weights) - 1.0) > 1e-6:
        # auto-normalize
        s = sum(cfg.cohort_weights)
        cfg.cohort_weights = [w / s for w in cfg.cohort_weights]
    # CDF of cohort weights
    cdf = []
    acc = 0.0
    for w in cfg.cohort_weights:
        acc += w
        cdf.append(acc)
    events: list[dict[str, Any]] = []
    ts = cfg.start_ts
    for pi in range(cfg.n_players):
        r = rng.random()
        bet_idx = len(cdf) - 1
        for i, c in enumerate(cdf):
            if r < c:
                bet_idx = i
                break
        bet = cfg.bet_distribution[bet_idx]
        pid = f"p{pi:05d}"
        sid = f"s{pi:05d}_0"
        for _ in range(cfg.spins_per_player):
            pay = _sample_pay(rng, bet, cfg.target_rtp, cfg.cv)
            events.append({
                "player_id": pid,
                "session_id": sid,
                "bet": bet,
                "pay": pay,
                "ts": ts,
            })
            ts += 1.0
    return events


def generate_jsonl(cfg: GeneratorConfig, out_path: Path | str) -> int:
    events = generate_events(cfg)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        for ev in events:
            f.write(json.dumps(ev))
            f.write("\n")
    return len(events)
