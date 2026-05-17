# TUMBLING_CASCADE_CHAIN_LENGTH — Tumbling Cascade Chain Length Analyzer Acceptance

Generated: `2026-05-17T10:26:12.121Z`

## Headline

**6/6 configs PASS** at 10000 MC spins each = 60.0K total spin sims.

Closes Faza 12 ext (post-W100): ✅ "Tumbling Cascade Chain Length Analyzer" (Wave 171 — 57th solver, Wald identity).

## Method

Closed-form Geometric chain length distribution + Wald identity:
  - **C ~ Geometric(p)**: P(C=k) = p^k·(1−p)
  - **E[C] = p/(1−p)**, Var[C] = p/(1−p)²
  - **P(C≥k) = p^k** survival
  - **Wald**: E[total] = E[C]·E[Y]
  - Var[total] = E[C]·Var[Y] + Var[C]·(E[Y])²

MC: 10K spins per config, per-cascade Bernoulli(p) + Gaussian payout draws, mulberry32 RNG.

## Configs — tumbling-mechanic operator disclosure table

| Config | Pass | p | E[Y] | Var[Y] | E[C] CF/MC | E[total] CF/MC | P(C≥3) CF/MC |
|---|---|---|---|---|---|---|---|
| A_sweet_bonanza_p030 | ✅ | 0.3 | 2 | 10 | 0.429/0.421 | 0.857/0.838 | 2.70%/2.60% |
| B_gonzo_quest_p020 | ✅ | 0.2 | 1.5 | 5 | 0.250/0.250 | 0.375/0.375 | 0.80%/0.80% |
| C_reactoonz_p050 | ✅ | 0.5 | 3 | 25 | 1.000/0.979 | 3.000/2.945 | 12.50%/11.76% |
| D_big_bass_tumble_p035 | ✅ | 0.35 | 2.5 | 15 | 0.538/0.528 | 1.346/1.312 | 4.29%/4.30% |
| E_hacksaw_tombstone_p040_high_vol | ✅ | 0.4 | 5 | 50 | 0.667/0.658 | 3.333/3.280 | 6.40%/6.25% |
| F_corner_low_p005_rare_chain | ✅ | 0.05 | 1 | 2 | 0.053/0.055 | 0.053/0.050 | 0.01%/0.00% |

## Compliance context

- **UKGC RTS 14** — cascade chain disclosure (operator must show typical chain length)
- **MGA PPD §11** — tumbling mechanic transparency
- **eCOGRA Generic Slots Audit** — cascade-mechanic auditor verification

Industry use: Pragmatic Sweet Bonanza family, NetEnt Gonzo Quest, Reactoonz, Big Bass tumble FS,
Hacksaw Tombstone, Push Money Cart 4 cascade.