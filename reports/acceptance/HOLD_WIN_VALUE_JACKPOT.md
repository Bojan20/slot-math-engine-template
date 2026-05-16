# HOLD_WIN_VALUE_JACKPOT — Hold-and-Win Multi-Tier Value-Based Jackpot Acceptance

Generated: `2026-05-16T09:51:29.824Z`

## Headline

**6/6 configs PASS** at 30000 episodes each = 180K total MC episodes.

Closes Faza 5 ext (post-W100): ✅ "Hold-and-Win Multi-Tier Value-Based Jackpot" (Wave 134).

## Method

Closed-form four-step pipeline:
  1. Markov chain (filled, respinsRemaining) → P(F_final = k)
  2. k-fold convolution valuePmf → V_total | F_final=k
  3. P(tier reached) = Σ_k P(F=k) · P(V_total ≥ T_t | F=k)
  4. **E[V_total] = (E[F] − F_init) · E[V]** (industry semantics)

MC: 30K episodes per config, mulberry32 RNG, episode-driven respin loop sa reset.

## Configs

| Config | Pass | E[F] | E[V] | P(fullGrid) | P(anyTier) |
|---|---|---|---|---|---|
| A_lightning_link_15cell_classic | ✅ | 8.28 | 14.50 | 0.16% | 10.92% |
| B_igt_hold_win_12cell | ✅ | 7.72 | 25.01 | 2.32% | 3.52% |
| C_buffalo_link_dense_grid | ✅ | 15.54 | 186.43 | 4.73% | 68.44% |
| D_pragmatic_big_bass_hold_spin | ✅ | 5.30 | 25.93 | 3.50% | 10.84% |
| E_high_freq_short_respins | ✅ | 5.82 | 8.40 | 17.84% | 38.60% |
| F_corner_trigger_equals_grid | ✅ | 9.00 | 0.00 | 100.00% | 100.00% |

## Compliance context

- **UKGC RTS 14** — per-tier hit probability + variance disclosure
- **MGA PPD §11.f** — operator-facing jackpot hit rate
- **eCOGRA Generic Slots Audit** — verifies tier probs match engine
- Industry use: Aristocrat Lightning Link / Buffalo Link, IGT Hold & Win,
  SG Money Burst, Pragmatic Big Bass Hold & Spin family.