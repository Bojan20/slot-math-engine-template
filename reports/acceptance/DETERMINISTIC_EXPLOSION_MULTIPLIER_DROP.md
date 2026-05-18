# DETERMINISTIC_EXPLOSION_MULTIPLIER_DROP — Deterministic Explosion Multiplier-Drop Aggregator Acceptance (W187, 68. solver, L&W M4 P1 GAP CLOSURE)

Generated: `2026-05-18T00:44:39.433Z`

## Headline

**6/6 configs PASS** at 100000 MC spins each = 600K total spin sims.

Closes Faza 12 ext (post-W100): ✅ "Deterministic Explosion Multiplier-Drop Aggregator" (Wave 187 — 68. closed-form solver, L&W M4 P1 GAP CLOSED — Dancing Drums Explosion + Revolution).

## Method

Trigger-gated compound sum:
  - Per spin: T ~ Bernoulli(p_trigger)
  - Conditional on trigger: K predetermined positions explode, each gets V_k iid iz discrete PMF {(v_l, π_l)}
  - **E[Y per spin] = p_trigger · K · c · E[V]**
  - **Var[Y per spin]** via law of total variance: p·K·c²·Var[V] + p·(1−p)·(K·c·E[V])²
  - **P(all K hit v_max | trigger) = π_max^K**
  - **oneInNSpinsAllMaxExplosion = 1 / (p_trigger · π_max^K)**
  - Per-value disclosure: 1−(1−π_l)^K za P(at least one position hits v_l)

MC: per-spin Bernoulli trigger + K iid multiplier draws iz cumulative PMF.

## Configs — Deterministic Explosion operator disclosure table

| Config | Pass | p_trig | K | E[V] CF/MC | E[Y/spin] CF/MC | maxMult | 1-in-N all-max |
|---|---|---|---|---|---|---|---|
| A_dancing_drums_explosion_classic_5pos | ✅ | 0.03 | 5 | 2.60/2.61 | 3.120/3.198 | 25 | 3333333 |
| B_dancing_drums_revolution_8pos_extended | ✅ | 0.02 | 8 | 4.00/3.97 | 6.400/6.500 | 200 | 76207895137936 |
| C_explosion_high_frequency_low_max | ✅ | 0.1 | 6 | 1.65/1.65 | 4.950/4.979 | 18 | 877915 |
| D_explosion_jackpot_skewed_to_top | ✅ | 0.01 | 5 | 5.95/5.96 | 3.570/3.671 | 250 | 320000000 |
| E_corner_single_value_deterministic_mult | ✅ | 0.05 | 4 | 3.00/3.00 | 6.000/6.192 | 12 | 20 |
| F_corner_single_position_K1 | ✅ | 0.08 | 1 | 4.00/4.01 | 6.400/6.500 | 10 | 125 |

## Compliance context

- **UKGC RTS-14** — max-win mandatory disclosure (per-position multiplier × max value tracking).
- **MGA PPD §11** — explosion-mechanic transparency.
- **eCOGRA Generic Slots Audit** — deterministic-position mechanic audit.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M4 gap — LNW Bally Dancing Drums Explosion (2020, defining title), Dancing Drums Revolution (2025 LightWave cabinet extended 8-position).