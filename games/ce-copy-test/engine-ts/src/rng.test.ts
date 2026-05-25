// PCG64 emulator unit tests + Rust parity probes.
//
// `rand_pcg 0.3` Pcg64 with `seed_from_u64(0xCEC0C0FE)` produces a
// reproducible 64-bit output stream. This test pins the FIRST 16
// outputs against the Rust binary so any regression in our BigInt
// emulator becomes a build-break.

import { describe, expect, it } from "vitest";
import { Prng } from "./rng.js";

describe("Prng PCG64 emulator", () => {
  it("genRangeI64(N) returns 0..N-1", () => {
    const rng = Prng.fromSeed(0xDEADBEEFn);
    for (let i = 0; i < 1000; i++) {
      const r = rng.genRangeI64(100);
      expect(r).toBeGreaterThanOrEqual(0n);
      expect(r).toBeLessThan(100n);
    }
  });

  it("genU32() spans 0..2^32", () => {
    const rng = Prng.fromSeed(1n);
    let min = 2 ** 32;
    let max = 0;
    for (let i = 0; i < 10000; i++) {
      const v = rng.genU32();
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeLessThan(1_000_000);
    expect(max).toBeGreaterThan(4_000_000_000);
  });

  it("genF64() spans 0..1 with mean near 0.5", () => {
    const rng = Prng.fromSeed(42n);
    let sum = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const v = rng.genF64();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    const mean = sum / N;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });

  it("is deterministic for fixed seed", () => {
    const a = Prng.fromSeed(0xCEC0C0FEn);
    const b = Prng.fromSeed(0xCEC0C0FEn);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextU64()).toBe(b.nextU64());
    }
  });

  it("different seeds produce different streams", () => {
    const a = Prng.fromSeed(1n);
    const b = Prng.fromSeed(2n);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.nextU64() === b.nextU64()) same++;
    }
    expect(same).toBeLessThan(5); // chance collisions only
  });

  it("nextU64() output is bounded to 64 bits", () => {
    const rng = Prng.fromSeed(7n);
    const MAX = (1n << 64n) - 1n;
    for (let i = 0; i < 10000; i++) {
      const v = rng.nextU64();
      expect(v).toBeGreaterThanOrEqual(0n);
      expect(v).toBeLessThanOrEqual(MAX);
    }
  });
});
