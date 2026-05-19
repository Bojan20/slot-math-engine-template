---
title: "Case Study 2 — Indie Studio ships first jackpot game in 21 days"
operator: "Indie Studio X"
publishDate: 2026-05-12
industry: "Indie slot studio / first jackpot"
metrics:
  team_size: 4
  prior_jackpot_experience: 0
  days_to_first_playable: 9
  days_to_certified_build: 21
  cert_pass_rate_percent: 100
---

# Case Study 2 — Indie Studio X: First jackpot in 21 days

## Problem statement

Indie Studio X is a four-person studio with two non-jackpot titles in market. Their next title was a 4-tier mystery progressive jackpot with a shared pool across 12 future games. None of the team had built a jackpot before. The conventional path — hire a math consultant, model in spreadsheets, hand off to a third-party verifier, await certification — was quoted at 16 weeks plus $40K in consulting fees.

## Solution

The studio adopted the slot-math-engine Indie tier and used the closed-form jackpot solver (W067 + W071) to derive contribution rates, seed values and reset rules directly from a single IR file. The studio's CTO drove the math; no external consultant was engaged.

## Math model used

* Closed-form mystery-progressive solver (W067)
* Multi-pool shared-jackpot accounting (W071)
* RTP attribution kernel — split base-game RTP vs jackpot contribution
* MC validator at 1e8 spins for paper trail (closed-form is the source of truth)

## Timeline

| Day | Milestone |
| --- | --- |
| 0   | Studio kick-off, IR scaffold generated |
| 3   | Jackpot tiers (Mini / Minor / Major / Grand) defined |
| 9   | First playable build, math RTP locked at 95.20% |
| 14  | Operator-package produced, GLI-19 submission |
| 21  | Certification returned PASS, build delivered to first operator |

## Results

* 21 days from kick-off to certified build (vs 16-week consultant quote)
* $40K saved on external math consulting
* 95.20% target RTP within 0.01 pp on first submission
* Single config file controls all 4 tiers + 12 future games sharing the pool

## Lessons

1. Closed-form solvers transform jackpot math from a specialist task into a config exercise. A studio CTO without prior jackpot experience finished it in three days.
2. Shared-pool accounting becomes trivial when expressed as a contribution-rate algebra rather than a stateful simulation.
3. The MC validation step is still useful for the cert paper trail even when the closed-form result is canonical — auditors expect both signals.

> "We did our first jackpot title in three weeks with no math consultant. The math engine is a force multiplier for a small team."
> — <Role at Operator>, Indie Studio X
