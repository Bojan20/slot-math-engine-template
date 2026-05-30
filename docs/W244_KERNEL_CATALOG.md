# W244 Math Kernel Catalog

> **Unified reference** — 16 open-source slot math kernels, each closed-form,
> pure-stdlib, Merkle-pinned. Single CLI regenerates the whole fleet
> (`python -m tools.build_all_w244_kernels`); master Merkle root attests
> the complete batch.

## Overview

The W244 batch delivers 16 math kernels covering every major industry slot
mechanic. Each kernel:

| Property | Value |
|---|---|
| Implementation | Pure-stdlib Python (no numpy / scipy / z3 deps) |
| Output | Deterministic JSON with Merkle root |
| Audit | `tools/tests/test_w244_*_kernel.py` (180+ acceptance tests, all PASS) |
| Fixtures | 3-5 industry-proxy fixtures per kernel (51 total) |
| Regeneration | `python -m tools.build_<kernel>_kernel` |
| Batch | `python -m tools.build_all_w244_kernels` (master Merkle) |

**Current master Merkle:** see `reports/acceptance/W244_ALL_KERNELS.json` for live root.

## Kernel Roster

### 1. `money_collect` (W244.10)

**Pattern:** Cash Eruption / Money Train / Coin Volcano — lock-and-respin cash bonus.

| Field | Value |
|---|---|
| Closed-form | Binomial trigger × Markov DP episode value |
| Output JSON | `reports/acceptance/MONEY_COLLECT_KERNEL.json` |
| Tests | `test_w244_money_collect_kernel.py` (20/20 PASS) |
| Industry firsts | Binomial CDF × DP on (k_locked, respins_remaining) |

### 2. `charge_meter` (W244.11)

**Pattern:** Starburst meter / Money Cart / Power Stacks — multi-tier energy meter.

| Field | Value |
|---|---|
| Closed-form | Wald identity per tier × multi-tier sum |
| Output JSON | `reports/acceptance/CHARGE_METER_KERNEL.json` |
| Tests | `test_w244_charge_meter_kernel.py` (16/16 PASS) |

### 3. `must_hit_by` (W244.12)

**Pattern:** Lightning Link / Dragon Link / Dollar Storm — mystery pots with forced-strike cap.

| Field | Value |
|---|---|
| Closed-form | Conservation flow (RTP = contribution_x) + geometric arrival truncated at cap |
| Output JSON | `reports/acceptance/MUST_HIT_BY_KERNEL.json` |
| Tests | `test_w244_must_hit_by_kernel.py` (15/15 PASS) |

### 4. `pick_chain` (W244.13)

**Pattern:** Mega Moolah pick-pot / Mighty Cash — multi-level pick bonus.

| Field | Value |
|---|---|
| Closed-form | First-order statistic E[picks] + relative-odds advance prob |
| Output JSON | `reports/acceptance/PICK_CHAIN_KERNEL.json` |
| Tests | `test_w244_pick_chain_kernel.py` (15/15 PASS) |

### 5. `buy_feature` (W244.15)

**Pattern:** BTG Bonus Buy / Pragmatic Buy Feature — buy-in regulator audit.

| Field | Value |
|---|---|
| Closed-form | buy_rtp + UKGC RTS 13C + MGA RG 2021/02 jurisdiction passes |
| Output JSON | `reports/acceptance/BUY_FEATURE_KERNEL.json` |
| Tests | `test_w244_buy_feature_kernel.py` (17/17 PASS) |

### 6. `wheel` (W244.16)

**Pattern:** Wheel of Fortune / Megafortune / Dragon Cash wheel — bonus wheel with spin-again chain.

| Field | Value |
|---|---|
| Closed-form | Weighted segment expectation + bounded geometric amortisation |
| Output JSON | `reports/acceptance/WHEEL_KERNEL.json` |
| Tests | `test_w244_wheel_kernel.py` (16/16 PASS) |

### 7. `state_machine` (W244.17)

**Pattern:** Stakelogic Supermeter / Pragmatic Power of Thor / Buffalo Stampede.

| Field | Value |
|---|---|
| Closed-form | Markov stationary distribution via Gaussian elimination |
| Output JSON | `reports/acceptance/STATE_MACHINE_KERNEL.json` |
| Tests | `test_w244_state_machine_kernel.py` (12/12 PASS) |

### 8. `expanding_symbol` (W244.18)

**Pattern:** Book of Ra / Book of Dead / Book of Atem — expanding-symbol Free Spins.

| Field | Value |
|---|---|
| Closed-form | Binomial(reels, p_per_reel) × pay_table expectation |
| Output JSON | `reports/acceptance/EXPANDING_SYMBOL_KERNEL.json` |
| Tests | `test_w244_expanding_symbol_kernel.py` (15/15 PASS) |

### 9. `persistent_multiplier` (W244.19)

**Pattern:** Sticky Bandits / Mighty Wild — FS multiplier escalation.

| Field | Value |
|---|---|
| Closed-form | Exact DP over (bump_count, spin) state, cap-aware |
| Output JSON | `reports/acceptance/PERSISTENT_MULTIPLIER_KERNEL.json` |
| Tests | `test_w244_persistent_multiplier_kernel.py` (12/12 PASS) |

### 10. `cascade` (W244.20)

**Pattern:** Sweet Bonanza / Money Train / Reactoonz — tumble/avalanche.

| Field | Value |
|---|---|
| Closed-form | Bounded geometric chain × per-step multiplier ladder |
| Output JSON | `reports/acceptance/CASCADE_KERNEL.json` |
| Tests | `test_w244_cascade_kernel.py` (13/13 PASS) |

### 11. `cluster_pays` (W244.21)

**Pattern:** Sweet Bonanza / Aloha / Gates of Olympus — connected-cluster pays.

| Field | Value |
|---|---|
| Closed-form | Operator-supplied empirical cluster distribution × pay ladder |
| Output JSON | `reports/acceptance/CLUSTER_PAYS_KERNEL.json` |
| Tests | `test_w244_cluster_pays_kernel.py` (13/13 PASS) |

### 12. `sticky_wilds` (W244.23)

**Pattern:** NetEnt Sticky Bandits / Pragmatic Pyramid King — wild persistence in respin chain.

| Field | Value |
|---|---|
| Closed-form | Exact Markov DP over (wild_count, respin_t) state |
| Output JSON | `reports/acceptance/STICKY_WILDS_KERNEL.json` |
| Tests | `test_w244_sticky_wilds_kernel.py` (14/14 PASS) |

### 13. `stacked_wilds` (W244.24)

**Pattern:** Mega Moolah / Buffalo 1024-ways / Cleopatra II — full-reel wild stacking.

| Field | Value |
|---|---|
| Closed-form | Binomial(n_reels, p_stacked_per_reel) × pay table |
| Output JSON | `reports/acceptance/STACKED_WILDS_KERNEL.json` |
| Tests | `test_w244_stacked_wilds_kernel.py` (13/13 PASS) |

### 14. `ways_evaluator` (W244.25)

**Pattern:** Megaways 117649 / Buffalo 1024 / 243-ways — variable-rows ways.

| Field | Value |
|---|---|
| Closed-form | E[ways] = product(E[row_count_per_reel]) under reel independence |
| Output JSON | `reports/acceptance/WAYS_EVALUATOR_KERNEL.json` |
| Tests | `test_w244_ways_evaluator_kernel.py` (13/13 PASS) |

### 15. `pay_anywhere` (W244.26)

**Pattern:** Sweet Bonanza scatter / Gonzo / Wolf Gold money — position-independent counting.

| Field | Value |
|---|---|
| Closed-form | Binomial(n_cells, p_per_cell) × pay table with min_pay_count threshold |
| Output JSON | `reports/acceptance/PAY_ANYWHERE_KERNEL.json` |
| Tests | `test_w244_pay_anywhere_kernel.py` (12/12 PASS) |

### 16. `hold_and_win` (W244.27) — **COMPOSED**

**Pattern:** Lightning Link / Dragon Cash / Lightning Cash — money collect + jackpot tiers.

| Field | Value |
|---|---|
| Composition | `money_collect` + `must_hit_by` |
| Closed-form | Independent summation (joint probability second-order) |
| Output JSON | `reports/acceptance/HOLD_AND_WIN_KERNEL.json` |
| Tests | `test_w244_hold_and_win_kernel.py` (3/3 PASS) |

Demonstrates the **composition pattern** — multi-mechanic games modeled by combining
existing kernels rather than monolithic implementations.

---

## Architectural Principles

### Kernel boundary

Each kernel takes **operator-supplied empirical parameters** (e.g.
`pay_per_wild_count[k]`, `cluster_count_distribution`, `row_distribution_per_reel`)
sourced from PAR data or Monte Carlo ground truth, and emits an
auditable deterministic RTP decomposition.

Math-complexity boundary (e.g. site percolation theory for cluster size
distributions) lives in **validated PAR data**, NOT in the kernel.
This keeps:
  * Kernel surface small and testable.
  * Operator-side numerical work visible and auditable.
  * Regulator review focused on the data pipeline rather than 1000-line
    mathematical derivations inside the kernel.

### Determinism contract

Every kernel:
1. Computes outputs via pure deterministic operations (Binomial PMF
   iterative product, exact DP, Gaussian elimination, weighted
   expectation sums).
2. Emits a Merkle root over the per-fixture deterministic
   representation.
3. Two runs at the same inputs yield byte-identical JSON.
4. Master batch runner aggregates the per-kernel roots into a single
   master Merkle.

### Composition

Multi-mechanic games (95 % of industry slots) build via composition:
  * `hold_and_win` = `money_collect` + `must_hit_by`
  * `cluster_cascade_charge` = `cluster_pays` + `cascade` + `charge_meter`
  * `megaways_with_persistent_mult_FS` = `ways_evaluator` + `persistent_multiplier`

Operators wire kernels together at the game-config layer; the kernels
themselves stay single-responsibility.

---

## Verification protocol

To attest the entire W244 batch in one command:

```bash
$ cd slot-math-engine-template
$ python -m tools.build_all_w244_kernels
[w244-all-kernels] wrote reports/acceptance/W244_ALL_KERNELS.json
  kernels:          16 / 16
  total fixtures:   51
  master merkle:    <256-bit hash>
```

Auditor commits the `master merkle` as the single 256-bit attestation
covering the complete kernel fleet. Per-kernel Merkle roots are
independently verifiable via each kernel's own builder.

Test attestation: `python -m pytest tools/tests/test_w244_*_kernel.py -q`
→ 180+ acceptance tests PASS in < 1 second.

---

## DONE-UNIVERSAL Coverage

W244 kernels collectively close the following items from
`SLOT_ENGINE_ULTIMATE_SCENARIOS.md §8 Definition of Done-Universal`:

| # | Reference game | Kernel(s) covering it |
|---:|---|---|
| 3 | Cluster cascade + multiplier symbols | `cluster_pays` + `cascade` |
| 4 | Pay-anywhere + multiplier collect | `pay_anywhere` + `cascade` |
| 5 | Money-collect FS | `money_collect` |
| 6 | Variable-rows + cascade | `ways_evaluator` + `cascade` |
| 7 | Expanding-symbol FS | `expanding_symbol` |
| 8 | H&W multi-jackpot | `hold_and_win` |
| 9 | Persistent multiplier + symbol-upgrade FS | `persistent_multiplier` |
| 10 | Cluster cascade + charge meter | `cluster_pays` + `cascade` + `charge_meter` |
| 11 | Sticky wilds multi-mode FS | `sticky_wilds` |
| 12 | Multi-tier WAP jackpot + wheel | `wheel` + `must_hit_by` |
| 13 | Supermeter state-switch | `state_machine` |
| 14 | Money-symbol H&W + multi-tier | `hold_and_win` |
| 15 | Must-hit-by jackpot | `must_hit_by` |
| 16 | Stacked wilds + 1024 all-ways | `stacked_wilds` + `ways_evaluator` |
| 17 | Pseudo-must-hit + level progression | `must_hit_by` (small p_strike) |
| 18 | Pick bonus + multi-level | `pick_chain` |
| 20 | Money-collect + variable-rows ways | `money_collect` + `ways_evaluator` |

15 / 20 DONE-UNIVERSAL items covered closed-form. Remaining 5 items
(#1 Both-ways + expanding, #2 Asymmetric paytable, #19 Crash-style)
are evaluator-level or corner-case rather than kernel patterns.
