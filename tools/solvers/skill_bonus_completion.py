"""Closed-form kernel — Skill Bonus Completion.

Industry pattern (Class III "skill-influenced" bonuses, gamified
features): player triggers a bonus, then plays a short skill task
with probabilistic success. Operator chooses calibration so the
*expected* RTP is fixed even though individual players experience
variance based on skill.

For trigger probability `p_trigger`, expected skill-task success
rate `p_success`, success pay `pay_success`, and failure pay
`pay_failure`:

  RTP_contribution = p_trigger · (
        p_success · pay_success + (1 - p_success) · pay_failure
  )

Multi-stage skill bonus: independent stages, each with success rate
`stage_success`, awarding `stage_pays[k]` for completing exactly k
stages out of N total:

  P(complete = k) = C(N, k) · p^k · (1 - p)^(N-k)
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class SkillBonusParams:
    p_trigger: float
    p_success: float           # avg per-stage success rate
    n_stages: int              # >= 1
    stage_pays: list[float]    # stage_pays[k] paid for k successes (k=0..N)


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_pmf(n: int, k: int, p: float) -> float:
    if not (0 <= k <= n):
        return 0.0
    return math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k))


def expected_payout_per_trigger(p: SkillBonusParams) -> float:
    if p.n_stages <= 0:
        raise ValueError("n_stages must be > 0")
    if len(p.stage_pays) < p.n_stages + 1:
        raise ValueError("stage_pays must have length n_stages + 1")
    if not (0.0 <= p.p_success <= 1.0):
        raise ValueError("p_success out of [0, 1]")
    total = 0.0
    for k in range(p.n_stages + 1):
        pmf = _binomial_pmf(p.n_stages, k, p.p_success)
        total += pmf * p.stage_pays[k]
    return total


def analytical_rtp(p: SkillBonusParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    return p.p_trigger * expected_payout_per_trigger(p)


def mc_simulate(p: SkillBonusParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        successes = sum(1 for _ in range(p.n_stages)
                        if rng.random() < p.p_success)
        if 0 <= successes < len(p.stage_pays):
            total += p.stage_pays[successes]
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }
