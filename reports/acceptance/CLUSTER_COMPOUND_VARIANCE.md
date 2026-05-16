# CLUSTER_COMPOUND_VARIANCE — Cluster Cascade Compound Wald Acceptance

Generated: `2026-05-16T06:06:17.709Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 12 extension: ✅ "Cluster Compound Variance" (Wave 102).

## Method

Closed-form Wald compound-sum identity:
  - N = chain length, K_i = per-step cluster size, y_i = paytable[K_i]
  - μ_Y = Σ clusterPmf[k] · paytable[k]
  - σ²_Y = Σ clusterPmf[k] · paytable[k]² − μ_Y²
  - **E[Y_total] = E[N] · μ_Y**
  - **Var[Y_total] = E[N] · σ²_Y + Var[N] · μ²_Y**
  - 3 input modes: explicit (chainPmf+clusterPmf), geometric (pKill), bridge helper

MC: 100K episodes per config, deterministic mulberry32.

## Configs

| Config | Mode | Pass | E[Y]_CF | E[Y]_MC | rel | E[N]_CF | E[N]_MC | std_rel |
|---|---|---|---|---|---|---|---|---|
| A_sweet_bonanza_geometric_pkill_0.5 | geometric | ✅ | 0.2250 | 0.2221 | 1.30% | 1.000 | 1.000 | 2.88% |
| B_reactoonz_long_chain_pkill_0.3 | geometric | ✅ | 0.5250 | 0.5217 | 0.63% | 2.333 | 2.335 | 2.59% |
| C_aggressive_short_chain_pkill_0.7 | geometric | ✅ | 0.0964 | 0.0953 | 1.19% | 0.429 | 0.432 | 6.11% |
| D_explicit_uniform_chain_pmf | explicit | ✅ | 0.6250 | 0.6252 | 0.04% | 2.500 | 2.503 | 0.16% |
| E_pkill_1_immediate_kill | geometric | ✅ | 0.0000 | 0.0000 | 0.00% | 0.000 | 0.000 | 0.00% |
| F_pkill_0.1_extreme_long_tail | geometric | ✅ | 2.0250 | 2.0080 | 0.84% | 9.000 | 8.961 | 2.53% |

## Compliance context

- **UKGC RTS 14** — variance disclosure for cascade games
- **MGA PPD §11.f** — tail-probability disclosure for cascade chains
- **eCOGRA Generic Slots Audit** — Wald compound-sum identity auditor-verifiable
- Industry use: Sweet Bonanza (Pragmatic), Reactoonz (Play'n GO), Jammin' Jars (Push Gaming), Wild Swarm (Push Gaming)