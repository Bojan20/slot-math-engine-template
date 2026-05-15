/**
 * W152 Wave 15 — Faza 1.6 — CLI `rtp` subcommand unit tests.
 *
 * Covers the `computeRtpReport` helper that backs the CLI. The CLI
 * itself stays a thin print wrapper; tests here verify the math +
 * tolerance gating + IR-parse error path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeRtpReport,
  formatRtpHeadline,
  parseIrOrThrow,
} from '../src/cli/rtp.js';

const FIXTURES = join(__dirname, 'fixtures');
const PARITY_PATH = join(FIXTURES, 'parity.json');
const PARITY_TEXT = readFileSync(PARITY_PATH, 'utf-8');

describe('Faza 1.6 — parseIrOrThrow', () => {
  it('accepts a valid IR JSON string', () => {
    const ir = parseIrOrThrow(PARITY_TEXT);
    expect(ir.meta.id).toBe('parity-fixture');
  });

  it('throws with multi-line diagnostic on validation failure', () => {
    const bad = JSON.stringify({ schema_version: '1.0.0', meta: {} });
    expect(() => parseIrOrThrow(bad)).toThrow(/IR validation failed/);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseIrOrThrow('not-json')).toThrow(/IR JSON parse failed/);
  });
});

describe('Faza 1.6 — computeRtpReport', () => {
  it('returns a structured report with deterministic seed', async () => {
    const a = await computeRtpReport(PARITY_TEXT, { spins: 2000, seed: 12345 });
    const b = await computeRtpReport(PARITY_TEXT, { spins: 2000, seed: 12345 });
    expect(a.rtp).toBe(b.rtp);
    expect(a.hitRate).toBe(b.hitRate);
    expect(a.maxWinX).toBe(b.maxWinX);
  });

  it('different seed → different stream → different RTP estimate', async () => {
    const a = await computeRtpReport(PARITY_TEXT, { spins: 5000, seed: 1 });
    const b = await computeRtpReport(PARITY_TEXT, { spins: 5000, seed: 2 });
    // Probability of exact equality is ≈ 0 for a healthy MC at 5k spins.
    expect(a.rtp).not.toBe(b.rtp);
  });

  it('emits drift + withinTolerance against IR limits', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 2000, seed: 12345 });
    expect(r.targetRtp).toBeCloseTo(0.96, 6);
    expect(r.tolerance).toBeCloseTo(0.0005, 6);
    expect(r.drift).toBeGreaterThanOrEqual(0);
    expect(typeof r.withinTolerance).toBe('boolean');
  });

  it('headline string carries every key piece of information', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 1000, seed: 12345 });
    const headline = formatRtpHeadline(r);
    expect(headline).toContain('parity-fixture');
    expect(headline).toContain('1,000');
    expect(headline).toContain('seed 12345');
    expect(headline).toMatch(/RTP: \d+\.\d{4} %/);
    expect(headline).toMatch(/Target 96\.0000 % ± 0\.0500 %/);
    expect(headline).toMatch(/(WITHIN|OUT-OF-RANGE)/);
    expect(headline).toMatch(/\d+ ms/);
  });

  it('clamps spins to ≥ 1 + floors fractional input', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 0.7 as unknown as number, seed: 7 });
    expect(r.spins).toBe(1);
  });

  it('reports spinsPerSec > 0 (sanity)', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 1000, seed: 42 });
    expect(r.spinsPerSec).toBeGreaterThan(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(1);
  });

  it('throws (does not silently produce zero RTP) on a broken IR', async () => {
    const broken = JSON.stringify({ schema_version: '1.0.0', meta: {} });
    await expect(computeRtpReport(broken, { spins: 100, seed: 1 })).rejects.toThrow(
      /IR validation failed/,
    );
  });

  it('returns featureTriggerFreqs map (may be empty)', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 1000, seed: 1 });
    expect(r.featureTriggerFreqs).toBeDefined();
    expect(typeof r.featureTriggerFreqs).toBe('object');
  });

  it('rtpBreakdown contains base bucket at minimum', async () => {
    const r = await computeRtpReport(PARITY_TEXT, { spins: 1000, seed: 1 });
    expect(r.rtpBreakdown).toBeDefined();
    expect('base' in r.rtpBreakdown).toBe(true);
  });
});

describe('Faza 1.6 — formatRtpHeadline tolerance edge cases', () => {
  it('omits target row when target is null (defensive)', async () => {
    // Build a report manually to test the null-target branch.
    const r = {
      configId: 'no-target',
      spins: 100,
      seed: 1,
      rtp: 0.5,
      hitRate: 0.25,
      maxWinX: 100,
      targetRtp: null,
      tolerance: null,
      drift: null,
      withinTolerance: null,
      elapsedMs: 10,
      spinsPerSec: 10000,
      featureTriggerFreqs: {},
      rtpBreakdown: { base: 0.5 },
    } as const;
    const headline = formatRtpHeadline(r);
    expect(headline).not.toContain('Target');
    expect(headline).toContain('no-target');
  });
});
