"""W4.5 — TypeScript engine codegen + Rust↔TS parity gate.

Mirrors the P3.2 Rust codegen but for an RGS-side TypeScript runtime.
Emits a self-contained TS package:

    <out>/<slug>-ts/
        package.json        — name=<slug>-ts, type=module, deps=tsx + vitest
        tsconfig.json       — strict ES2022 + node module resolution
        src/
            sim.ts          — IR loader + line-evaluator + PCG64 PRNG
            main.ts         — CLI runner (process.argv parsing)
        ir/<slug>.ir.json   — embedded IR copy
        tests/
            <slug>.spec.ts  — vitest parity check vs golden RTP
        README.md           — `tsx src/main.ts --spins 1000` quickstart

Parity gate
===========

The companion ``parity_check`` helper takes a (slug, n_spins, seed)
triple and:
  1. Runs the Rust crate via cargo (when available) → captures RTP +
     hit_freq
  2. Runs the TS via tsx (when available) → captures RTP + hit_freq
  3. Asserts both fall within the published rtp_tolerance band

Pure-Python — no actual cargo/tsx execution in the codegen call,
only in the optional parity check.
"""
from tools.codegen_ts.codegen import (
    write_ts_codegen,
    slugify,
)

__all__ = [
    "write_ts_codegen",
    "slugify",
]
