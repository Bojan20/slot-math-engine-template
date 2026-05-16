# CASCADE_METER_CHARGE_UP — Cascade Meter Charge-Up Trigger Acceptance

Generated: `2026-05-16T11:00:40.869Z`

## Headline

**6/6 configs PASS** at 300000 spins each = 1.80M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Cascade Meter Charge-Up Trigger" (Wave 146).

## Method

Closed-form Quantum-Leap meter analyzer:
  - Per spin cascade chain L ~ Geometric(1-p)
  - Per-win meter +1; threshold T integer
  - **F = ⌊L/T⌋ ~ Geometric(1-p^T)** elegant distribution
  - **E[F] = p^T / (1-p^T)**
  - **E[L mod T] = (1-p)·Σ_{r=0..T-1} r·p^r / (1-p^T)** (finite series)
  - **Conservation: E[L] = T·E[F] + E[meterEnd]** verified

MC: 300K spins per config, mulberry32 RNG, per-cascade Bernoulli + PMF sampling.

## Configs

| Config | Pass | T | p | E[F] | P(fire) | E[Y] |
|---|---|---|---|---|---|---|
| A_reactoonz_quantum_leap_T4 | ✅ | 4 | 0.50 | 0.06667 | 6.250% | 8.367 |
| B_hacksaw_stack_em_T3 | ✅ | 3 | 0.55 | 0.19958 | 16.638% | 6.151 |
| C_push_aztec_bonanza_T10_high_threshold | ✅ | 10 | 0.60 | 0.00608 | 0.605% | 54.792 |
| D_yggdrasil_vault_anubis_T6 | ✅ | 6 | 0.45 | 0.00837 | 0.830% | 6.974 |
| E_corner_T1_every_win_fires | ✅ | 1 | 0.40 | 0.66667 | 40.000% | 4.000 |
| F_corner_huge_T_almost_never_fires | ✅ | 20 | 0.30 | 0.00000 | 0.000% | 0.429 |

## Compliance context

- **UKGC RTS 14** — feature trigger frequency disclosure (P(fire), E[F])
- **MGA PPD §11.f** — meter mechanic + carry-over transparency
- **eCOGRA Generic Slots Audit** — verifies meter fire rate matches engine
- Industry use: Play'n GO Reactoonz / Reactoonz 2 (Quantum Leap), Hacksaw
  Stack 'Em, Push Aztec Bonanza, Yggdrasil Vault of Anubis FS charge meter,
  NetEnt Wildbeast charge meter.