/**
 * W215 Faza 1300.0 Agent C — operator CSM dashboard projection tests.
 *
 * 15+ specs covering:
 *   * colorFromRisk maps severity to green/amber/red
 *   * colorFromNps maps score buckets to colors
 *   * rowHealth picks the worse of NPS/risk
 *   * daysUntilRenewal handles past/future/invalid
 *   * filterCsmRows by tier / stage / risk / search
 *   * sortByHealth orders by severity then score
 *   * summarizeRows produces the right counts
 *   * composeRow wraps the input shape unchanged
 */
import { describe, it, expect } from 'vitest';
import {
  colorFromRisk,
  colorFromNps,
  rowHealth,
  daysUntilRenewal,
  filterCsmRows,
  sortByHealth,
  summarizeRows,
  composeRow,
  type CsmDashboardRow,
} from '../src/csm-dashboard.js';

function row(over: Partial<CsmDashboardRow> = {}): CsmDashboardRow {
  return composeRow({
    customerId: 'c',
    tenantId: 't',
    displayName: 'T',
    tier: 'indie',
    stage: 'full_launch',
    npsScore: 50,
    openTickets: 0,
    churnRisk: 10,
    churnSeverity: 'low',
    renewalDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    csmEmail: 'csm@platform',
    ...over,
  });
}

describe('colorFromRisk', () => {
  it('maps each severity', () => {
    expect(colorFromRisk('low')).toBe('green');
    expect(colorFromRisk('medium')).toBe('amber');
    expect(colorFromRisk('high')).toBe('red');
    expect(colorFromRisk('critical')).toBe('red');
  });
});

describe('colorFromNps', () => {
  it('amber when score is null', () => {
    expect(colorFromNps(null)).toBe('amber');
  });
  it('green >= 40', () => {
    expect(colorFromNps(40)).toBe('green');
    expect(colorFromNps(80)).toBe('green');
  });
  it('amber 0..39', () => {
    expect(colorFromNps(0)).toBe('amber');
    expect(colorFromNps(20)).toBe('amber');
  });
  it('red < 0', () => {
    expect(colorFromNps(-10)).toBe('red');
  });
});

describe('rowHealth', () => {
  it('picks the worse of the two colors', () => {
    const r = row({ churnSeverity: 'low', npsScore: -20 });
    expect(rowHealth(r)).toBe('red');
  });
  it('returns green when both are green', () => {
    expect(rowHealth(row({ churnSeverity: 'low', npsScore: 50 }))).toBe('green');
  });
});

describe('daysUntilRenewal', () => {
  it('positive for future', () => {
    const r = row({ renewalDueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() });
    expect(daysUntilRenewal(r.renewalDueAt)).toBeGreaterThanOrEqual(9);
  });
  it('negative for past', () => {
    const r = row({ renewalDueAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() });
    expect(daysUntilRenewal(r.renewalDueAt)).toBeLessThanOrEqual(-4);
  });
  it('NaN for invalid', () => {
    expect(Number.isNaN(daysUntilRenewal('not-a-date'))).toBe(true);
  });
});

describe('filterCsmRows', () => {
  const rows = [
    row({ tenantId: 'acme', tier: 'enterprise', stage: 'first_spin', churnSeverity: 'high' }),
    row({ tenantId: 'beta', tier: 'platform', stage: 'full_launch', churnSeverity: 'low' }),
    row({ tenantId: 'gamma', tier: 'indie', stage: 'full_launch', churnSeverity: 'medium' }),
  ];

  it('any-pass on empty filter', () => {
    expect(filterCsmRows(rows, {}).length).toBe(3);
  });
  it('filters by tier', () => {
    expect(filterCsmRows(rows, { tier: 'enterprise' }).length).toBe(1);
  });
  it('filters by stage', () => {
    expect(filterCsmRows(rows, { stage: 'full_launch' }).length).toBe(2);
  });
  it('filters by risk', () => {
    expect(filterCsmRows(rows, { risk: 'high' }).length).toBe(1);
  });
  it('search matches tenant + name + csm email', () => {
    expect(filterCsmRows(rows, { search: 'beta' }).length).toBe(1);
  });
  it('any string in filter is a no-op', () => {
    expect(filterCsmRows(rows, { tier: 'any', stage: 'any', risk: 'any' }).length).toBe(3);
  });
});

describe('sortByHealth', () => {
  it('puts critical first, low last; ties broken by score', () => {
    const rows = [
      row({ tenantId: 'a', churnSeverity: 'low', churnRisk: 5 }),
      row({ tenantId: 'b', churnSeverity: 'critical', churnRisk: 90 }),
      row({ tenantId: 'c', churnSeverity: 'high', churnRisk: 60 }),
      row({ tenantId: 'd', churnSeverity: 'high', churnRisk: 70 }),
    ];
    const sorted = sortByHealth(rows);
    expect(sorted[0].tenantId).toBe('b');
    expect(sorted[1].tenantId).toBe('d');
    expect(sorted[2].tenantId).toBe('c');
    expect(sorted[3].tenantId).toBe('a');
  });
});

describe('summarizeRows', () => {
  it('counts colors + critical risk + open tickets', () => {
    const rows = [
      row({ tenantId: 'a', churnSeverity: 'critical', npsScore: -10, openTickets: 5 }),
      row({ tenantId: 'b', churnSeverity: 'low', npsScore: 70, openTickets: 0 }),
      row({ tenantId: 'c', churnSeverity: 'medium', npsScore: 30, openTickets: 2 }),
    ];
    const s = summarizeRows(rows);
    expect(s.total).toBe(3);
    expect(s.criticalRisk).toBe(1);
    expect(s.totalOpenTickets).toBe(7);
    expect(s.green + s.amber + s.red).toBe(3);
    expect(s.meanNps).toBe(Math.round((-10 + 70 + 30) / 3));
  });

  it('meanNps is null when all scores are null', () => {
    const rows = [row({ npsScore: null }), row({ npsScore: null })];
    expect(summarizeRows(rows).meanNps).toBe(null);
  });
});
