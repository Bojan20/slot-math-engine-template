# LOCKED_REELS_FS — Locked/Held Reels During FS Analyzer Acceptance

Generated: `2026-05-16T10:02:41.766Z`

## Headline

**6/6 configs PASS** at 50000 episodes each = 300K total MC episodes.

Closes Faza 4.3 ext (post-W100): ✅ "Locked/Held Reels During FS Analyzer" (Wave 136).

## Method

Closed-form retrigger conditional analyzer:
  - K trigger reels held kroz M FS spins (locked scatter visible)
  - Per non-held reel: fresh scatter Bernoulli(q), independent
  - **P_re = P(Bin(N−K, q) ≥ T−K)** Binomial tail
  - E[retriggers across FS] = M·P_re
  - P(any retrigger) = 1−(1−P_re)^M
  - E[time-to-first] = (1−(1−P_re)^M)/P_re (truncated by M)

MC: 50K episodes per config, mulberry32 RNG, per-FS-spin Binomial scatter sampling.

## Configs

| Config | Pass | P_re | E[retrig] | P(any) | E[T_first] |
|---|---|---|---|---|---|
| A_pragmatic_wolf_gold_5reel_3held | ✅ | 4.000% | 0.3200 | 27.86% | 6.97 |
| B_buffalo_king_6reel_4held | ✅ | 32.760% | 3.2760 | 98.11% | 2.99 |
| C_john_hunter_tomb_6reel_long_fs | ✅ | 1.440% | 0.2160 | 19.55% | 13.58 |
| D_high_threshold_rare_retrigger | ✅ | 0.051% | 0.0051 | 0.51% | 9.98 |
| E_corner_held_already_at_threshold | ✅ | 100.000% | 5.0000 | 100.00% | 1.00 |
| F_corner_impossible_threshold | ✅ | 0.010% | 0.0010 | 0.10% | 10.00 |

## Compliance context

- **UKGC RTS 14** — retrigger frequency disclosure
- **MGA PPD §11.f** — operator-facing held-reel retrigger rate
- **eCOGRA Generic Slots Audit** — verifies retrigger probability matches engine
- Industry use: Pragmatic Wolf Gold / Buffalo King / John Hunter Tomb, Push Mount
  Magmas / Yggdrasil Vault of Anubis lock-and-spin FS variants.