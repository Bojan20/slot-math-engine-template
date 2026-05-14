import { describe, it, expect } from 'vitest';
import {
  laplaceSample,
  dpExport,
  TYPICAL_SENSITIVITIES,
  type DpExportConfig,
} from '../src/math/par-sheet/dpExport.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic LCG for repeatable noise draws. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// ─── laplaceSample ────────────────────────────────────────────────────────────

describe('laplaceSample', () => {
  it('returns a number', () => {
    expect(typeof laplaceSample(1, makeLcg(1))).toBe('number');
  });

  it('throws on non-positive scale', () => {
    expect(() => laplaceSample(0, makeLcg(1))).toThrow(/scale must be > 0/);
    expect(() => laplaceSample(-1, makeLcg(1))).toThrow(/scale must be > 0/);
  });

  it('mean across N samples ≈ 0', () => {
    const rng = makeLcg(42);
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += laplaceSample(1, rng);
    expect(Math.abs(sum / N)).toBeLessThan(0.05);
  });

  it('larger scale ⇒ larger variance', () => {
    const N = 5000;
    let sum1 = 0,
      sum10 = 0;
    const rng1 = makeLcg(1);
    const rng10 = makeLcg(1);
    for (let i = 0; i < N; i++) {
      const a = laplaceSample(1, rng1);
      const b = laplaceSample(10, rng10);
      sum1 += a * a;
      sum10 += b * b;
    }
    expect(sum10 / N).toBeGreaterThan(sum1 / N * 50);
  });

  it('determinism — same RNG seed produces same sample sequence', () => {
    const a = makeLcg(99);
    const b = makeLcg(99);
    expect(laplaceSample(1, a)).toBe(laplaceSample(1, b));
  });
});

// ─── dpExport ─────────────────────────────────────────────────────────────────

describe('dpExport', () => {
  const baseFields = [
    { key: 'rtp', sensitivity: TYPICAL_SENSITIVITIES.rtp, value: 0.96 },
    { key: 'hit_rate', sensitivity: TYPICAL_SENSITIVITIES.hit_rate, value: 0.25 },
    {
      key: 'feature_trigger_rate',
      sensitivity: TYPICAL_SENSITIVITIES.feature_trigger_rate,
      value: 0.005,
    },
  ];

  it('throws when epsilon ≤ 0', () => {
    expect(() =>
      dpExport({ epsilon: 0, fields: baseFields, rng: makeLcg(1) }, 'now')
    ).toThrow(/epsilon must be > 0/);
  });

  it('throws when fields is empty', () => {
    expect(() =>
      dpExport({ epsilon: 0.3, fields: [], rng: makeLcg(1) }, 'now')
    ).toThrow(/at least one field/);
  });

  it('throws when a field has non-positive sensitivity', () => {
    expect(() =>
      dpExport(
        {
          epsilon: 0.3,
          fields: [{ key: 'bad', sensitivity: 0, value: 1 }],
          rng: makeLcg(1),
        },
        'now'
      )
    ).toThrow(/sensitivity must be > 0/);
  });

  it('throws when rng is not a function', () => {
    expect(() =>
      dpExport(
        { epsilon: 0.3, fields: baseFields, rng: null as unknown as () => number },
        'now'
      )
    ).toThrow(/rng must be a function/);
  });

  it('produces one DpExportField per input field', () => {
    const r = dpExport(
      { epsilon: 0.3, fields: baseFields, rng: makeLcg(7) },
      '2026-05-15T00:00:00Z'
    );
    expect(r.fields).toHaveLength(baseFields.length);
    expect(r.epsilonUsed).toBe(0.3);
    expect(r.generatedAt).toBe('2026-05-15T00:00:00Z');
  });

  it('noisedValue = originalValue + noiseAdded', () => {
    const r = dpExport(
      { epsilon: 0.3, fields: baseFields, rng: makeLcg(11) },
      'now'
    );
    for (const f of r.fields) {
      expect(f.originalValue + f.noiseAdded).toBeCloseTo(f.noisedValue, 12);
    }
  });

  it('determinism — same RNG seed → identical noised values', () => {
    const a = dpExport(
      { epsilon: 0.3, fields: baseFields, rng: makeLcg(2026) },
      'now'
    );
    const b = dpExport(
      { epsilon: 0.3, fields: baseFields, rng: makeLcg(2026) },
      'now'
    );
    for (let i = 0; i < a.fields.length; i++) {
      expect(a.fields[i].noisedValue).toBe(b.fields[i].noisedValue);
    }
  });

  it('larger epsilon ⇒ smaller average |noise| (privacy-utility tradeoff)', () => {
    const N = 500;
    let abs_lo = 0,
      abs_hi = 0;
    for (let i = 0; i < N; i++) {
      const lo = dpExport(
        { epsilon: 0.01, fields: baseFields, rng: makeLcg(i + 1) },
        'now'
      );
      const hi = dpExport(
        { epsilon: 1.0, fields: baseFields, rng: makeLcg(i + 1) },
        'now'
      );
      abs_lo += Math.abs(lo.fields[0].noiseAdded);
      abs_hi += Math.abs(hi.fields[0].noiseAdded);
    }
    expect(abs_lo / N).toBeGreaterThan((abs_hi / N) * 5);
  });

  it('TYPICAL_SENSITIVITIES is frozen and has rtp/hit_rate keys', () => {
    expect(Object.isFrozen(TYPICAL_SENSITIVITIES)).toBe(true);
    expect(TYPICAL_SENSITIVITIES.rtp).toBeGreaterThan(0);
    expect(TYPICAL_SENSITIVITIES.hit_rate).toBeGreaterThan(0);
  });

  it('field with infinite value is rejected', () => {
    expect(() =>
      dpExport(
        {
          epsilon: 0.3,
          fields: [{ key: 'bad', sensitivity: 1, value: Infinity }],
          rng: makeLcg(1),
        },
        'now'
      )
    ).toThrow(/value must be finite/);
  });

  it('Laplace scale per field equals sensitivity / (epsilon/k)', () => {
    const cfg: DpExportConfig = {
      epsilon: 0.3,
      fields: baseFields,
      rng: makeLcg(1),
    };
    const r = dpExport(cfg, 'now');
    const k = baseFields.length;
    for (let i = 0; i < r.fields.length; i++) {
      const expected = baseFields[i].sensitivity / (0.3 / k);
      expect(r.fields[i].laplaceScale).toBeCloseTo(expected, 12);
    }
  });

  it('utility: published RTP within ±2% of original for ε=0.3 across trials', () => {
    // With ε=0.3 over k=1 fields and sensitivity=5e-3, the per-field
    // Laplace scale is 5e-3 / 0.3 ≈ 0.0167.  Median |Laplace(0, b)|
    // is b·ln(2) ≈ 0.0116, so ~50% of samples should be within 0.0116
    // of the truth.  A ±2% (=±0.02) bound is satisfied by >80% in
    // expectation — strong evidence the mechanism is preserving
    // utility at this privacy budget.
    let withinCount = 0;
    const TRIALS = 200;
    for (let i = 0; i < TRIALS; i++) {
      const r = dpExport(
        {
          epsilon: 0.3,
          fields: [
            { key: 'rtp', sensitivity: TYPICAL_SENSITIVITIES.rtp, value: 0.96 },
          ],
          rng: makeLcg(i + 1),
        },
        'now'
      );
      if (Math.abs(r.fields[0].noisedValue - 0.96) < 0.02) withinCount++;
    }
    expect(withinCount).toBeGreaterThan(120); // >60% of trials
  });
});
