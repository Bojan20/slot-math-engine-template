// W204 / PHASE 9.4 — Tournament-Aware RTP Audit Pipeline vitest specs
// (107. solver wave, composes W201+W202+W203 → multi-format audit report).

import { describe, it, expect } from 'vitest';
import {
  buildTournamentAuditReport,
  emitTournamentAuditMarkdown,
  emitTournamentAuditJson,
  emitTournamentAuditXml,
  type TournamentAuditInput,
} from '../src/cli/buildTournamentAuditReport.js';
import type { TournamentPrizeAllocationConfig } from '../src/features/tournamentPrizeAllocation.js';
import type { MultiPoolCrossTournamentConfig } from '../src/features/multiPoolCrossTournament.js';
import type { SkillVarianceAdjustedRankingConfig } from '../src/features/skillVarianceAdjustedRanking.js';

const FIXED_TS = '2026-05-27T01:42:00.000Z';

const w201Cfg: TournamentPrizeAllocationConfig = {
  nPlayers: 10,
  spinsPerPlayer: 100,
  betPerSpin: 1,
  contributionRate: 0.02,
  perSpinPayoutMean: 0.94,
  perSpinPayoutVariance: 4.0,
  prizeStructure: { kind: 'winner-take-all' },
};

const w202Cfg: MultiPoolCrossTournamentConfig = {
  nPlayers: 100,
  titleDayGrid: Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => ({
      spinsPerPlayer: 50,
      contributionRate: 0.015,
      betPerSpin: 1,
      perSpinPayoutMean: 0.94,
      perSpinPayoutVariance: 4.0,
    })),
  ),
  prizeStructure: { kind: 'top-n-flat', topN: 10 },
};

const w203Cfg: SkillVarianceAdjustedRankingConfig = {
  players: [
    { mean: 0.94, variance: 4.0, betSize: 1, label: 'low' },
    { mean: 0.94, variance: 4.0, betSize: 5, label: 'mid' },
    { mean: 0.94, variance: 4.0, betSize: 25, label: 'high' },
  ],
  spinsPerPlayer: 200,
  contributionRate: 0.02,
};

const baseInput: TournamentAuditInput = {
  tournamentId: 'UKGC-TEST-2026Q2',
  operator: 'TestOp Ltd.',
  baseGameRtpTarget: 0.94,
  prizeAllocation: w201Cfg,
};

describe('W204 — Tournament-Aware RTP Audit Pipeline', () => {
  describe('validation', () => {
    it('rejects empty tournamentId', () => {
      expect(() => buildTournamentAuditReport({ ...baseInput, tournamentId: '' })).toThrow();
    });
    it('rejects empty operator', () => {
      expect(() => buildTournamentAuditReport({ ...baseInput, operator: '' })).toThrow();
    });
    it('rejects baseGameRtpTarget out of [0, 1.1]', () => {
      expect(() =>
        buildTournamentAuditReport({ ...baseInput, baseGameRtpTarget: 1.5 }),
      ).toThrow();
      expect(() =>
        buildTournamentAuditReport({ ...baseInput, baseGameRtpTarget: -0.1 }),
      ).toThrow();
    });
    it('rejects when all three sub-configs missing', () => {
      expect(() =>
        buildTournamentAuditReport({
          tournamentId: 'X',
          operator: 'Y',
          baseGameRtpTarget: 0.94,
        }),
      ).toThrow();
    });
  });

  describe('header', () => {
    it('echoes tournamentId + operator + baseRtp', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.header.tournamentId).toBe('UKGC-TEST-2026Q2');
      expect(r.header.operator).toBe('TestOp Ltd.');
      expect(r.header.baseGameRtpTarget).toBe(0.94);
    });
    it('emits ISO timestamp when not provided', () => {
      const r = buildTournamentAuditReport(baseInput);
      expect(r.header.emitTimestampIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    it('uses provided nowIso when supplied', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.header.emitTimestampIso).toBe(FIXED_TS);
    });
    it('schema version is v1 namespaced', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.header.schemaVersion).toBe('urn:slotmath:tournament-audit:v1');
    });
  });

  describe('single-tier W201 path', () => {
    it('emits prizeAllocation + rankDisclosure with N rows', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.prizeAllocation).toBeDefined();
      expect(r.rankDisclosure).toHaveLength(10);
    });
    it('combinedRtp = base + tournament overlay', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.combinedRtpPerSpin).toBeCloseTo(0.94 + 0.02, 9);
    });
    it('typicalSkillExpectedReturn = poolPaidOut / N', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.typicalSkillExpectedReturn).toBeCloseTo(r.prizeAllocation!.poolPaidOut / 10, 9);
    });
    it('rank rows carry probabilityThisRank + expectedPrizeContribution', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      for (const row of r.rankDisclosure) {
        expect(row.probabilityThisRank).toBeCloseTo(0.1, 9);
        expect(row.expectedPrizeContribution).toBeCloseTo(0.1 * row.prize, 9);
      }
    });
  });

  describe('network pool W202 path', () => {
    const input: TournamentAuditInput = {
      tournamentId: 'NET-TEST',
      operator: 'NetworkOp',
      baseGameRtpTarget: 0.94,
      networkPool: w202Cfg,
    };
    it('emits networkPool result', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.networkPool).toBeDefined();
      expect(r.networkPool!.audit.nTitles).toBe(5);
      expect(r.networkPool!.audit.nDays).toBe(3);
    });
    it('rankDisclosure falls back to networkPool.rankBreakdown', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.rankDisclosure).toHaveLength(100);
    });
    it('fundingShares = per-title share when network only', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.fundingShares).toHaveLength(5);
      const sum = r.fundingShares.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 9);
    });
  });

  describe('bet-fairness W203 path', () => {
    const input: TournamentAuditInput = {
      tournamentId: 'FAIR-TEST',
      operator: 'FairOp',
      baseGameRtpTarget: 0.94,
      prizeAllocation: w201Cfg,
      betFairness: w203Cfg,
    };
    it('emits betFairness result', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.betFairness).toBeDefined();
      expect(r.betFairness!.nPlayers).toBe(3);
    });
    it('fundingShares = per-player when betFairness provided', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.fundingShares).toHaveLength(3);
      // high-bet 25× has highest share
      expect(r.fundingShares[2]).toBeGreaterThan(r.fundingShares[0]);
    });
    it('bet-fairness compliance finding present', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('§c'));
      expect(f).toBeDefined();
      expect(f!.status).toBe('pass');
    });
    it('bet spread > 10× emits stake-range advisory WARN', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('§c.2'));
      expect(f).toBeDefined();
      expect(f!.status).toBe('warn');
    });
  });

  describe('combined path (W201 + W202 + W203)', () => {
    const input: TournamentAuditInput = {
      tournamentId: 'COMBO-TEST',
      operator: 'ComboOp',
      baseGameRtpTarget: 0.94,
      prizeAllocation: w201Cfg,
      networkPool: w202Cfg,
      betFairness: w203Cfg,
    };
    it('all three sub-results emitted', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.prizeAllocation).toBeDefined();
      expect(r.networkPool).toBeDefined();
      expect(r.betFairness).toBeDefined();
    });
    it('rankDisclosure prefers prizeAllocation when both present', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      // W201 cfg has nPlayers=10, W202 cfg has nPlayers=100; prefer W201
      expect(r.rankDisclosure).toHaveLength(10);
    });
    it('fundingShares = per-player when betFairness present (priority)', () => {
      const r = buildTournamentAuditReport(input, FIXED_TS);
      expect(r.fundingShares).toHaveLength(3);
    });
  });

  describe('compliance findings', () => {
    it('emits 5+ findings on full single-tier path', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      expect(r.complianceFindings.length).toBeGreaterThanOrEqual(5);
    });
    it('UKGC RTS-12 §a per-rank disclosure: pass', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('§a'));
      expect(f!.status).toBe('pass');
    });
    it('UKGC RTS-12 §b combined RTP: pass', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('§b'));
      expect(f!.status).toBe('pass');
    });
    it('eCOGRA §4.1.3 pool payout share: pass on full payout', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('eCOGRA'));
      expect(f!.status).toBe('pass');
    });
    it('eCOGRA §4.1.3: warn when residual > 0 (percentile-bracket)', () => {
      const input: TournamentAuditInput = {
        tournamentId: 'RES-TEST',
        operator: 'Op',
        baseGameRtpTarget: 0.94,
        prizeAllocation: {
          ...w201Cfg,
          prizeStructure: {
            kind: 'percentile-bracket',
            brackets: [{ topPercentile: 0.5, shareOfPool: 0.6 }], // 40% residual
          },
        },
      };
      const r = buildTournamentAuditReport(input, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('eCOGRA'));
      expect(f!.status).toBe('warn');
    });
    it('EU GA 2024 Art. 7: pass when combined RTP ≥ 0.85', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const f = r.complianceFindings.find((x) => x.rule.includes('EU GA'));
      expect(f!.status).toBe('pass');
    });
    it('EU GA 2024 Art. 7: warn when combined RTP < 0.85', () => {
      const r = buildTournamentAuditReport(
        { ...baseInput, baseGameRtpTarget: 0.5 },
        FIXED_TS,
      );
      const f = r.complianceFindings.find((x) => x.rule.includes('EU GA'));
      expect(f!.status).toBe('warn');
    });
  });

  describe('markdown emitter', () => {
    it('emits non-empty markdown with header', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const md = emitTournamentAuditMarkdown(r);
      expect(md).toContain('# Tournament Audit Report');
      expect(md).toContain('UKGC-TEST-2026Q2');
      expect(md).toContain('TestOp Ltd.');
    });
    it('includes per-rank table with at most 20 rows + truncation note', () => {
      const input: TournamentAuditInput = {
        ...baseInput,
        prizeAllocation: { ...w201Cfg, nPlayers: 100 },
      };
      const md = emitTournamentAuditMarkdown(buildTournamentAuditReport(input, FIXED_TS));
      expect(md).toContain('| 1 |');
      expect(md).toContain('| 20 |');
      expect(md).toContain('80 more rows');
    });
    it('includes compliance findings table with badges', () => {
      const md = emitTournamentAuditMarkdown(buildTournamentAuditReport(baseInput, FIXED_TS));
      expect(md).toContain('## Compliance Findings');
      expect(md).toContain('✅ PASS');
    });
    it('includes bet-size fairness section when betFairness present', () => {
      const r = buildTournamentAuditReport(
        { ...baseInput, betFairness: w203Cfg },
        FIXED_TS,
      );
      const md = emitTournamentAuditMarkdown(r);
      expect(md).toContain('## Bet-Size Fairness');
      expect(md).toContain('Fairness gain from adjustment');
    });
  });

  describe('JSON emitter', () => {
    it('emits valid JSON parseable back to report shape', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const json = emitTournamentAuditJson(r);
      const parsed = JSON.parse(json);
      expect(parsed.header.tournamentId).toBe('UKGC-TEST-2026Q2');
      expect(parsed.rankDisclosure).toHaveLength(10);
      expect(parsed.complianceFindings.length).toBeGreaterThanOrEqual(5);
    });
    it('JSON is deterministic for same input + nowIso', () => {
      const j1 = emitTournamentAuditJson(buildTournamentAuditReport(baseInput, FIXED_TS));
      const j2 = emitTournamentAuditJson(buildTournamentAuditReport(baseInput, FIXED_TS));
      expect(j1).toBe(j2);
    });
  });

  describe('XML emitter', () => {
    it('emits valid namespaced XML', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const xml = emitTournamentAuditXml(r);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('xmlns="urn:slotmath:tournament-audit:v1"');
      expect(xml).toContain('<TournamentId>UKGC-TEST-2026Q2</TournamentId>');
    });
    it('XML escapes special chars in tournamentId', () => {
      const r = buildTournamentAuditReport(
        { ...baseInput, tournamentId: 'A&B<C>' },
        FIXED_TS,
      );
      const xml = emitTournamentAuditXml(r);
      expect(xml).toContain('A&amp;B&lt;C&gt;');
    });
    it('includes Rank entries with attributes', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const xml = emitTournamentAuditXml(r);
      expect(xml).toMatch(/<Rank index="1" prize="\d/);
      expect(xml).toMatch(/probability="0\.1"/);
    });
    it('includes ComplianceFindings with status attribute', () => {
      const r = buildTournamentAuditReport(baseInput, FIXED_TS);
      const xml = emitTournamentAuditXml(r);
      expect(xml).toContain('<Finding status="pass">');
    });
  });

  describe('acceptance — 4 regulator-grade audit scenarios', () => {
    const scenarios: Array<{ name: string; input: TournamentAuditInput }> = [
      {
        name: 'UKGC single-tier flat WTA',
        input: { ...baseInput, tournamentId: 'UKGC-WTA' },
      },
      {
        name: 'Pragmatic Drops & Wins network — 5×3 grid + percentile',
        input: {
          tournamentId: 'PRAG-DW-WK01',
          operator: 'Pragmatic Play Ltd.',
          baseGameRtpTarget: 0.94,
          networkPool: {
            ...w202Cfg,
            prizeStructure: {
              kind: 'percentile-bracket',
              brackets: [
                { topPercentile: 0.01, shareOfPool: 0.4 },
                { topPercentile: 0.05, shareOfPool: 0.3 },
                { topPercentile: 0.2, shareOfPool: 0.3 },
              ],
            },
          },
        },
      },
      {
        name: 'IGT VIP mixed-stake bet-fair leaderboard',
        input: {
          tournamentId: 'IGT-VIP-Q2',
          operator: 'IGT Network',
          baseGameRtpTarget: 0.96,
          prizeAllocation: { ...w201Cfg, nPlayers: 20 },
          betFairness: {
            ...w203Cfg,
            players: Array.from({ length: 20 }, (_, i) => ({
              mean: 0.94,
              variance: 4.0,
              betSize: 1 + i * 5,
              label: `vip-${i}`,
            })),
          },
        },
      },
      {
        name: 'Combined L&W WinPower exp-decay + bet-fair',
        input: {
          tournamentId: 'LW-WINPOWER-2026M05',
          operator: 'L&W Suite',
          baseGameRtpTarget: 0.94,
          prizeAllocation: {
            ...w201Cfg,
            nPlayers: 50,
            prizeStructure: { kind: 'exponential-decay', topN: 10, alpha: 0.4 },
          },
          networkPool: w202Cfg,
          betFairness: {
            players: Array.from({ length: 50 }, (_, i) => ({
              mean: 0.94,
              variance: 4.0,
              betSize: 1 + (i % 5),
              label: `wp-${i}`,
            })),
            spinsPerPlayer: 250,
            contributionRate: 0.02,
          },
        },
      },
    ];

    for (const { name, input } of scenarios) {
      it(`[${name}] emits all 3 formats consistently`, () => {
        const r = buildTournamentAuditReport(input, FIXED_TS);
        const md = emitTournamentAuditMarkdown(r);
        const json = emitTournamentAuditJson(r);
        const xml = emitTournamentAuditXml(r);
        expect(md.length).toBeGreaterThan(500);
        expect(json.length).toBeGreaterThan(500);
        expect(xml.length).toBeGreaterThan(500);
        expect(json).toContain(input.tournamentId);
        expect(xml).toContain(input.tournamentId);
        expect(md).toContain(input.tournamentId);
      });
      it(`[${name}] combined RTP ≥ base RTP`, () => {
        const r = buildTournamentAuditReport(input, FIXED_TS);
        expect(r.combinedRtpPerSpin).toBeGreaterThanOrEqual(input.baseGameRtpTarget);
      });
      it(`[${name}] no FAIL findings`, () => {
        const r = buildTournamentAuditReport(input, FIXED_TS);
        const fails = r.complianceFindings.filter((f) => f.status === 'fail');
        expect(fails).toHaveLength(0);
      });
    }
  });
});
