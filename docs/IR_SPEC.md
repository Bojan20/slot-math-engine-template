# SLOT GAME IR — Formal Specification

**Status:** Draft v0.1 — Faza 1.1 of MASTER_TODO
**Scope:** Single canonical JSON document that fully describes a slot
game so the **same config** drives both the TS preview engine and the
Rust Monte Carlo / analytical solver. Two engines, one source of truth.

---

## Why one IR

Today the engine has hardcoded `NUM_REELS = 5`, `NUM_ROWS = 3`, a baked
`SymbolId` enum, and a fixed payline array. Every new game would mean
forking the TS source. The IR replaces that by making every parameter a
config field — adding a game becomes "write one JSON file, run the
simulator", and the engine itself is never touched.

Equally important: the IR is the **canonical contract** for the
TS↔Rust parity test (Faza 10.3). If both engines load the same IR and
disagree on RTP, exactly one of them has a bug — there is no hand-wave
about "different defaults".

---

## Top-level shape

```jsonc
{
  "schema_version": "1.0.0",
  "meta": { "id": "...", "name": "...", "version": "...", "theme_tags": [...] },
  "topology": { ... },          // grid shape (reels / rows / layout kind)
  "symbols": [ { ... }, ... ],   // arbitrary set, no enum
  "reels": { ... },              // per-reel strips or weighted distribution
  "evaluation": { ... },          // lines | ways | cluster | pattern | pay_anywhere
  "paytable": { ... },           // symbol_id → count → multiplier
  "features": [ { ... }, ... ],   // free_spins | hold_and_win | cascade | ...
  "rng": { ... },                // mulberry32 | pcg64 | xoshiro256pp | aes_ctr_drbg
  "bet": { ... },                // base_bet, ante, buy_feature_costs, denominations
  "limits": { ... },             // target_rtp, max_win_x, win_cap, hit_freq_target
  "compliance": { ... },         // jurisdictions, rtp_range, near_miss_rule
  "rtp_allocation": { ... }      // declared budget per feature; solver verifies
}
```

Every block is **required** at parse time. The validator refuses to load
a config missing any block — production sims must never silently default.

---

## `meta`

```jsonc
{
  "id": "example-game",                     // stable kebab-case key
  "name": "Example Game",                   // display label
  "version": "1.0.0",                       // semver of the config itself
  "description": "5x3 hold-and-win demo",
  "theme_tags": ["sample", "demo"],
  "author": "math@studio.example",
  "created_at_utc": "2026-05-12T00:00:00Z"
}
```

---

## `topology` — grid shape

Discriminated by `kind`. Three kinds today; new kinds (`pyramid`,
`hexagonal`, `infinity-reels`) are additive — older configs still
validate against newer schema.

### `kind: "rectangular"` (most slots)

```jsonc
{ "kind": "rectangular", "reels": 5, "rows": 3 }
```

### `kind: "variable_rows"` (variable per-reel row counts)

Each reel can land any row count in its declared range. Total ways is
the product of per-spin row counts.

```jsonc
{
  "kind": "variable_rows",
  "reels": 6,
  "row_range_per_reel": [[2, 7], [2, 7], [2, 7], [2, 7], [2, 7], [2, 7]],
  "ways_cap": 117_649
}
```

### `kind: "cluster_grid"` (cluster-pay grid)

```jsonc
{ "kind": "cluster_grid", "columns": 6, "rows": 5, "adjacency": "orthogonal" }
```

Adjacency is `"orthogonal"` (4-neighbours), `"diagonal"` (8), or
`"hex"`. Cluster evaluator uses this to walk the grid.

---

## `symbols`

Arbitrary set — no enum, no fixed count. Each entry:

```jsonc
{
  "id": "S_WILD",                            // stable key, referenced everywhere
  "name": "Wild",
  "kind": "wild",                            // see kinds table below
  "substitutes": ["S_LP1", "S_HP1", ...],    // or "*" for "all non-special"
  "weight_hint": 0.04                         // optional; reel strips override
}
```

### Symbol kinds

| Kind            | Notes                                                          |
|-----------------|----------------------------------------------------------------|
| `lp`            | Low-pay base symbol                                             |
| `hp`            | High-pay base symbol                                            |
| `wild`          | Substitutes per `substitutes` list                              |
| `scatter`       | Pays-anywhere, typical free-spins trigger                       |
| `bonus`         | Hold & Win trigger / carries cash value                         |
| `multiplier`    | Carries multiplier value (e.g. 2×, 5×); applied to line / total |
| `sticky`        | Sticks for N respins / FS retriggers                            |
| `expanding`     | Expands to full reel/column when landed                         |
| `mystery`       | Reveals one base symbol uniformly at evaluation time            |
| `transform`     | Transforms into another symbol on a trigger                     |
| `chain_wild`    | Walking / chain reaction — moves position between spins         |

The kind list is open — new kinds are added in Faza 3 as the behaviour
plugin layer ships.

---

## `reels`

Two valid shapes — choose one. Schema rejects mixing.

### Per-reel symbol weight distribution (recommended)

```jsonc
{
  "mode": "weighted",
  "base": [
    { "S_HP1": 1, "S_HP2": 1, "S_LP1": 8, ... },   // reel 0
    { "S_HP1": 1, "S_HP2": 2, "S_LP1": 7, ... }    // reel 1
  ],
  "free_spins": [...]                                // same shape, optional
}
```

### Explicit strip arrays (industry-standard for full-cycle math)

```jsonc
{
  "mode": "strips",
  "base": [
    ["S_HP1", "S_LP1", "S_LP2", ...],   // reel 0 strip (any length)
    ...
  ],
  "free_spins": [...]
}
```

`mode: "strips"` enables exact `enumerator/fullCycle.ts` (Faza 6 closed
form) — every position is countable. `mode: "weighted"` is for MC.

---

## `evaluation` — how wins are scored

Discriminated by `kind`.

### `kind: "lines"`

```jsonc
{
  "kind": "lines",
  "paylines": [
    [1, 1, 1, 1, 1],   // payline: row index per reel
    [0, 0, 0, 0, 0],
    ...
  ],
  "direction": "ltr",                // "ltr" | "rtl" | "both"
  "min_match": 3,                    // 3-of-a-kind starts paying
  "pay_left_to_right_only": true
}
```

### `kind: "ways"`

```jsonc
{
  "kind": "ways",
  "direction": "ltr",
  "min_match": 3,
  "max_ways_per_spin": 1024
}
```

### `kind: "cluster"`

```jsonc
{
  "kind": "cluster",
  "min_cluster_size": 5,
  "cluster_pay_table": {              // size → multiplier (per symbol via paytable cross-ref)
    "5":  1,  "6":  2,  "7":  5,  "8": 10,
    "9": 20, "10": 50, "11": 100, "12+": 500
  }
}
```

### `kind: "pay_anywhere"`

```jsonc
{ "kind": "pay_anywhere", "min_count": 8 }
```

### `kind: "pattern"`

```jsonc
{
  "kind": "pattern",
  "patterns": [
    { "id": "X",       "positions": [[0,0],[0,4],[1,2],[2,0],[2,4]], "pay_multiplier": 50 },
    { "id": "FULL",    "positions": "all" , "pay_multiplier": 500 }
  ]
}
```

---

## `paytable`

Two-level map. Outer key = `symbol.id`, inner key = match count.

```jsonc
{
  "S_HP1": { "3": 5,  "4": 25, "5": 100 },
  "S_HP2": { "3": 3,  "4": 12, "5":  50 },
  "S_LP1": { "3": 0.5, "4": 2, "5":   8 }
}
```

For `evaluation.kind == "cluster"`, paytable contains cluster-size keys
instead of OAK counts (validator checks shape against evaluation kind).

---

## `features` — list of game features

Each entry is a discriminated union by `kind`. Multiple features can
coexist (e.g. FS + H&W + Cascade). Order matters: features higher in
the list trigger earlier within a spin's resolution.

```jsonc
[
  {
    "kind": "free_spins",
    "trigger": { "by": "scatter_count", "thresholds": { "3": 10, "4": 15, "5": 20 } },
    "retrigger": { "by": "scatter_count", "thresholds": { "3": 5 }, "max_total": 100 },
    "global_multiplier": 1,
    "modifiers": ["sticky_wilds"]
  },
  {
    "kind": "hold_and_win",
    "trigger": { "by": "bonus_count", "min": 6 },
    "respins_initial": 3,
    "respin_reset_on_new": true,
    "cash_value_distribution": [
      { "value": 1,   "weight": 100 },
      { "value": 2,   "weight":  60 },
      { "value": 5,   "weight":  30 },
      { "value": 10,  "weight":  10 },
      { "value": 50,  "weight":   3 },
      { "value": 100, "weight":   1 }
    ],
    "jackpot_tiers": [
      { "id": "MINI",  "multiplier":    5 },
      { "id": "MINOR", "multiplier":   25 },
      { "id": "MAJOR", "multiplier":  100 },
      { "id": "GRAND", "multiplier": 1000 }
    ],
    "grid_full_award": "GRAND"
  },
  {
    "kind": "cascade",
    "replacement": "drop",
    "max_chain": 12,
    "multiplier_progression": [1, 1, 2, 2, 3, 3, 5, 5, 10]
  }
]
```

Other kinds (initial set, expanded in Faza 4): `respin`, `pick`,
`wheel`, `buy_feature`, `ante_bet`, `gamble`, `mystery_symbol`,
`symbol_upgrade`.

---

## `rng`

```jsonc
{
  "kind": "pcg64",                    // mulberry32 | pcg64 | xoshiro256pp | aes_ctr_drbg
  "default_seed": 12345,
  "jump_function": "advance_2_64"     // optional; required for distributed sims
}
```

Mulberry32 is fine for preview; production cert needs PCG64 or
AES-CTR-DRBG (faza 7.2 statistical certification).

---

## `bet`

```jsonc
{
  "currency": "EUR",
  "base_bet": 1.0,
  "denominations": [0.01, 0.10, 1.0, 10.0],
  "ante_bet": { "enabled": false, "extra_multiplier": 0.25 },
  "buy_feature": [
    { "id": "buy_fs",  "cost_x": 75,  "guaranteed": "free_spins" },
    { "id": "buy_hnw", "cost_x": 150, "guaranteed": "hold_and_win" }
  ]
}
```

---

## `limits`

```jsonc
{
  "target_rtp": 0.9600,
  "rtp_tolerance": 0.0005,    // ±0.05% acceptance band
  "max_win_x": 5000,           // hard cap on bet multiplier
  "win_cap_apply": "per_spin", // "per_spin" | "per_feature_session"
  "target_volatility": "high", // "low" | "medium" | "high" | "ultra"
  "hit_freq_target": 0.30      // 30 % of spins must score a win
}
```

---

## `compliance`

```jsonc
{
  "jurisdictions": ["UKGC", "MGA", "ADM"],
  "rtp_range_required": [0.92, 0.97],
  "max_win_cap_required": 10000,
  "near_miss_rule": "must_be_random",   // prohibits forced "near-miss"
  "ldw_disclosure": true,                // losses-disguised-as-wins flag
  "session_time_display": true
}
```

---

## `rtp_allocation` — declared budget

```jsonc
{
  "base_game":      0.45,
  "free_spins":     0.20,
  "hold_and_win":   0.30,
  "jackpot":        0.01,
  "tolerance":      0.005       // sum must be in [1.0 - tol, 1.0 + tol] minus target_rtp
}
```

The analytical solver verifies the *actual* RTP per feature matches
this declared budget within tolerance. Drift triggers a Fail compliance
finding.

---

## Versioning & extensibility

- `schema_version` is semver. Patch bump = bug fix in spec wording.
  Minor bump = additive (new optional fields / new union variants).
  Major bump = breaking (existing config files must migrate).
- Validator allows **unknown fields** at any object level — engines log
  them as `unknown_keys` but don't fail. Lets ops add operator-side
  metadata (e.g. `__internal_qa_status`) without forking the spec.
- Every union has a `"kind"` discriminator. Engines pattern-match on it
  and treat unknown kinds as Fail (no silent default).

---

## Open questions (resolved during Faza 1.2 / 1.3)

- Per-reel symbol **eligibility lists** (cluster games where some symbols
  appear only on specific positions) — needs `appears_on` field per symbol.
- **Hex grid** evaluator semantics — pending Faza 2.3 cluster impl.
- **Anticipation reels** (slow stop on near-miss bonuses) — server-side
  pacing flag in `meta` or part of `features` discriminator?
