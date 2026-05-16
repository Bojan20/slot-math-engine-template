# SYMBOL_UPGRADE_CHAIN — Markov Ladder Acceptance

Generated: `2026-05-16T06:01:15.631Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 12 extension: ✅ "Symbol Upgrade Chain Markov" (Wave 101).

## Method

Closed-form Markov-chain solver:
  - A ~ Binomial(K, p): E[A]=K·p, Var[A]=K·p·(1-p)
  - F = min(A, L) (final state, clipped at top)
  - P(F=i) = C(K,i)·p^i·(1-p)^(K-i) for i < L
  - P(F=L) = 1 − Σ_{i<L} P(F=i)
  - E[Y] = Σ P(F=i)·v_i, Var[Y] = Σ P(F=i)·v_i² − E[Y]²
  - Tail: P(reach top), P(stay at base), P(reach halfway)

MC: 100K episodes per config, deterministic mulberry32, per-spin Bernoulli advance.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | P(top) | P(base) |
|---|---|---|---|---|---|---|
| A_pragmatic_6tier_K20 | ✅ | 65.011 | 64.952 | 0.09% | 17.015% | 3.876% |
| B_btg_aggressive_3tier_K8 | ✅ | 45.146 | 45.145 | 0.00% | 89.362% | 1.680% |
| C_high_p_short_K | ✅ | 73.181 | 73.087 | 0.13% | 68.256% | 1.024% |
| D_long_K_low_p | ✅ | 106.329 | 105.184 | 1.08% | 7.319% | 4.239% |
| E_p0_corner | ✅ | 1.000 | 1.000 | 0.00% | 0.000% | 100.000% |
| F_p1_full_advance | ✅ | 500.000 | 500.000 | 0.00% | 100.000% | 0.000% |

## Compliance context

- **UKGC RTS 14** — variance disclosure required for ladder/upgrade features
- **MGA PPD §11.f** — tail-probability disclosure (P(reach top) per session)
- **eCOGRA Generic Slots Audit** — closed-form Markov chain auditor-verifiable
- Industry use: Pragmatic upgrade FS, BTG Megaways tier ladders, Push Gaming Quantum