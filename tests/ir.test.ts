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

// ─── PHASE 50 — Ultimate Build-Section QA closeout ──────────────────────
// Three holes that survived through W213:
//   (1) duplicate symbol ids silently collapsed in crossValidate's Set,
//       so the evaluator picked the first occurrence and downstream RTP
//       drifted with no surfaced error.
//   (2) Zod `z.number()` accepts NaN/Infinity by default; `.min()/.max()`
//       chained comparisons return false for NaN, so every numeric
//       constraint silently passes a NaN value.
//   (3) The roundtrip parity test caught neither because the canonical
//       fixture has unique ids and finite numbers.
// Regression coverage below pins all three.

describe('IR — duplicate symbol id detection (PHASE 50)', () => {
  it('rejects an IR with two symbols sharing an id', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    // Clone the first symbol but keep the existing id — duplicate by design.
    const dup = { ...ir.symbols[0], name: ir.symbols[0].name + ' (dup)' };
    ir.symbols.push(dup);
    const result = parseGameIR(ir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const dupErrors = result.issues.filter((i) => /duplicate symbol id/.test(i.message));
      expect(dupErrors.length).toBeGreaterThanOrEqual(1);
      // Path points to the SECOND occurrence (the dup we appended).
      expect(dupErrors[0].path).toMatch(/\/symbols\/\d+\/id/);
    }
  });

  it('crossValidate surfaces the duplicate id message verbatim', () => {
    const ir = (parseGameIR(loadFixture()) as { ir: SlotGameIR }).ir;
    ir.symbols.push({ ...ir.symbols[0] });
    const { errors } = crossValidate(ir);
    expect(errors.some((e) => /duplicate symbol id/.test(e.message))).toBe(true);
  });

  it('accepts the unmodified canonical fixture (no duplicate-id false positives)', () => {
    const result = parseGameIR(loadFixture());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.filter((w) => /duplicate/.test(w.message))).toHaveLength(0);
    }
  });
});

describe('IR — non-finite number rejection (PHASE 50)', () => {
  // Zod 4 (`z.number()`) already rejects NaN/Infinity at the type level
  // by emitting "Invalid input: expected number, received NaN/Infinity".
  // These tests pin that contract so an accidental downgrade to Zod 3 —
  // where `z.number()` accepted NaN and `.min()/.max()` comparisons
  // returned false for NaN, silently corrupting RTP math — fails loudly.

  // Zod 4's wording for non-finite varies by context (direct number =
  // "received NaN/Infinity"; record value = "received number"), so we
  // pin only the ok=false signal + the path of the offending field
  // rather than the exact message string.

  it('rejects NaN in a paytable payout multiplier', () => {
    const raw = loadFixture() as { paytable: Record<string, Record<string, number>>; symbols: { id: string }[] };
    const firstSym = raw.symbols[0].id;
    raw.paytable[firstSym] = { ...raw.paytable[firstSym], '3': Number.NaN };
    const result = parseGameIR(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.startsWith(`/paytable/${firstSym}`))).toBe(true);
    }
  });

  it('rejects +Infinity in a reel weight', () => {
    const raw = loadFixture() as { reels: { mode: string; base: Array<Record<string, number>> } };
    if (raw.reels.mode !== 'weighted') return; // fixture should be weighted
    const firstKey = Object.keys(raw.reels.base[0])[0];
    raw.reels.base[0][firstKey] = Number.POSITIVE_INFINITY;
    const result = parseGameIR(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.startsWith('/reels/base/0/'))).toBe(true);
    }
  });

  it('rejects -Infinity in rtp_allocation.base_game', () => {
    const raw = loadFixture() as { rtp_allocation: Record<string, number> };
    raw.rtp_allocation = { ...raw.rtp_allocation, base_game: Number.NEGATIVE_INFINITY };
    const result = parseGameIR(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects NaN in limits.target_rtp', () => {
    const raw = loadFixture() as { limits: Record<string, unknown> };
    raw.limits = { ...raw.limits, target_rtp: Number.NaN };
    const result = parseGameIR(raw);
    expect(result.ok).toBe(false);
  });

  it('accepts the canonical fixture (no false-positive finite checks)', () => {
    const result = parseGameIR(loadFixture());
    expect(result.ok).toBe(true);
  });
});
