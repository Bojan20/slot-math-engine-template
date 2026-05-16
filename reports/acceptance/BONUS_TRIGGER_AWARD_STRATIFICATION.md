# BONUS_TRIGGER_AWARD_STRATIFICATION — Bonus Trigger Award Tier Stratification Acceptance

Generated: `2026-05-16T11:29:02.330Z`

## Headline

**6/6 configs PASS** at 300000 spins each = 1.80M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Bonus Trigger Award Tier Stratification" (Wave 152).

## Method

Closed-form scatter-Binomial analyzer:
  - S ~ Binomial(N, q) total scatter count per spin
  - **P(trigger) = Σ_{s≥S_min} C(N,s)·q^s·(1−q)^(N−s)**
  - **P(S=s | trigger) = P(S=s) / P(trigger)** — tier stratification
  - **E[K | trigger] = Σ_{s≥S_min} K(s)·P(S=s | trigger)**
  - **E[FS per spin] = P(trig)·E[K | trig] = Σ K(s)·P(S=s)**
  - **oneInNTriggerFrequency = 1 / P(trigger)** (regulator "1 in X")

MC: 300K spins per config, mulberry32 RNG, per-spin Binomial sampling.

## Configs

| Config | Pass | N | q | S_min | P(trig) | 1-in-N | E[FS/spin] |
|---|---|---|---|---|---|---|---|
| A_pragmatic_sweet_bonanza_3_4_5 | ✅ | 5 | 0.13 | 3 | 1.791% | 56 | 0.1857 |
| B_netent_vikings_3_4_5_high_top | ✅ | 5 | 0.10 | 3 | 0.856% | 117 | 0.0619 |
| C_microgaming_mega_moolah_4_scatter_only | ✅ | 5 | 0.12 | 4 | 0.094% | 1067 | 0.0241 |
| D_btg_megaways_6reel_3_4_5_6 | ✅ | 6 | 0.10 | 3 | 1.585% | 63 | 0.1651 |
| E_corner_5_scatter_only_rare | ✅ | 5 | 0.15 | 5 | 0.008% | 13169 | 0.0076 |
| F_corner_1_scatter_almost_always_triggers | ✅ | 5 | 0.20 | 1 | 67.232% | 1 | 1.1488 |

## Compliance context

- **UKGC RTS 14** — bonus trigger frequency + award tier disclosure
- **MGA PPD §11.f** — scatter mechanic + award schedule transparency
- **eCOGRA Generic Slots Audit** — verifies per-tier trigger rate matches engine
- Industry use: Pragmatic Sweet Bonanza family (3/4/5 = 10/15/20 FS),
  NetEnt Vikings tier awards, Hacksaw RIP City, IGT Cleopatra,
  Microgaming Mega Moolah (4-scatter only), BTG Megaways 6-reel.