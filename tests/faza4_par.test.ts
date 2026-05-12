/**
 * Faza 4 — PAR Sheet KATs.
 *
 * Tests for generatePARSheet and formatPARSheet in
 * src/statistics/parSheet.ts.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  generatePARSheet,
  formatPARSheet,
  HDR_THRESHOLDS,
  type PARConfig,
} from '../src/statistics/parSheet.js';
import { runIRSimulation, type IRSimResult } from '../src/engine/irSimulator.js';
import { parseGameIR } from '../src/ir/index.js';
import type { JackpotMetrics } from '../src/features/jackpotManager.js';
import type { SlotGameIR } from '../src/ir/types.js';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const PARITY_FIXTURE = resolve(HERE, 'fixtures', 'parity.json');

/** Minimal SlotGameIR stub for unit tests that don't need a full IR. */
function minimalIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'test', name: 'Test', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'S_LP1', name: 'LP1', kind: 'lp' },
      { id: 'S_WILD', name: 'Wild', kind: 'wild', substitutes: '*' },
    ],
    reels: {
      mode: 'weighted',
      base: Array.from({ length: 5 }, () => ({ S_LP1: 9, S_WILD: 1 })),
    },
    evaluation: {
      kind: 'lines',
      paylines: [[1, 1, 1, 1, 1]],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: { S_LP1: { '3': 0.5, '4': 2, '5': 8 } },
    features: [],
    rng: { kind: 'mulberry32', default_seed: 42 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.01,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'medium',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['MGA', 'UKGC'],
      rtp_range_required: [85, 99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: { base_game: 0.7, free_spins: 0.2, hold_and_win: 0.05, jackpot: 0.05, tolerance: 0.01 },
  };
}

/** Minimal IRSimResult for unit tests. */
function minimalResult(overrides: Partial<IRSimResult> = {}): IRSimResult {
  return {
    spins: 10000,
    rtp: 0.96,
    hitRate: 0.3,
    featureTriggerFreqs: {},
    maxWinX: 250,
    rtpBreakdown: {
      base: 0.7,
      free_spins: 0.2,
      hold_and_win: 0.05,
      cascade: 0.01,
    },
    jackpotBreakdown: {},
    jackpotRtp: 0,
    ...overrides,
  };
}

/** Standard PARConfig for unit tests. */
function standardConfig(overrides: Partial<PARConfig> = {}): PARConfig {
  return {
    gameId: 'test-game',
    gameVersion: '1.0.0',
    targetRtpPct: 96,
    rtpTolerancePct: 0.5,
    maxWinCapX: 5000,
    jurisdictions: ['MGA'],
    rtpRangeRequired: [85, 99],
    nearMissRule: 'must_be_random',
    ldwDisclosure: true,
    sessionTimeDisplay: true,
    seedsUsed: 1,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePARSheet', () => {
  // ── Test 1: valid structure ────────────────────────────────────────────────
  it('generates valid structure with all required sections', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());

    expect(par).toBeDefined();
    expect(par.schemaVersion).toBe('1.0.0');
    expect(par.meta).toBeDefined();
    expect(par.rtp).toBeDefined();
    expect(par.hitFrequency).toBeDefined();
    expect(par.volatility).toBeDefined();
    expect(par.winDistribution).toBeDefined();
    expect(par.jackpots).toBeDefined();
    expect(par.compliance).toBeDefined();
    expect(par.statistics).toBeDefined();

    // Meta fields
    expect(par.meta.gameId).toBe('test-game');
    expect(par.meta.totalSpins).toBe(10000);
    expect(par.meta.rngKind).toBe('mulberry32');
  });

  // ── Test 2: RTP within tolerance passes ───────────────────────────────────
  it('RTP within tolerance check passes when actual equals target', () => {
    const result = minimalResult({ rtp: 0.96 }); // 96%
    const cfg = standardConfig({ targetRtpPct: 96, rtpTolerancePct: 0.5 });
    const par = generatePARSheet(result, minimalIR(), cfg);

    expect(par.rtp.withinTolerance).toBe(true);
  });

  // ── Test 3: RTP out of tolerance ──────────────────────────────────────────
  it('RTP out of tolerance check fails when actual is 2pp below target', () => {
    const result = minimalResult({ rtp: 0.94 }); // 94%
    const cfg = standardConfig({ targetRtpPct: 96, rtpTolerancePct: 0.5 });
    const par = generatePARSheet(result, minimalIR(), cfg);

    expect(par.rtp.withinTolerance).toBe(false);
  });

  // ── Test 4: win distribution bucket count ──────────────────────────────────
  it('win distribution has HDR_THRESHOLDS.length + 1 buckets', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());
    // +1 for the no-win bucket (below first threshold)
    expect(par.winDistribution).toHaveLength(HDR_THRESHOLDS.length + 1);
  });

  // ── Test 5: win distribution sums to total spins ──────────────────────────
  it('win distribution counts sum to winHistory length when provided', () => {
    // 10 wins at various sizes, 90 zeros
    const winHistory = [
      ...Array(90).fill(0),
      1.5, 3.0, 8.0, 25.0, 60.0, 110.0, 250.0, 600.0, 1200.0, 6000.0,
    ];
    const cfg = standardConfig({ winHistory });
    const par = generatePARSheet(minimalResult({ spins: 100 }), minimalIR(), cfg);

    const totalCount = par.winDistribution.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(winHistory.length);
  });

  // ── Test 6: jackpot RTP sums correctly ────────────────────────────────────
  it('jackpot RTP section equals sum of jackpot contributionRtp × 100', () => {
    const jackpots: JackpotMetrics[] = [
      {
        id: 'MINI',
        name: 'Mini',
        kind: 'fixed',
        hits: 10,
        avgInterval: 1000,
        totalPaidX: 10000,
        totalContributedX: 0,
        currentPoolX: 1000,
        contributionRtp: 0.01, // 1%
      },
      {
        id: 'GRAND',
        name: 'Grand',
        kind: 'progressive',
        hits: 1,
        avgInterval: 10000,
        totalPaidX: 5000,
        totalContributedX: 500,
        currentPoolX: 500,
        contributionRtp: 0.005, // 0.5%
      },
    ];
    const cfg = standardConfig({ jackpots });
    const par = generatePARSheet(minimalResult(), minimalIR(), cfg);

    // 0.01 + 0.005 = 0.015 → 1.5%
    expect(par.rtp.jackpotRtpPct).toBeCloseTo(1.5, 6);
  });

  // ── Test 7: formatPARSheet returns string with required section headers ────
  it('formatPARSheet returns string containing RTP, HIT FREQUENCY, COMPLIANCE', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());
    const formatted = formatPARSheet(par);

    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('RTP');
    expect(formatted).toContain('HIT FREQUENCY');
    expect(formatted).toContain('COMPLIANCE');
  });

  // ── Test 8: compliance jurisdiction RTP check ─────────────────────────────
  it('compliance rtpWithinRequired passes when RTP 96% is within [85%, 99%]', () => {
    const result = minimalResult({ rtp: 0.96 });
    const cfg = standardConfig({ rtpRangeRequired: [85, 99] });
    const par = generatePARSheet(result, minimalIR(), cfg);

    expect(par.compliance.rtpWithinRequired).toBe(true);
  });

  it('compliance rtpWithinRequired fails when RTP is below lower bound', () => {
    const result = minimalResult({ rtp: 0.84 }); // 84% < 85%
    const cfg = standardConfig({ rtpRangeRequired: [85, 99] });
    const par = generatePARSheet(result, minimalIR(), cfg);

    expect(par.compliance.rtpWithinRequired).toBe(false);
  });

  // ── Test 9: smoke test with real IR fixture ────────────────────────────────
  it('smoke test: load parity.json, run 5000-spin sim, generate & format PAR', async () => {
    const json = fs.readFileSync(PARITY_FIXTURE, 'utf8');
    const parseResult = parseGameIR(JSON.parse(json) as Record<string, unknown>);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) throw new Error('IR parse failed');
    const ir = parseResult.ir;

    const result = await runIRSimulation(ir, { spins: 5000, seed: 7 });

    const cfg = standardConfig({
      gameId: ir.meta.id,
      gameVersion: ir.meta.version,
      targetRtpPct: ir.limits.target_rtp * 100,
      rtpTolerancePct: ir.limits.rtp_tolerance * 100,
      maxWinCapX: ir.limits.max_win_x,
      jurisdictions: ir.compliance.jurisdictions,
      rtpRangeRequired: ir.compliance.rtp_range_required,
      nearMissRule: ir.compliance.near_miss_rule,
      ldwDisclosure: ir.compliance.ldw_disclosure,
      sessionTimeDisplay: ir.compliance.session_time_display,
      seedsUsed: 1,
    });

    const par = generatePARSheet(result, ir, cfg);
    const formatted = formatPARSheet(par);

    // Should not throw, should produce a non-empty string.
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(200);
    expect(formatted).toContain('RTP');
    expect(formatted).toContain('COMPLIANCE');

    // Basic sanity checks on the PAR structure.
    expect(par.meta.gameId).toBe('parity-fixture');
    expect(par.meta.totalSpins).toBe(5000);
    expect(par.winDistribution).toHaveLength(HDR_THRESHOLDS.length + 1);
  }, 30000);
});

describe('win distribution', () => {
  it('all-zero win history produces all-zero bucket counts', () => {
    const cfg = standardConfig({ winHistory: new Array(1000).fill(0) });
    const par = generatePARSheet(minimalResult({ spins: 1000 }), minimalIR(), cfg);

    const nonZero = par.winDistribution.filter((b) => b.count > 0);
    // Only bucket 0 (no-win) should have count=1000
    expect(nonZero).toHaveLength(1);
    expect(nonZero[0]!.count).toBe(1000);
  });

  it('bucket probabilities sum to approximately 1 when winHistory provided', () => {
    const winHistory = [0, 0, 0, 1.5, 50.0, 200.0, 2000.0, 0, 0, 0];
    const cfg = standardConfig({ winHistory });
    const par = generatePARSheet(minimalResult({ spins: 10 }), minimalIR(), cfg);

    const probSum = par.winDistribution.reduce((s, b) => s + b.probability, 0);
    expect(probSum).toBeCloseTo(1.0, 6);
  });
});

describe('statistics section', () => {
  it('confidence adequate flag is false for small spin counts (< 100k typically)', () => {
    const par = generatePARSheet(minimalResult({ spins: 1000 }), minimalIR(), standardConfig());
    // For 1000 spins, stdError will not be < 0.001
    // (it's sqrt(0.3*0.7/1000) ≈ 0.0145)
    expect(par.statistics.confidenceAdequate).toBe(false);
  });

  it('multi-seed CI uses provided seedRtps', () => {
    const seedRtps = [0.955, 0.960, 0.965, 0.958, 0.962];
    const cfg = standardConfig({ seedRtps });
    const par = generatePARSheet(minimalResult(), minimalIR(), cfg);

    expect(par.statistics.stdDevAcrossSeeds).toBeGreaterThan(0);
    expect(par.statistics.ci95Low).toBeLessThan(par.statistics.ci95High);
  });
});

describe('formatPARSheet', () => {
  it('formatPARSheet smoke test returns box-drawing characters', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());
    const formatted = formatPARSheet(par);
    expect(formatted).toContain('╔');
    expect(formatted).toContain('╚');
    expect(formatted).toContain('║');
  });

  it('formatPARSheet includes VOLATILITY and STATISTICAL sections', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());
    const formatted = formatPARSheet(par);
    expect(formatted).toContain('VOLATILITY');
    expect(formatted).toContain('STATISTICAL');
  });

  it('formatPARSheet includes WIN DISTRIBUTION section', () => {
    const par = generatePARSheet(minimalResult(), minimalIR(), standardConfig());
    const formatted = formatPARSheet(par);
    expect(formatted).toContain('WIN DISTRIBUTION');
  });

  it('formatPARSheet includes jackpot section when jackpots are present', () => {
    const jackpots: JackpotMetrics[] = [
      {
        id: 'GRAND',
        name: 'Grand Jackpot',
        kind: 'progressive',
        hits: 5,
        avgInterval: 2000,
        totalPaidX: 50000,
        totalContributedX: 1000,
        currentPoolX: 1500,
        contributionRtp: 0.02,
      },
    ];
    const cfg = standardConfig({ jackpots });
    const par = generatePARSheet(minimalResult(), minimalIR(), cfg);
    const formatted = formatPARSheet(par);
    expect(formatted).toContain('JACKPOTS');
    expect(formatted).toContain('Grand Jackpot');
  });
});
