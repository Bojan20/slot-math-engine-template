# GPU Metal Byte-Parity Status — Faza 9.6 / 9.8b

> Captured: W152 Wave 26 · Host: Apple M3 Pro · Metal-capable GPU available

## Master TODO claim under test

> **9.6 GPU backend (Metal — dev mašina; CUDA — provider preuzima)**
>
> **Acceptance:** 50–500× CPU for 5×3 lines igra · byte parity 1 M spins
> GPU ↔ CPU.

## Current state

The GPU module is **scaffold-only** — it ships:

| Artifact                            | State |
|-------------------------------------|-------|
| `rust-sim/src/gpu/mod.rs`           | ✅ public surface (`GpuRequest`/`GpuResult`/`GpuAvailability`) |
| `rust-sim/src/gpu/spin_eval.wgsl`   | ✅ 239-line WGSL kernel — Philox4x32 RNG + 5-payline eval + scatter pay |
| `rust-sim/src/gpu/request.rs`       | ✅ pipeline contract types |
| `probe_gpu()` runtime probe         | ✅ returns `NotCompiled` (default) / `NoAdapter` (`feature = "gpu"`) |
| `wgpu` integration                  | ❌ no dep in Cargo.toml — Faza 9.8b work item |
| `naga` WGSL validator               | ❌ no dep in Cargo.toml |
| GPU executor `SpinPipeline::run`    | ❌ stub — does nothing |
| GPU↔CPU byte parity test            | ❌ cannot exist until executor lands |

## What 1 M-spin byte parity requires

The acceptance gate ("1 M spins GPU ≡ 1 M spins CPU bit-for-bit") needs
THREE things in place that aren't:

1. **wgpu integration.** `wgpu = "0.20"` (or current) on Cargo.toml,
   `feature = "gpu"` propagation to the binary, real
   `Instance::request_adapter` → `Device::create_shader_module` path.

2. **Identical RNG stream.** The WGSL kernel uses Philox4x32 keyed by
   `(base_seed, slice_index, gid)`. The CPU side must use the SAME
   keying scheme so spin index N consumes the same 4 u32s on both
   sides. Today the CPU `BulkDispatcher` uses `SlotRng` (Mulberry32-
   compatible). For byte parity we'd need to add a CPU Philox4x32
   path AND prove it's stream-identical to the WGSL emulation.

3. **Identical floating-point semantics.** WGSL `f32` and Rust `f32`
   should agree, but corner cases (denormals, fused-multiply-add
   ordering, transcendentals) need byte-level audit before claiming
   "byte parity".

Total: ~3-4 weeks of Faza 9.8b work, two of those weeks being the
Philox4x32 CPU mirror + cross-validation.

## What we CAN ship in Wave 26

**Nothing testable.** The honest answer is that 9.6 acceptance stays
❌ this wave. Adding a sham test that just compares scaffold output
(empty bytes vs. empty bytes) would be misleading.

What IS in this report:

- This document mapping the gate to specific outstanding work items.
- A renewed status flip in master TODO: `9.6 ⚠️` → `9.6 ⚠️ (Faza 9.8b
  blocked on wgpu integration)`.

## Reproduction path (when Faza 9.8b lands)

```rust
// rust-sim/tests/faza98b_gpu_byte_parity.rs (future)
let cpu_results = run_cpu_philox(seed, 1_000_000);
let gpu_results = run_gpu_philox(seed, 1_000_000)?;
assert_eq!(cpu_results, gpu_results); // byte-exact
```

This test will land alongside the wgpu integration; not before.

## Acceptance verdict

**Master TODO 9.6 acceptance: ❌** — scaffold landed, executor pending.

Status flip recommended: "⚠️" → "⚠️ scaffold ✅ / wgpu integration
+ Philox CPU mirror pending (Faza 9.8b — Wave 28+)".
