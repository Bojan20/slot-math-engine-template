/**
 * W215 Faza 1300.0 Agent C — Operator CSM dashboard projection layer.
 *
 * The operator dashboard already covers game library, RTP, A/B, subs,
 * compliance, account. CSM tab adds a single grid view of every
 * tenant's health: onboarding stage, NPS, ticket counts, churn risk,
 * next renewal date.
 *
 * Like every other section in `web/operator`, the DOM rendering is left
 * to a thin `render*()` function in `sections.ts`; this file is the
 * pure projection / filtering / sorting layer that the unit tests
 * exercise.
 */

export type OnboardingStage =
  | 'deal_won'
  | 'kickoff_scheduled'
  | 'kickoff_done'
  | 'integration_in_progress'
  | 'first_spin'
  | 'soft_launch'
  | 'full_launch'
  | 'first_renewal_due';

export type CustomerTier = 'enterprise' | 'platform' | 'indie';
export type HealthColor = 'green' | 'amber' | 'red';
export type ChurnSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CsmDashboardRow {
  customerId: string;
  tenantId: string;
  displayName: string;
  tier: CustomerTier;
  stage: OnboardingStage;
  npsScore: number | null;
  openTickets: number;
  churnRisk: number;
  churnSeverity: ChurnSeverity;
  renewalDueAt: string;
  csmEmail: string;
}

export interface CsmDashboardFilter {
  tier?: CustomerTier | 'any';
  stage?: OnboardingStage | 'any';
  risk?: ChurnSeverity | 'any';
  search?: string;
}

/** Map a churn-risk score to a coarse status color. */
export function colorFromRisk(severity: ChurnSeverity): HealthColor {
  switch (severity) {
    case 'low':
      return 'green';
    case 'medium':
      return 'amber';
    case 'high':
    case 'critical':
      return 'red';
  }
}

/** Map an NPS score to the same green/amber/red palette. */
export function colorFromNps(score: number | null): HealthColor {
  if (score == null) return 'amber';
  if (score >= 40) return 'green';
  if (score >= 0) return 'amber';
  return 'red';
}

/**
 * Combined per-row health: take the worst of (NPS, risk).
 * Used to drive the row background-color in the dashboard grid.
 */
export function rowHealth(row: CsmDashboardRow): HealthColor {
  const a = colorFromRisk(row.churnSeverity);
  const b = colorFromNps(row.npsScore);
  const order: HealthColor[] = ['green', 'amber', 'red'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Days until renewal; negative if past. */
export function daysUntilRenewal(renewalDueAt: string, now: number = Date.now()): number {
  const t = Date.parse(renewalDueAt);
  if (!Number.isFinite(t)) return Number.NaN;
  return Math.floor((t - now) / (24 * 60 * 60 * 1000));
}

/** Apply filters + search to the dashboard rows. Pure. */
export function filterCsmRows(
  rows: ReadonlyArray<CsmDashboardRow>,
  filter: CsmDashboardFilter,
): CsmDashboardRow[] {
  return rows.filter((r) => {
    if (filter.tier && filter.tier !== 'any' && r.tier !== filter.tier) return false;
    if (filter.stage && filter.stage !== 'any' && r.stage !== filter.stage) return false;
    if (filter.risk && filter.risk !== 'any' && r.churnSeverity !== filter.risk) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const blob = `${r.tenantId} ${r.displayName} ${r.csmEmail}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

/** Sort by health (worst first) then by churn-risk score descending. */
export function sortByHealth(rows: ReadonlyArray<CsmDashboardRow>): CsmDashboardRow[] {
  const sevRank: Record<ChurnSeverity, number> = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
  };
  return [...rows].sort((a, b) => {
    const sa = sevRank[a.churnSeverity];
    const sb = sevRank[b.churnSeverity];
    if (sa !== sb) return sb - sa;
    return b.churnRisk - a.churnRisk;
  });
}

/** Summary counts for the dashboard header strip. */
export function summarizeRows(rows: ReadonlyArray<CsmDashboardRow>): {
  total: number;
  green: number;
  amber: number;
  red: number;
  criticalRisk: number;
  meanNps: number | null;
  totalOpenTickets: number;
} {
  let green = 0;
  let amber = 0;
  let red = 0;
  let criticalRisk = 0;
  let totalOpenTickets = 0;
  const npsScores: number[] = [];
  for (const r of rows) {
    const h = rowHealth(r);
    if (h === 'green') green += 1;
    else if (h === 'amber') amber += 1;
    else red += 1;
    if (r.churnSeverity === 'critical') criticalRisk += 1;
    if (r.npsScore != null) npsScores.push(r.npsScore);
    totalOpenTickets += r.openTickets;
  }
  const meanNps =
    npsScores.length === 0
      ? null
      : Math.round(npsScores.reduce((s, n) => s + n, 0) / npsScores.length);
  return {
    total: rows.length,
    green,
    amber,
    red,
    criticalRisk,
    meanNps,
    totalOpenTickets,
  };
}

/** Compose a single tenant row from raw subsystem snapshots. */
export function composeRow(input: {
  customerId: string;
  tenantId: string;
  displayName: string;
  tier: CustomerTier;
  stage: OnboardingStage;
  npsScore: number | null;
  openTickets: number;
  churnRisk: number;
  churnSeverity: ChurnSeverity;
  renewalDueAt: string;
  csmEmail: string;
}): CsmDashboardRow {
  return { ...input };
}
