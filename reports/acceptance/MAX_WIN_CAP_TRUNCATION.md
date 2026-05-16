# MAX_WIN_CAP_TRUNCATION — Max Win Cap Truncation Analyzer Acceptance

Generated: `2026-05-16T11:09:38.072Z`

## Headline

**6/6 configs PASS** at 200000 spins each = 1.20M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Max Win Cap Truncation Analyzer" (Wave 148).

## Method

Closed-form discrete payout PMF cap analyzer:
  - Y ~ payoutPmf, cap C → Y_capped = min(Y, C)
  - **E[Y_capped] = Σ_{y<C} y·π_y + C·P_cap**
  - **rtpLossRelative = (E[Y] − E[Y_capped]) / E[Y]**
  - **oneInNCapHitFrequency = 1 / P_cap** (regulator "1 in X")
  - **E[overflow | Y≥C] = (Σ_{y≥C}(y−C)·π_y) / P_cap**

MC: 200K spins per config, mulberry32 RNG, discrete PMF sampling.

## Configs

| Config | Pass | Cap | E[Y_uncap] | E[Y_cap] | RTP_loss | 1-in-N |
|---|---|---|---|---|---|---|
| A_pragmatic_5000x_sweet_bonanza_tail | ✅ | 5000 | 20.65 | 19.65 | 4.843% | 1000 |
| B_hacksaw_7500x_rare_extreme | ✅ | 7500 | 58.25 | 58.25 | 0.000% | 10000 |
| C_nolimit_city_25000x_deep_tail | ✅ | 25000 | 407.50 | 407.50 | 0.000% | 500 |
| D_netent_10000x_classic | ✅ | 10000 | 100.74 | 60.74 | 39.706% | 333 |
| E_corner_no_loss_cap_above_max | ✅ | 100000 | 28.00 | 28.00 | 0.000% | ∞ |
| F_corner_aggressive_low_cap_high_loss | ✅ | 100 | 3170.00 | 50.00 | 98.423% | 2 |

## Compliance context

- **UKGC RTS 14** — max-win disclosure mandatory (B3-LCCP)
- **UKGC §5.A.E** — operator must disclose cap impact to player
- **MGA PPD §11.f** — cap mechanic + RTP-loss transparency
- **AU NCRG** — post-2023 reform max-win disclosure
- **BE Belgian Gaming Commission** — max-win disclosure
- **eCOGRA Generic Slots Audit** — verifies cap matches engine
- Industry use: Pragmatic Play 5000x (Sweet Bonanza family), Hacksaw
  Gaming 7500x, Nolimit City 25000x (Mental, Tombstone RIP), NetEnt
  10000x, Stake.com 5000x, Push Gaming 10000-15000x, Yggdrasil 7777x.