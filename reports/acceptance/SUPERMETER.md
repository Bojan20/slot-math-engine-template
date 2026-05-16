# SUPERMETER — State-Switch Markov Chain Acceptance

Generated: `2026-05-16T01:51:04.842Z`

## Headline

**6/6 configs PASS** at 500000 MC spins each.

Closes Faza 12 scenario: ⚠️→✅ "Supermeter state-switch".

## Method

Power-iteration solver for stationary distribution π. Long-run RTP = Σ π_i × r_i.
Finite-horizon by forward propagation π_{n+1} = π_n × P.
First-passage expected times via standard absorbing-chain linear system.
Verified against Monte Carlo at 500K spins per config + finite-horizon MC averaging.

## Tolerances

| Metric | Tolerance |
|---|---|
| long-run RTP | rel ≤ 1.5% |
| state proportion | abs ≤ 0.01 |
| finite-horizon RTP | rel ≤ 5.0% |

## Configs

| Config | Pass | CF long-run RTP | MC RTP | rel err | max state abs |
|---|---|---|---|---|---|
| A_2state_classic | ✅ | 0.95000 | 0.94994 | 0.007% | 0.00036 |
| B_3state_ladder | ✅ | 0.93750 | 0.93759 | 0.009% | 0.00177 |
| C_4state_cycle | ✅ | 0.92029 | 0.92070 | 0.045% | 0.00146 |
| D_asymmetric | ✅ | 1.16818 | 1.16899 | 0.070% | 0.00232 |
| E_near_absorbing_super | ✅ | 1.43636 | 1.43314 | 0.224% | 0.00460 |
| F_symmetric_uniform | ✅ | 0.98000 | 0.98006 | 0.006% | 0.00058 |

## Stationary Distributions

### A_2state_classic

_2-state BASE↔SUPER, BASE=0.92 RTP, SUPER=1.10, p_up=0.02, p_down=0.10_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| BASE | 0.83333 | 0.83369 | 0.920 | 50.0 |
| SUPER | 0.16667 | 0.16631 | 1.100 | 10.0 |

### B_3state_ladder

_3-state ladder BASE/BOOST/SUPER (forward escalation, backward fallback)_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| BASE | 0.75000 | 0.75088 | 0.900 | 20.0 |
| BOOST | 0.18750 | 0.18573 | 1.000 | 3.3 |
| SUPER | 0.06250 | 0.06338 | 1.200 | 3.3 |

### C_4state_cycle

_4-state with mixed cycles (LOW/MID/HIGH/MAX) - asymmetric transitions_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| LOW | 0.52174 | 0.52068 | 0.850 | 10.0 |
| MID | 0.34783 | 0.34718 | 0.950 | 4.0 |
| HIGH | 0.11594 | 0.11740 | 1.100 | 2.9 |
| MAX | 0.01449 | 0.01474 | 1.300 | 2.5 |

### D_asymmetric

_Heavy SUPER bias once entered (p_down=0.005 vs p_up=0.05)_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| BASE | 0.09091 | 0.08859 | 0.850 | 20.0 |
| SUPER | 0.90909 | 0.91141 | 1.200 | 200.0 |

### E_near_absorbing_super

_SUPER nearly absorbing (P[SUPER][SUPER]=0.999) — long sojourn_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| BASE | 0.09091 | 0.09551 | 0.800 | 100.0 |
| SUPER | 0.90909 | 0.90449 | 1.500 | 1000.0 |

### F_symmetric_uniform

_Symmetric 4-state uniform — π should be uniform 0.25 each_

| State | π (CF) | π (MC) | rtp/spin | sojourn (spins) |
|---|---|---|---|---|
| A | 0.25000 | 0.24962 | 0.920 | 1.3 |
| B | 0.25000 | 0.24955 | 0.960 | 1.3 |
| C | 0.25000 | 0.25058 | 1.000 | 1.3 |
| D | 0.25000 | 0.25024 | 1.040 | 1.3 |
