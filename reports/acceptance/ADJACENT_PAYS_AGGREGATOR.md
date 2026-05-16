# ADJACENT_PAYS_AGGREGATOR — Adjacent Pays Aggregator Acceptance

Generated: `2026-05-16T10:31:02.545Z`

## Headline

**6/6 configs PASS** at 200000 spins each = 1.20M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Adjacent Pays Aggregator" (Wave 140).

## Method

Closed-form DP on (position, current_run, max_run) state-space:
  - Per reel match (p_s): c → c+1, m → max(m, c+1)
  - Per reel no-match (1-p_s): c → 0, m unchanged
  - Marginalize → P(longest_run_s = k) for k=0..N
  - E[pay_s] = Σ_{k=k_min..N} paytable[s][k]·P(longest_run = k)
  - Per spin: × paylineCount

MC: 200K spins per config, mulberry32 RNG, per-payline per-reel symbol sampling.

## Configs

| Config | Pass | k_min | E[pay]/spin | hit/spin | maxRun_obs |
|---|---|---|---|---|---|
| A_aristocrat_buffalo_1024_adjacent | ✅ | 3 | 109.6066 | 4.5475 | 5 |
| B_nextgen_foxin_wins_25line | ✅ | 3 | 2.5135 | 0.4170 | 5 |
| C_konami_6reel_kmin2 | ✅ | 2 | 15.0074 | 8.1168 | 6 |
| D_pragmatic_big_bass_5x3 | ✅ | 3 | 2.0856 | 0.6898 | 5 |
| E_corner_single_symbol_all_match | ✅ | 3 | 100.0000 | 1.0000 | 5 |
| F_corner_kmin_equals_N | ✅ | 5 | 40.9600 | 0.2048 | 5 |

## Compliance context

- **UKGC RTS 14** — adjacent payline rule disclosure
- **MGA PPD §11.f** — run length definition transparency
- **eCOGRA Generic Slots Audit** — verifies adjacent payline math
- Industry use: Aristocrat Buffalo (pay-adjacent classic), Konami
  Roman Tribune, NextGen Foxin' Wins, IGT Cleopatra adjacent
  variants, Pragmatic Big Bass families.