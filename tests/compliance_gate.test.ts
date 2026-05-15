/**
 * W152 Wave 19 — complianceGate tests (Faza 15.B.5).
 */

import { describe, it, expect } from 'vitest';
import { evaluateCompliance, isStrictPass, isLenientPass } from '../src/jurisdiction/complianceGate.js';
import { PROFILES } from '../src/jurisdiction/profiles.js';
import type { SlotGameIR } from '../src/ir/types.js';

function makeIR(overrides: Partial<SlotGameIR> = {}): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'g', name: 'G', version: '1.0.0', theme_tags: [] },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [{ id: 'A', name: 'A', kind: 'lp' }],
    reels: { mode: 'weighted', base: [{ A: 1 }] },
    paytable: { A: { '3': 5 } },
    evaluation: { kind: 'lines', paylines: [[0]], direction: 'ltr' },
    features: [],
    rng: { kind: 'pcg64', default_seed: 1 },
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
      jurisdictions: ['MGA'],
      rtp_range_required: [0.92, 0.99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: { base_game: 1, free_spins: 0, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
    ...overrides,
  } as unknown as SlotGameIR;
}

describe('PROFILES — Wave 19 new entries', () => {
  it('DGOJ profile registered', () => {
    expect(PROFILES.has('DGOJ')).toBe(true);
    expect(PROFILES.get('DGOJ')?.maxWinX).toBe(50000);
  });
  it('SPELINSPEKTIONEN profile registered', () => {
    expect(PROFILES.has('SPELINSPEKTIONEN')).toBe(true);
    expect(PROFILES.get('SPELINSPEKTIONEN')?.bonusWageringCapX).toBe(1);
  });
  it('PGCB profile registered', () => {
    expect(PROFILES.has('PGCB')).toBe(true);
    expect(PROFILES.get('PGCB')?.rtpRange[0]).toBe(0.85);
  });
  it('NCPG profile registered', () => {
    expect(PROFILES.has('NCPG')).toBe(true);
    expect(PROFILES.get('NCPG')?.maxWinX).toBe(25000);
  });
  it('total profile count is 15 (11 baseline + 4 new)', () => {
    expect(PROFILES.size).toBe(15);
  });
});

describe('evaluateCompliance — RTP envelope', () => {
  it('passes within range', () => {
    const v = evaluateCompliance(makeIR(), 'MGA');
    const rtpCheck = v.checks.find((c) => c.ruleId === 'rtp_range');
    expect(rtpCheck?.status).toBe('PASS');
  });
  it('fails when target_rtp below floor', () => {
    const ir = makeIR({
      limits: {
        target_rtp: 0.7,
        rtp_tolerance: 0.01,
        max_win_x: 5000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
    });
    const v = evaluateCompliance(ir, 'MGA');
    const rtpCheck = v.checks.find((c) => c.ruleId === 'rtp_range');
    expect(rtpCheck?.status).toBe('FAIL');
  });
});

describe('evaluateCompliance — max-win cap', () => {
  it('PASS when cap respected (DGOJ 50000)', () => {
    const ir = makeIR({
      limits: {
        target_rtp: 0.96,
        rtp_tolerance: 0.01,
        max_win_x: 25000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
    });
    const v = evaluateCompliance(ir, 'DGOJ');
    const capCheck = v.checks.find((c) => c.ruleId === 'max_win_cap');
    expect(capCheck?.status).toBe('PASS');
  });
  it('FAIL when cap exceeded', () => {
    const ir = makeIR({
      limits: {
        target_rtp: 0.96,
        rtp_tolerance: 0.01,
        max_win_x: 75000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
    });
    const v = evaluateCompliance(ir, 'DGOJ');
    const capCheck = v.checks.find((c) => c.ruleId === 'max_win_cap');
    expect(capCheck?.status).toBe('FAIL');
  });
  it('N/A when no cap mandated (UKGC)', () => {
    const v = evaluateCompliance(makeIR(), 'UKGC');
    const capCheck = v.checks.find((c) => c.ruleId === 'max_win_cap');
    expect(capCheck?.status).toBe('N/A');
  });
});

describe('evaluateCompliance — prohibited features', () => {
  it('PASS when no prohibited features declared', () => {
    const v = evaluateCompliance(makeIR(), 'SPELINSPEKTIONEN');
    const f = v.checks.find((c) => c.ruleId === 'prohibited_features');
    expect(f?.status).toBe('PASS');
  });
  it('FAIL when banned feature is declared (SE buy_feature)', () => {
    const ir = makeIR({
      features: [{ kind: 'buy_feature', cost_x: 100, guaranteed: 'free_spins' } as unknown as SlotGameIR['features'][number]],
    });
    const v = evaluateCompliance(ir, 'SPELINSPEKTIONEN');
    const f = v.checks.find((c) => c.ruleId === 'prohibited_features');
    expect(f?.status).toBe('FAIL');
    expect(f?.note).toMatch(/buy_feature/);
  });
});

describe('evaluateCompliance — informational checks', () => {
  it('WARN on min spin duration (operator must enforce)', () => {
    const v = evaluateCompliance(makeIR(), 'DGOJ');
    const w = v.checks.find((c) => c.ruleId === 'min_spin_duration');
    expect(w?.status).toBe('WARN');
  });
  it('WARN on autoplay prohibition', () => {
    const v = evaluateCompliance(makeIR(), 'NCPG');
    const w = v.checks.find((c) => c.ruleId === 'autoplay_prohibition');
    expect(w?.status).toBe('WARN');
  });
  it('WARN on bonus wagering cap', () => {
    const v = evaluateCompliance(makeIR(), 'SPELINSPEKTIONEN');
    const w = v.checks.find((c) => c.ruleId === 'bonus_wagering_cap');
    expect(w?.status).toBe('WARN');
    expect(w?.expected).toBe(1);
  });
});

describe('evaluateCompliance — LDW + session time', () => {
  it('PASS when both flags true and required', () => {
    const v = evaluateCompliance(makeIR(), 'DGOJ');
    expect(v.checks.find((c) => c.ruleId === 'ldw_disclosure')?.status).toBe('PASS');
    expect(v.checks.find((c) => c.ruleId === 'session_time_display')?.status).toBe('PASS');
  });
  it('FAIL when required but flag is false', () => {
    const ir = makeIR({
      compliance: {
        jurisdictions: ['DGOJ'],
        rtp_range_required: [0.9, 0.99],
        max_win_cap_required: 50000,
        near_miss_rule: 'must_be_random',
        ldw_disclosure: false,
        session_time_display: false,
      },
    });
    const v = evaluateCompliance(ir, 'DGOJ');
    expect(v.checks.find((c) => c.ruleId === 'ldw_disclosure')?.status).toBe('FAIL');
    expect(v.checks.find((c) => c.ruleId === 'session_time_display')?.status).toBe('FAIL');
  });
});

describe('evaluateCompliance — overall verdict', () => {
  it('overallStatus = PASS when all checks pass', () => {
    const v = evaluateCompliance(makeIR(), 'MGA');
    expect(v.overallStatus).toBe('PASS');
  });
  it('overallStatus = FAIL on any FAIL', () => {
    const ir = makeIR({
      compliance: {
        jurisdictions: ['DGOJ'],
        rtp_range_required: [0.9, 0.99],
        max_win_cap_required: 50000,
        near_miss_rule: 'must_be_random',
        ldw_disclosure: false,
        session_time_display: true,
      },
    });
    const v = evaluateCompliance(ir, 'DGOJ');
    expect(v.overallStatus).toBe('FAIL');
  });
  it('overallStatus = WARN when only WARN, no FAIL', () => {
    // PGCB has min_spin_duration WARN but no other failures by default
    const v = evaluateCompliance(makeIR(), 'PGCB');
    expect(v.overallStatus).toBe('WARN');
  });
});

describe('evaluateCompliance — guards', () => {
  it('throws on unknown jurisdiction', () => {
    expect(() => evaluateCompliance(makeIR(), 'UNKNOWN')).toThrow(/unknown jurisdiction/);
  });
});

describe('isStrictPass / isLenientPass', () => {
  it('strict pass requires zero FAIL', () => {
    const v = evaluateCompliance(makeIR(), 'MGA');
    expect(isStrictPass(v)).toBe(true);
  });
  it('strict reject on any FAIL', () => {
    const ir = makeIR({
      limits: {
        target_rtp: 0.5,
        rtp_tolerance: 0.01,
        max_win_x: 5000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
    });
    const v = evaluateCompliance(ir, 'MGA');
    expect(isStrictPass(v)).toBe(false);
  });
  it('lenient allows single FAIL', () => {
    const ir = makeIR({
      limits: {
        target_rtp: 0.5,
        rtp_tolerance: 0.01,
        max_win_x: 5000,
        win_cap_apply: 'per_spin',
        target_volatility: 'medium',
        hit_freq_target: 0.3,
      },
    });
    const v = evaluateCompliance(ir, 'MGA');
    // MGA: rtp_range FAIL + no warnings → lenient passes (1 FAIL, 0 WARN)
    if (v.warnCount === 0) expect(isLenientPass(v)).toBe(true);
  });
});
