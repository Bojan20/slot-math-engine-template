# Scaled Parity / Determinism Report

> Generated: 2026-05-20T11:34:22.818Z
> Fixture: `tests/fixtures/parity.json`
> Seeds: 42, 1337, 3405691582, 3735928559 · Spins/seed: 1,000,000
> Total Rust spins this run: 8,000,000 · Wall: 68480ms

## Headline

- Rust self-determinism @ 1,000,000 spins/seed: **✅**
- TS self-determinism @ 1,000,000 spins/seed: **✅**
- Cross-language bit-exact (existing vitest): **✅**

## A. Rust self-determinism (per-spin NDJSON SHA-256)

| Seed | NDJSON sha256 (head) | Bit-exact 2× run | Wall A ms | Wall B ms |
|-----:|----------------------|:----------------:|---------:|---------:|
| 42 | `4548695144f464f7…` | ✅ | 1761 | 1372 |
| 1337 | `1e46878a042f5112…` | ✅ | 1369 | 1360 |
| 3405691582 | `aeb8d74f95139630…` | ✅ | 1373 | 1362 |
| 3735928559 | `81135bdfedda56e0…` | ✅ | 1364 | 1361 |

## B. TS self-determinism (aggregate stats)

| Seed | RTP | Hit rate | Bit-exact 2× run | Wall A ms | Wall B ms |
|-----:|----:|---------:|:----------------:|---------:|---------:|
| 42 | 78.746280% | 32.605% | ✅ | 6899 | 6711 |
| 1337 | 79.179670% | 32.721% | ✅ | 6761 | 6983 |
| 3405691582 | 79.354090% | 32.731% | ✅ | 6750 | 6714 |
| 3735928559 | 78.883950% | 32.723% | ✅ | 6794 | 6943 |

## C. Cross-language per-spin bit-exact (existing vitest)

Owner: `tests/evaluator_parity.test.ts` — compares EVERY field of EVERY spin between
Rust oracle output and TS spin emitter. Runs at 1 K spins/seed in CI.

Status: **✅ bit-exact** (vitest exit=0)

## Why not compare `irSimulator` to `evaluator_parity` aggregate?

It would be apples-to-oranges. The Rust oracle disables FS + lightning to make its output a pure function of (config, seed, spin_idx); the TS `irSimulator` runs the FULL game (base + FS + H&W + lightning). The ~10pp aggregate RTP delta you'd see comparing the two is the FS + H&W contribution, NOT a parity bug. Per-spin TS↔Rust bit-exact (the vitest in §C) DOES disable FS on both sides — that's the canonical cross-language gate.

## Acceptance verdict

**Master TODO 10.3 (scaled mid-tier) acceptance: ✅** Rust + TS self-deterministic at 1,000,000-spin scale; cross-language bit-exact via existing vitest gate. The cert-grade 10⁹-spin run is operator-initiated CI dispatch.
