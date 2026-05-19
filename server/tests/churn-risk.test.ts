/**
 * W215 Faza 1300.0 Agent C — churn-risk scorer tests.
 *
 * 18+ specs covering:
 *   * Empty input returns score 0 / severity low
 *   * Detractor NPS adds +30
 *   * Ticket volume buckets correctly
 *   * Spin-decline detection (split-half compare)
 *   * RTP drift events per event
 *   * Renewal window (within 60 days)
 *   * Missed CSM calls capped at 15
 *   * Severity banding (low/medium/high/critical)
 *   * Recommendations align with triggers
 *   * rankPortfolio orders by score desc
 *   * Computation is deterministic on identical input
 */
import { describe, it, expect } from 'vitest';
import {
  computeChurnRisk,
  computeSpinDecline,
  rankPortfolio,
  type ChurnRiskInput,
} from '../lib/csm/churn-risk.js';
import type { NpsResponse } from '../lib/csm/nps.js';
import type { SupportTicket } from '../state/support-tickets.js';
import type { CustomerOnboardingRecord } from '../state/customer-onboarding.js';

const NOW = '2026-05-18T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function nps(over: Partial<NpsResponse>): NpsResponse {
  return {
    id: 'r',
    tenantId: 't',
    respondentEmail: 'a@b.co',
    scoreOutOf10: 5,
    comment: '',
    surveyDate: NOW,
    category: 'detractor',
    sentiment: 'negative',
    tags: [],
    ...over,
  };
}

function ticket(daysAgo: number): SupportTicket {
  const ts = new Date(NOW_MS - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `t-${daysAgo}`,
    tenantId: 't',
    raisedBy: 'a@b.co',
    title: 'x',
    description: 'y',
    severity: 'P2',
    category: 'bug',
    status: 'open',
    assignee: 'engineering@platform',
    slaDeadline: ts,
    firstResponseAt: null,
    escalations: [],
    comments: [],
    createdAt: ts,
    updatedAt: ts,
    resolvedAt: null,
  };
}

function onboarding(renewalDaysFromNow: number): CustomerOnboardingRecord {
  return {
    customerId: 'c',
    tenantId: 't',
    displayName: 'T',
    tier: 'indie',
    dealValueUsd: 1000,
    csmEmail: 'csm@platform',
    stage: 'full_launch',
    stageEnteredAt: NOW,
    renewalDueAt: new Date(NOW_MS + renewalDaysFromNow * 24 * 60 * 60 * 1000).toISOString(),
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function baseInput(over: Partial<ChurnRiskInput> = {}): ChurnRiskInput {
  return {
    tenantId: 't',
    npsResponses: [],
    tickets: [],
    spinTrend: { daily: [100, 100, 100, 100, 100, 100, 100, 100] },
    driftEvents: [],
    onboarding: null,
    csmActivity: { missedCalls: 0 },
    now: NOW,
    ...over,
  };
}

describe('computeSpinDecline', () => {
  it('flat data returns 0', () => {
    expect(computeSpinDecline([100, 100, 100, 100])).toBe(0);
  });
  it('growing data returns 0', () => {
    expect(computeSpinDecline([100, 100, 200, 200])).toBe(0);
  });
  it('detects -50% drop', () => {
    const d = computeSpinDecline([200, 200, 100, 100]);
    expect(d).toBeCloseTo(0.5, 5);
  });
});

describe('computeChurnRisk', () => {
  it('empty input → low severity, score 0', () => {
    const r = computeChurnRisk(baseInput());
    expect(r.score).toBe(0);
    expect(r.severity).toBe('low');
    expect(r.triggers.length).toBe(0);
  });

  it('detractor NPS adds +30', () => {
    const r = computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'detractor' })] }));
    expect(r.score).toBe(30);
    expect(r.triggers.some((t) => t.signal === 'nps_detractor')).toBe(true);
  });

  it('promoter NPS does not add risk', () => {
    const r = computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'promoter', scoreOutOf10: 10 })] }));
    expect(r.score).toBe(0);
  });

  it('5 tickets → +5, 10 tickets → +10, capped at 25', () => {
    const t5 = computeChurnRisk(baseInput({ tickets: Array.from({ length: 5 }, () => ticket(1)) }));
    expect(t5.score).toBe(5);
    const t10 = computeChurnRisk(baseInput({ tickets: Array.from({ length: 10 }, () => ticket(1)) }));
    expect(t10.score).toBe(10);
    const t50 = computeChurnRisk(baseInput({ tickets: Array.from({ length: 50 }, () => ticket(1)) }));
    expect(t50.score).toBe(25);
  });

  it('spin decline adds +15 per 10% (capped 30)', () => {
    const r = computeChurnRisk(
      baseInput({ spinTrend: { daily: [100, 100, 100, 100, 80, 80, 80, 80] } }),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.triggers.some((t) => t.signal === 'spin_decline')).toBe(true);
  });

  it('RTP drift adds +3 per event, capped 15', () => {
    const drift = Array.from({ length: 6 }, () => ({
      occurredAt: NOW,
      gameId: 'g',
      magnitude: 0.02,
    }));
    const r = computeChurnRisk(baseInput({ driftEvents: drift }));
    expect(r.score).toBe(15);
  });

  it('renewal within 60 days adds +10', () => {
    const r = computeChurnRisk(baseInput({ onboarding: onboarding(30) }));
    expect(r.score).toBe(10);
    expect(r.triggers.some((t) => t.signal === 'renewal_window')).toBe(true);
  });

  it('renewal far in future does not add risk', () => {
    const r = computeChurnRisk(baseInput({ onboarding: onboarding(180) }));
    expect(r.score).toBe(0);
  });

  it('missed CSM calls capped at 15', () => {
    const r = computeChurnRisk(baseInput({ csmActivity: { missedCalls: 10 } }));
    expect(r.score).toBe(15);
  });

  it('severity bands correctly', () => {
    expect(computeChurnRisk(baseInput()).severity).toBe('low');
    expect(
      computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'detractor' })] })).severity,
    ).toBe('medium');
    expect(
      computeChurnRisk(
        baseInput({
          npsResponses: [nps({ category: 'detractor' })],
          tickets: Array.from({ length: 20 }, () => ticket(1)),
        }),
      ).severity,
    ).toBe('high');
  });

  it('critical severity surfaces ceo escalation recommendation', () => {
    const r = computeChurnRisk(
      baseInput({
        npsResponses: [nps({ category: 'detractor' })],
        tickets: Array.from({ length: 25 }, () => ticket(1)),
        driftEvents: Array.from({ length: 6 }, () => ({ occurredAt: NOW, gameId: 'g', magnitude: 0.02 })),
        spinTrend: { daily: [200, 200, 100, 100] },
        csmActivity: { missedCalls: 2 },
        onboarding: onboarding(30),
      }),
    );
    expect(r.severity).toBe('critical');
    expect(r.recommendations.some((s) => s.includes('VP Customer Success'))).toBe(true);
  });

  it('score is capped at 100', () => {
    const r = computeChurnRisk(
      baseInput({
        npsResponses: [nps({ category: 'detractor' })],
        tickets: Array.from({ length: 50 }, () => ticket(1)),
        driftEvents: Array.from({ length: 50 }, () => ({ occurredAt: NOW, gameId: 'g', magnitude: 0.05 })),
        spinTrend: { daily: [500, 500, 1, 1] },
        csmActivity: { missedCalls: 100 },
        onboarding: onboarding(15),
      }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.severity).toBe('critical');
  });

  it('is deterministic on identical input', () => {
    const a = computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'detractor' })] }));
    const b = computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'detractor' })] }));
    expect(a.score).toBe(b.score);
    expect(a.severity).toBe(b.severity);
    expect(a.recommendations).toEqual(b.recommendations);
  });

  it('recommendations align with triggers', () => {
    const r = computeChurnRisk(baseInput({ npsResponses: [nps({ category: 'detractor' })] }));
    expect(r.recommendations.some((s) => /executive save call/i.test(s))).toBe(true);
  });

  it('ignores NPS responses outside 90-day window', () => {
    const old = nps({
      category: 'detractor',
      surveyDate: new Date(NOW_MS - 200 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const r = computeChurnRisk(baseInput({ npsResponses: [old] }));
    expect(r.score).toBe(0);
  });

  it('ignores tickets outside 30-day window', () => {
    const r = computeChurnRisk(
      baseInput({ tickets: Array.from({ length: 10 }, () => ticket(60)) }),
    );
    expect(r.score).toBe(0);
  });

  it('rankPortfolio orders by score desc', () => {
    const a = computeChurnRisk(baseInput());
    const b = computeChurnRisk(baseInput({ tenantId: 'b', npsResponses: [nps({ category: 'detractor' })] }));
    const c = computeChurnRisk(baseInput({ tenantId: 'c', csmActivity: { missedCalls: 1 } }));
    const ranked = rankPortfolio([a, b, c]);
    expect(ranked[0].tenantId).toBe('b');
    expect(ranked[2].tenantId).toBe('t'); // a
  });
});
