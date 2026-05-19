/**
 * W215 Faza 1300.0 Agent C — Churn risk scorer.
 *
 * Aggregates signals from NPS, support tickets, spin volume trend,
 * RTP-drift event log, customer onboarding state, and CSM activity
 * into a single 0..100 risk score per tenant. Output is fully
 * deterministic so the same input snapshot always produces the same
 * score / severity / triggers — that is a hard requirement for the
 * acceptance suite and for daily diffs against the previous run.
 *
 * Score banding:
 *   0..24   = low
 *   25..49  = medium
 *   50..74  = high
 *   75..100 = critical
 *
 * Recommendations are produced by mapping each triggered signal to a
 * canonical mitigation action.
 */

import type { NpsResponse } from './nps.js';
import type { SupportTicket } from '../../state/support-tickets.js';
import type { CustomerOnboardingRecord } from '../../state/customer-onboarding.js';

export type ChurnSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SpinTrend {
  /** Per-day spin counts over the last ~30 days. Most-recent last. */
  daily: number[];
}

export interface DriftEvent {
  /** ISO timestamp. */
  occurredAt: string;
  gameId: string;
  /** Magnitude (e.g. 0.025 for 2.5pp). */
  magnitude: number;
}

export interface CsmActivity {
  /** Count of CSM check-ins missed in the last 30 days. */
  missedCalls: number;
}

export interface ChurnRiskInput {
  tenantId: string;
  npsResponses: NpsResponse[];
  tickets: SupportTicket[];
  spinTrend: SpinTrend;
  driftEvents: DriftEvent[];
  onboarding: CustomerOnboardingRecord | null;
  csmActivity: CsmActivity;
  /** Reference "now" for window calculations. */
  now?: string;
}

export interface ChurnTrigger {
  signal: string;
  delta: number;
  detail: string;
}

export interface ChurnRiskOutput {
  tenantId: string;
  score: number;
  severity: ChurnSeverity;
  triggers: ChurnTrigger[];
  recommendations: string[];
  computedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function bandSeverity(score: number): ChurnSeverity {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/**
 * Detect a declining spin-volume trend: split the window in half and
 * compare totals; return the relative decrease (0..1) or 0 if flat
 * / growing.
 */
export function computeSpinDecline(daily: number[]): number {
  if (daily.length < 4) return 0;
  const mid = Math.floor(daily.length / 2);
  const a = daily.slice(0, mid).reduce((s, n) => s + n, 0);
  const b = daily.slice(mid).reduce((s, n) => s + n, 0);
  if (a <= 0) return 0;
  if (b >= a) return 0;
  return (a - b) / a;
}

/** Cap-aware additive risk computation. Pure. Deterministic. */
export function computeChurnRisk(input: ChurnRiskInput): ChurnRiskOutput {
  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const triggers: ChurnTrigger[] = [];
  let score = 0;

  // 1. Detractor NPS = +30 risk (last 90d, worst single response wins).
  const recentNps = input.npsResponses.filter((r) => {
    return Date.parse(r.surveyDate) >= nowMs - 90 * DAY_MS;
  });
  const hasDetractor = recentNps.some((r) => r.category === 'detractor');
  if (hasDetractor) {
    score += 30;
    triggers.push({
      signal: 'nps_detractor',
      delta: 30,
      detail: 'Detractor NPS (<=6) within the last 90 days',
    });
  }

  // 2. Tickets opened in last 30d (per 5 tickets = +5 risk, capped at 25).
  const recentTickets = input.tickets.filter((t) => {
    return Date.parse(t.createdAt) >= nowMs - 30 * DAY_MS;
  });
  if (recentTickets.length > 0) {
    const buckets = Math.floor(recentTickets.length / 5);
    const delta = Math.min(25, buckets * 5);
    if (delta > 0) {
      score += delta;
      triggers.push({
        signal: 'ticket_volume',
        delta,
        detail: `${recentTickets.length} tickets opened in the last 30 days`,
      });
    }
  }

  // 3. Spin volume declining trend = +15 risk per 10% decrease (capped 30).
  const decline = computeSpinDecline(input.spinTrend.daily);
  if (decline > 0.05) {
    const buckets = Math.floor(decline * 10); // 0.10 → 1, 0.20 → 2 …
    const delta = Math.min(30, buckets * 15);
    if (delta > 0) {
      score += delta;
      triggers.push({
        signal: 'spin_decline',
        delta,
        detail: `Spin volume down ${(decline * 100).toFixed(1)}% in second half of window`,
      });
    }
  }

  // 4. RTP drift events in last 30d (per event = +3 risk, capped 15).
  const recentDrift = input.driftEvents.filter(
    (d) => Date.parse(d.occurredAt) >= nowMs - 30 * DAY_MS,
  );
  if (recentDrift.length > 0) {
    const delta = Math.min(15, recentDrift.length * 3);
    score += delta;
    triggers.push({
      signal: 'rtp_drift',
      delta,
      detail: `${recentDrift.length} RTP-drift events in the last 30 days`,
    });
  }

  // 5. Renewal approaching (60d before) = +10 risk.
  if (input.onboarding) {
    const renewalMs = Date.parse(input.onboarding.renewalDueAt);
    if (
      Number.isFinite(renewalMs) &&
      renewalMs > nowMs &&
      renewalMs - nowMs <= 60 * DAY_MS
    ) {
      score += 10;
      const days = Math.ceil((renewalMs - nowMs) / DAY_MS);
      triggers.push({
        signal: 'renewal_window',
        delta: 10,
        detail: `Renewal due in ${days} day(s)`,
      });
    }
  }

  // 6. Missed CSM call = +5 risk per missed call (capped 15).
  if (input.csmActivity.missedCalls > 0) {
    const delta = Math.min(15, input.csmActivity.missedCalls * 5);
    score += delta;
    triggers.push({
      signal: 'missed_csm_calls',
      delta,
      detail: `${input.csmActivity.missedCalls} missed CSM check-in(s) in the last 30 days`,
    });
  }

  // Final clamp.
  score = Math.max(0, Math.min(100, score));
  const severity = bandSeverity(score);

  // Build recommendations from triggers.
  const recs = new Set<string>();
  for (const t of triggers) {
    switch (t.signal) {
      case 'nps_detractor':
        recs.add('Schedule executive save call within 5 business days');
        break;
      case 'ticket_volume':
        recs.add('Run a ticket-pattern review with engineering + assign a TAM');
        break;
      case 'spin_decline':
        recs.add('Investigate spin-volume decline with product analytics');
        break;
      case 'rtp_drift':
        recs.add('Trigger RTP-drift root-cause analysis (math + ops)');
        break;
      case 'renewal_window':
        recs.add('Begin renewal proposal cycle now (offer term-uplift incentive)');
        break;
      case 'missed_csm_calls':
        recs.add('Re-establish weekly cadence with new CSM if needed');
        break;
    }
  }
  if (severity === 'critical') {
    recs.add('Escalate to VP Customer Success + CEO awareness');
  }

  return {
    tenantId: input.tenantId,
    score,
    severity,
    triggers,
    recommendations: [...recs].sort(),
    computedAt: now,
  };
}

/** Aggregate a per-tenant batch into a single sorted leaderboard. */
export function rankPortfolio(
  results: ChurnRiskOutput[],
): ChurnRiskOutput[] {
  return [...results].sort((a, b) => b.score - a.score);
}
