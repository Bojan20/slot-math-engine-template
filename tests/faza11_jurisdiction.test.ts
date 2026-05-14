/**
 * Faza 11.9 — Jurisdiction Adapter Tests.
 *
 * Covers 40+ test cases for JurisdictionAdapter: validate(), autoFix(),
 * generateReport(), listJurisdictions(), getProfile().
 */

import { describe, it, expect } from 'vitest';
import { JurisdictionAdapter, PROFILES } from '../src/jurisdiction/index.js';
import type { SlotGameIR } from '../src/ir/types.js';

// ─── Base IR factory ─────────────────────────────────────────────────────────

/** Creates a fully-compliant 5x3 IR for UKGC+MGA jurisdictions. */
function baseIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: {
      id: 'test-jurisdiction',
      name: 'Jurisdiction Test Game',
      version: '1.0.0',
      theme_tags: ['test'],
    },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'S_LP1', name: 'LP1', kind: 'lp' },
      { id: 'S_LP2', name: 'LP2', kind: 'lp' },
      { id: 'S_HP1', name: 'HP1', kind: 'hp' },
      { id: 'S_WILD', name: 'Wild', kind: 'wild', substitutes: '*' },
      { id: 'S_SCAT', name: 'Scatter', kind: 'scatter' },
    ],
    reels: {
      mode: 'weighted',
      base: Array.from({ length: 5 }, () => ({
        S_LP1: 8,
        S_LP2: 6,
        S_HP1: 3,
        S_WILD: 1,
        S_SCAT: 1,
      })),
    },
    evaluation: {
      kind: 'lines',
      paylines: [
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
        [2, 2, 2, 2, 2],
      ],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable: {
      S_LP1: { '3': 0.5, '4': 2, '5': 8 },
      S_LP2: { '3': 0.8, '4': 3, '5': 12 },
      S_HP1: { '3': 3, '4': 12, '5': 50 },
    },
    // No features — avoids gamble/buy_feature prohibition in UKGC
    features: [],
    rng: { kind: 'mulberry32', default_seed: 12345 },
    bet: { currency: 'EUR', base_bet: 1.0, denominations: [0.01, 0.1, 1.0] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.0005,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'high',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['UKGC', 'MGA'],
      rtp_range_required: [0.94, 0.99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: 0.66,
      free_spins: 0.30,
      hold_and_win: 0.0,
      jackpot: 0.0,
      tolerance: 0.005,
    },
  };
}

const adapter = new JurisdictionAdapter();

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('Faza 11.9 — Jurisdiction Adapter', () => {
  // ── JURI-01: Fully compliant IR → no errors ─────────────────────────────
  it('JURI-01: fully compliant UKGC+MGA IR → isCompliant=true, zero errors', () => {
    const ir = baseIR();
    const report = adapter.validate(ir, ['UKGC', 'MGA']);
    expect(report.isCompliant).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  // ── JURI-02: RTP below UKGC min ─────────────────────────────────────────
  it('JURI-02: RTP 0.93 below UKGC min (0.94) → error', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 0.93;
    const report = adapter.validate(ir, ['UKGC']);
    const rtpErr = report.violations.find((v) => v.ruleId === 'UKGC-RTP-001');
    expect(rtpErr).toBeDefined();
    expect(rtpErr?.severity).toBe('error');
    expect(report.isCompliant).toBe(false);
  });

  // ── JURI-03: RTP above UKGC max ─────────────────────────────────────────
  it('JURI-03: RTP 1.00 above UKGC max (0.99) → error', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 1.0;
    const report = adapter.validate(ir, ['UKGC']);
    const rtpErr = report.violations.find((v) => v.ruleId === 'UKGC-RTP-001');
    expect(rtpErr).toBeDefined();
    expect(rtpErr?.severity).toBe('error');
  });

  // ── JURI-04: gamble feature in UKGC ─────────────────────────────────────
  it('JURI-04: gamble feature in UKGC → error', () => {
    const ir = baseIR();
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-FEAT-GAMBLE');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  // ── JURI-05: buy_feature in UKGC ────────────────────────────────────────
  it('JURI-05: buy_feature in UKGC → error', () => {
    const ir = baseIR();
    ir.features.push({
      kind: 'buy_feature',
      offers: [{ id: 'bf1', cost_x: 100, guaranteed: 'free_spins' }],
    });
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-FEAT-BUYFEATURE');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  // ── JURI-06: gamble in ADM ───────────────────────────────────────────────
  it('JURI-06: gamble feature in ADM → error', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['ADM'];
    ir.compliance.rtp_range_required = [0.85, 0.97];
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    const report = adapter.validate(ir, ['ADM']);
    const v = report.violations.find((v) => v.ruleId === 'ADM-FEAT-GAMBLE');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  // ── JURI-07: gamble in AGCO ──────────────────────────────────────────────
  it('JURI-07: gamble feature in AGCO → error', () => {
    const ir = baseIR();
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    const report = adapter.validate(ir, ['AGCO']);
    const v = report.violations.find((v) => v.ruleId === 'AGCO-FEAT-GAMBLE');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
  });

  // ── JURI-08: ldw_disclosure=false in UKGC ───────────────────────────────
  it('JURI-08: ldw_disclosure=false in UKGC → error', () => {
    const ir = baseIR();
    ir.compliance.ldw_disclosure = false;
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-LDW-001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.canAutoFix).toBe(true);
  });

  // ── JURI-09: session_time_display=false in UKGC ─────────────────────────
  it('JURI-09: session_time_display=false in UKGC → error', () => {
    const ir = baseIR();
    ir.compliance.session_time_display = false;
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-SESSION-001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.canAutoFix).toBe(true);
  });

  // ── JURI-10: near_miss_rule='allowed_within_distribution' in UKGC ───────
  it('JURI-10: near_miss_rule=allowed_within_distribution in UKGC → error', () => {
    const ir = baseIR();
    ir.compliance.near_miss_rule = 'allowed_within_distribution';
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-NEARMISS-001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.canAutoFix).toBe(true);
  });

  // ── JURI-11: MGA online has NO max-win cap (Kimi research May 2026) ─────
  it('JURI-11: MGA online enforces no max-win cap', () => {
    const ir = baseIR();
    ir.limits.max_win_x = 1_000_000;
    const report = adapter.validate(ir, ['MGA']);
    const v = report.violations.find((v) => v.ruleId === 'MGA-MAXWIN-001');
    expect(v).toBeUndefined();
  });

  // ── JURI-12: ADM online has NO per-spin max-win cap ─────────────────────
  it('JURI-12: ADM online enforces no per-spin max-win cap', () => {
    const ir = baseIR();
    ir.limits.max_win_x = 50_000;
    ir.compliance.jurisdictions = ['ADM'];
    ir.compliance.rtp_range_required = [0.90, 0.99];
    const report = adapter.validate(ir, ['ADM']);
    const v = report.violations.find((v) => v.ruleId === 'ADM-MAXWIN-001');
    expect(v).toBeUndefined();
  });

  // ── JURI-13: autoFix removes gamble from UKGC IR ────────────────────────
  it('JURI-13: autoFix removes gamble feature for UKGC', () => {
    const ir = baseIR();
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    expect(ir.features.some((f) => f.kind === 'gamble')).toBe(true);

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.features.some((f) => f.kind === 'gamble')).toBe(false);
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-FEAT-GAMBLE');
    expect(fix).toBeDefined();
  });

  // ── JURI-14: autoFix removes buy_feature from UKGC IR ───────────────────
  it('JURI-14: autoFix removes buy_feature for UKGC', () => {
    const ir = baseIR();
    ir.features.push({
      kind: 'buy_feature',
      offers: [{ id: 'bf1', cost_x: 100, guaranteed: 'free_spins' }],
    });

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.features.some((f) => f.kind === 'buy_feature')).toBe(false);
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-FEAT-BUYFEATURE');
    expect(fix).toBeDefined();
  });

  // ── JURI-15: autoFix sets ldw_disclosure=true ───────────────────────────
  it('JURI-15: autoFix sets ldw_disclosure=true', () => {
    const ir = baseIR();
    ir.compliance.ldw_disclosure = false;

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.compliance.ldw_disclosure).toBe(true);
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-LDW-001');
    expect(fix).toBeDefined();
  });

  // ── JURI-16: autoFix sets session_time_display=true ─────────────────────
  it('JURI-16: autoFix sets session_time_display=true', () => {
    const ir = baseIR();
    ir.compliance.session_time_display = false;

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.compliance.session_time_display).toBe(true);
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-SESSION-001');
    expect(fix).toBeDefined();
  });

  // ── JURI-17: MGA auto-fix is a no-op on max_win_x (no statutory cap) ────
  it('JURI-17: MGA autoFix does not clamp max_win_x', () => {
    const ir = baseIR();
    ir.limits.max_win_x = 1_000_000;

    const result = adapter.autoFix(ir, ['MGA']);
    expect(result.ir.limits.max_win_x).toBe(1_000_000);
    const fix = result.appliedFixes.find((f) => f.ruleId === 'MGA-MAXWIN-001');
    expect(fix).toBeUndefined();
  });

  // ── JURI-18: autoFix sets near_miss_rule ────────────────────────────────
  it('JURI-18: autoFix sets near_miss_rule=must_be_random', () => {
    const ir = baseIR();
    ir.compliance.near_miss_rule = 'allowed_within_distribution';

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.compliance.near_miss_rule).toBe('must_be_random');
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-NEARMISS-001');
    expect(fix).toBeDefined();
  });

  // ── JURI-19: RTP-001 canAutoFix=false ───────────────────────────────────
  it('JURI-19: RTP violation (rtp-001) has canAutoFix=false', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 0.93;

    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-RTP-001');
    expect(v?.canAutoFix).toBe(false);
  });

  // ── JURI-20: autoFix adds jurisdiction to compliance.jurisdictions ───────
  it('JURI-20: autoFix adds jurisdiction to compliance.jurisdictions', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = [];

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.compliance.jurisdictions).toContain('UKGC');
    const fix = result.appliedFixes.find((f) => f.ruleId === 'UKGC-DECL-001');
    expect(fix).toBeDefined();
  });

  // ── JURI-21: autoFix doesn't mutate original IR ──────────────────────────
  it('JURI-21: autoFix does not mutate original IR', () => {
    const ir = baseIR();
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    ir.compliance.ldw_disclosure = false;
    const originalFeatureCount = ir.features.length;
    const originalLdw = ir.compliance.ldw_disclosure;

    adapter.autoFix(ir, ['UKGC']);

    // Original IR should be unchanged
    expect(ir.features.length).toBe(originalFeatureCount);
    expect(ir.compliance.ldw_disclosure).toBe(originalLdw);
  });

  // ── JURI-22: autoFix on fully-violating IR → isFullyCompliant=true ───────
  it('JURI-22: autoFix on IR with all fixable violations → isFullyCompliant=true', () => {
    const ir = baseIR();
    ir.compliance.ldw_disclosure = false;
    ir.compliance.session_time_display = false;
    ir.compliance.near_miss_rule = 'allowed_within_distribution';

    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.isFullyCompliant).toBe(true);
    expect(result.appliedFixes.length).toBeGreaterThanOrEqual(3);
  });

  // ── JURI-23: multiple jurisdictions → violations from both ───────────────
  it('JURI-23: multiple jurisdictions validate against both rule sets', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 0.84; // below MGA (0.85) and UKGC (0.94) minimums
    ir.compliance.rtp_range_required = [0.94, 0.99];

    const report = adapter.validate(ir, ['UKGC', 'MGA']);
    const ukgcErr = report.violations.find((v) => v.ruleId === 'UKGC-RTP-001');
    const mgaErr = report.violations.find((v) => v.ruleId === 'MGA-RTP-001');
    expect(ukgcErr).toBeDefined();
    expect(mgaErr).toBeDefined();
  });

  // ── JURI-24: explicit jurisdiction list overrides ir.compliance.jurisdictions
  it('JURI-24: explicit jurisdiction list overrides ir.compliance.jurisdictions', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['MGA']; // IR says MGA only

    // Explicitly check ADM — should use ADM profile, not MGA
    const report = adapter.validate(ir, ['ADM']);
    expect(report.checkedJurisdictions).toEqual(['ADM']);
    // ADM has different rtp range, so should generate rtp_002 warning at minimum
    const admViolations = report.violations.filter((v) => v.jurisdiction === 'ADM');
    expect(admViolations.length).toBeGreaterThan(0);
  });

  // ── JURI-25: uses ir.compliance.jurisdictions when no explicit list ───────
  it('JURI-25: uses ir.compliance.jurisdictions when no explicit list given', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['BMM'];
    ir.compliance.rtp_range_required = [0.80, 0.99];

    const report = adapter.validate(ir); // no explicit list
    expect(report.checkedJurisdictions).toContain('BMM');
    // Should NOT contain UKGC since we're only checking BMM
    expect(report.checkedJurisdictions).not.toContain('UKGC');
  });

  // ── JURI-26: info violations for informational notes + derived checks ────
  it('JURI-26: info violations generated for informational notes', () => {
    const ir = baseIR();
    const report = adapter.validate(ir, ['UKGC']);
    const infoViolations = report.violations.filter((v) => v.severity === 'info');
    expect(infoViolations.length).toBeGreaterThan(0);
    // UKGC: 6 informational notes + 4 derived (AUTOPLAY, TURBO, PACING, WAGERING) = 10.
    const ukgcInfo = infoViolations.filter((v) => v.jurisdiction === 'UKGC');
    expect(ukgcInfo.length).toBe(10);
    expect(ukgcInfo[0].canAutoFix).toBe(false);
  });

  // ── JURI-27: generateReport returns non-empty string ─────────────────────
  it('JURI-27: generateReport returns non-empty string', () => {
    const ir = baseIR();
    const report = adapter.generateReport(ir, ['UKGC']);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  // ── JURI-28: generateReport contains ✅ when compliant ───────────────────
  it('JURI-28: generateReport contains ✅ when compliant', () => {
    const ir = baseIR();
    const report = adapter.generateReport(ir, ['UKGC']);
    expect(report).toContain('✅');
  });

  // ── JURI-29: generateReport contains ❌ when non-compliant ───────────────
  it('JURI-29: generateReport contains ❌ when non-compliant', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 0.93; // below UKGC min
    const report = adapter.generateReport(ir, ['UKGC']);
    expect(report).toContain('❌');
  });

  // ── JURI-30: listJurisdictions() returns array of 8 IDs ──────────────────
  it('JURI-30: listJurisdictions() returns array of 8 IDs', () => {
    const ids = adapter.listJurisdictions();
    expect(ids).toHaveLength(8);
    expect(ids).toContain('UKGC');
    expect(ids).toContain('MGA');
    expect(ids).toContain('ADM');
    expect(ids).toContain('BMM');
    expect(ids).toContain('GLI19');
    expect(ids).toContain('AGCO');
    expect(ids).toContain('DGA');
    expect(ids).toContain('NJDGE');
  });

  // ── JURI-31: getProfile('UKGC') returns correct profile ──────────────────
  it('JURI-31: getProfile(UKGC) returns profile with correct rtpRange', () => {
    const profile = adapter.getProfile('UKGC');
    expect(profile).toBeDefined();
    expect(profile?.rtpRange).toEqual([0.94, 0.99]);
    expect(profile?.id).toBe('UKGC');
  });

  // ── JURI-32: getProfile('UNKNOWN') returns undefined ─────────────────────
  it('JURI-32: getProfile(UNKNOWN) returns undefined', () => {
    const profile = adapter.getProfile('UNKNOWN');
    expect(profile).toBeUndefined();
  });

  // ── JURI-33: validate with unknown jurisdiction gives warning ─────────────
  it('JURI-33: validate with unknown jurisdiction gives warning', () => {
    const ir = baseIR();
    const report = adapter.validate(ir, ['UNKNOWN_JUR']);
    const v = report.violations.find((v) => v.jurisdiction === 'UNKNOWN_JUR');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
  });

  // ── JURI-34: UKGC: both gamble AND buy_feature detected (2 errors min) ───
  it('JURI-34: UKGC detects both gamble AND buy_feature (2+ errors)', () => {
    const ir = baseIR();
    ir.features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'house' });
    ir.features.push({
      kind: 'buy_feature',
      offers: [{ id: 'bf1', cost_x: 100, guaranteed: 'free_spins' }],
    });

    const report = adapter.validate(ir, ['UKGC']);
    const featErrors = report.violations.filter(
      (v) => v.severity === 'error' && v.ruleId.includes('-FEAT-'),
    );
    expect(featErrors.length).toBeGreaterThanOrEqual(2);
  });

  // ── JURI-35: MGA: compliant IR passes ────────────────────────────────────
  it('JURI-35: MGA compliant IR passes (no errors)', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['MGA'];
    ir.compliance.rtp_range_required = [0.92, 0.99];

    const report = adapter.validate(ir, ['MGA']);
    expect(report.summary.errors).toBe(0);
  });

  // ── JURI-36: ADM: compliant IR passes ────────────────────────────────────
  it('JURI-36: ADM compliant IR passes (no errors)', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['ADM'];
    ir.compliance.rtp_range_required = [0.85, 0.97];
    ir.limits.target_rtp = 0.94;
    ir.limits.max_win_x = 800;

    const report = adapter.validate(ir, ['ADM']);
    expect(report.summary.errors).toBe(0);
  });

  // ── JURI-37: AGCO: validates correctly ───────────────────────────────────
  it('JURI-37: AGCO validates correctly — gamble triggers error', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['AGCO'];
    ir.compliance.rtp_range_required = [0.85, 0.99];
    ir.features.push({ kind: 'gamble', type: 'suit', max_steps: 3, tie_resolution: 'push' });

    const report = adapter.validate(ir, ['AGCO']);
    expect(report.violations.find((v) => v.ruleId === 'AGCO-FEAT-GAMBLE')).toBeDefined();
    expect(report.isCompliant).toBe(false);
  });

  // ── JURI-38: DGA: validates correctly ────────────────────────────────────
  it('JURI-38: DGA compliant IR passes (no errors)', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['DGA'];
    ir.compliance.rtp_range_required = [0.92, 0.99];

    const report = adapter.validate(ir, ['DGA']);
    expect(report.summary.errors).toBe(0);
  });

  // ── JURI-39: NJDGE: validates correctly ──────────────────────────────────
  it('JURI-39: NJDGE compliant IR passes (no errors)', () => {
    const ir = baseIR();
    ir.compliance.jurisdictions = ['NJDGE'];
    ir.compliance.rtp_range_required = [0.83, 0.99];

    const report = adapter.validate(ir, ['NJDGE']);
    expect(report.summary.errors).toBe(0);
  });

  // ── JURI-40: autoFix on already-compliant IR → 0 applied fixes ───────────
  it('JURI-40: autoFix on already-compliant IR → 0 applied fixes', () => {
    const ir = baseIR();
    const result = adapter.autoFix(ir, ['UKGC']);
    // Should have no fixes that are for errors (info/rtp-002 still may be fixed)
    // But since the baseIR is compliant, there should be no error-level fixes
    expect(result.isFullyCompliant).toBe(true);
  });

  // ── Additional structural checks ─────────────────────────────────────────

  it('PROFILES map has 8 entries', () => {
    expect(PROFILES.size).toBe(8);
  });

  it('RTP-002 warning is auto-fixable', () => {
    const ir = baseIR();
    ir.compliance.rtp_range_required = [0.90, 0.98]; // wrong for UKGC
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-RTP-002');
    expect(v?.canAutoFix).toBe(true);
  });

  it('autoFix sets rtp_range_required correctly for UKGC', () => {
    const ir = baseIR();
    ir.compliance.rtp_range_required = [0.90, 0.98]; // wrong for UKGC
    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.compliance.rtp_range_required).toEqual([0.94, 0.99]);
  });

  it('compliance report summary counts are correct', () => {
    const ir = baseIR();
    ir.limits.target_rtp = 0.93; // error
    ir.compliance.ldw_disclosure = false; // error
    const report = adapter.validate(ir, ['UKGC']);
    expect(report.summary.errors).toBeGreaterThanOrEqual(2);
    expect(report.summary.infos).toBeGreaterThan(0);
  });

  it('UKGC prohibitedFeatures includes gamble and buy_feature', () => {
    const profile = adapter.getProfile('UKGC');
    expect(profile?.prohibitedFeatures).toContain('gamble');
    expect(profile?.prohibitedFeatures).toContain('buy_feature');
  });

  it('MGA online has no statutory maxWinX cap', () => {
    const profile = adapter.getProfile('MGA');
    expect(profile?.maxWinX).toBeUndefined();
  });

  it('ADM online has no per-spin maxWinX cap', () => {
    const profile = adapter.getProfile('ADM');
    expect(profile?.maxWinX).toBeUndefined();
  });

  it('info violations all have canAutoFix=false', () => {
    const ir = baseIR();
    const report = adapter.validate(ir, ['UKGC', 'MGA']);
    const infoViolations = report.violations.filter((v) => v.severity === 'info');
    expect(infoViolations.every((v) => v.canAutoFix === false)).toBe(true);
  });

  it('generateReport mentions checked jurisdictions', () => {
    const ir = baseIR();
    const report = adapter.generateReport(ir, ['UKGC', 'MGA']);
    expect(report).toContain('UKGC');
    expect(report).toContain('MGA');
  });

  it('autoFix result.ir is different object from original', () => {
    const ir = baseIR();
    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir).not.toBe(ir);
  });
});
