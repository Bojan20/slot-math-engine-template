/**
 * W215 Faza 1300.0 Agent C — Customer onboarding tracker (in-memory).
 *
 * Tracks each customer's journey post-deal through 8 well-defined
 * states. Each state has an expected duration (SLA flag fires when the
 * tenant lingers past it). The Customer Success Manager (CSM) is the
 * named owner; state transitions are append-only (audit history).
 *
 * Mirrors the conventions of {@link MarketingLeadStore} / {@link
 * CompliancePostureStore}: pure in-memory by default, PG-backed mirror
 * in `./customer-onboarding-pg.ts`, routes swap at boot when
 * USE_POSTGRES=true.
 *
 * Customer data is global (NOT per-tenant)—it tracks the relationship
 * the platform has *with* each tenant—and admin queries scan the whole
 * table. Customer-facing endpoints scope to the tenant in the path.
 */
import { randomUUID } from 'node:crypto';

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

export interface OnboardingTransition {
  /** From which stage (null on initial creation). */
  fromStage: OnboardingStage | null;
  /** To which stage. */
  toStage: OnboardingStage;
  /** ISO timestamp the transition happened. */
  occurredAt: string;
  /** Who pushed the button (CSM email or 'system'). */
  actor: string;
  /** Free-form note. */
  note: string;
}

export interface CustomerOnboardingRecord {
  customerId: string;
  tenantId: string;
  /** Display name (e.g. "Acme Casino Group"). */
  displayName: string;
  tier: CustomerTier;
  /** Total contract value (USD). */
  dealValueUsd: number;
  /** Active CSM email. */
  csmEmail: string;
  /** Current onboarding stage. */
  stage: OnboardingStage;
  /** When the stage was entered (drives SLA). */
  stageEnteredAt: string;
  /** Renewal due date (ISO). */
  renewalDueAt: string;
  /** Append-only transition log. */
  history: OnboardingTransition[];
  /** ISO timestamps for create + last update. */
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOnboardingInput {
  tenantId: string;
  displayName: string;
  tier: CustomerTier;
  dealValueUsd: number;
  csmEmail: string;
  renewalDueAt: string;
  /** Default `deal_won`. */
  stage?: OnboardingStage;
}

export interface OnboardingFilter {
  tenantId?: string;
  tier?: CustomerTier;
  stage?: OnboardingStage;
  csmEmail?: string;
}

export interface SlaBreach {
  customerId: string;
  tenantId: string;
  stage: OnboardingStage;
  enteredAt: string;
  expectedMaxDays: number;
  actualDays: number;
  overdueDays: number;
}

/** Per-stage SLA expectation in days; breach fires above. */
export const STAGE_SLA_DAYS: Record<OnboardingStage, number> = {
  deal_won: 7,
  kickoff_scheduled: 14,
  kickoff_done: 30,
  integration_in_progress: 60,
  first_spin: 14,
  soft_launch: 21,
  full_launch: 365,
  first_renewal_due: 30,
};

const ALL_STAGES: ReadonlySet<OnboardingStage> = new Set<OnboardingStage>([
  'deal_won',
  'kickoff_scheduled',
  'kickoff_done',
  'integration_in_progress',
  'first_spin',
  'soft_launch',
  'full_launch',
  'first_renewal_due',
]);

const ALL_TIERS: ReadonlySet<CustomerTier> = new Set<CustomerTier>([
  'enterprise',
  'platform',
  'indie',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valid forward transitions. Tightens the state machine. */
const NEXT_STAGES: Record<OnboardingStage, ReadonlyArray<OnboardingStage>> = {
  deal_won: ['kickoff_scheduled'],
  kickoff_scheduled: ['kickoff_done'],
  kickoff_done: ['integration_in_progress'],
  integration_in_progress: ['first_spin'],
  first_spin: ['soft_launch'],
  soft_launch: ['full_launch'],
  full_launch: ['first_renewal_due'],
  first_renewal_due: ['full_launch'], // renewal closed → back to live
};

/** Returns true if `to` is a legal next stage from `from`. */
export function canTransition(
  from: OnboardingStage,
  to: OnboardingStage,
): boolean {
  return NEXT_STAGES[from].includes(to);
}

/** Compute days a customer has been in the current stage. */
export function daysInStage(stageEnteredAt: string, now: number = Date.now()): number {
  const t = Date.parse(stageEnteredAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
}

/** Return SLA breach metadata for a record, or null if within SLA. */
export function checkSlaBreach(
  rec: CustomerOnboardingRecord,
  now: number = Date.now(),
): SlaBreach | null {
  const expected = STAGE_SLA_DAYS[rec.stage];
  const actual = daysInStage(rec.stageEnteredAt, now);
  if (actual <= expected) return null;
  return {
    customerId: rec.customerId,
    tenantId: rec.tenantId,
    stage: rec.stage,
    enteredAt: rec.stageEnteredAt,
    expectedMaxDays: expected,
    actualDays: actual,
    overdueDays: actual - expected,
  };
}

function validateInput(input: CustomerOnboardingInput): void {
  if (!input.tenantId || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(input.tenantId)) {
    throw new RangeError('customer-onboarding: bad tenantId');
  }
  if (!input.displayName || input.displayName.length < 1) {
    throw new RangeError('customer-onboarding: bad displayName');
  }
  if (!ALL_TIERS.has(input.tier)) {
    throw new RangeError('customer-onboarding: bad tier');
  }
  if (!Number.isFinite(input.dealValueUsd) || input.dealValueUsd < 0) {
    throw new RangeError('customer-onboarding: bad dealValueUsd');
  }
  if (!EMAIL_RE.test(input.csmEmail)) {
    throw new RangeError('customer-onboarding: bad csmEmail');
  }
  if (!Number.isFinite(Date.parse(input.renewalDueAt))) {
    throw new RangeError('customer-onboarding: bad renewalDueAt');
  }
  if (input.stage !== undefined && !ALL_STAGES.has(input.stage)) {
    throw new RangeError('customer-onboarding: bad initial stage');
  }
}

export class CustomerOnboardingStore {
  private readonly byId = new Map<string, CustomerOnboardingRecord>();
  private readonly byTenant = new Map<string, string>();

  create(input: CustomerOnboardingInput): CustomerOnboardingRecord {
    validateInput(input);
    if (this.byTenant.has(input.tenantId)) {
      throw new RangeError(
        `customer-onboarding: tenant ${input.tenantId} already onboarded`,
      );
    }
    const now = new Date().toISOString();
    const stage = input.stage ?? 'deal_won';
    const rec: CustomerOnboardingRecord = {
      customerId: randomUUID(),
      tenantId: input.tenantId,
      displayName: input.displayName.trim(),
      tier: input.tier,
      dealValueUsd: Math.round(input.dealValueUsd * 100) / 100,
      csmEmail: input.csmEmail.toLowerCase(),
      stage,
      stageEnteredAt: now,
      renewalDueAt: input.renewalDueAt,
      history: [
        {
          fromStage: null,
          toStage: stage,
          occurredAt: now,
          actor: 'system',
          note: 'created',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(rec.customerId, rec);
    this.byTenant.set(rec.tenantId, rec.customerId);
    return rec;
  }

  get(customerId: string): CustomerOnboardingRecord | null {
    return this.byId.get(customerId) ?? null;
  }

  getByTenant(tenantId: string): CustomerOnboardingRecord | null {
    const id = this.byTenant.get(tenantId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  list(filter: OnboardingFilter = {}): CustomerOnboardingRecord[] {
    let rows = Array.from(this.byId.values());
    if (filter.tenantId) rows = rows.filter((r) => r.tenantId === filter.tenantId);
    if (filter.tier) rows = rows.filter((r) => r.tier === filter.tier);
    if (filter.stage) rows = rows.filter((r) => r.stage === filter.stage);
    if (filter.csmEmail) {
      const e = filter.csmEmail.toLowerCase();
      rows = rows.filter((r) => r.csmEmail === e);
    }
    return rows.sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  }

  transition(
    customerId: string,
    nextStage: OnboardingStage,
    actor: string,
    note: string = '',
  ): CustomerOnboardingRecord {
    const rec = this.byId.get(customerId);
    if (!rec) throw new RangeError(`customer-onboarding: ${customerId} not found`);
    if (!ALL_STAGES.has(nextStage)) {
      throw new RangeError('customer-onboarding: bad nextStage');
    }
    if (!canTransition(rec.stage, nextStage)) {
      throw new RangeError(
        `customer-onboarding: illegal transition ${rec.stage} → ${nextStage}`,
      );
    }
    const now = new Date().toISOString();
    rec.history.push({
      fromStage: rec.stage,
      toStage: nextStage,
      occurredAt: now,
      actor,
      note: note.slice(0, 500),
    });
    rec.stage = nextStage;
    rec.stageEnteredAt = now;
    rec.updatedAt = now;
    return rec;
  }

  reassign(customerId: string, csmEmail: string): CustomerOnboardingRecord {
    const rec = this.byId.get(customerId);
    if (!rec) throw new RangeError(`customer-onboarding: ${customerId} not found`);
    if (!EMAIL_RE.test(csmEmail)) {
      throw new RangeError('customer-onboarding: bad csmEmail');
    }
    rec.csmEmail = csmEmail.toLowerCase();
    rec.updatedAt = new Date().toISOString();
    return rec;
  }

  /** Return SLA breaches for the entire portfolio. */
  listSlaBreaches(now: number = Date.now()): SlaBreach[] {
    const out: SlaBreach[] = [];
    for (const rec of this.byId.values()) {
      const breach = checkSlaBreach(rec, now);
      if (breach) out.push(breach);
    }
    return out.sort((a, b) => b.overdueDays - a.overdueDays);
  }

  /** Return upcoming renewals within a window (default 60d). */
  listUpcomingRenewals(
    now: number = Date.now(),
    windowDays: number = 60,
  ): CustomerOnboardingRecord[] {
    const cutoff = now + windowDays * 24 * 60 * 60 * 1000;
    return Array.from(this.byId.values())
      .filter((r) => {
        const t = Date.parse(r.renewalDueAt);
        return Number.isFinite(t) && t >= now && t <= cutoff;
      })
      .sort((a, b) => a.renewalDueAt.localeCompare(b.renewalDueAt));
  }

  countByStage(): Record<OnboardingStage, number> {
    const out: Record<OnboardingStage, number> = {
      deal_won: 0,
      kickoff_scheduled: 0,
      kickoff_done: 0,
      integration_in_progress: 0,
      first_spin: 0,
      soft_launch: 0,
      full_launch: 0,
      first_renewal_due: 0,
    };
    for (const r of this.byId.values()) out[r.stage] += 1;
    return out;
  }

  size(): number {
    return this.byId.size;
  }

  reset(): void {
    this.byId.clear();
    this.byTenant.clear();
  }
}
