/**
 * W215 Faza 1300.0 Agent C — Postgres-backed support tickets store.
 *
 * Mirrors {@link SupportTicketStore}'s API against the `support_tickets`
 * table defined by `017_support_tickets.sql`. Comments and escalations
 * are stored as JSONB arrays on the row; the table is intentionally
 * denormalized because (a) tickets are append-only after first write
 * for the most-common operations and (b) the row is rarely > 50KB.
 *
 * The W208 tenant-isolation observer instruments every query — see
 * the route layer for the `tenantId` enforcement.
 */
import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import {
  SLA_MS,
  computeSlaDeadline,
  escalationTarget,
  type SupportTicket,
  type TicketCategory,
  type TicketComment,
  type TicketEscalation,
  type TicketFilter,
  type TicketInput,
  type TicketPatch,
  type TicketSeverity,
  type TicketStatus,
} from './support-tickets.js';

interface TicketRow {
  id: string;
  tenant_id: string;
  raised_by: string;
  title: string;
  description: string;
  severity: TicketSeverity;
  category: TicketCategory;
  status: TicketStatus;
  assignee: string;
  sla_deadline: Date | string;
  first_response_at: Date | string | null;
  escalations: TicketEscalation[];
  comments: TicketComment[];
  created_at: Date | string;
  updated_at: Date | string;
  resolved_at: Date | string | null;
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToTicket(r: TicketRow): SupportTicket {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    raisedBy: r.raised_by,
    title: r.title,
    description: r.description,
    severity: r.severity,
    category: r.category,
    status: r.status,
    assignee: r.assignee,
    slaDeadline: toIso(r.sla_deadline),
    firstResponseAt: r.first_response_at == null ? null : toIso(r.first_response_at),
    escalations: r.escalations ?? [],
    comments: r.comments ?? [],
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    resolvedAt: r.resolved_at == null ? null : toIso(r.resolved_at),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+/;

const DEFAULT_ASSIGNEE: Record<TicketCategory, string> = {
  bug: 'engineering@platform',
  question: 'support@platform',
  feature_request: 'product@platform',
  billing: 'finance@platform',
};

const ALL_SEVERITIES: ReadonlySet<TicketSeverity> = new Set<TicketSeverity>([
  'P0',
  'P1',
  'P2',
  'P3',
]);
const ALL_CATEGORIES: ReadonlySet<TicketCategory> = new Set<TicketCategory>([
  'bug',
  'question',
  'feature_request',
  'billing',
]);
const ALL_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  'open',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
]);

export class PostgresSupportTicketStore {
  constructor(private readonly conn: PgConnection) {}

  async create(input: TicketInput): Promise<SupportTicket> {
    if (!input.tenantId) throw new RangeError('bad tenantId');
    if (!EMAIL_RE.test(input.raisedBy)) throw new RangeError('bad raisedBy');
    if (!ALL_SEVERITIES.has(input.severity)) throw new RangeError('bad severity');
    if (!ALL_CATEGORIES.has(input.category)) throw new RangeError('bad category');
    if (!input.title || input.title.length < 4) throw new RangeError('bad title');
    if (!input.description) throw new RangeError('bad description');
    const now = new Date().toISOString();
    const id = randomUUID();
    const assignee = input.assignee ?? DEFAULT_ASSIGNEE[input.category];
    const slaDeadline = computeSlaDeadline(input.severity, now);
    await this.conn.query(
      `INSERT INTO support_tickets (
         id, tenant_id, raised_by, title, description, severity,
         category, status, assignee, sla_deadline, first_response_at,
         escalations, comments, created_at, updated_at, resolved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, NULL,
                 '[]'::jsonb, '[]'::jsonb, $10, $10, NULL)`,
      [
        id,
        input.tenantId,
        input.raisedBy.toLowerCase(),
        input.title.trim().slice(0, 200),
        input.description.trim().slice(0, 4000),
        input.severity,
        input.category,
        assignee,
        slaDeadline,
        now,
      ],
    );
    return {
      id,
      tenantId: input.tenantId,
      raisedBy: input.raisedBy.toLowerCase(),
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 4000),
      severity: input.severity,
      category: input.category,
      status: 'open',
      assignee,
      slaDeadline,
      firstResponseAt: null,
      escalations: [],
      comments: [],
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
  }

  async get(id: string): Promise<SupportTicket | null> {
    const r = await this.conn.query<TicketRow>(
      `SELECT * FROM support_tickets WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (r.rows.length === 0) return null;
    return rowToTicket(r.rows[0]);
  }

  async list(filter: TicketFilter = {}): Promise<SupportTicket[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.severity) {
      params.push(filter.severity);
      where.push(`severity = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    if (filter.category) {
      params.push(filter.category);
      where.push(`category = $${params.length}`);
    }
    if (filter.assignee) {
      params.push(filter.assignee.toLowerCase());
      where.push(`LOWER(assignee) = $${params.length}`);
    }
    const sql =
      `SELECT * FROM support_tickets
        ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC`;
    const r = await this.conn.query<TicketRow>(sql, params);
    return r.rows.map(rowToTicket);
  }

  async patch(
    id: string,
    patch: TicketPatch,
    actor: string = 'system',
  ): Promise<SupportTicket> {
    const t = await this.get(id);
    if (!t) throw new RangeError(`support-tickets: ${id} not found`);
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let resolvedAt: string | null = t.resolvedAt;
    let status: TicketStatus = t.status;
    let severity: TicketSeverity = t.severity;
    let assignee: string = t.assignee;
    let slaDeadline: string = t.slaDeadline;
    if (patch.status !== undefined) {
      if (!ALL_STATUSES.has(patch.status)) throw new RangeError('bad status');
      status = patch.status;
      params.push(status);
      setClauses.push(`status = $${params.length}`);
      if ((status === 'resolved' || status === 'closed') && !resolvedAt) {
        resolvedAt = new Date().toISOString();
        params.push(resolvedAt);
        setClauses.push(`resolved_at = $${params.length}`);
      }
    }
    if (patch.assignee !== undefined) {
      if (!EMAIL_RE.test(patch.assignee)) throw new RangeError('bad assignee');
      assignee = patch.assignee;
      params.push(assignee);
      setClauses.push(`assignee = $${params.length}`);
    }
    if (patch.severity !== undefined) {
      if (!ALL_SEVERITIES.has(patch.severity)) throw new RangeError('bad severity');
      severity = patch.severity;
      slaDeadline = computeSlaDeadline(severity, t.createdAt);
      params.push(severity);
      setClauses.push(`severity = $${params.length}`);
      params.push(slaDeadline);
      setClauses.push(`sla_deadline = $${params.length}`);
    }
    const now = new Date().toISOString();
    params.push(now);
    setClauses.push(`updated_at = $${params.length}`);
    params.push(id);
    await this.conn.query(
      `UPDATE support_tickets SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    if (patch.resolution !== undefined) {
      await this.appendComment(id, actor, `RESOLUTION: ${patch.resolution}`);
    }
    return {
      ...t,
      status,
      severity,
      assignee,
      slaDeadline,
      resolvedAt,
      updatedAt: now,
    };
  }

  async appendComment(
    id: string,
    author: string,
    body: string,
  ): Promise<TicketComment> {
    if (!body || body.trim().length === 0) throw new RangeError('empty comment');
    const t = await this.get(id);
    if (!t) throw new RangeError(`support-tickets: ${id} not found`);
    const comment: TicketComment = {
      id: randomUUID(),
      author,
      body: body.trim().slice(0, 4000),
      postedAt: new Date().toISOString(),
    };
    const newComments = [...t.comments, comment];
    let firstResponseAt = t.firstResponseAt;
    if (!firstResponseAt && !author.toLowerCase().startsWith(t.raisedBy)) {
      firstResponseAt = comment.postedAt;
    }
    await this.conn.query(
      `UPDATE support_tickets
          SET comments = $2::jsonb,
              first_response_at = $3,
              updated_at = $4
        WHERE id = $1`,
      [id, JSON.stringify(newComments), firstResponseAt, comment.postedAt],
    );
    return comment;
  }

  async sweepEscalations(now: number = Date.now()): Promise<TicketEscalation[]> {
    const all = await this.list();
    const out: TicketEscalation[] = [];
    for (const t of all) {
      if (t.firstResponseAt) continue;
      if (t.status === 'resolved' || t.status === 'closed') continue;
      const deadlineMs = Date.parse(t.slaDeadline);
      if (!Number.isFinite(deadlineMs) || now < deadlineMs) continue;
      const next = escalationTarget(t.assignee);
      if (next === t.assignee) continue;
      const esc: TicketEscalation = {
        fromAssignee: t.assignee,
        toAssignee: next,
        occurredAt: new Date(now).toISOString(),
        reason: `SLA breach (${t.severity} > ${SLA_MS[t.severity] / 3_600_000}h)`,
      };
      const newEscalations = [...t.escalations, esc];
      await this.conn.query(
        `UPDATE support_tickets
            SET escalations = $2::jsonb,
                assignee = $3,
                updated_at = $4
          WHERE id = $1`,
        [t.id, JSON.stringify(newEscalations), next, esc.occurredAt],
      );
      out.push(esc);
    }
    return out;
  }

  async countByStatus(filter: TicketFilter = {}): Promise<Record<TicketStatus, number>> {
    const rows = await this.list(filter);
    const out: Record<TicketStatus, number> = {
      open: 0,
      in_progress: 0,
      waiting_customer: 0,
      resolved: 0,
      closed: 0,
    };
    for (const t of rows) out[t.status] += 1;
    return out;
  }

  async meanTimeToResolutionHours(filter: TicketFilter = {}): Promise<number> {
    const rows = await this.list(filter);
    const closed = rows.filter(
      (t) => t.resolvedAt && (t.status === 'resolved' || t.status === 'closed'),
    );
    if (closed.length === 0) return 0;
    const totalMs = closed.reduce((acc, t) => {
      const created = Date.parse(t.createdAt);
      const resolved = Date.parse(t.resolvedAt as string);
      return acc + Math.max(0, resolved - created);
    }, 0);
    return totalMs / closed.length / 3_600_000;
  }

  async size(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM support_tickets`,
    );
    return Number(r.rows[0].count);
  }

  async reset(): Promise<void> {
    await this.conn.query(`DELETE FROM support_tickets`);
  }
}
