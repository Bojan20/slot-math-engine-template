/**
 * W152 Wave 19 — certificationReport tests (Faza 15.B.4).
 */

import { describe, it, expect } from 'vitest';
import {
  buildCertDossier,
  renderCertJson,
  renderCertMarkdown,
  type CertReportInput,
} from '../src/report/certificationReport.js';
import type { SlotGameIR } from '../src/ir/types.js';

function makeIR(): SlotGameIR {
  return {
    schema_version: '1.0.0',
    meta: { id: 'test-game', name: 'Test Game', version: '1.0.0', theme_tags: ['test'] },
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: [
      { id: 'A', name: 'A', kind: 'lp' },
      { id: 'W', name: 'Wild', kind: 'wild', substitutes: '*' },
    ],
    reels: { mode: 'weighted', base: [{ A: 5 }, { A: 5 }, { A: 5 }, { A: 5 }, { A: 5 }] },
    paytable: { A: { '3': 5, '4': 25, '5': 100 } },
    evaluation: { kind: 'lines', paylines: [[0, 0, 0, 0, 0]], direction: 'ltr' },
    features: [{ kind: 'free_spins', trigger: { by: 'scatter_count', thresholds: { '3': 10 } } }],
    rng: { kind: 'pcg64', default_seed: 12345 },
    bet: { currency: 'EUR', base_bet: 1, denominations: [1] },
    limits: {
      target_rtp: 0.96,
      rtp_tolerance: 0.005,
      max_win_x: 5000,
      win_cap_apply: 'per_spin',
      target_volatility: 'medium',
      hit_freq_target: 0.3,
    },
    compliance: {
      jurisdictions: ['UKGC', 'MGA'],
      rtp_range_required: [0.92, 0.99],
      max_win_cap_required: 10000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: { base_game: 0.7, free_spins: 0.26, hold_and_win: 0, jackpot: 0, tolerance: 0.01 },
  } as unknown as SlotGameIR;
}

const baseInput: CertReportInput = {
  ir: makeIR(),
  mc: { spins: 100000, seed: 12345, rtp: 0.961, hitRate: 0.32 },
  engineCommitSha: 'abc12345',
  buildTimestampUtc: '2026-05-15T03:00:00.000Z',
};

describe('buildCertDossier', () => {
  it('produces complete dossier from minimal input', () => {
    const d = buildCertDossier(baseInput);
    expect(d.game.id).toBe('test-game');
    expect(d.topology.kind).toBe('rectangular');
    expect(d.rtp.target).toBe(0.96);
    expect(d.rtp.measured).toBe(0.961);
    expect(d.rtp.withinTolerance).toBe(true);
  });
  it('flags RTP out of tolerance', () => {
    const input = { ...baseInput, mc: { ...baseInput.mc, rtp: 0.985 } };
    const d = buildCertDossier(input);
    expect(d.rtp.withinTolerance).toBe(false);
  });
  it('reportId is deterministic', () => {
    const a = buildCertDossier(baseInput);
    const b = buildCertDossier(baseInput);
    expect(a.reportId).toBe(b.reportId);
  });
  it('reportId differs across input', () => {
    const a = buildCertDossier(baseInput);
    const b = buildCertDossier({ ...baseInput, mc: { ...baseInput.mc, seed: 99999 } });
    expect(a.reportId).not.toBe(b.reportId);
  });
  it('reel summary matches IR', () => {
    const d = buildCertDossier(baseInput);
    expect(d.reelSummary).toHaveLength(5);
    expect(d.reelSummary[0].totalStops).toBe(5);
    expect(d.reelSummary[0].uniqueSymbols).toBe(1);
  });
  it('paytable row count matches', () => {
    const d = buildCertDossier(baseInput);
    expect(d.paytableRowCount).toBe(3); // A: 3 / 4 / 5
  });
  it('features captured', () => {
    const d = buildCertDossier(baseInput);
    expect(d.features).toHaveLength(1);
    expect(d.features[0].kind).toBe('free_spins');
    expect(d.features[0].triggerHint).toBe('scatter_count');
  });
  it('volatility null when no variance profile', () => {
    const d = buildCertDossier(baseInput);
    expect(d.volatility.vi95).toBeNull();
    expect(d.volatility.observedSigma).toBeNull();
  });
  it('volatility populated when variance profile present', () => {
    const d = buildCertDossier({
      ...baseInput,
      mc: {
        ...baseInput.mc,
        variance: {
          vi95: 0.001,
          vi99: 0.0013,
          expectedSigma: 0.196,
          observedSigma: 0.198,
          toleranceBand: [0.95, 0.97],
          withinTolerance: true,
          deviationSigma: 0.5,
          sigmaWithinTolerance: true,
        },
      },
    });
    expect(d.volatility.vi95).toBe(0.001);
    expect(d.volatility.observedSigma).toBe(0.198);
  });
});

describe('renderCertJson', () => {
  it('produces canonical sorted JSON', () => {
    const d = buildCertDossier(baseInput);
    const json = renderCertJson(d);
    expect(json).toContain('"reportId"');
    expect(json).toContain('"game"');
    // Sorted: artifactPaths comes before build alphabetically
    const positions = ['artifactPaths', 'build', 'compliance', 'game', 'rtp', 'topology'].map(
      (k) => json.indexOf(`"${k}":`),
    );
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });
});

describe('renderCertMarkdown', () => {
  it('emits headed sections', () => {
    const md = renderCertMarkdown(buildCertDossier(baseInput));
    expect(md).toMatch(/^# Certification Report/m);
    expect(md).toMatch(/^## Game/m);
    expect(md).toMatch(/^## Topology/m);
    expect(md).toMatch(/^## RTP/m);
  });
  it('shows ✅ when within tolerance', () => {
    const md = renderCertMarkdown(buildCertDossier(baseInput));
    expect(md).toContain('✅');
  });
  it('shows ❌ when out of tolerance', () => {
    const md = renderCertMarkdown(
      buildCertDossier({ ...baseInput, mc: { ...baseInput.mc, rtp: 0.99 } }),
    );
    expect(md).toContain('❌');
  });
});
