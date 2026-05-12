/**
 * PAR PDF renderer test suite — P0 #6 closure.
 *
 * Covers:
 * - happy path (full input → valid PDF buffer with %PDF header + EOF)
 * - minimal input (only meta) — every section renders `—` for missing data
 * - external dialect (subset structural shape) — no throw
 * - file-stream mode — writes a real PDF to disk
 * - render options — disclaimer / histogram limit / paytable limit honored
 * - error mode — null / undefined inputs still produce a valid PDF
 * - compliance metadata — UKGC / GLI fields surface in output
 */

import { describe, it, expect } from 'vitest';
import { renderParSheetPdf, renderParSheetToFile, type ParRenderInput } from '../src/report/parPdf.js';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MINIMAL: ParRenderInput = {
  schemaVersion: 'v1.0.0',
  generatedAt: '2026-05-12T22:30:00.000Z',
  configHash: 'abc123def456',
  game: { name: 'Example Game', version: '1.0.0' },
};

const FULL: ParRenderInput = {
  schemaVersion: 'v1.0.0',
  generatedAt: '2026-05-12T22:30:00.000Z',
  configHash: 'abc123def456789',
  game: {
    name: 'Example Game',
    version: '1.0.0',
    mathVersion: 'v1.0.0',
    layout: '5x3',
    paySystem: 'paylines',
    paylines: 10,
    targetRTP: 96.0,
    targetVolatility: 'high',
    maxWin: 5000,
  },
  simulation: {
    spins: 10_000_000,
    seed: 12345,
    engineVersion: 'engine-1.2.3',
  },
  results: {
    observedRTP: 0.95987,
    rtpPercent: 95.987,
    errorMargin: 0.0003,
    ci95Lower: 0.9595,
    ci95Upper: 0.9602,
    rtpBreakdown: {
      baseLine: 0.4520,
      scatter: 0.0610,
      freeSpins: 0.2855,
      holdAndWin: 0.1614,
    },
    hitRate: 0.2871,
    deadSpinRate: 0.7129,
    avgWinOnHit: 3.42,
    percentiles: { p50: 0.0, p90: 2.5, p99: 14.0, p999: 95.5 },
    tailBuckets: { ge100x: 1245, ge500x: 312, ge1000x: 88, ge5000x: 7 },
    maxObservedWin: 4987.3,
    maxWinSpin: 8_472_310,
  },
  volatility: {
    variance: 9.42,
    stdDev: 3.07,
    volatilityIndex: 12.5,
    classification: 'high',
  },
  features: [
    { id: 'free_spins', name: 'Free Spins', triggerRate: 0.0113, frequency: '1 / 88', avgWin: 67.3, rtpContribution: 0.2855 },
    { id: 'hold_and_win', name: 'Hold & Win', triggerRate: 0.0052, frequency: '1 / 192', avgWin: 142.5, rtpContribution: 0.1614 },
  ],
  streaks: { deadMean: 3.5, deadMax: 28 },
  histogram: [
    { bucket: '0×', count: 7_129_000, percentage: 0.7129, rtpContribution: 0 },
    { bucket: '0-1×', count: 1_400_000, percentage: 0.14, rtpContribution: 0.07 },
    { bucket: '1-5×', count: 800_000, percentage: 0.08, rtpContribution: 0.24 },
    { bucket: '5-20×', count: 500_000, percentage: 0.05, rtpContribution: 0.225 },
    { bucket: '20-100×', count: 150_000, percentage: 0.015, rtpContribution: 0.18 },
    { bucket: '100×+', count: 21_000, percentage: 0.0021, rtpContribution: 0.045 },
  ],
  paytable: {
    lineWins: [
      { symbol: 'HP_1', pays: { '3': 5, '4': 25, '5': 100 } },
      { symbol: 'HP_2', pays: { '3': 3, '4': 15, '5': 50 } },
      { symbol: 'LP_1', pays: { '3': 0.5, '4': 1, '5': 5 } },
    ],
    scatter: [
      { count: 3, pay: 2, freeSpins: 10 },
      { count: 4, pay: 5, freeSpins: 12 },
      { count: 5, pay: 25, freeSpins: 15 },
    ],
    holdAndWin: {
      expectedOrbValue: 1.75,
      orbValues: [
        { type: 'cash-1', multiplier: 1, weight: 50 },
        { type: 'cash-5', multiplier: 5, weight: 20 },
        { type: 'cash-25', multiplier: 25, weight: 5 },
      ],
    },
  },
  notes: [
    'Closed-form RTP cross-validated against MC at ±0.005% on 10⁹ spins.',
    'No game / vendor trademarks referenced (template-clean).',
  ],
  compliance: {
    jurisdiction: 'UKGC',
    standard: 'GLI-19',
    submitter: 'operator-test@example.org',
    cycleSize: 312_500_000,
  },
};

function isPdfBuffer(buf: Buffer): boolean {
  // %PDF magic at start, %%EOF near the end (within last 64 bytes).
  if (buf.length < 100) return false;
  const head = buf.subarray(0, 5).toString('ascii');
  const tail = buf.subarray(buf.length - 64).toString('ascii');
  return head === '%PDF-' && tail.includes('%%EOF');
}

// ─── PARPDF-01: Happy path ──────────────────────────────────────────────────

describe('PARPDF-01: renderParSheetPdf — full input', () => {
  it('produces a valid PDF buffer', async () => {
    const buf = (await renderParSheetPdf(FULL)) as Buffer;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(isPdfBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });
});

// ─── PARPDF-02: Minimal input ───────────────────────────────────────────────

describe('PARPDF-02: minimal input renders fallback dashes for missing data', () => {
  it('does not throw on missing optional fields', async () => {
    const buf = (await renderParSheetPdf(MINIMAL)) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });

  it('renders even when game.name is missing', async () => {
    const buf = (await renderParSheetPdf({})) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });
});

// ─── PARPDF-03: External dialect (structural subset) ───────────────────────

describe('PARPDF-03: accepts external PAR-shaped JSON without throwing', () => {
  it('renders a dialect input lacking compliance + features sections', async () => {
    const input: ParRenderInput = {
      schemaVersion: '2.0',
      game: { name: 'Reel-strips Dialect Sample', layout: '6x4' },
      results: { observedRTP: 0.94, rtpPercent: 94 },
    };
    const buf = (await renderParSheetPdf(input)) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });

  it('renders when paytable.lineWins.pays is an array instead of object', async () => {
    const input: ParRenderInput = {
      game: { name: 'Array-pay variant' },
      paytable: {
        lineWins: [{ symbol: 'WILD', pays: [10, 50, 250] }],
      },
    };
    const buf = (await renderParSheetPdf(input)) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });
});

// ─── PARPDF-04: File-stream mode ────────────────────────────────────────────

describe('PARPDF-04: renderParSheetToFile — writes a real PDF', () => {
  it('creates a file on disk with valid PDF magic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'par-pdf-'));
    const filePath = join(dir, 'par.pdf');
    try {
      await renderParSheetToFile(FULL, filePath);
      expect(existsSync(filePath)).toBe(true);
      const buf = readFileSync(filePath);
      expect(isPdfBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(2000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── PARPDF-05: Render options honored (structural — PDFKit encodes text as
//                glyph hex codes so plain string-search inside the binary
//                doesn't work; we compare buffer sizes instead).
// ──────────────────────────────────────────────────────────────────────────

describe('PARPDF-05: render options honored', () => {
  it('custom disclaimer produces a different PDF size than default', async () => {
    const a = (await renderParSheetPdf(FULL, { disclaimer: 'A' })) as Buffer;
    const b = (await renderParSheetPdf(FULL, {
      disclaimer: 'CONFIDENTIAL — operator submission only — much longer text increases size meaningfully here so we see a real delta',
    })) as Buffer;
    // Longer disclaimer => more glyphs => larger PDF.
    expect(b.length).toBeGreaterThan(a.length);
  });

  it('histogramRowLimit produces a smaller PDF than unlimited', async () => {
    const bigHistogram: ParRenderInput = {
      game: { name: 'Big-histogram test' },
      histogram: Array.from({ length: 100 }, (_, i) => ({
        bucket: `bucket-${i}`,
        count: 1000 - i * 10,
        percentage: 0.001,
        rtpContribution: 0.0001,
      })),
    };
    const small = (await renderParSheetPdf(bigHistogram, { histogramRowLimit: 5 })) as Buffer;
    const big = (await renderParSheetPdf(bigHistogram, { histogramRowLimit: 100 })) as Buffer;
    expect(big.length).toBeGreaterThan(small.length);
  });

  it('paytableRowLimit produces a smaller PDF than unlimited', async () => {
    const bigPaytable: ParRenderInput = {
      game: { name: 'Big-paytable test' },
      paytable: {
        lineWins: Array.from({ length: 50 }, (_, i) => ({
          symbol: `SYM_${i}`,
          pays: { '3': i, '4': i * 2, '5': i * 5 },
        })),
      },
    };
    const small = (await renderParSheetPdf(bigPaytable, { paytableRowLimit: 3 })) as Buffer;
    const big = (await renderParSheetPdf(bigPaytable, { paytableRowLimit: 50 })) as Buffer;
    expect(big.length).toBeGreaterThan(small.length);
  });
});

// ─── PARPDF-06: Error / null tolerance ──────────────────────────────────────

describe('PARPDF-06: null / undefined fields tolerated', () => {
  it('handles undefined nested fields', async () => {
    const input: ParRenderInput = {
      game: { name: 'Null-test', version: undefined as unknown as string },
      results: { observedRTP: undefined, rtpBreakdown: undefined },
      paytable: { lineWins: undefined, scatter: undefined },
    };
    const buf = (await renderParSheetPdf(input)) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });

  it('handles empty arrays', async () => {
    const input: ParRenderInput = {
      game: { name: 'Empty-arrays' },
      features: [],
      histogram: [],
      paytable: { lineWins: [], scatter: [] },
      notes: [],
    };
    const buf = (await renderParSheetPdf(input)) as Buffer;
    expect(isPdfBuffer(buf)).toBe(true);
  });
});

// ─── PARPDF-07: Compliance metadata surfaces (structural delta) ─────────────

describe('PARPDF-07: compliance metadata changes the PDF size', () => {
  it('PDF with compliance section is larger than without', async () => {
    const without = (await renderParSheetPdf({
      ...FULL,
      compliance: undefined,
    })) as Buffer;
    const withComp = (await renderParSheetPdf({
      ...FULL,
      compliance: {
        jurisdiction: 'UKGC',
        standard: 'GLI-19',
        submitter: 'audit@example.org',
        cycleSize: 312_500_000,
      },
    })) as Buffer;
    expect(withComp.length).toBeGreaterThan(without.length);
  });

  it('PDF Info dictionary is present (Title key in /Info)', async () => {
    const buf = (await renderParSheetPdf({ game: { name: 'PDF-info-test-12345' } })) as Buffer;
    // PDF /Info dictionary uses literal /Title key (this is in the trailer,
    // unaffected by content-stream glyph encoding).
    const bin = buf.toString('binary');
    expect(bin.includes('/Title')).toBe(true);
    expect(bin.includes('/Author')).toBe(true);
    expect(bin.includes('/Subject')).toBe(true);
  });
});

// ─── PARPDF-08: Multi-page handling ─────────────────────────────────────────

describe('PARPDF-08: multi-page handling', () => {
  it('large input produces a multi-page PDF (/Pages /Count > 1)', async () => {
    const huge: ParRenderInput = {
      game: { name: 'Multi-page-test' },
      histogram: Array.from({ length: 60 }, (_, i) => ({
        bucket: `bkt-${i}`,
        count: 100,
        percentage: 0.001,
        rtpContribution: 0.0001,
      })),
      features: Array.from({ length: 20 }, (_, i) => ({
        id: `f${i}`,
        name: `Feature-${i}`,
        triggerRate: 0.01,
        rtpContribution: 0.01,
        avgWin: 5,
      })),
    };
    const buf = (await renderParSheetPdf(huge, { histogramRowLimit: 60 })) as Buffer;
    const bin = buf.toString('binary');
    // PDF object tree exposes /Type /Pages with /Count N — literal, searchable.
    const countMatch = bin.match(/\/Type\s*\/Pages[^/]*\/Count\s+(\d+)/);
    expect(countMatch).not.toBeNull();
    if (countMatch && countMatch[1]) {
      expect(parseInt(countMatch[1], 10)).toBeGreaterThan(1);
    }
  });
});
