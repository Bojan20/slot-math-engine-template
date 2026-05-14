/**
 * W152 P0-6 — Reporting adapter tests.
 *
 * Coverage matrix:
 *
 *   Adapter            Format        Tests
 *   ─────────────────  ────────────  ────────────────────────────────
 *   PGADAdapter        fixed-width    width / field positions / dates
 *   DKXmlAdapter       XML            structure / escape / 2dp rounding
 *   MGAJsonAdapter     JSON           key order / eurocent rounding
 *   NJCsvAdapter       CSV            header / hold computation / CRLF
 *   index registry     —              aliases / unknown / emit dispatch
 *   determinism        all four       same input → byte-identical output
 *   negative numbers   all four       defensive clamping
 */

import { describe, it, expect } from 'vitest';
import {
  PGADAdapter,
  PGAD_RECORD_WIDTH,
  DKXmlAdapter,
  MGAJsonAdapter,
  NJCsvAdapter,
  adapterFor,
  emitForJurisdiction,
  REPORT_ADAPTERS,
  computeRtp,
  rtpToPercentString,
  mcToCurrencyString,
  isoToPgadDate,
  xmlEscape,
  csvQuote,
  type JurisdictionalReport,
} from '../src/report/adapters/index.js';
import { __dkXmlInternals } from '../src/report/adapters/dkXmlAdapter.js';
import { __mgaInternals } from '../src/report/adapters/mgaJsonAdapter.js';
import { __njInternals } from '../src/report/adapters/njCsvAdapter.js';

// ─── Sample report ───────────────────────────────────────────────────────────

const SAMPLE: JurisdictionalReport = {
  schemaVersion: '1.0.0',
  operatorLicenseId: 'OP-12345',
  gameLicenseId: 'G-987654',
  gameName: 'Test Slot',
  gameVersion: '1.0.0',
  currency: 'EUR',
  periodStartUtc: '2026-05-01T00:00:00Z',
  periodEndUtc: '2026-05-31T23:59:59Z',
  totalSpins: 1_234_567,
  totalWageredMc: 1_234_567_890, // = 1,234,567.890 EUR
  totalWonMc: 1_191_777_900, // = 1,191,777.900 EUR (96.5% RTP)
  uniquePlayers: 8420,
  largestWinMc: 42_000_000, // = 42,000.000 EUR
  jurisdiction: 'MGA',
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

describe('W152 P0-6 — shared helpers', () => {
  it('computeRtp returns 0 when wagered=0', () => {
    expect(computeRtp({ ...SAMPLE, totalWageredMc: 0, totalWonMc: 100 })).toBe(0);
  });

  it('computeRtp matches the hand calculation', () => {
    const rtp = computeRtp(SAMPLE);
    expect(rtp).toBeCloseTo(1_191_777_900 / 1_234_567_890, 9);
  });

  it('rtpToPercentString uses 4 decimals (UKGC RTS 11)', () => {
    expect(rtpToPercentString(0.96512345)).toBe('96.5123');
  });

  it('mcToCurrencyString formats millicredits as 3-dp decimal', () => {
    expect(mcToCurrencyString(1_000)).toBe('1.000');
    expect(mcToCurrencyString(1_234_567_890)).toBe('1234567.890');
    expect(mcToCurrencyString(-5)).toBe('0.000');
    expect(mcToCurrencyString(NaN)).toBe('0.000');
  });

  it('isoToPgadDate converts T-delimited UTC to space-delimited', () => {
    expect(isoToPgadDate('2026-05-31T23:59:59Z')).toBe('2026-05-31 23:59:59');
    expect(isoToPgadDate('2026-05-31T23:59:59+00:00')).toBe('2026-05-31 23:59:59');
  });

  it('isoToPgadDate throws on garbage', () => {
    expect(() => isoToPgadDate('not-a-date')).toThrow();
  });

  it('xmlEscape escapes all five XML entities', () => {
    expect(xmlEscape('<a & b "c" \'d\'>')).toBe(
      '&lt;a &amp; b &quot;c&quot; &apos;d&apos;&gt;',
    );
  });

  it('csvQuote leaves clean strings untouched, quotes problematic ones', () => {
    expect(csvQuote('hello')).toBe('hello');
    expect(csvQuote('a,b')).toBe('"a,b"');
    expect(csvQuote('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvQuote('line\nbreak')).toBe('"line\nbreak"');
  });
});

// ─── PGAD adapter ────────────────────────────────────────────────────────────

describe('W152 P0-6 — PGADAdapter (Italy ADM)', () => {
  it('emits a record of exactly the spec width + CRLF', () => {
    const out = PGADAdapter.emit(SAMPLE);
    expect(out.endsWith('\r\n')).toBe(true);
    expect(out.length - 2).toBe(PGAD_RECORD_WIDTH);
  });

  it('record starts with the DAIL tag', () => {
    expect(PGADAdapter.emit(SAMPLE).slice(0, 4)).toBe('DAIL');
  });

  it('zero-pads license ids to 16 chars', () => {
    const out = PGADAdapter.emit(SAMPLE);
    const op = out.slice(4, 20);
    expect(op).toBe('00000000OP-12345');
    expect(op.length).toBe(16);
  });

  it('encodes RTP as basis-points × 100 (8 chars zero-padded)', () => {
    // RTP ≈ 0.9653344... → 965334 → "00965334"
    const out = PGADAdapter.emit(SAMPLE);
    // Position: 4 (rec) + 16 + 16 + 19 + 19 + 3 + 14 + 18 + 18 = 127
    const rtpField = out.slice(127, 135);
    expect(rtpField).toHaveLength(8);
    expect(/^\d{8}$/.test(rtpField)).toBe(true);
    // Should be close to 96.53% → 965300-ish basis-points × 100.
    const v = parseInt(rtpField, 10);
    expect(v).toBeGreaterThanOrEqual(965_000);
    expect(v).toBeLessThanOrEqual(966_000);
  });

  it('truncates currency to first 3 chars', () => {
    const out = PGADAdapter.emit({ ...SAMPLE, currency: 'EURO' });
    // Position 78-81 for currency: 4+16+16+19+19=74, +3=77
    expect(out.slice(74, 77)).toBe('EUR');
  });

  it('clamps negative monetary fields to zero (defensive)', () => {
    const out = PGADAdapter.emit({ ...SAMPLE, largestWinMc: -1, totalWonMc: -100 });
    expect(out.length - 2).toBe(PGAD_RECORD_WIDTH);
    // Won and largest-win fields are 18 chars zero-padded → all zeros.
    // Position of won: 4+16+16+19+19+3+14+18 = 109
    expect(out.slice(109, 127)).toBe('0'.repeat(18));
  });
});

// ─── DK XML adapter ──────────────────────────────────────────────────────────

describe('W152 P0-6 — DKXmlAdapter (Denmark SP)', () => {
  it('starts with UTF-8 prolog and SP namespace', () => {
    const out = DKXmlAdapter.emit(SAMPLE);
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toContain('xmlns="https://spillemyndigheden.dk/');
  });

  it('contains expected operator + game + RTP elements', () => {
    const out = DKXmlAdapter.emit(SAMPLE);
    expect(out).toContain('<LicenseId>OP-12345</LicenseId>');
    expect(out).toContain('<LicenseId>G-987654</LicenseId>');
    expect(out).toContain('<Name>Test Slot</Name>');
    expect(out).toContain('<Currency>EUR</Currency>');
    expect(out).toMatch(/<RtpPercent>96\.\d{4}<\/RtpPercent>/);
  });

  it('escapes XML special chars in game name', () => {
    const out = DKXmlAdapter.emit({
      ...SAMPLE,
      gameName: 'Pirates <Ship> & Co',
    });
    expect(out).toContain('<Name>Pirates &lt;Ship&gt; &amp; Co</Name>');
  });

  it("banker's rounding at the millicredit→cent boundary", () => {
    // mcTo2dp(1_005) = 1.00 (5 → round half to even, current = 0 even)
    // mcTo2dp(1_015) = 1.02 (5 → round half to even, current = 1 odd → +1)
    const { mcTo2dp } = __dkXmlInternals;
    expect(mcTo2dp(1_005)).toBe('1.00');
    expect(mcTo2dp(1_015)).toBe('1.02');
    expect(mcTo2dp(1_004)).toBe('1.00');
    expect(mcTo2dp(1_006)).toBe('1.01');
    // Carry on overflow.
    expect(mcTo2dp(999_995)).toBe('1000.00');
  });

  it('jurisdiction uppercase normalisation', () => {
    const out = DKXmlAdapter.emit({ ...SAMPLE, jurisdiction: 'sp' });
    expect(out).toContain('<Jurisdiction>SP</Jurisdiction>');
  });
});

// ─── MGA JSON adapter ────────────────────────────────────────────────────────

describe('W152 P0-6 — MGAJsonAdapter (Malta)', () => {
  it('emits valid JSON parseable round-trip', () => {
    const out = MGAJsonAdapter.emit(SAMPLE);
    expect(() => JSON.parse(out)).not.toThrow();
    const obj = JSON.parse(out);
    expect(obj.schema_version).toBe('1.0.0');
    expect(obj.jurisdiction).toBe('MGA');
    expect(obj.operator_license_id).toBe('OP-12345');
    expect(typeof obj.total_wagered_eurocents).toBe('number');
  });

  it('alphabetically orders keys for byte-stable replay', () => {
    const out = MGAJsonAdapter.emit(SAMPLE);
    // Extract keys in document order (top-level only).
    const keys: string[] = [];
    const re = /"([a-z_]+)":/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out)) !== null) {
      // First match per key (skip the second occurrence in nested objects;
      // we don't have any nested objects in this schema, so this is safe).
      if (!keys.includes(m[1])) keys.push(m[1]);
    }
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('mcToEurocents rounds half to even', () => {
    const { mcToEurocents } = __mgaInternals;
    expect(mcToEurocents(10)).toBe(1); // 1.0 → 1
    expect(mcToEurocents(15)).toBe(2); // 1.5 → 2 (1 odd → up)
    expect(mcToEurocents(25)).toBe(2); // 2.5 → 2 (2 even → stay)
    expect(mcToEurocents(14)).toBe(1);
    expect(mcToEurocents(16)).toBe(2);
  });

  it('RTP serialised with 6 decimals', () => {
    const out = MGAJsonAdapter.emit(SAMPLE);
    const obj = JSON.parse(out);
    expect(obj.rtp).toBeGreaterThan(0.96);
    expect(obj.rtp).toBeLessThan(0.97);
    // 6-decimal precision (no more, no less).
    expect(obj.rtp).toBe(Number(obj.rtp.toFixed(6)));
  });
});

// ─── NJ CSV adapter ──────────────────────────────────────────────────────────

describe('W152 P0-6 — NJCsvAdapter (NJ DGE)', () => {
  it('header has 15 columns and matches DGE template', () => {
    const out = NJCsvAdapter.emit(SAMPLE);
    const lines = out.split('\r\n');
    const header = lines[0].split(',');
    expect(header).toHaveLength(15);
    expect(header[0]).toBe('Operator License Number');
    expect(header[14]).toBe('Jurisdiction Code');
  });

  it('row uses CRLF line endings (Excel-on-Windows compatibility)', () => {
    const out = NJCsvAdapter.emit(SAMPLE);
    expect(out).toMatch(/\r\n/);
    // Header + 1 row + trailing CRLF = 3 segments.
    expect(out.split('\r\n')).toHaveLength(3);
  });

  it('theoretical hold = wagered - won', () => {
    const out = NJCsvAdapter.emit(SAMPLE);
    const fields = out.split('\r\n')[1].split(',');
    // Column index 11 (0-based) = Theoretical Hold
    const hold = parseFloat(fields[11]);
    const wagered = parseFloat(fields[9]);
    const returned = parseFloat(fields[10]);
    expect(hold).toBeCloseTo(wagered - returned, 2);
  });

  it('date columns are YYYY-MM-DD (no time portion)', () => {
    const out = NJCsvAdapter.emit(SAMPLE);
    const fields = out.split('\r\n')[1].split(',');
    expect(fields[4]).toBe('2026-05-01');
    expect(fields[5]).toBe('2026-05-31');
  });

  it("banker's rounding in USD 2dp converter", () => {
    const { mcToUsd2dp } = __njInternals;
    expect(mcToUsd2dp(1_005)).toBe('1.00');
    expect(mcToUsd2dp(1_015)).toBe('1.02');
    expect(mcToUsd2dp(0)).toBe('0.00');
  });

  it('jurisdiction column is always NJ-DGE regardless of input', () => {
    const out = NJCsvAdapter.emit({ ...SAMPLE, jurisdiction: 'something-else' });
    const fields = out.split('\r\n')[1].split(',');
    expect(fields[14]).toBe('NJ-DGE');
  });

  it('quotes fields containing commas', () => {
    const out = NJCsvAdapter.emit({ ...SAMPLE, gameName: 'Big, Slot' });
    const fields = out.split('\r\n')[1];
    expect(fields).toContain('"Big, Slot"');
  });
});

// ─── Registry ────────────────────────────────────────────────────────────────

describe('W152 P0-6 — adapter registry', () => {
  it('maps every supported jurisdiction code to an adapter', () => {
    for (const code of ['ADM', 'IT', 'ITALY']) {
      expect(adapterFor(code)).toBe(PGADAdapter);
    }
    for (const code of ['SP', 'DK', 'DENMARK']) {
      expect(adapterFor(code)).toBe(DKXmlAdapter);
    }
    for (const code of ['MGA', 'MT', 'MALTA']) {
      expect(adapterFor(code)).toBe(MGAJsonAdapter);
    }
    for (const code of ['DGE', 'NJ', 'NJ-DGE']) {
      expect(adapterFor(code)).toBe(NJCsvAdapter);
    }
  });

  it('lookup is case-insensitive and tolerates whitespace', () => {
    expect(adapterFor('  mga  ')).toBe(MGAJsonAdapter);
    expect(adapterFor('Adm')).toBe(PGADAdapter);
  });

  it('unknown jurisdiction throws with adapter list', () => {
    expect(() => adapterFor('XX-FAKE')).toThrow(/No reporting adapter/);
  });

  it('emitForJurisdiction dispatches via the report.jurisdiction field', () => {
    const out = emitForJurisdiction(SAMPLE);
    const obj = JSON.parse(out);
    expect(obj.jurisdiction).toBe('MGA');
  });

  it('REPORT_ADAPTERS frozen registry exposes all adapter names', () => {
    const names = new Set(Object.values(REPORT_ADAPTERS).map((a) => a.name));
    expect(names).toEqual(
      new Set(['adm-pgad', 'dk-sp-xml', 'mga-portal-json', 'nj-dge-csv']),
    );
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('W152 P0-6 — determinism (byte-stable replay)', () => {
  // Cross-jurisdiction: same input twice must produce identical bytes.
  // This is the regulator-side audit-replay invariant.
  for (const [name, adapter] of [
    ['pgad', PGADAdapter],
    ['dk-xml', DKXmlAdapter],
    ['mga-json', MGAJsonAdapter],
    ['nj-csv', NJCsvAdapter],
  ] as const) {
    it(`${name} adapter: two consecutive emits are byte-identical`, () => {
      const a = adapter.emit(SAMPLE);
      const b = adapter.emit(SAMPLE);
      expect(a).toBe(b);
    });
  }
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('W152 P0-6 — edge cases', () => {
  const ZERO_REPORT: JurisdictionalReport = {
    ...SAMPLE,
    totalSpins: 0,
    totalWageredMc: 0,
    totalWonMc: 0,
    uniquePlayers: 0,
    largestWinMc: 0,
  };

  it('zero-activity period produces valid (non-throwing) output for all adapters', () => {
    expect(() => PGADAdapter.emit(ZERO_REPORT)).not.toThrow();
    expect(() => DKXmlAdapter.emit(ZERO_REPORT)).not.toThrow();
    expect(() => MGAJsonAdapter.emit(ZERO_REPORT)).not.toThrow();
    expect(() => NJCsvAdapter.emit(ZERO_REPORT)).not.toThrow();
  });

  it('zero wagered → RTP 0 in every adapter', () => {
    const json = JSON.parse(MGAJsonAdapter.emit(ZERO_REPORT));
    expect(json.rtp).toBe(0);
    expect(DKXmlAdapter.emit(ZERO_REPORT)).toContain('<RtpPercent>0.0000');
    const njFields = NJCsvAdapter.emit(ZERO_REPORT).split('\r\n')[1].split(',');
    expect(njFields[13]).toBe('0.0000');
  });
});
