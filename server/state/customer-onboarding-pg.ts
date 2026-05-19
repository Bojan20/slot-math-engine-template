/**
 * W215 Faza 1300.0 Agent C — Postgres-backed customer onboarding store.
 *
 * Mirrors {@link CustomerOnboardingStore}'s API against the
 * `customer_onboarding` table defined by migration
 * `016_customer_onboarding.sql`. The history list is stored as JSONB on
 * the row (small append-only log, <=200 entries in normal life).
 *
 * Routes swap via `process.env.USE_POSTGRES`, same convention as the
 * W206 / W214 stores. Cross-tenant scans are intentional — the table
 * is global, not multi-tenant — so the W208 isolation observer is left
 * unbothered here.
 */
import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import {
  STAGE_SLA_DAYS,
  canTransition,
  checkSlaBreach,
  daysInStage,
  type CustomerOnboardingInput,
  type CustomerOnboardingRecord,
  type CustomerTier,
  type OnboardingFilter,
  type OnboardingStage,
  type OnboardingTransition,
  type SlaBreach,
} from './customer-onboarding.js';

interface CustomerOnboardingRow {
  customer_id: string;
  tenant_id: string;
  display_name: string;
  tier: CustomerTier;
  deal_value_usd: string | number;
  csm_email: string;
  stage: OnboardingStage;
  stage_entered_at: Date;
  renewal_due_at: Date;
  history: OnboardingTransition[];
  created_at: Date;
  updated_at: Date;
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToRecord(r: CustomerOnboardingRow): CustomerOnboardingRecord {
  return {
    customerId: r.customer_id,
    tenantId: r.tenant_id,
    displayName: r.display_name,
    tier: r.tier,
    dealValueUsd: Number(r.deal_value_usd),
    csmEmail: r.csm_email,
    stage: r.stage,
    stageEnteredAt: toIso(r.stage_entered_at),
    renewalDueAt: toIso(r.renewal_due_at),
    history: r.history ?? [],
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PostgresCustomerOnboardingStore {
  constructor(private readonly conn: PgConnection) {}

  async create(input: CustomerOnboardingInput): Promise<CustomerOnboardingRecord> {
    if (!input.tenantId) throw new RangeError('tenantId required');
    if (!input.displayName) throw new RangeError('displayName required');
    if (!EMAIL_RE.test(input.csmEmail)) throw new RangeError('bad csmEmail');
    if (!Number.isFinite(input.dealValueUsd) || input.dealValueUsd < 0) {
      throw new RangeError('bad dealValueUsd');
    }
    const existing = await this.getByTenant(input.tenantId);
    if (existing) {
      throw new RangeError(
        `customer-onboarding: tenant ${input.tenantId} already onboarded`,
      );
    }
    const customerId = randomUUID();
    const stage = input.stage ?? 'deal_won';
    const now = new Date().toISOString();
    const history: OnboardingTransition[] = [
      {
        fromStage: null,
        toStage: stage,
        occurredAt: now,
        actor: 'system',
        note: 'created',
      },
    ];
    await this.conn.query(
      `INSERT INTO customer_onboarding (
         customer_id, tenant_id, display_name, tier, deal_value_usd,
         csm_email, stage, stage_entered_at, renewal_due_at,
         history, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
      [
        customerId,
        input.tenantId,
        input.displayName.trim(),
        input.tier,
        input.dealValueUsd,
        input.csmEmail.toLowerCase(),
        stage,
        now,
        input.renewalDueAt,
        JSON.stringify(history),
        now,
        now,
      ],
    );
    return {
      customerId,
      tenantId: input.tenantId,
      displayName: input.displayName.trim(),
      tier: input.tier,
      dealValueUsd: input.dealValueUsd,
      csmEmail: input.csmEmail.toLowerCase(),
      stage,
      stageEnteredAt: now,
      renewalDueAt: input.renewalDueAt,
      history,
      createdAt: now,
      updatedAt: now,
    };
  }

  async get(customerId: string): Promise<CustomerOnboardingRecord | null> {
    const r = await this.conn.query<CustomerOnboardingRow>(
      `SELECT customer_id, tenant_id, display_name, tier, deal_value_usd,
              csm_email, stage, stage_entered_at, renewal_due_at,
              history, created_at, updated_at
         FROM customer_onboarding
        WHERE customer_id = $1
        LIMIT 1`,
      [customerId],
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async getByTenant(tenantId: string): Promise<CustomerOnboardingRecord | null> {
    const r = await this.conn.query<CustomerOnboardingRow>(
      `SELECT customer_id, tenant_id, display_name, tier, deal_value_usd,
              csm_email, stage, stage_entered_at, renewal_due_at,
              history, created_at, updated_at
         FROM customer_onboarding
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId],
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async list(filter: OnboardingFilter = {}): Promise<CustomerOnboardingRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.tier) {
      params.push(filter.tier);
      where.push(`tier = $${params.length}`);
    }
    if (filter.stage) {
      params.push(filter.stage);
      where.push(`stage = $${params.length}`);
    }
    if (filter.csmEmail) {
      params.push(filter.csmEmail.toLowerCase());
      where.push(`csm_email = $${params.length}`);
    }
    const sql =
      `SELECT customer_id, tenant_id, display_name, tier, deal_value_usd,
              csm_email, stage, stage_entered_at, renewal_due_at,
              history, created_at, updated_at
         FROM customer_onboarding
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY tenant_id ASC`;
    const r = await this.conn.query<CustomerOnboardingRow>(sql, params);
    return r.rows.map(rowToRecord);
  }

  async transition(
    customerId: string,
    nextStage: OnboardingStage,
    actor: string,
    note: string = '',
  ): Promise<CustomerOnboardingRecord> {
    const rec = await this.get(customerId);
    if (!rec) throw new RangeError(`customer-onboarding: ${customerId} not found`);
    if (!canTransition(rec.stage, nextStage)) {
      throw new RangeError(
        `customer-onboarding: illegal transition ${rec.stage} → ${nextStage}`,
      );
    }
    const now = new Date().toISOString();
    const newHistory: OnboardingTransition[] = [
      ...rec.history,
      {
        fromStage: rec.stage,
        toStage: nextStage,
        occurredAt: now,
        actor,
        note: note.slice(0, 500),
      },
    ];
    await this.conn.query(
      `UPDATE customer_onboarding
          SET stage = $2,
              stage_entered_at = $3,
              history = $4::jsonb,
              updated_at = $5
        WHERE customer_id = $1`,
      [customerId, nextStage, now, JSON.stringify(newHistory), now],
    );
    return { ...rec, stage: nextStage, stageEnteredAt: now, history: newHistory, updatedAt: now };
  }

  async reassign(
    customerId: string,
    csmEmail: string,
  ): Promise<CustomerOnboardingRecord> {
    if (!EMAIL_RE.test(csmEmail)) throw new RangeError('bad csmEmail');
    const now = new Date().toISOString();
    const r = await this.conn.query(
      `UPDATE customer_onboarding SET csm_email = $2, updated_at = $3 WHERE customer_id = $1`,
      [customerId, csmEmail.toLowerCase(), now],
    );
    if ((r.rowCount ?? 0) === 0) {
      throw new RangeError(`customer-onboarding: ${customerId} not found`);
    }
    const rec = await this.get(customerId);
    if (!rec) throw new RangeError(`customer-onboarding: race on ${customerId}`);
    return rec;
  }

  async listSlaBreaches(now: number = Date.now()): Promise<SlaBreach[]> {
    const rows = await this.list();
    const out: SlaBreach[] = [];
    for (const r of rows) {
      const b = checkSlaBreach(r, now);
      if (b) out.push(b);
    }
    return out.sort((a, b) => b.overdueDays - a.overdueDays);
  }

  async listUpcomingRenewals(
    now: number = Date.now(),
    windowDays: number = 60,
  ): Promise<CustomerOnboardingRecord[]> {
    const rows = await this.list();
    const cutoff = now + windowDays * 24 * 60 * 60 * 1000;
    return rows
      .filter((r) => {
        const t = Date.parse(r.renewalDueAt);
        return Number.isFinite(t) && t >= now && t <= cutoff;
      })
      .sort((a, b) => a.renewalDueAt.localeCompare(b.renewalDueAt));
  }

  async countByStage(): Promise<Record<OnboardingStage, number>> {
    const rows = await this.list();
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
    for (const r of rows) out[r.stage] += 1;
    return out;
  }

  async size(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM customer_onboarding`,
    );
    return Number(r.rows[0].count);
  }

  async reset(): Promise<void> {
    await this.conn.query(`DELETE FROM customer_onboarding`);
  }
}

// Re-export helpers so consumers only need this module.
export { STAGE_SLA_DAYS, daysInStage, checkSlaBreach };
