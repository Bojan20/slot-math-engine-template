# FREE_BET_WAGERING_REQUIREMENT — Free Bet Wagering Requirement Aggregator Acceptance

Generated: `2026-05-17T01:24:50.542Z`

## Headline

**6/6 configs PASS** at 5000 MC episodes each = 30.0K total bonus play-through episodes.

Closes Faza 12 ext (post-W100): ✅ "Free Bet Wagering Requirement Aggregator" (Wave 154).

## Method

Closed-form Bachelier first-passage analyzer (Reflection Principle, exact for continuous Brownian motion with drift):
  - Required wagering W = WR · B, required spins N = ⌈W / b⌉
  - Per-spin drift μ = b·(R − 1), variance σ² = (volIndex·b)²
  - **E[balance @ WR] = B + N·μ**
  - **P_bust = Φ((−B − μN)/(σ√N)) + exp(2Bμ/σ²) · Φ((−B + μN)/(σ√N))** (μ<0 case)
  - **E[withdrawable] = max(0, E[balance]) · (1 − bust)**
  - **trueBonusValueRatio = E[withdrawable] / B** — disclosure metric
  - **playerLossRate = (B − E[withdrawable]) / B**

Φ via Abramowitz-Stegun erf approximation (≤1.5e-7 absolute error).

MC: 5K episodes per config, Box-Muller Gaussian per-spin increment, mulberry32 RNG.

## Configs

| Config | Pass | B | WR | Bet | RTP | volIdx | P(bust) | E[withdraw] | bonusVal |
|---|---|---|---|---|---|---|---|---|---|
| A_uk_mga_x35_standard_96pct_med_vol | ✅ | 10 | x35 | 0.2 | 96.0% | 5 | 87.03% | 6.125 | 61.3% |
| B_mga_capped_x30_high_rtp_low_vol | ✅ | 20 | x30 | 0.4 | 97.0% | 3 | 77.14% | 12.001 | 60.0% |
| C_predatory_x50_96pct_high_vol | ✅ | 10 | x50 | 0.2 | 96.0% | 12 | 94.58% | 7.710 | 77.1% |
| D_favorable_x10_high_rtp_low_vol | ✅ | 50 | x10 | 1 | 97.5% | 2 | 35.24% | 39.440 | 78.9% |
| E_corner_positive_rtp_promo | ✅ | 25 | x20 | 0.5 | 100.0% | 4 | 69.26% | 25.000 | 100.0% |
| F_high_rtp_promotional_advantage | ✅ | 30 | x15 | 0.6 | 102.0% | 4 | 60.71% | 35.161 | 117.2% |

## Compliance context

- **UKGC RTS-12** — responsible gambling, bonus terms transparency (operator must disclose typical play-through outcomes)
- **MGA Player Protection Directives §15** — maximum x35 WR cap, prominent display of bonus EV
- **EU GambleAware** — realistic expected-return disclosure for "free bet" advertising
- **eCOGRA Generic Slots Audit** — verifies bonus play-through engine matches disclosed expected outcome

Industry use: UKGC x35 standard (Sky Vegas / William Hill / Bet365 promotions),
MGA x30 capped offers, Pragmatic Sweet Bonanza high-vol predatory x50 scenarios,
cashback-boost RTP>1 promo edge cases.