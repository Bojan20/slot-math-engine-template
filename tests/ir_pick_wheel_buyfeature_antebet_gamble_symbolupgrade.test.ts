/**
 * W152 P0-3 round 2 — IR adapter Pick / Wheel / BuyFeature / AnteBet /
 * Gamble / SymbolUpgrade unstub.
 *
 * Validates that `irToGameConfig()` now extracts six additional feature
 * config blocks that were previously dropped (no-op match arms in both
 * Rust and TS adapters).
 *
 * The companion Rust integration test in
 * `rust-sim/tests/ir_pick_wheel_buyfeature_antebet_gamble_symbolupgrade.rs`
 * consumes the **same** fixture
 * (`tests/fixtures/pick-wheel-buyfeature-antebet-gamble-symbolupgrade.json`)
 * and asserts byte-stable equivalent output — extending the TS↔Rust parity
 * gate to all 9 currently-supported feature kinds.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { irToGameConfig } from '../src/ir/adapter.js';
import type { SlotGameIR } from '../src/ir/types.js';

const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'pick-wheel-buyfeature-antebet-gamble-symbolupgrade.json',
);

function loadFixture(): SlotGameIR {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as SlotGameIR;
}

describe('W152 P0-3 r2 — IR adapter pick / wheel / buy_feature / ante_bet / gamble / symbol_upgrade', () => {
  it('extracts pick config with weighted prize pool preserving order', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.pick).toBeDefined();
    expect(cfg.pick?.prizePool).toHaveLength(4);
    expect(cfg.pick?.prizePool[0]).toEqual({
      id: 'MINI',
      weight: 50.0,
      payMultiplier: 10.0,
    });
    expect(cfg.pick?.prizePool[3]).toEqual({
      id: 'GRAND',
      weight: 5.0,
      payMultiplier: 1000.0,
    });
    // Weights sum to 100 — verifies fidelity.
    const total = cfg.pick!.prizePool.reduce((s, p) => s + p.weight, 0);
    expect(total).toBeCloseTo(100, 9);
  });

  it('extracts wheel config with segments preserving order', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.wheel).toBeDefined();
    expect(cfg.wheel?.segments).toHaveLength(5);
    expect(cfg.wheel?.segments[0]).toEqual({
      id: 'x1',
      weight: 40.0,
      payMultiplier: 1.0,
    });
    expect(cfg.wheel?.segments[4]).toEqual({
      id: 'x50',
      weight: 5.0,
      payMultiplier: 50.0,
    });
  });

  it('extracts buy_feature config with both offers', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.buyFeature).toBeDefined();
    expect(cfg.buyFeature?.offers).toHaveLength(2);
    expect(cfg.buyFeature?.offers[0]).toEqual({
      id: 'FS',
      costX: 100.0,
      guaranteed: 'free_spins',
    });
    expect(cfg.buyFeature?.offers[1]).toEqual({
      id: 'SUPER_FS',
      costX: 250.0,
      guaranteed: 'super_free_spins',
    });
  });

  it('extracts ante_bet config with multiplier + default', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.anteBet).toBeDefined();
    expect(cfg.anteBet?.extraMultiplier).toBe(1.25);
    expect(cfg.anteBet?.enabledByDefault).toBe(false);
  });

  it('extracts gamble config with type + tie_resolution', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.gamble).toBeDefined();
    expect(cfg.gamble?.type).toBe('red_black');
    expect(cfg.gamble?.maxSteps).toBe(5);
    expect(cfg.gamble?.tieResolution).toBe('push');
  });

  it('extracts symbol_upgrade config', () => {
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.symbolUpgrade).toBeDefined();
    expect(cfg.symbolUpgrade?.from).toBe('S_LP1');
    expect(cfg.symbolUpgrade?.to).toBe('S_HP3');
    expect(cfg.symbolUpgrade?.probability).toBe(0.05);
  });

  it('omits all six keys when the IR has no such features', () => {
    const minimal: SlotGameIR = {
      ...loadFixture(),
      features: [
        {
          kind: 'free_spins',
          trigger: {
            by: 'scatter_count',
            thresholds: { '3': 8, '4': 12, '5': 15 },
          },
          global_multiplier: 1,
        },
      ],
    };
    const cfg = irToGameConfig(minimal);
    expect(cfg.pick).toBeUndefined();
    expect(cfg.wheel).toBeUndefined();
    expect(cfg.buyFeature).toBeUndefined();
    expect(cfg.anteBet).toBeUndefined();
    expect(cfg.gamble).toBeUndefined();
    expect(cfg.symbolUpgrade).toBeUndefined();
    // Keys must NOT be present in the object (not just `undefined` values).
    // Otherwise JSON.stringify would emit `"pick": undefined` which differs
    // from Rust's `skip_serializing_if = "Option::is_none"` — breaks parity.
    expect(Object.prototype.hasOwnProperty.call(cfg, 'pick')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cfg, 'wheel')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cfg, 'buyFeature')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cfg, 'anteBet')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cfg, 'gamble')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cfg, 'symbolUpgrade')).toBe(
      false,
    );
  });

  it('gamble snake_case → camelCase: type / maxSteps / tieResolution', () => {
    // IR wire format is snake_case; TS adapter exposes camelCase keys.
    // Verifies the mapping isn't accidentally identity (would break parity).
    const cfg = irToGameConfig(loadFixture());
    expect(cfg.gamble).toBeDefined();
    // Idiomatic TS keys present:
    expect(Object.keys(cfg.gamble!).sort()).toEqual([
      'maxSteps',
      'tieResolution',
      'type',
    ]);
    // IR-style keys absent:
    const obj = cfg.gamble as unknown as Record<string, unknown>;
    expect(obj.max_steps).toBeUndefined();
    expect(obj.tie_resolution).toBeUndefined();
  });

  it('JSON stringify of pick/wheel/buyFeature is order-stable', () => {
    // Stability matters for parity: the same IR run twice must produce the
    // same byte string in TS as in Rust. Arrays preserve insertion order in
    // JSON.stringify, so the only risk would be the adapter sorting them
    // — we explicitly do NOT sort prize pools / segments / offers.
    const cfg1 = irToGameConfig(loadFixture());
    const cfg2 = irToGameConfig(loadFixture());
    expect(JSON.stringify(cfg1.pick)).toBe(JSON.stringify(cfg2.pick));
    expect(JSON.stringify(cfg1.wheel)).toBe(JSON.stringify(cfg2.wheel));
    expect(JSON.stringify(cfg1.buyFeature)).toBe(
      JSON.stringify(cfg2.buyFeature),
    );
  });
});
