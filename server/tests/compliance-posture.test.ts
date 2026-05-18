/**
 * W214 Faza 600.3 — Compliance posture tracker specs.
 */
import { describe, it, expect } from 'vitest';
import {
  InMemoryCompliancePostureStore,
  makeKey,
  renderPostureReport,
  EXPIRY_WARNING_DAYS,
  type CompliancePostureEntry,
} from '../state/compliance-posture.js';

const NOW = new Date('2026-05-18T00:00:00Z');

function mk(over: Partial<CompliancePostureEntry> = {}): CompliancePostureEntry {
  return {
    tenantId: 't-1',
    gameId: 'lw-quick-hit',
    jurisdiction: 'UKGC',
    certValidUntil: '2026-12-01T00:00:00Z',
    rtsComplianceStatus: 'compliant',
    findingsOutstanding: 0,
    lastReviewedAt: '2026-05-01T00:00:00Z',
    ...over,
  };
}

describe('W214 compliance-posture · key helper', () => {
  it('makeKey produces stable identifier', () => {
    expect(makeKey('t', 'g', 'UK')).toBe('t::g::UK');
  });
});

describe('W214 compliance-posture · upsert/get/list', () => {
  it('upsert stores entry; get retrieves it', () => {
    const s = new InMemoryCompliancePostureStore();
    const e = mk();
    s.upsert(e);
    const g = s.get(e.tenantId, e.gameId, e.jurisdiction);
    expect(g).toMatchObject({ tenantId: 't-1', gameId: 'lw-quick-hit' });
  });

  it('upsert is idempotent (same key overwrites)', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk({ findingsOutstanding: 1 }));
    s.upsert(mk({ findingsOutstanding: 4 }));
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].findingsOutstanding).toBe(4);
  });

  it('list with filters narrows results', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk({ tenantId: 'a' }));
    s.upsert(mk({ tenantId: 'b', gameId: 'g2' }));
    s.upsert(mk({ tenantId: 'a', jurisdiction: 'MGA', gameId: 'g3' }));
    expect(s.list({ tenantId: 'a' })).toHaveLength(2);
    expect(s.list({ jurisdiction: 'MGA' })).toHaveLength(1);
    expect(s.list({ status: 'compliant' })).toHaveLength(3);
  });

  it('remove returns true when entry deleted, false otherwise', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk());
    expect(s.remove('t-1', 'lw-quick-hit', 'UKGC')).toBe(true);
    expect(s.remove('t-1', 'lw-quick-hit', 'UKGC')).toBe(false);
  });

  it('list output is sorted deterministically', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk({ tenantId: 'z' }));
    s.upsert(mk({ tenantId: 'a' }));
    s.upsert(mk({ tenantId: 'm' }));
    const ids = s.list().map((e) => e.tenantId);
    expect(ids).toEqual(['a', 'm', 'z']);
  });
});

describe('W214 compliance-posture · expiry alerts', () => {
  it('listUpcomingExpiries returns alerts within window', () => {
    const s = new InMemoryCompliancePostureStore();
    // Expires in 30 days → within 60d window.
    const inThirty = new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    s.upsert(mk({ certValidUntil: inThirty }));
    // Expires in 200 days → outside default window.
    const inTwoHundred = new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString();
    s.upsert(mk({ gameId: 'g2', certValidUntil: inTwoHundred }));
    const alerts = s.listUpcomingExpiries(NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].daysRemaining).toBeGreaterThanOrEqual(29);
    expect(alerts[0].daysRemaining).toBeLessThanOrEqual(31);
  });

  it('does not alert on already-expired certs', () => {
    const s = new InMemoryCompliancePostureStore();
    const past = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    s.upsert(mk({ certValidUntil: past }));
    const alerts = s.listUpcomingExpiries(NOW);
    expect(alerts).toHaveLength(0);
  });

  it('alerts are sorted by daysRemaining ascending', () => {
    const s = new InMemoryCompliancePostureStore();
    for (const days of [50, 10, 30]) {
      const d = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      s.upsert(mk({ gameId: `g-${days}`, certValidUntil: d }));
    }
    const alerts = s.listUpcomingExpiries(NOW);
    expect(alerts.map((a) => a.daysRemaining)).toEqual([10, 30, 50]);
  });

  it('EXPIRY_WARNING_DAYS is 60', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(60);
  });
});

describe('W214 compliance-posture · aggregations', () => {
  it('countByStatus tallies per-status counts', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk({ rtsComplianceStatus: 'compliant' }));
    s.upsert(mk({ gameId: 'g2', rtsComplianceStatus: 'non_compliant' }));
    s.upsert(mk({ gameId: 'g3', rtsComplianceStatus: 'non_compliant' }));
    s.upsert(mk({ gameId: 'g4', rtsComplianceStatus: 'pending_review' }));
    const c = s.countByStatus();
    expect(c.compliant).toBe(1);
    expect(c.non_compliant).toBe(2);
    expect(c.pending_review).toBe(1);
  });

  it('outstandingFindingsTotal sums across entries', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk({ findingsOutstanding: 3 }));
    s.upsert(mk({ gameId: 'g2', findingsOutstanding: 5 }));
    expect(s.outstandingFindingsTotal()).toBe(8);
  });

  it('renderPostureReport returns generatedAt + counts + entries', () => {
    const s = new InMemoryCompliancePostureStore();
    s.upsert(mk());
    const report = renderPostureReport(s, NOW);
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(report.counts.compliant).toBe(1);
    expect(report.entries).toHaveLength(1);
    expect(Array.isArray(report.upcomingExpiries)).toBe(true);
  });
});

describe('W214 compliance-posture · validation', () => {
  it('rejects bad certValidUntil', () => {
    const s = new InMemoryCompliancePostureStore();
    expect(() => s.upsert(mk({ certValidUntil: 'not-a-date' }))).toThrow();
  });

  it('rejects negative findings count', () => {
    const s = new InMemoryCompliancePostureStore();
    expect(() => s.upsert(mk({ findingsOutstanding: -1 }))).toThrow();
  });

  it('rejects unknown status', () => {
    const s = new InMemoryCompliancePostureStore();
    expect(() => s.upsert(mk({
      rtsComplianceStatus: 'banana' as unknown as 'compliant',
    }))).toThrow();
  });
});
