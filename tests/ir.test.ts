/**
 * IR — Faza 1.1 acceptance gate.
 *
 * Three layers under test:
 *   1. Zod shape — `SlotGameIRZ.safeParse` on the canonical fixture must succeed.
 *   2. Semantic cross-validation — `parseGameIR` returns no errors.
 *   3. Roundtrip stability — `JSON.parse(JSON.stringify(ir))` re-parses
 *      cleanly with identical structure (no field re-ordering changes
 *      semantic equality once we go through a stable serializer).
 *
 * Plus negative tests for each cross-validation rule so regressions in
 * `crossValidate` show up immediately.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  parseGameIR,
  crossValidate,
  SlotGameIRZ,
  type SlotGameIR,
} from '../src/ir/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, 'fixtures', 'parity.json');

function loadFixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE, 'utf-8'));
}

describe('IR — Zod shape', () => {
  it('accepts the canonical parity fixture', () => {
    const raw = loadFixture();
    const result = SlotGameIRZ.safeParse(raw);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('rejects a config missing required block', () => {
    const raw = loadFixture() as Record<string, unknown>;
    delete raw.paytable;
    const result = SlotGameIRZ.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects an unknown topology kind', () => {
    const raw = loadFixture() as { topology: Record<string, unknown> };
    raw.topology = { kind: 'square', size: 5 };
    const result = SlotGameIRZ.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects unknown evaluation kind', () => {
    const raw = loadFixture() as { evaluation: Record<string, unknown> };
    raw.evaluation = { kind: 'unknown', foo: 1 };
    expect(SlotGameIRZ.safeParse(raw).success).toBe(false);
  });
});

describe('IR — parseGameIR (Zod + semantic)', () => {
  it('returns ok=true with no errors on the canonical fixture', () => {
    const result = parseGameIR(loadFixture());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(result.ir.meta.id).toBe('parity-fixture');
    }
  });

  it('surfaces unknown top-level keys without failing', () => {
    const raw = loadFixture() as Record<string, unknown>;
    raw.__ops_metadata = { ticket: 'JIRA-1234' };
    const result = parseGameIR(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.unknown_keys).toContain('__ops_metadata');
    }
  });
});

describe('IR — crossValidate semantic rules', () => {
  it('flags paytable symbol that does not exist in /symbols', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.paytable['S_PHANTOM'] = { '3': 1 };
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => e.path.includes('S_PHANTOM'))).toBe(true);
  });

  it('flags reel weight key referencing unknown symbol', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    if (ir.reels.mode === 'weighted') {
      ir.reels.base[0]['S_PHANTOM'] = 1;
    }
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /S_PHANTOM/.test(e.message))).toBe(true);
  });

  it('flags rectangular topology with payline length mismatch', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    if (ir.evaluation.kind === 'lines') {
      ir.evaluation.paylines.push([1, 1, 1, 1]); // only 4 reels — should be 5
    }
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /payline length/.test(e.message))).toBe(true);
  });

  it('flags row out of range', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    if (ir.evaluation.kind === 'lines') {
      ir.evaluation.paylines[0] = [9, 9, 9, 9, 9];
    }
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /out of range/.test(e.message))).toBe(true);
  });

  it('flags RTP allocation that does not sum to target_rtp', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.rtp_allocation.base_game = 0.1; // total now ≈ 0.40, target is 0.96
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /rtp_allocation/.test(e.path))).toBe(true);
  });

  it('warns when target_rtp falls outside compliance band', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.compliance.rtp_range_required = [0.97, 0.98];
    const { warnings } = crossValidate(ir);
    expect(warnings.some((w) => /target_rtp/.test(w.path))).toBe(true);
  });

  it('flags hold_and_win without a bonus symbol present', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.features.push({
      kind: 'hold_and_win',
      trigger: { by: 'bonus_count', min: 6 },
      respins_initial: 3,
      respin_reset_on_new: true,
      cash_value_distribution: [{ value: 1, weight: 1 }],
      jackpot_tiers: [{ id: 'GRAND', multiplier: 1000 }],
    });
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /hold_and_win/.test(e.message))).toBe(true);
  });

  it('accepts hold_and_win when bonus symbol exists', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.symbols.push({ id: 'S_BONUS', name: 'Bonus', kind: 'bonus' });
    if (ir.reels.mode === 'weighted') {
      ir.reels.base.forEach((map) => (map['S_BONUS'] = 1));
    }
    ir.features.push({
      kind: 'hold_and_win',
      trigger: { by: 'bonus_count', min: 6 },
      respins_initial: 3,
      respin_reset_on_new: true,
      cash_value_distribution: [{ value: 1, weight: 1 }],
      jackpot_tiers: [{ id: 'GRAND', multiplier: 1000 }],
    });
    // Re-balance allocation so it still sums to target_rtp.
    ir.rtp_allocation = {
      base_game: 0.5,
      free_spins: 0.2,
      hold_and_win: 0.26,
      jackpot: 0.0,
      tolerance: 0.005,
    };
    const { errors } = crossValidate(ir);
    expect(errors.filter((e) => /hold_and_win/.test(e.message))).toHaveLength(0);
  });
});

describe('IR — JSON roundtrip stability', () => {
  it('parse → stringify → parse is structurally identical', () => {
    const first = parseGameIR(loadFixture());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const re = JSON.parse(JSON.stringify(first.ir));
    const second = parseGameIR(re);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.ir).toEqual(first.ir);
    }
  });
});
