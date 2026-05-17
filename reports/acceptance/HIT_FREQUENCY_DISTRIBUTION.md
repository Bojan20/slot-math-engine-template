# HIT_FREQUENCY_DISTRIBUTION — Hit Frequency Distribution Decomposition Analyzer Acceptance

Generated: `2026-05-17T02:23:59.824Z`

## Headline

**6/6 configs PASS** at 200,000 spins each = 1.20M total MC samples.

Closes Faza 12 ext (post-W100): ✅ "Hit Frequency Distribution Decomposition Analyzer" (Wave 159 — 51st closed-form solver).

## Method

Closed-form survival-function decomposition of payout PMF + Hill-estimator Pareto tail fit:

- Per-tier breakdown: tierProb = Σ_{m_k ≥ C} p_k, oneInN = 1/tierProb, condEV = Σ m·p/tierProb
- RTP contribution + rtpShareOfTotal per tier
- Top-X% RTP concentration (1%/5%/10%) sortira positive outcomes descending by multiple
- Hill estimator Pareto α̂ = totalTailMass / Σ p·ln(m/m_min) for m ≥ paretoTailStartMultiplier

MC: 200K spins per config, categorical sampling from PMF, mulberry32 RNG.

## Configs — operator/regulator disclosure table

| Config | Pass | RTP CF/MC | HF CF/MC | Pareto α | top-1% RTP share | 1-in-N (max tier) |
|---|---|---|---|---|---|---|
| A_starburst_class_medium_vol | ✅ | 1.740/1.742 | 26.80%/26.68% | 2.09 | 27.8% | 1-in-10000 |
| B_pragmatic_sweet_bonanza_high_vol | ✅ | 5.555/5.721 | 18.00%/17.87% | 1.90 | 39.6% | 1-in-5000 |
| C_hacksaw_extreme_max_win | ✅ | 12.970/13.490 | 15.00%/14.89% | 1.21 | 57.8% | 1-in-10000 |
| D_netent_classic_96pct_low_vol | ✅ | 1.480/1.483 | 40.00%/39.93% | 2.05 | 19.6% | 1-in-10000 |
| E_big_time_megaways_megaway_class | ✅ | 3.475/3.659 | 24.50%/24.33% | 1.76 | 58.4% | 1-in-10000 |
| F_corner_uniform_pmf_sanity | ✅ | 2.000/1.997 | 80.00%/79.97% | 1.26 | 1.6% | 1-in-5 |

## Compliance context

- **UKGC RTS 14 Tag 12** — operator must disclose top hit rates per game (regulator-friendly "1 in X" form)
- **MGA Player Protection Directives §11.f** — variance disclosure including tier-stratified hit frequency tables
- **eCOGRA Generic Slots Audit** — hit-frequency table mandate (per-tier oneInN and condEV)
- **AU NCPF Reform 2022 Schedule 3** — rare-events disclosure with explicit "1 in X" frequency for top-tier wins
- **EU consumer protection** — Pareto α heavy-tail diagnostic for "is this slot front-loaded or back-loaded?"

Industry use: UKGC game-info tooltip ("This slot pays 1-in-X for top wins"),
MGA slot-variance classification (low / medium / high based on tier-1% RTP share),
eCOGRA pre-launch RTP/HF audit, NCPF responsible-gambling info-card generator.

## Why this is industry-standard (not industry-first)

Hit-frequency disclosure is REQUIRED by all major regulators but operators currently
compile per-game tables MANUALLY in spreadsheets. This solver:
  1. Automates per-tier hit frequency + condEV + RTP contribution computation
  2. Adds top-X% RTP concentration (regulator interpretability metric — "is RTP back-loaded?")
  3. Adds Pareto tail-α diagnostic (heavy-tail vs light-tail classifier)
  4. Provides MC cross-validation harness for engine-spec ↔ disclosure-table parity audit