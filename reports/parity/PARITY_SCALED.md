# Scaled Parity / Determinism Report

> Generated: 2026-05-15T18:20:08.222Z
> Fixture: `tests/fixtures/parity.json`
> Seeds: 42, 1337, 3405691582, 3735928559 · Spins/seed: 100,000
> Total Rust spins this run: 800,000 · Wall: 7550ms

## Headline

- Rust self-determinism @ 100,000 spins/seed: **✅**
- TS self-determinism @ 100,000 spins/seed: **✅**
- Cross-language bit-exact (existing vitest): **✅**

## A. Rust self-determinism (per-spin NDJSON SHA-256)

| Seed | NDJSON sha256 (head) | Bit-exact 2× run | Wall A ms | Wall B ms |
|-----:|----------------------|:----------------:|---------:|---------:|
| 42 | `0e5bc0bcacb58361…` | ✅ | 140 | 138 |
| 1337 | `e6fdbaa0854625ff…` | ✅ | 136 | 139 |
| 3405691582 | `67e1f4e951f4e320…` | ✅ | 137 | 142 |
| 3735928559 | `b4b3267c8d3f0de4…` | ✅ | 135 | 137 |

## B. TS self-determinism (aggregate stats)

| Seed | RTP | Hit rate | Bit-exact 2× run | Wall A ms | Wall B ms |
|-----:|----:|---------:|:----------------:|---------:|---------:|
| 42 | 79.413900% | 32.526% | ✅ | 740 | 703 |
| 1337 | 78.164600% | 32.743% | ✅ | 720 | 714 |
| 3405691582 | 79.274600% | 32.645% | ✅ | 714 | 704 |
| 3735928559 | 78.247900% | 32.657% | ✅ | 701 | 710 |

## C. Cross-language per-spin bit-exact (existing vitest)

Owner: `tests/evaluator_parity.test.ts` — compares EVERY field of EVERY spin between
Rust oracle output and TS spin emitter. Runs at 1 K spins/seed in CI.

Status: **✅ bit-exact** (vitest exit=0)

## Why not compare `irSimulator` to `evaluator_parity` aggregate?

It would be apples-to-oranges. The Rust oracle disables FS + lightning to make its output a pure function of (config, seed, spin_idx); the TS `irSimulator` runs the FULL game (base + FS + H&W + lightning). The ~10pp aggregate RTP delta you'd see comparing the two is the FS + H&W contribution, NOT a parity bug. Per-spin TS↔Rust bit-exact (the vitest in §C) DOES disable FS on both sides — that's the canonical cross-language gate.

## Acceptance verdict

**Master TODO 10.3 (scaled mid-tier) acceptance: ✅** Rust + TS self-deterministic at 100,000-spin scale; cross-language bit-exact via existing vitest gate. The cert-grade 10⁹-spin run is operator-initiated CI dispatch.
