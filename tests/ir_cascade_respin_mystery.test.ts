/**
 * W152 P0-3 — IR adapter Cascade / Respin / MysterySymbol unstub.
 *
 * Validates that `irToGameConfig()` now extracts the three new feature
 * config blocks from the IR (previously dropped on the floor as TODO).
 *
 * The companion Rust integration test in
 * `rust-sim/tests/ir_cascade_respin_mystery.rs` consumes the **same**
 * fixture (`tests/fixtures/cascade-respin-mystery.json`) and asserts
 * byte-stable equivalent output — the TS↔Rust parity gate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { irToGameConfig } from '../src/ir/adapter.js';
import type { SlotGameIR } from '../src/ir/types.js';

function loadFixture(): SlotGameIR {
  const raw = readFileSync(
    join(__dirname, 'fixtures', 'cascade-respin-mystery.json'),
    'utf-8',
  );
  return JSON.parse(raw) as SlotGameIR;
}

describe('W152 P0-3 — IR adapter cascade / respin / mystery', () => {
  it('extracts cascade config with multiplier ladder', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    expect(cfg.cascade).toBeDefined();
    expect(cfg.cascade?.replacement).toBe('drop');
    expect(cfg.cascade?.maxChain).toBe(7);
    expect(cfg.cascade?.multiplierProgression).toEqual([
      1.0, 2.0, 3.0, 5.0, 8.0,
    ]);
  });

  it('extracts respin config with cost + cap', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    expect(cfg.respin).toBeDefined();
    expect(cfg.respin?.costX).toBe(2.5);
    expect(cfg.respin?.maxUsesPerSpin).toBe(3);
  });

  it('extracts mystery config with reveal distribution', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    expect(cfg.mystery).toBeDefined();
    expect(cfg.mystery?.symbolId).toBe('S_MYS');
    expect(cfg.mystery?.revealDistribution).toEqual({
      S_HP1: 15.0,
      S_HP2: 15.0,
      S_LP1: 25.0,
      S_LP2: 20.0,
      S_LP3: 20.0,
      S_WILD: 5.0,
    });
    // Alphabetic ordering is required for parity with the Rust BTreeMap
    // — verify the JS object's iteration order explicitly.
    const keys = Object.keys(cfg.mystery!.revealDistribution);
    expect(keys).toEqual([...keys].sort());
  });

  it('legacy fields (freeSpins, holdAndWin) still populate', () => {
    const ir = loadFixture();
    const cfg = irToGameConfig(ir);
    expect(cfg.freeSpins.awards).toEqual({ 3: 8, 4: 12, 5: 15 });
    // Hold & win is absent from this fixture → carries the default.
    expect(cfg.holdAndWin.triggerCount).toBe(6);
  });

  it('omits cascade / respin / mystery keys when IR has none', () => {
    const ir = loadFixture();
    // Strip the new features — only free_spins remains.
    ir.features = ir.features.filter((f) => f.kind === 'free_spins');
    const cfg = irToGameConfig(ir);
    expect(cfg.cascade).toBeUndefined();
    expect(cfg.respin).toBeUndefined();
    expect(cfg.mystery).toBeUndefined();
  });

  it('serialised JSON output stays byte-stable across runs (parity-safe)', () => {
    const ir = loadFixture();
    const a = JSON.stringify(irToGameConfig(ir));
    const b = JSON.stringify(irToGameConfig(ir));
    expect(a).toBe(b);
  });
});
