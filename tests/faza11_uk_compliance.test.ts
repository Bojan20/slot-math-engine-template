/**
 * Faza 11.10 — UKGC compliance integration tests (TS mirror of Rust suite).
 *
 * Mirrors `rust-sim/tests/faza11_uk_compliance.rs`. Covers:
 *  - Profile flag surface (SI 2025/215 + RTS 14D + 10x wagering cap).
 *  - IR-level stake checker (STAKE-001/002/003) + auto-fix.
 *  - Info surface (AUTOPLAY/TURBO/PACING/WAGERING).
 *  - Runtime validators: stake, pacing, autoplay, turbo, wagering, full ctx.
 *  - Multi-jurisdiction interaction (UKGC vs ADM autoplay delta).
 */

import { describe, expect, it } from 'vitest';

import {
  JurisdictionAdapter,
  PROFILES,
  resolveStakeCap,
  validateAutoplay,
  validateBonusWagering,
  validateSpin,
  validateSpinDuration,
  validateSpinFull,
  validateStake,
  validateTurbo,
} from '../src/jurisdiction/index.js';
import type { SlotGameIR } from '../src/ir/types.js';

const adapter = new JurisdictionAdapter();

function baseUkIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: {
      id: 'ts-uk-compliance',
      name: 'UK Compliance Test',
      version: '1.0.0',
      theme_tags: ['test'],
    },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'S_LP1', name: 'LP1', kind: 'lp' },
      { id: 'S_HP1', name: 'HP1', kind: 'hp' },
      { id: 'S_WILD', name: 'Wild', kind: 'wild', substitutes: '*' },
      { id: 'S_SCAT', name: 'Scatter', kind: 'scatter' },
    ],
    reels: {
      mode: 'weighted',
      base: Array.from({ length: 5 }, () => ({
        S_LP1: 8,
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
      S_HP1: { '3': 3, '4': 12, '5': 50 },
    },
    features: [],
    rng: { kind: 'mulberry32', default_seed: 12345 },
    bet: { currency: 'GBP', base_bet: 1.0, denominations: [0.1, 0.5, 1.0, 2.0] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.0005,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'high',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['UKGC'],
      rtp_range_required: [0.94, 0.99],
      max_win_cap_required: 5000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: 0.66,
      free_spins: 0.3,
      hold_and_win: 0,
      jackpot: 0,
      tolerance: 0.005,
    },
  };
}

describe('Faza 11.10 — UKGC compliance (TS mirror)', () => {
  // ── Profile flag surface ─────────────────────────────────────────────────
  it('UKGC profile carries SI 2025/215 fields', () => {
    const p = PROFILES.get('UKGC');
    expect(p).toBeDefined();
    expect(p!.maxStakeDefault).toBe(5);
    expect(p!.ageTieredStakes).toHaveLength(2);
    expect(p!.ageTieredStakes![0].maxStake).toBe(2); // 18-24
    expect(p!.ageTieredStakes![1].maxStake).toBe(5); // 25+
    expect(p!.minSpinDurationMs).toBe(2500);
    expect(p!.prohibitAutoplay).toBe(true);
    expect(p!.prohibitTurbo).toBe(true);
    expect(p!.bonusWageringCapX).toBe(10);
    expect(p!.effectiveFrom).toBe('2025-04-09');
    expect(p!.regulatorUrl).toMatch(/gamblingcommission\.gov\.uk/);
  });

  it('resolveStakeCap returns 5 for 25+', () => {
    const p = PROFILES.get('UKGC')!;
    expect(resolveStakeCap(p, 25)).toBe(5);
    expect(resolveStakeCap(p, 40)).toBe(5);
  });

  it('resolveStakeCap returns 2 for 18-24', () => {
    const p = PROFILES.get('UKGC')!;
    expect(resolveStakeCap(p, 18)).toBe(2);
    expect(resolveStakeCap(p, 24)).toBe(2);
  });

  it('resolveStakeCap returns 2 (strictest) when no age supplied', () => {
    const p = PROFILES.get('UKGC')!;
    expect(resolveStakeCap(p, undefined)).toBe(2);
  });

  it('resolveStakeCap returns undefined for unknown age band', () => {
    const p = PROFILES.get('UKGC')!;
    expect(resolveStakeCap(p, 17)).toBeUndefined();
  });

  // ── IR-level stake checker ───────────────────────────────────────────────
  it('IR: base_bet £3 triggers UKGC-STAKE-001', () => {
    const ir = baseUkIR();
    ir.bet.base_bet = 3;
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-STAKE-001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.canAutoFix).toBe(true);
  });

  it('IR: denominations over cap trigger UKGC-STAKE-002', () => {
    const ir = baseUkIR();
    ir.bet.denominations = [0.1, 1, 5, 25];
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-STAKE-002');
    expect(v).toBeDefined();
  });

  it('IR: negative base_bet triggers UKGC-STAKE-003 (no auto-fix)', () => {
    const ir = baseUkIR();
    ir.bet.base_bet = -1;
    const report = adapter.validate(ir, ['UKGC']);
    const v = report.violations.find((v) => v.ruleId === 'UKGC-STAKE-003');
    expect(v).toBeDefined();
    expect(v?.canAutoFix).toBe(false);
  });

  it('IR: NaN base_bet triggers UKGC-STAKE-003', () => {
    const ir = baseUkIR();
    ir.bet.base_bet = NaN;
    const report = adapter.validate(ir, ['UKGC']);
    expect(
      report.violations.some((v) => v.ruleId === 'UKGC-STAKE-003'),
    ).toBe(true);
  });

  it('auto-fix caps base_bet to strictest band', () => {
    const ir = baseUkIR();
    ir.bet.base_bet = 10;
    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.bet.base_bet).toBe(2);
    expect(
      result.appliedFixes.some((f) => f.ruleId === 'UKGC-STAKE-001'),
    ).toBe(true);
  });

  it('auto-fix drops denominations over cap', () => {
    const ir = baseUkIR();
    ir.bet.denominations = [0.1, 1, 5, 100];
    const result = adapter.autoFix(ir, ['UKGC']);
    expect(result.ir.bet.denominations.every((d) => d <= 2)).toBe(true);
    expect(result.ir.bet.denominations).toContain(1);
  });

  // ── Informational surface ────────────────────────────────────────────────
  it('UKGC emits AUTOPLAY/TURBO/PACING/WAGERING info violations', () => {
    const ir = baseUkIR();
    const report = adapter.validate(ir, ['UKGC']);
    for (const rid of [
      'UKGC-AUTOPLAY-001',
      'UKGC-TURBO-001',
      'UKGC-PACING-001',
      'UKGC-WAGERING-001',
    ]) {
      const v = report.violations.find((v) => v.ruleId === rid);
      expect(v, `missing ${rid}`).toBeDefined();
      expect(v?.severity).toBe('info');
    }
  });

  // ── Runtime: validateStake ───────────────────────────────────────────────
  it('runtime stake £5 at age 25 passes', () => {
    expect(validateStake('UKGC', 5, 25)).toBeNull();
  });

  it('runtime stake £5.01 at age 25 rejected', () => {
    const err = validateStake('UKGC', 5.01, 25);
    expect(err?.kind).toBe('stake_over_cap');
  });

  it('runtime stake £2 at age 20 passes; £3 rejected', () => {
    expect(validateStake('UKGC', 2, 20)).toBeNull();
    expect(validateStake('UKGC', 3, 20)?.kind).toBe('stake_over_cap');
  });

  it('runtime stake without age in tiered jurisdiction → age_required', () => {
    expect(validateStake('UKGC', 1, undefined)?.kind).toBe('age_required');
  });

  it('runtime stake at age 17 → unknown_age_band', () => {
    expect(validateStake('UKGC', 1, 17)?.kind).toBe('unknown_age_band');
  });

  it('runtime stake invalid values → invalid_stake', () => {
    expect(validateStake('UKGC', 0, 25)?.kind).toBe('invalid_stake');
    expect(validateStake('UKGC', -1, 25)?.kind).toBe('invalid_stake');
    expect(validateStake('UKGC', NaN, 25)?.kind).toBe('invalid_stake');
    expect(validateStake('UKGC', Infinity, 25)?.kind).toBe('invalid_stake');
  });

  it('runtime stake unknown jurisdiction → unknown_jurisdiction', () => {
    expect(validateStake('ZZGC', 1, undefined)?.kind).toBe(
      'unknown_jurisdiction',
    );
  });

  it('runtime stake uncapped jurisdiction passes any amount', () => {
    expect(validateStake('GLI19', 10_000, undefined)).toBeNull();
  });

  // ── Runtime: pacing ──────────────────────────────────────────────────────
  it('pacing under 2500ms rejected for UKGC', () => {
    const err = validateSpinDuration('UKGC', 2499);
    expect(err?.kind).toBe('spin_too_fast');
  });

  it('pacing 2500ms exactly passes for UKGC', () => {
    expect(validateSpinDuration('UKGC', 2500)).toBeNull();
  });

  it('pacing any duration passes for MGA (no minimum)', () => {
    expect(validateSpinDuration('MGA', 100)).toBeNull();
  });

  // ── Runtime: autoplay / turbo ────────────────────────────────────────────
  it('autoplay rejected in UKGC, allowed in MGA + ADM', () => {
    expect(validateAutoplay('UKGC')?.kind).toBe('autoplay_prohibited');
    expect(validateAutoplay('MGA')).toBeNull();
    expect(validateAutoplay('ADM')).toBeNull();
  });

  it('turbo rejected in UKGC, allowed in MGA + ADM', () => {
    expect(validateTurbo('UKGC')?.kind).toBe('turbo_prohibited');
    expect(validateTurbo('MGA')).toBeNull();
    expect(validateTurbo('ADM')).toBeNull();
  });

  // ── Runtime: wagering ────────────────────────────────────────────────────
  it('wagering 10x passes UKGC; 35x rejected', () => {
    expect(validateBonusWagering('UKGC', 10)).toBeNull();
    expect(validateBonusWagering('UKGC', 35)?.kind).toBe(
      'bonus_wagering_over_cap',
    );
  });

  it('wagering any value passes uncapped jurisdiction', () => {
    expect(validateBonusWagering('MGA', 100)).toBeNull();
  });

  // ── Runtime: SpinContext ─────────────────────────────────────────────────
  it('validateSpin: compliant UKGC 25+ context passes', () => {
    expect(
      validateSpin({
        jurisdiction: 'UKGC',
        stake: 5,
        playerAge: 25,
        spinDurationMs: 2500,
      }),
    ).toBeNull();
  });

  it('validateSpinFull collects every violation', () => {
    const errs = validateSpinFull({
      jurisdiction: 'UKGC',
      stake: 1000,
      playerAge: 20,
      spinDurationMs: 100,
      autoplay: true,
      turbo: true,
    });
    expect(errs).toHaveLength(4);
    const kinds = new Set(errs.map((e) => e.kind));
    expect(kinds.has('autoplay_prohibited')).toBe(true);
    expect(kinds.has('turbo_prohibited')).toBe(true);
    expect(kinds.has('stake_over_cap')).toBe(true);
    expect(kinds.has('spin_too_fast')).toBe(true);
  });

  // ── Multi-jurisdiction interaction ───────────────────────────────────────
  it('UKGC flags AUTOPLAY but ADM does not', () => {
    const ir = baseUkIR();
    const report = adapter.validate(ir, ['UKGC', 'ADM']);
    expect(
      report.violations.some((v) => v.ruleId === 'UKGC-AUTOPLAY-001'),
    ).toBe(true);
    expect(
      report.violations.some((v) => v.ruleId === 'ADM-AUTOPLAY-001'),
    ).toBe(false);
  });

  it('uncapped jurisdiction emits no stake violations', () => {
    const ir = baseUkIR();
    ir.bet.base_bet = 125;
    const report = adapter.validate(ir, ['MGA']);
    expect(
      report.violations.every((v) => !v.ruleId.startsWith('MGA-STAKE-')),
    ).toBe(true);
  });
});
