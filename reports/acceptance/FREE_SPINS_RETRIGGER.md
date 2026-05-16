# FREE_SPINS_RETRIGGER — Compound-Geometric Variance Acceptance

Generated: `2026-05-16T04:38:06.731Z`

## Headline

**6/6 configs PASS** at 50000 episodes each = 300K total MC.

Closes Faza 4.3 extension: ✅ "Free Spins Retrigger Compound Variance" (Wave 84).

## Method

Closed-form Wald + compound-sum identities:
  - N ~ shifted-geometric: E[N]=1/(1-p), Var[N]=p/(1-p)²
  - T=K·N: E[T]=K/(1-p), Var[T]=K²·p/(1-p)²
  - E[Y]=E[T]·μ  (Wald)
  - Var[Y]=E[T]·σ² + Var[T]·μ²  (compound-sum)
  - P(N≥k)=p^(k-1)  (geometric tail)

MC: 50K episodes per config, deterministic mulberry32, exact 2-point per-FS distribution.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | Var[Y]_CF | Var[Y]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_typical_10fs_p20 | ✅ | 18.750 | 18.815 | 0.35% | 382.81 | 385.80 | 0.78% |
| B_no_retrigger | ✅ | 20.000 | 20.040 | 0.20% | 160.00 | 160.06 | 0.04% |
| C_high_retrigger | ✅ | 16.000 | 15.925 | 0.47% | 272.00 | 269.14 | 1.05% |
| D_big_K_low_p | ✅ | 66.667 | 66.394 | 0.41% | 9333.33 | 9264.23 | 0.74% |
| E_small_K_moderate_p | ✅ | 5.714 | 5.721 | 0.12% | 38.37 | 38.06 | 0.80% |
| F_super_high_retrigger | ✅ | 10.000 | 9.970 | 0.30% | 110.00 | 108.89 | 1.01% |

## Tail probabilities (per config)

| Config | E[N] | P(N≥2) | P(N≥5) | P(N≥10) | max observed N |
|---|---|---|---|---|---|
| A_typical_10fs_p20 | 1.250 | 20.00% | 0.1600% | 0.000051% | 7 |
| B_no_retrigger | 1.000 | 0.00% | 0.0000% | 0.000000% | 1 |
| C_high_retrigger | 2.000 | 50.00% | 6.2500% | 0.195313% | 15 |
| D_big_K_low_p | 1.111 | 10.00% | 0.0100% | 0.000000% | 5 |
| E_small_K_moderate_p | 1.429 | 30.00% | 0.8100% | 0.001968% | 9 |
| F_super_high_retrigger | 3.333 | 70.00% | 24.0100% | 4.035361% | 34 |

## Compliance context

- **UKGC RTS 14** — variance disclosure required for PAR sheet
- **MGA PPD §11.f** — player-protection limit calculations need Var[Y]
- **eCOGRA Generic Slots Audit** — compound-sum derivation auditor-verifiable
- Closed-form E[Y] + Var[Y] enables exact bankroll-management chart generation