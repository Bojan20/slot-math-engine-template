# `walking-wild-clean-room-template` — Sticky + Walking Wild Slot Template

Copyright-safe clean-room math template for a **5×3 / 20-line** slot with
two stacked wild mechanics:

| Wave | Primitive |
|---|---|
| **W4.12a** | Sticky Wild (lock-position state machine) |
| **W4.12b** | Walking Wild (lock + direction state machine) |

The math primitives below are **public-domain mechanic descriptions**:
NetEnt's classic Walking Wild (Jack & The Beanstalk, 2011), Quickspin's
Stick & Walk pattern, and Pragmatic's Mystery Wild — every published
implementation. The template lets the engine show parity with the
family without requiring a specific vendor PAR.

## Math primitives captured

### 1. Topology
| Field | Value |
|---|---|
| Reels × Rows | 5 × 3 |
| Paylines | 20 (fixed, left-to-right) |
| Symbols | BOOK (scatter), WILD, HP1..HP3, LP1..LP5 |

### 2. Sticky Wild state machine (W4.12a)

When a WILD lands during a spin:

```
state s_t per cell = {empty, freshly_landed, sticky}
transition:
    empty + WILD draw     → freshly_landed
    freshly_landed + spin → sticky
    sticky + spin         → sticky (until sticky_ttl expires)
    any state + ttl=0     → empty
```

`sticky_ttl_pmf` per fresh wild: 1=20%, 2=40%, 3=25%, 4=10%, 5=5%.

### 3. Walking Wild state machine (W4.12b)

When a WILD lands during a spin:

```
state s_t per wild = {position: (reel, row), direction: int, steps_left: int}
direction PMF:    left = 50%, right = 50%
initial steps:    drawn from walking_steps_pmf
per spin:
    if steps_left > 0:
        move wild to (reel + direction, row); award all spins triggered
            during the walk-through as bonus respins
        steps_left -= 1
    else:
        wild evaporates
```

`walking_steps_pmf`: 1=15%, 2=30%, 3=30%, 4=15%, 5=10%.

Wilds reaching the edge of the grid (reel < 0 or reel > 4) **evaporate
immediately** but award the in-progress respin chain.

### 4. Free Spins
Trigger: 3+ BOOK scatter symbols on the same spin. Award schedule:
- 3 BOOK → 10 FS
- 4 BOOK → 15 FS
- 5 BOOK → 20 FS

FS feature: every fresh wild that lands is automatically **Walking Wild**
with `direction=left` and `steps_left=4`. Provides the bulk of FS RTP.

### 5. Reference RTP
| Component | Share |
|---|---|
| Base game (lines + scatter) | 0.61 |
| Sticky / Walking wild bonuses | 0.13 |
| Free Spins | 0.22 |
| **Total** | **0.96** |

## Copyright posture

| Item | Action |
|---|---|
| Vendor / game / SWID identifiers | None — synthetic clean-room |
| Symbol names | Generic (`BOOK`, `WILD`, `HP1..HP3`, `LP1..LP5`) |
| Walking Wild trademark | Not used; "lock-and-walk wild state machine" is the generic descriptor |
| Sticky Wild trademark | Not used |

## Layout

```
games/walking-wild-clean-room-template/
├── README.md
├── scripts/
│   └── lift_to_ir.py
└── out/
    └── template-walking-wild-cleanroom.ir.json
```

Run locally:

```bash
python3 games/walking-wild-clean-room-template/scripts/lift_to_ir.py
```
