# SLOT-MATH — Shape Coverage Dossier

> One-page authority on what slot-math W244 stack supports end-to-end.
> Status: **v2.0 — 5/5 shapes covered, 6/6 games proven, sub-bps composer + Wilson CI MC.**

---

## What is a "shape"?

A **shape** is the evaluation pattern that turns a grid (or non-grid)
outcome into a payout. Modern slot/casino industry has 5 dominant
shapes; slot-math covers all of them.

| # | Shape | Industry pattern | Examples |
|---|---|---|---|
| 1 | `lines` | Per-payline left-to-right matching | Classic 3-reel, 20/30/50-line video |
| 2 | `cluster_pays` | BFS-connected regions of same symbol | Sweet Bonanza, Aloha, Gates of Olympus |
| 3 | `ways` (Megaways) | Variable rows per reel, product = ways count | Bonanza, Big Bass, Extra Chilli |
| 4 | `crash` | Pareto multiplier + player cashout target | Stake Crash, Aviator, Bustabit |
| 5 | `pay_anywhere` | K-of-symbol anywhere on grid pays | Sweet Bonanza scatter, Gonzo's Quest |

---

## Per-shape status matrix

| Shape | Composer (CF) | MC executor | Throughput | Test gates |
|---|:---:|:---:|---:|:---:|
| `lines` | ✅ sub-bps | ✅ Rust + Python | **554M spins/s** (parallel) | 13 |
| `cluster_pays` | ✅ sub-bps | ✅ Python (Poisson + cascade) | 200K spins/s | 6 |
| `ways` | ✅ sub-bps | ✅ Python (variable-rows + cascade) | 586K spins/s | 1 |
| `crash` | ✅ sub-bps | ✅ Python (Pareto inverse-CDF) | 1.75M rounds/s | 6 |
| `pay_anywhere` | ✅ sub-bps | ✅ CF exact (kernel IS truth) | N/A | 1 |

---

## Reference games

Real-world or synthetic-stand-in game per shape, all in
`reports/par-library/<game>/<variant>/`.

| Game | Variant | Shape | Lock state |
|---|---|---|---|
| Wrath of Olympus | v12.0.0 | lines + FS + HW + Lightning | **production-locked** (real) |
| Oracle of Delphi | v1.0.0 | lines + FS + HW | synthetic template |
| Mystic Cluster | v1.0.0 | cluster_pays + cascade | synthetic |
| Lightning Ways | v1.0.0 | ways + cascade (Megaways) | synthetic |
| Stake Rush | v1.0.0 | crash | synthetic |
| Sky Cascade | v1.0.0 | pay_anywhere + cascade | synthetic |

---

## CLI surface (post v2.0)

```bash
# Discovery
python3 -m tools.par_kernels.cli shapes        # what shapes are supported
python3 -m tools.par_kernels.cli list-games    # what games are in the library

# Scaffold a new game (any shape)
python3 -m tools.par_kernels.cli init <game> <variant> --shape <shape>
#   e.g. init crimson-tiger v1.0.0 --shape ways

# Evaluate (composer + optional MC + per-feature breakdown)
python3 -m tools.par_kernels.cli evaluate --game <game> --variant <variant>
python3 -m tools.par_kernels.cli evaluate --game <game> --variant <variant> --mc-spins 10_000_000
python3 -m tools.par_kernels.cli evaluate --game <game> --variant <variant> --mc-spins 10_000_000 --python-mc

# Direct file mode (no PAR library entry needed)
python3 -m tools.par_kernels.cli evaluate path/to/game.ir.json --cf path/to/cf.json
```

Default behaviour:
- Composer always runs (closed-form, sub-bps target)
- MC opt-in (`--mc-spins N`), Rust if binary built, Python fallback
- Tolerance 50 bps (accommodates reel-strip vs RNG model gap)
- Markdown report to stdout or `--out path.md`

---

## Adding a 7th shape (or 7th game on existing shape)

1. **Shape ALREADY supported** → `init` + edit JSON:
   ```bash
   python3 -m tools.par_kernels.cli init my-game v1.0.0 --shape cluster_pays
   $EDITOR reports/par-library/my-game/v1.0.0/game.ir.json
   $EDITOR reports/par-library/my-game/v1.0.0/closed-form-rtp.json
   python3 -m tools.par_kernels.cli evaluate --game my-game --variant v1.0.0
   ```

2. **NEW shape not in registry** → 3 steps:
   - Add kernel under `packages/slot-math-kernels/src/slot_math_kernels/<shape>.py`
   - Register in `tools/par_kernels/composer.py` KERNEL_REGISTRY
   - Add builder branch in `tools/par_kernels/generic_params.py`
   - Optional: MC executor under `tools/par_kernels/mc_<shape>_runtime.py`

---

## Determinism + audit guarantees

- **Same IR + CF → same composer output**, byte-stable (modulo OS float epsilon)
- **Same seed → same MC output**, replay-from-seed
- **Wilson 99% CI** on every MC RTP — published with the result
- **Per-feature breakdown** (Rust MC, lines shape) — regulator-grade transparency
- **Cap clamping** — per-spin cap honored everywhere (proportional scale-down)

---

## Performance ladder (Wrath payload, T-tier benchmarks)

| Tier | Spinova | Pure-Python Wrath sim | slot-math Rust parallel |
|---|---:|---:|---:|
| T1 (designer feedback) | 32M | 27 s | **0.06 s** |
| T2 (CI gate) | 160M | 2 min | **0.3 s** |
| T3 (regulator default) | 8B | 2 h | **14 s** |
| T4 (pre-deploy stress) | 40B | 10 h | **1.2 min** |
| T5 (ultimate audit) | 200B | 50 h | **6 min** |

---

## Provably fair theorem (crash shape)

The crash kernel + MC verify analytically AND empirically that
**RTP = 1 - house_edge**, independent of player's cashout target T.
Verified at T ∈ {1.5, 2.0, 5.0, 20.0} — all converge to ~99% within
Wilson 99% CI for house_edge = 0.01.

---

## Sweep history

| Version | Milestone |
|---|---|
| v1.0 | Wrath-only proof (1 game, 1 shape) |
| v1.1 | W244 composer (sub-bps Wrath parity) |
| v1.2 | Generic params + CLI + 2nd game (Oracle of Delphi) |
| v1.3 | Rust MC single-thread (69×) |
| v1.4 | rayon parallel (474×) |
| v1.5 | Per-feature MC breakdown |
| v1.6 | Mystic Cluster (3rd shape) |
| v1.7 | Cluster MC executor |
| v1.8 | Lightning Ways (4th shape) |
| v1.9 | Stake Rush (5th shape, crash) |
| **v2.0** | **Sky Cascade (6th game) + CLI polish — ALL shapes covered** |

---

*Living document. Last updated alongside the v2.0 ship sweep.*
