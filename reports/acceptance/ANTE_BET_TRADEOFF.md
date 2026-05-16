# ANTE_BET_TRADEOFF — Ante Bet / Bet Boost Decision Math Acceptance

Generated: `2026-05-16T05:17:00.608Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 4.8 extension: ✅ "Ante Bet / Bet Boost Trade-Off Analyzer" (Wave 95).

## Method

Closed-form decision math:
  - base RTP = μ_0 / 1, ante RTP = μ_a / (1+a)
  - anteIsPositiveEV iff RTP_a > RTP_b
  - boost premium = (RTP_a − RTP_b) / RTP_b
  - 2-sigma crossover N* = 4σ² / μ_net²
  - Aggregate RTP weighted by adoption fraction f (optional)

MC: 100K spins per config (both modes parallel), deterministic mulberry32 + exact 2-point distribution.

## Configs

| Config | Pass | base RTP_CF | base RTP_MC | ante RTP_CF | ante RTP_MC | +EV? |
|---|---|---|---|---|---|---|
| A_pragmatic_ante_positive_EV | ✅ | 0.9600 | 0.9471 | 0.9800 | 0.9913 | ✅ +EV |
| B_neutral_player_trap | ✅ | 0.9600 | 0.9471 | 0.9600 | 0.9721 | ❌ −EV |
| C_negative_EV_ante | ✅ | 0.9600 | 0.9471 | 0.6667 | 0.6710 | ❌ −EV |
| D_high_boost_aggressive | ✅ | 0.9600 | 0.9471 | 1.0100 | 1.0126 | ✅ +EV |
| E_with_adoption_30pct | ✅ | 0.9600 | 0.9471 | 0.9800 | 0.9913 | ✅ +EV |
| F_low_premium_minor_boost | ✅ | 0.9500 | 0.9352 | 0.9600 | 0.9717 | ✅ +EV |

## Decision metrics (per config)

| Config | boost premium | base house | ante house | base N* (2σ) | ante N* (2σ) | aggregate RTP |
|---|---|---|---|---|---|---|
| A_pragmatic_ante_positive_EV | 2.083% | 4.00% | 2.00% | 25000 | 115201 | n/a |
| B_neutral_player_trap | 0.000% | 4.00% | 4.00% | 25000 | 27778 | n/a |
| C_negative_EV_ante | -30.556% | 4.00% | 33.33% | 25000 | 320 | n/a |
| D_high_boost_aggressive | 5.208% | 4.00% | -1.00% | 25000 | 768001 | n/a |
| E_with_adoption_30pct | 2.083% | 4.00% | 2.00% | 25000 | 115201 | 0.9670 |
| F_low_premium_minor_boost | 1.053% | 5.00% | 4.00% | 12800 | 24794 | n/a |

## Compliance context

- **UKGC RTS 12** — per-mode RTP disclosure required
- **MGA PPD §11.f** — variance comparison across modes required
- **Regulator-flag detection** — ante RTP == base RTP → "player trap" warning
- Industry use: Pragmatic Ante Bet, Wazdan Ante Bet, NetEnt Bet Boost