/**
 * W214 Faza 800.1 Agent C — Postgres-backed marketing leads store.
 *
 * Mirrors {@link MarketingLeadStore}'s API against the `marketing_leads`
 * table defined by migration `014_marketing_leads.sql`. Routes swap via
 * `process.env.USE_POSTGRES`, same convention as the W206 stores.
 *
 * `marketing_leads` is intentionally NOT a multi-tenant table — leads
 * are global (one queue feeding sales). Admin queries that scan across
 * the whole table are expected to be allowed.
 */

import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import {
  detectOperatorTier,
  routeToSalesRep,
  type LeadOperatorTier,
  type LeadRole,
  type MarketingLeadFilters,
  type MarketingLeadInput,
  type MarketingLeadRecord,
} from './marketing-leads.js';

interface MarketingLeadRow {
  lead_id: string;
  name: string;
  email: string;
  company: string;
  role: LeadRole;
  message: string;
  operator_tier: LeadOperatorTier;
  remote_ip: string;
  received_at: Date;
  tarball_sent_at: Date | null;
  routed_to: string;
}

function rowToRecord(r: MarketingLeadRow): MarketingLeadRecord {
  return {
    leadId: r.lead_id,
    name: r.name,
    email: r.email,
    company: r.company,
    role: r.role,
    message: r.message,
    operatorTier: r.operator_tier,
    remoteIp: r.remote_ip,
    receivedAt:
      r.received_at instanceof Date ? r.received_at.toISOString() : String(r.received_at),
    tarballSentAt:
      r.tarball_sent_at == null
        ? null
        : r.tarball_sent_at instanceof Date
          ? r.tarball_sent_at.toISOString()
          : String(r.tarball_sent_at),
    routedTo: r.routed_to,
  };
}

export class PostgresMarketingLeadStore {
  constructor(private readonly conn: PgConnection) {}

  async create(input: MarketingLeadInput): Promise<MarketingLeadRecord> {
    if (!input.email) throw new RangeError('email required');
    if (!input.name) throw new RangeError('name required');
    if (!input.company) throw new RangeError('company required');
    if (!input.role) throw new RangeError('role required');
    const tier = detectOperatorTier(input.email);
    const leadId = randomUUID();
    const email = input.email.trim().toLowerCase();
    const message = (input.message ?? '').trim().slice(0, 2000);
    const remoteIp = input.remoteIp ?? '0.0.0.0';
    const routedTo = routeToSalesRep(tier);
    const receivedAt = new Date().toISOString();
    await this.conn.query(
      `INSERT INTO marketing_leads (
         lead_id, name, email, company, role, message, operator_tier,
         remote_ip, received_at, tarball_sent_at, routed_to
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)`,
      [
        leadId,
        input.name.trim(),
        email,
        input.company.trim(),
        input.role,
        message,
        tier,
        remoteIp,
        receivedAt,
        routedTo,
      ]
    );
    return {
      leadId,
      name: input.name.trim(),
      email,
      company: input.company.trim(),
      role: input.role,
      message,
      operatorTier: tier,
      remoteIp,
      receivedAt,
      tarballSentAt: null,
      routedTo,
    };
  }

  async get(leadId: string): Promise<MarketingLeadRecord | null> {
    const r = await this.conn.query<MarketingLeadRow>(
      `SELECT lead_id, name, email, company, role, message, operator_tier,
              remote_ip, received_at, tarball_sent_at, routed_to
         FROM marketing_leads
        WHERE lead_id = $1
        LIMIT 1`,
      [leadId]
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async getByEmail(email: string): Promise<MarketingLeadRecord | null> {
    const r = await this.conn.query<MarketingLeadRow>(
      `SELECT lead_id, name, email, company, role, message, operator_tier,
              remote_ip, received_at, tarball_sent_at, routed_to
         FROM marketing_leads
        WHERE email = $1
        ORDER BY received_at DESC
        LIMIT 1`,
      [email.toLowerCase()]
    );
    if (r.rows.length === 0) return null;
    return rowToRecord(r.rows[0]);
  }

  async markSent(
    leadId: string,
    when: string = new Date().toISOString()
  ): Promise<MarketingLeadRecord | null> {
    const r = await this.conn.query(
      `UPDATE marketing_leads SET tarball_sent_at = $2 WHERE lead_id = $1`,
      [leadId, when]
    );
    if ((r.rowCount ?? 0) === 0) return null;
    return this.get(leadId);
  }

  async list(filters: MarketingLeadFilters = {}): Promise<MarketingLeadRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.email) {
      params.push(filters.email.toLowerCase());
      where.push(`email = $${params.length}`);
    }
    if (filters.operatorTier) {
      params.push(filters.operatorTier);
      where.push(`operator_tier = $${params.length}`);
    }
    if (filters.sent === true) {
      where.push(`tarball_sent_at IS NOT NULL`);
    } else if (filters.sent === false) {
      where.push(`tarball_sent_at IS NULL`);
    }
    const sql =
      `SELECT lead_id, name, email, company, role, message, operator_tier,
              remote_ip, received_at, tarball_sent_at, routed_to
         FROM marketing_leads
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY received_at DESC`;
    const r = await this.conn.query<MarketingLeadRow>(sql, params);
    return r.rows.map(rowToRecord);
  }

  async count(filters: MarketingLeadFilters = {}): Promise<number> {
    const rows = await this.list(filters);
    return rows.length;
  }

  async reset(): Promise<void> {
    await this.conn.query(`DELETE FROM marketing_leads`);
  }
}
