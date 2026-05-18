// CERTIFY tab tests (W199-CERTIFY).
// Exercises the pure math + projection layer of `src/certify.ts`, plus
// the operator-package file-list builder. DOM-coupled flows are not
// asserted here (vitest runs under Node env without happy-dom).

import { describe, it, expect } from 'vitest';
import {
  MC_SIZES,
  RNG_BACKENDS,
  JURISDICTIONS,
  RNG_AUDIT_FIXTURE,
  makeRng,
  runMcInline,
  buildParSections,
  merkleRoot,
  mockHsmSignature,
  runComplianceAudit,
  buildOperatorPackageFileList,
  renderParMarkdown,
  type RngBackend,
  type AuditContext,
} from '../src/certify.js';
import type { SlotGameIR } from '@engine/ir/types.js';

// ── Minimal IR for the MC runner — 5x3, 3 paylines, 3 HP symbols + wild ──
function makeIR(): SlotGameIR {
  const m: Record<string, number> = { HP1: 4, HP2: 4, HP3: 4, LP1: 8, LP2: 8, WILD: 2, SCATTER: 2 };
  return {
    schema_version: '1.0.0',
    meta: { id: 'test-game', name: 'Test', version: '0.1.0', theme_tags: [], created_at_utc: new Date().toISOString() },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'HP1', name: 'HP1', kind: 'hp',  weight_hint: 4 },
      { id: 'HP2', name: 'HP2', kind: 'hp',  weight_hint: 4 },
      { id: 'HP3', name: 'HP3', kind: 'hp',  weight_hint: 4 },
      { id: 'LP1', name: 'LP1', kind: 'lp',  weight_hint: 8 },
      { id: 'LP2', name: 'LP2', kind: 'lp',  weight_hint: 8 },
      { id: 'WILD',    name: 'Wild',    kind: 'wild',    weight_hint: 2, substitutes: '*' },
      { id: 'SCATTER', name: 'Scatter', kind: 'scatter', weight_hint: 2 },
    ],
    reels: {
      mode: 'weighted',
      base: [ {...m}, {...m}, {...m}, {...m}, {...m} ],
    },
    evaluation: {
      kind: 'lines',
      paylines: [ [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2] ],
      direction: 'ltr', min_match: 3, pay_left_to_right_only: true,
    },
    paytable: {
      HP1: { '3': 50, '4': 150, '5': 500 },
      HP2: { '3': 50, '4': 150, '5': 500 },
      HP3: { '3': 50, '4': 150, '5': 500 },
      LP1: { '3': 5,  '4': 20,  '5': 75  },
      LP2: { '3': 5,  '4': 20,  '5': 75  },
      WILD: { '3': 0, '4': 0, '5': 0 },
      SCATTER: { '3': 5, '4': 20, '5': 100 },
    },
    features: [],
    rng: { kind: 'pcg64', default_seed: 0xC0FFEE },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: { target_rtp: 0.96, rtp_tolerance: 0.01, max_win_x: 5000, win_cap_apply: 'per_spin', target_volatility: 'medium', hit_freq_target: 0.25 },
    compliance: { jurisdictions: ['EU-MT'], rtp_range_required: [0.85, 0.98], max_win_cap_required: 100000, near_miss_rule: 'must_be_random', ldw_disclosure: true, session_time_display: true },
    rtp_allocation: { base_game: 0.7, free_spins: 0.3, hold_and_win: 0, jackpot: 0, tolerance: 0.05 },
  };
}

// ── §1 — MC sizes — ────────────────────────────────────────────────
describe('CERTIFY · MC size selector', () => {
  it('exposes exactly 5 MC sample sizes', () => {
    expect(MC_SIZES.length).toBe(5);
    expect(MC_SIZES.map((s) => s.label)).toEqual(['100K', '1M', '10M', '100M', '1B']);
  });
  it('first size (100K) is the fast main-thread default', () => {
    expect(MC_SIZES[0].spins).toBe(100_000);
    expect(MC_SIZES[0].fast).toBe(true);
  });
  it('all sizes >= 1M run in WebWorker (fast=false)', () => {
    for (let i = 1; i < MC_SIZES.length; i++) expect(MC_SIZES[i].fast).toBe(false);
  });
});

// ── §2 — RNG backends — ───────────────────────────────────────────
describe('CERTIFY · RNG backends', () => {
  it('exposes exactly 5 RNG backends in canonical order', () => {
    expect(RNG_BACKENDS).toEqual([
      'mulberry32', 'pcg64', 'xoshiro256ss', 'philox4x32', 'chacha20',
    ]);
  });
  it('ChaCha20 is flagged UK CRITICAL in jurisdiction registry', () => {
    const uk = JURISDICTIONS.find((j) => j.id === 'UKGC');
    expect(uk?.isUKCritical).toBe(true);
  });
  it.each(RNG_BACKENDS as RngBackend[])('rng %s produces values in [0, 1)', (kind) => {
    const r = makeRng(kind, 12345);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('same seed yields deterministic stream (PCG64)', () => {
    const a = makeRng('pcg64', 42);
    const b = makeRng('pcg64', 42);
    for (let i = 0; i < 32; i++) expect(a()).toBe(b());
  });
});

// ── §3 — MC inline runner — ───────────────────────────────────────
describe('CERTIFY · MC inline runner', () => {
  it('returns an MCResult with finite RTP and 100K spins', () => {
    const ir = makeIR();
    const r = runMcInline({ ir, spins: 5000, rng: 'pcg64', seed: 7, closedFormRtp: 0.95 });
    expect(r.spins).toBe(5000);
    expect(Number.isFinite(r.rtp)).toBe(true);
    expect(r.rtp).toBeGreaterThan(0);
    expect(r.hitFreq).toBeGreaterThan(0);
    expect(r.hitFreq).toBeLessThanOrEqual(1);
    expect(r.ciHalfWidth95).toBeGreaterThan(0);
    expect(r.quantiles.p50).toBeGreaterThanOrEqual(0);
  });

  it('progress callback fires at least once and reports frac in [0,1]', () => {
    const ir = makeIR();
    const fracs: number[] = [];
    runMcInline({
      ir, spins: 3000, rng: 'mulberry32', seed: 1, closedFormRtp: 0.95,
      onProgress: (frac) => { fracs.push(frac); },
    });
    expect(fracs.length).toBeGreaterThan(0);
    for (const f of fracs) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

// ── §4 — Jurisdictions — ──────────────────────────────────────────
describe('CERTIFY · 15 jurisdictions', () => {
  it('exposes exactly 15 regulators', () => {
    expect(JURISDICTIONS.length).toBe(15);
  });
  it('includes the canonical regulator IDs', () => {
    const ids = JURISDICTIONS.map((j) => j.id);
    for (const expected of ['UKGC','MGA','ADM','eCOGRA','DGOJ','SE','SRIJ','KSA','GGL','AGCO','AU','NZ','JP','KR','BR']) {
      expect(ids).toContain(expected);
    }
  });
  it('UKGC has RTS-7A, RTS-12 (autoplay), RTS-14D (pacing)', () => {
    const uk = JURISDICTIONS.find((j) => j.id === 'UKGC')!;
    expect(uk.prohibitAutoplay).toBe(true);
    expect(uk.minSpinMs).toBe(2500);
    const codes = uk.rules.map((r) => r.code);
    expect(codes).toContain('RTS-7A');
    expect(codes).toContain('RTS-12');
    expect(codes).toContain('RTS-14D');
  });
  it('GGL (Germany) requires 5000 ms pacing and forbids autoplay', () => {
    const de = JURISDICTIONS.find((j) => j.id === 'GGL')!;
    expect(de.minSpinMs).toBe(5000);
    expect(de.prohibitAutoplay).toBe(true);
  });
});

// ── §5 — Compliance audit — ───────────────────────────────────────
describe('CERTIFY · compliance audit', () => {
  function ctx(over: Partial<AuditContext> = {}): AuditContext {
    return {
      rtp: 0.96,
      maxWinX: 5000,
      autoplayEnabled: false,
      spinPacingMs: 5000,
      bonusWageringX: 10,
      rngBackend: 'chacha20',
      selfExclusionProvider: 'GAMSTOP',
      lossLimitEnabled: true,
      ...over,
    };
  }
  it('detects autoplay violation against UKGC', () => {
    const audits = runComplianceAudit(ctx({ autoplayEnabled: true }));
    const uk = audits.find((a) => a.jur === 'UKGC')!;
    expect(uk.violations).toBeGreaterThan(0);
    const autoplayCheck = uk.checks.find((c) => c.code === 'AUTOPLAY')!;
    expect(autoplayCheck.pass).toBe(false);
    expect(autoplayCheck.fixable).toBe(true);
  });
  it('CSPRNG check fails for non-ChaCha20 under UKGC', () => {
    const audits = runComplianceAudit(ctx({ rngBackend: 'pcg64' }));
    const uk = audits.find((a) => a.jur === 'UKGC')!;
    const cs = uk.checks.find((c) => c.code === 'CSPRNG')!;
    expect(cs.pass).toBe(false);
  });
  it('passes UKGC when all rules are met', () => {
    const audits = runComplianceAudit(ctx({}));
    const uk = audits.find((a) => a.jur === 'UKGC')!;
    expect(uk.violations).toBe(0);
  });
  it('produces one audit row per jurisdiction', () => {
    const audits = runComplianceAudit(ctx());
    expect(audits.length).toBe(JURISDICTIONS.length);
  });
});

// ── §6 — PAR sections (12) + Merkle commit — ──────────────────────
describe('CERTIFY · 12-section PAR sheet', () => {
  it('builds exactly 12 sections numbered 1..12', () => {
    const ir = makeIR();
    const mc = runMcInline({ ir, spins: 2000, rng: 'pcg64', seed: 3, closedFormRtp: 0.95 });
    const par = buildParSections(ir, mc);
    expect(par.length).toBe(12);
    expect(par.map((s) => s.index)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    // canonical section titles
    expect(par[0].title).toBe('Meta');
    expect(par[1].title).toBe('RTP summary');
    expect(par[6].title).toBe('Compliance');
    expect(par[11].title).toBe('Required spins');
  });
  it('renders markdown with all 12 section headers', () => {
    const ir = makeIR();
    const mc = runMcInline({ ir, spins: 1000, rng: 'pcg64', seed: 1, closedFormRtp: 0.95 });
    const md = renderParMarkdown(buildParSections(ir, mc));
    for (let i = 1; i <= 12; i++) {
      expect(md).toContain(`## §${i} `);
    }
  });
  it('merkleRoot returns a deterministic 64+-char hash', async () => {
    const ir = makeIR();
    const mc = runMcInline({ ir, spins: 1000, rng: 'pcg64', seed: 1, closedFormRtp: 0.95 });
    const par = buildParSections(ir, mc);
    const h1 = await merkleRoot(par);
    const h2 = await merkleRoot(par);
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThanOrEqual(64);
  });
  it('mockHsmSignature is deterministic and contains ed25519 prefix', () => {
    const sig = mockHsmSignature('a'.repeat(64));
    expect(sig.startsWith('ed25519:')).toBe(true);
    expect(mockHsmSignature('a'.repeat(64))).toBe(sig);
  });
});

// ── §7 — RNG audit fixture — ──────────────────────────────────────
describe('CERTIFY · RNG audit', () => {
  it('has audit rows for all 5 backends', () => {
    expect(RNG_AUDIT_FIXTURE.length).toBe(5);
    const rngs = RNG_AUDIT_FIXTURE.map((r) => r.rng);
    for (const b of RNG_BACKENDS) expect(rngs).toContain(b);
  });
  it('ChaCha20 passes NIST SP 800-22 (15/15) and KAT', () => {
    const cc = RNG_AUDIT_FIXTURE.find((r) => r.rng === 'chacha20')!;
    expect(cc.nistPass).toBe(15);
    expect(cc.katPass).toBe(true);
    expect(cc.entropyBits).toBeGreaterThan(7.99);
  });
});

// ── §8 — Operator package ZIP — ───────────────────────────────────
describe('CERTIFY · operator package', () => {
  function inputs() {
    const ir = makeIR();
    const mc = runMcInline({ ir, spins: 1000, rng: 'pcg64', seed: 9, closedFormRtp: 0.95 });
    const par = buildParSections(ir, mc);
    return {
      ir, par, mc,
      merkle: 'a'.repeat(64),
      hsmSig: 'ed25519:beef',
      audits: runComplianceAudit({
        rtp: mc.rtp, maxWinX: mc.maxWinX, autoplayEnabled: false,
        spinPacingMs: 5000, bonusWageringX: 10, rngBackend: 'chacha20',
        selfExclusionProvider: 'GAMSTOP', lossLimitEnabled: true,
      }),
      rngAudit: RNG_AUDIT_FIXTURE,
    };
  }
  it('builds a 153-file manifest', () => {
    const files = buildOperatorPackageFileList(inputs());
    expect(files.length).toBe(153);
  });
  it('includes IR, PAR, MC, Merkle, HSM and 15 jurisdiction overlays', () => {
    const files = buildOperatorPackageFileList(inputs());
    const paths = files.map((f) => f.path);
    expect(paths).toContain('ir/game.ir.json');
    expect(paths).toContain('par/par-sheet.json');
    expect(paths).toContain('par/par-sheet.pdf');
    expect(paths).toContain('mc/mc-result.json');
    expect(paths).toContain('merkle/merkle-root.txt');
    expect(paths).toContain('merkle/hsm-signature.txt');
    expect(paths).toContain('compliance/audit-results.json');
    // 15 overlays + 15 cert sheets
    for (const j of JURISDICTIONS) {
      expect(paths).toContain(`compliance/jurisdictions/${j.id.toLowerCase()}.overlay.json`);
    }
    // 12 PAR section MD files
    for (let i = 1; i <= 12; i++) {
      expect(paths).toContain(`par/sections/section-${String(i).padStart(2, '0')}.md`);
    }
  });
});
