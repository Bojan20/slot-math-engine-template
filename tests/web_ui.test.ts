/**
 * W152 Faza 11.1 — Web Config Builder UI unit tests.
 *
 * The UI ships pure ES-module helpers (`validateIRShape`, `topologyDims`,
 * `reelProbabilities`, `estimateBaseRtp`, `loadIRText`) that have no DOM
 * dependencies. We exercise every branch from node + vitest without
 * spinning up a browser.
 *
 * The DOM-binding code path (`bindUI`, `handleFile`) is exercised
 * manually in a browser; not unit-tested here.
 * Smoke / e2e in a real browser is out of scope for the MVP — a single
 * Playwright spec would be the next step.
 */

import { describe, it, expect } from 'vitest';
import {
  validateIRShape,
  topologyDims,
  reelProbabilities,
  estimateBaseRtp,
  loadIRText,
} from '../web/app.js';

function lineFixture() {
  return {
    schema_version: '1.0.0',
    meta: { id: 'web-ui-fixture', name: 'Web UI Fixture', version: '1.0.0', theme_tags: ['test'] },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'LP', name: 'Low', kind: 'lp' },
      { id: 'HP', name: 'High', kind: 'hp' },
      { id: 'WILD', name: 'Wild', kind: 'wild' },
    ],
    reels: {
      mode: 'weighted',
      base: [
        { LP: 80, HP: 18, WILD: 2 },
        { LP: 80, HP: 18, WILD: 2 },
        { LP: 80, HP: 18, WILD: 2 },
        { LP: 80, HP: 18, WILD: 2 },
        { LP: 80, HP: 18, WILD: 2 },
      ],
    },
    evaluation: { kind: 'lines', paylines: [[1, 1, 1, 1, 1]], direction: 'ltr', min_match: 3, pay_left_to_right_only: true },
    paytable: {
      LP: { '3': 0.5, '4': 2, '5': 8 },
      HP: { '3': 3, '4': 12, '5': 63 },
    },
    features: [],
    rng: { kind: 'mulberry32', default_seed: 1 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: { target_rtp: 0.96, rtp_tolerance: 0.0005, max_win_x: 5000, win_cap_apply: 'per_spin', target_volatility: 'medium', hit_freq_target: 0.3 },
    compliance: { jurisdictions: ['UKGC'], rtp_range_required: [0.92, 0.97], max_win_cap_required: 10000, near_miss_rule: 'must_be_random', ldw_disclosure: true, session_time_display: true },
    rtp_allocation: { base_game: 0.96, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.005 },
  };
}

// ─── validateIRShape ──────────────────────────────────────────────────────

describe('Web UI — validateIRShape', () => {
  it('clean fixture → no issues', () => {
    expect(validateIRShape(lineFixture())).toEqual([]);
  });
  it('top-level non-object → single issue', () => {
    expect(validateIRShape(null)).toEqual(['Top-level value is not an object.']);
    expect(validateIRShape(42)).toEqual(['Top-level value is not an object.']);
  });
  it('missing required fields are flagged individually', () => {
    const ir = lineFixture() as Partial<ReturnType<typeof lineFixture>>;
    delete ir.symbols;
    delete ir.paytable;
    const issues = validateIRShape(ir);
    expect(issues).toContain('Missing required field: symbols');
    expect(issues).toContain('Missing required field: paytable');
  });
  it('symbols-not-array flagged', () => {
    const ir = lineFixture();
    (ir as { symbols: unknown }).symbols = { not: 'an array' };
    expect(validateIRShape(ir)).toContain('symbols must be an array');
  });
  it('topology.kind type check', () => {
    const ir = lineFixture();
    (ir.topology as { kind: unknown }).kind = 42;
    expect(validateIRShape(ir)).toContain('topology.kind must be a string');
  });
});

// ─── topologyDims ─────────────────────────────────────────────────────────

describe('Web UI — topologyDims', () => {
  it('rectangular reads reels/rows', () => {
    expect(topologyDims({ kind: 'rectangular', reels: 5, rows: 3 })).toEqual([5, 3]);
  });
  it('variable_rows uses max of upper bounds', () => {
    expect(
      topologyDims({
        kind: 'variable_rows',
        reels: 6,
        row_range_per_reel: [
          [2, 4],
          [3, 7],
          [2, 5],
        ],
      }),
    ).toEqual([6, 7]);
  });
  it('cluster_grid uses columns × rows', () => {
    expect(topologyDims({ kind: 'cluster_grid', columns: 7, rows: 7 })).toEqual([7, 7]);
  });
  it('unknown / missing → [0, 0]', () => {
    expect(topologyDims(null)).toEqual([0, 0]);
    expect(topologyDims({ kind: 'mystery' })).toEqual([0, 0]);
  });
});

// ─── reelProbabilities ────────────────────────────────────────────────────

describe('Web UI — reelProbabilities', () => {
  it('weighted reels → normalised probabilities sum to ~1', () => {
    const probs = reelProbabilities(lineFixture());
    expect(probs).toHaveLength(5);
    for (const reel of probs) {
      const sum = Object.values(reel).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
    expect(probs[0].LP).toBeCloseTo(0.8, 6);
    expect(probs[0].HP).toBeCloseTo(0.18, 6);
    expect(probs[0].WILD).toBeCloseTo(0.02, 6);
  });

  it('strips mode → count-based probabilities', () => {
    const ir = lineFixture();
    ir.reels = {
      mode: 'strips',
      base: [['LP', 'LP', 'HP', 'WILD'], ['LP', 'HP', 'HP', 'WILD']],
    } as unknown as typeof ir.reels;
    const probs = reelProbabilities(ir);
    expect(probs[0].LP).toBeCloseTo(0.5, 6);
    expect(probs[1].HP).toBeCloseTo(0.5, 6);
  });

  it('empty reels → empty array', () => {
    const ir = lineFixture();
    (ir as { reels: unknown }).reels = undefined;
    expect(reelProbabilities(ir)).toEqual([]);
  });
});

// ─── estimateBaseRtp ──────────────────────────────────────────────────────

describe('Web UI — estimateBaseRtp', () => {
  it('returns finite numbers for a valid lines fixture', () => {
    const { rtp, hitRate } = estimateBaseRtp(lineFixture());
    expect(rtp).toBeGreaterThan(0);
    expect(rtp).toBeLessThan(5); // sanity ceiling
    expect(hitRate).toBeGreaterThan(0);
    expect(hitRate).toBeLessThan(1);
  });

  it('zero pays → zero RTP', () => {
    const ir = lineFixture();
    ir.paytable = { LP: { '3': 0, '4': 0, '5': 0 }, HP: { '3': 0, '4': 0, '5': 0 } };
    const { rtp } = estimateBaseRtp(ir);
    expect(rtp).toBe(0);
  });

  it('higher symbol probability raises RTP monotonically', () => {
    const a = lineFixture();
    a.reels.base = a.reels.base.map(() => ({ LP: 60, HP: 38, WILD: 2 }));
    const b = lineFixture();
    b.reels.base = b.reels.base.map(() => ({ LP: 60, HP: 38, WILD: 2 }));
    b.paytable.HP['5'] = b.paytable.HP['5'] * 2;
    expect(estimateBaseRtp(b).rtp).toBeGreaterThan(estimateBaseRtp(a).rtp);
  });

  it('under 3 reels → zero (no 3-of-a-kind possible)', () => {
    const ir = lineFixture();
    ir.reels.base = ir.reels.base.slice(0, 2);
    ir.topology = { kind: 'rectangular', reels: 2, rows: 3 };
    expect(estimateBaseRtp(ir).rtp).toBe(0);
  });

  it('wild substitution lifts paying-symbol probability', () => {
    const a = lineFixture();
    a.symbols = a.symbols.filter((s) => s.kind !== 'wild');
    a.reels.base = a.reels.base.map(() => ({ LP: 80, HP: 20 }));
    const b = lineFixture(); // has WILD at 2% per reel
    expect(estimateBaseRtp(b).rtp).toBeGreaterThan(estimateBaseRtp(a).rtp);
  });
});

// ─── loadIRText ───────────────────────────────────────────────────────────

describe('Web UI — loadIRText', () => {
  it('parses a valid JSON IR string', async () => {
    const txt = JSON.stringify(lineFixture());
    const ir = await loadIRText(txt);
    expect(ir.meta.id).toBe('web-ui-fixture');
  });

  it('rejects malformed JSON', async () => {
    await expect(loadIRText('not json')).rejects.toThrow(/JSON parse failed/);
  });

  it('rejects shape-invalid IR', async () => {
    const bad = JSON.stringify({ schema_version: '1.0.0', meta: {} });
    await expect(loadIRText(bad)).rejects.toThrow(/IR shape issues/);
  });
});
