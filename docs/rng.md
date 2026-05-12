# RNG — Formal Specification

**Status:** Draft v0.1 — Faza 0.2 deliverable
**Scope:** The pluggable RNG layer, four production backends, the
splitting protocol used for parallel workers, and the determinism
contract that lets the same seed reproduce a spin across TS, Rust, and
GPU stacks.

---

## Why pluggable RNG

A slot engine's PRNG is **regulator-visible**: jurisdictions audit
state size, period, statistical quality (BigCrush / NIST / PractRand),
and how independent worker streams are derived. The engine therefore
exposes a single `RngBackend` interface and four implementations
optimized for different needs.

Switching backend is a one-token IR change:

```jsonc
"rng": { "kind": "pcg64", "seed": "0xCAFEBABE_DEADBEEF" }
```

No code path elsewhere is allowed to special-case a backend; if the
math depends on which RNG is used, the math is wrong.

---

## Backend catalog

| Backend          | State     | Period      | Notable property                  | Use case                            |
|------------------|-----------|-------------|------------------------------------|--------------------------------------|
| `mulberry32`     | 32 bit    | 2³²         | Trivial — for TS↔Rust byte parity  | Legacy / cross-engine parity tests   |
| `pcg64`          | 128 bit   | 2¹²⁶        | Default — passes BigCrush          | Production Monte Carlo & live spins  |
| `xoshiro256ss`   | 256 bit   | 2²⁵⁶ − 1    | Excellent quality, very fast       | High-throughput parallel sim         |
| `philox4x32`     | counter   | 2¹²⁸        | Counter-based — random access      | GPU, deterministic replay, jump-ahead |

State size and period are **not interchangeable choices**. Production
configs default to `pcg64`. `mulberry32` is the only legacy default
retained, exclusively for parity diff between the TS engine and the
Rust engine (both implement Mulberry32 byte-for-byte identically).

---

## The `RngBackend` trait (Rust) / interface (TS)

Identical shape on both stacks:

```rust
// rust-sim/src/rng.rs
pub trait RngBackend: Send + Sync {
    fn next_u64(&mut self) -> u64;
    fn next_f64(&mut self) -> f64;                // 53-bit mantissa
    fn next_u32_bounded(&mut self, max: u32) -> u32; // Lemire — no modulo bias
    fn split(&self, nonce: u64) -> Box<dyn RngBackend>;
    fn seed_state(&self) -> [u64; 4];
}
```

```ts
// src/rng/RngBackend.ts
export interface RngBackend {
  nextU64(): [number, number];      // JS has no u64 — split as [hi32, lo32]
  nextF64(): number;                 // 53-bit mantissa
  nextU32Bounded(max: number): number; // Lemire
  split(nonce: number): RngBackend;
}
```

### Why `next_u32_bounded` exists

Naive `rng.next_u64() % max` produces **modulo bias** unless `max` is a
power of two. Every RNG call that picks a reel position or a symbol
ID must use the Lemire rejection method — not modulo. Lemire is
nearly division-free and unbiased.

### Why `next_f64` uses the *top* 53 bits

Mantissa of `f64` is 53 bits. Taking the **upper** bits gives uniform
[0, 1) regardless of the generator's internal mixing depth. Some LCG
backends (PCG variants with even multipliers in the low 32) have
weaker low bits — using `>> 11` from the top is robust to that.

---

## Splitting protocol

Parallel Monte Carlo needs many independent streams. The engine
mandates **explicit splitting** — workers never seed themselves by
hashing thread-IDs or wall-clock.

```rust
let parent = Pcg64::new(seed);
let stream0 = parent.split(0);
let stream1 = parent.split(1);
// ... streamN = parent.split(N);
// Workers 0..N each receive their stream.
```

Each backend defines `split(nonce)` differently:

| Backend        | Split implementation                                                          |
|----------------|-------------------------------------------------------------------------------|
| `mulberry32`   | `seed ⊕ (nonce × 0x9E37_79B9)` — XORshift-mixed                              |
| `pcg64`        | Stream selector — both streams independent within the PCG family               |
| `xoshiro256ss` | `jump()` advance × nonce — moves 2¹²⁸ positions ahead                          |
| `philox4x32`   | Counter advance by `nonce × 2⁶⁴` — counter-based makes this O(1)              |

Splitting is **deterministic**: a given (parent seed, nonce) always
produces the same child stream. Replay tests rely on this.

---

## Seed format

IR field `"rng.seed"` accepts:

- Hex literal: `"0xCAFEBABE_DEADBEEF"` (underscore separator allowed)
- Decimal integer: `"1234567890"`
- Hash of a string: `"sha256:my-deterministic-label"`

Internally everything is normalized to `u64`. Hashing-from-string is
provided so QA fixtures can use human-readable labels without losing
determinism.

---

## State serialization

Every backend implements `seed_state() -> [u64; 4]`. This is used by:

- **Recall** (`src/recall/`) — every spin journals the pre-spin RNG
  state so replay reconstructs the spin byte-for-byte.
- **Cluster fail-over** (`rust-sim/src/cluster/`) — workers checkpoint
  state every N spins; on crash a peer resumes from the checkpoint.
- **Audit chain** — the RNG state hash is part of the per-spin
  audit-chain payload.

Backends that don't fit in 4 × u64 (e.g. counter+key for Philox) pack
into the array in a documented order; deserialization is the inverse.

---

## Statistical-quality acceptance criteria

Default backend (`pcg64`) MUST pass:

| Suite             | Acceptance                                  | Owner                         |
|-------------------|---------------------------------------------|-------------------------------|
| TestU01 SmallCrush | All 15 tests pass                           | `cargo test --release crush` |
| TestU01 Crush      | All 96 tests pass                           | nightly job                   |
| TestU01 BigCrush   | All 160 tests pass                          | weekly job                    |
| NIST SP 800-22     | 188 of 188 sub-tests at α=0.01              | release gate                  |
| PractRand          | ≥ 2³⁸ bytes without failures                | release gate                  |

`mulberry32` is **exempt** from BigCrush — it fails several tests by
design (small state). It is retained only for TS↔Rust parity, not for
production roll.

---

## Hot-path inlining

The `next_*` methods are marked `#[inline]` in Rust and inlined by the
TS bundler. The trait-object indirection (`Box<dyn RngBackend>`) is
hoisted **outside** the per-spin loop: a worker captures its concrete
backend by value at thread start and the spin loop calls a
monomorphic function.

The hot inner loop never branches on `rng.kind`.

---

## Cross-stack parity

The differential CI job (`ci.yml::parity`) seeds both TS and Rust
engines from the **same IR + same seed** and asserts:

| Backend          | RTP delta            | Per-spin trace                                |
|------------------|----------------------|------------------------------------------------|
| `mulberry32`     | 0.00% — byte parity  | First 1000 spins MUST match exactly            |
| `pcg64`          | < 0.005% on 10⁶ spin | Sampled traces match (no exact-byte parity)    |
| `xoshiro256ss`   | < 0.005% on 10⁶ spin | Sampled traces match                            |
| `philox4x32`     | < 0.005% on 10⁶ spin | Sampled traces match                            |

Mulberry32 is the only backend that gives byte parity; the others
share semantics but the two implementations diverge in micro-detail
(e.g. order of integer operations on different word widths). The
**math** matches; the **bit-exact stream** does not.

---

## Adding a new backend

1. Implement the trait in `rust-sim/src/rng.rs::backends::*` and the
   matching interface in `src/rng/backends/*.ts`.
2. Add the new variant to `RngKind` (both stacks).
3. Add an entry to `RngFactory` (TS) and the `rng_from_ir` match
   arm (Rust).
4. Add a parity fixture in `tests/fixtures/rng-parity/` if the new
   backend supports byte-exact cross-stack parity.
5. Add a statistical-quality acceptance row to the table above and
   wire up the relevant TestU01 / NIST / PractRand runner.

Anything less is a regression to the regulator.
