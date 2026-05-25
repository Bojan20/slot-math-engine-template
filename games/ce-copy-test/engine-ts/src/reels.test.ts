// Reel sampler + weighted-table tests — convergence checks against the
// canonical IR.

import { describe, expect, it } from "vitest";
import { loadIr } from "./ir.js";
import { ReelSetPicker, Strip, WeightedTable } from "./reels.js";
import { Prng } from "./rng.js";

const IR_PATH = `${import.meta.dirname}/../../out/ce-copy-test.200-1637-001.ir.json`;

describe("Strip sampling", () => {
  it("samples in proportion to weight", () => {
    const s = new Strip([
      { symbol: "A", weight: 1 },
      { symbol: "B", weight: 9 },
    ]);
    const rng = Prng.fromSeed(0n);
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 10000; i++) {
      const idx = s.sampleStop(rng);
      counts[s.symbols[idx]! as "A" | "B"]++;
    }
    // B should dominate ~9:1
    expect(counts.B).toBeGreaterThan(counts.A * 6);
    expect(counts.B).toBeLessThan(counts.A * 12);
  });

  it("visible window wraps cyclically", () => {
    const s = new Strip([
      { symbol: "Top", weight: 1 },
      { symbol: "Mid", weight: 1 },
      { symbol: "Bot", weight: 1 },
    ]);
    expect(s.visible(0)).toEqual(["Bot", "Top", "Mid"]);
    expect(s.visible(1)).toEqual(["Top", "Mid", "Bot"]);
    expect(s.visible(2)).toEqual(["Mid", "Bot", "Top"]);
  });
});

describe("WeightedTable", () => {
  it("respects relative weights", () => {
    const t = new WeightedTable<string>([
      ["x", 30],
      ["y", 70],
    ]);
    const rng = Prng.fromSeed(123n);
    let xCount = 0;
    for (let i = 0; i < 10000; i++) {
      const [v] = t.sampleWithIndex(rng);
      if (v === "x") xCount++;
    }
    expect(xCount).toBeGreaterThan(2700);
    expect(xCount).toBeLessThan(3300);
  });
});

describe("IR-driven reel set picker", () => {
  it("BG total weight = 500_000 per PAR-001 D105", () => {
    const ir = loadIr(IR_PATH);
    const picker = ReelSetPicker.fromBg(ir);
    expect(picker.picker.total).toBe(500_000);
  });

  it("FG total weight = 39_752 per PAR-001", () => {
    const ir = loadIr(IR_PATH);
    const picker = ReelSetPicker.fromFg(ir);
    expect(picker.picker.total).toBe(39_752);
  });

  it("BG has 36 reel sets, FG has 16", () => {
    const ir = loadIr(IR_PATH);
    expect(ReelSetPicker.fromBg(ir).sets.length).toBe(36);
    expect(ReelSetPicker.fromFg(ir).sets.length).toBe(16);
  });

  it("every BG reel has 5 strips and stop counts > 0", () => {
    const ir = loadIr(IR_PATH);
    const picker = ReelSetPicker.fromBg(ir);
    for (const rs of picker.sets) {
      expect(rs.strips.length).toBe(5);
      for (const strip of rs.strips) {
        expect(strip.symbols.length).toBeGreaterThan(0);
        expect(strip.total).toBeGreaterThan(0);
      }
    }
  });
});
