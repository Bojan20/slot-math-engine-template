/**
 * W215 Faza 1300.0 Agent C — Support ticketing store (in-memory).
 *
 * Tracks every customer-raised ticket against the platform: bugs,
 * questions, feature requests, billing issues. Each ticket carries an
 * SLA derived from severity (P0 → 1h response, P3 → 72h) and an
 * append-only audit trail of escalations and comments.
 *
 * Tickets are tenant-scoped (the `tenantId` column is enforced by both
 * the route and the W208 tenant-isolation observer). The CSM dashboard
 * pulls cross-tenant via an admin-scope override.
 */
import { randomUUID } from 'node:crypto';

export type TicketSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type TicketCategory = 'bug' | 'question' | 'feature_request' | 'billing';
export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'resolved'
  | 'closed';

export interface TicketComment {
  id: string;
  author: string;
  body: string;
  postedAt: string;
}

export interface TicketEscalation {
  fromAssignee: string;
  toAssignee: string;
  occurredAt: string;
  reason: string;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  raisedBy: string;
  title: string;
  description: string;
  severity: TicketSeverity;
  category: TicketCategory;
  status: TicketStatus;
  assignee: string;
  /** ISO timestamp by which the first response is due. */
  slaDeadline: string;
  /** ISO timestamp of the actual first response (or null). */
  firstResponseAt: string | null;
  escalations: TicketEscalation[];
  comments: TicketComment[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TicketInput {
  tenantId: string;
  raisedBy: string;
  title: string;
  description: string;
  severity: TicketSeverity;
  category: TicketCategory;
  assignee?: string;
}

export interface TicketFilter {
  tenantId?: string;
  severity?: TicketSeverity;
  status?: TicketStatus;
  category?: TicketCategory;
  assignee?: string;
}

export interface TicketPatch {
  status?: TicketStatus;
  assignee?: string;
  severity?: TicketSeverity;
  resolution?: string;
}

/** Per-severity SLA in milliseconds before an auto-escalation fires. */
export const SLA_MS: Record<TicketSeverity, number> = {
  P0: 1 * 60 * 60 * 1000,
  P1: 4 * 60 * 60 * 1000,
  P2: 24 * 60 * 60 * 1000,
  P3: 72 * 60 * 60 * 1000,
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

/** Default assignee per category, used when no override provided. */
const DEFAULT_ASSIGNEE: Record<TicketCategory, string> = {
  bug: 'engineering@platform',
  question: 'support@platform',
  feature_request: 'product@platform',
  billing: 'finance@platform',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+/;

/** Return the next assignee for an auto-escalation. */
export function escalationTarget(current: string): string {
  if (current.startsWith('engineering@')) return 'lead-engineering@platform';
  if (current.startsWith('support@')) return 'lead-support@platform';
  if (current.startsWith('product@')) return 'head-product@platform';
  if (current.startsWith('finance@')) return 'head-finance@platform';
  if (current.startsWith('lead-')) return 'vp-customer-success@platform';
  return 'vp-customer-success@platform';
}

/** Compute SLA deadline given severity and creation time. */
export function computeSlaDeadline(
  severity: TicketSeverity,
  createdAt: string,
): string {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) {
    throw new RangeError('support-tickets: bad createdAt');
  }
  return new Date(t + SLA_MS[severity]).toISOString();
}

export interface SlaState {
  status: 'within_sla' | 'breached' | 'responded';
  msRemaining: number;
}

/** Inspect SLA for a ticket. */
export function inspectSla(
  ticket: SupportTicket,
  now: number = Date.now(),
): SlaState {
  if (ticket.firstResponseAt) return { status: 'responded', msRemaining: 0 };
  const t = Date.parse(ticket.slaDeadline);
  const rem = t - now;
  if (rem < 0) return { status: 'breached', msRemaining: rem };
  return { status: 'within_sla', msRemaining: rem };
}

function validateInput(input: TicketInput): void {
  if (!input.tenantId) throw new RangeError('support-tickets: bad tenantId');
  if (!EMAIL_RE.test(input.raisedBy)) {
    throw new RangeError('support-tickets: bad raisedBy');
  }
  if (!input.title || input.title.length < 4) {
    throw new RangeError('support-tickets: bad title');
  }
  if (!input.description || input.description.length < 1) {
    throw new RangeError('support-tickets: bad description');
  }
  if (!ALL_SEVERITIES.has(input.severity)) {
    throw new RangeError('support-tickets: bad severity');
  }
  if (!ALL_CATEGORIES.has(input.category)) {
    throw new RangeError('support-tickets: bad category');
  }
}

export class SupportTicketStore {
  private readonly byId = new Map<string, SupportTicket>();

  create(input: TicketInput): SupportTicket {
    validateInput(input);
    const now = new Date().toISOString();
    const assignee = input.assignee ?? DEFAULT_ASSIGNEE[input.category];
    const ticket: SupportTicket = {
      id: randomUUID(),
      tenantId: input.tenantId,
      raisedBy: input.raisedBy.toLowerCase(),
      title: input.title.trim().slice(0, 200),
      description: input.description.trim().slice(0, 4000),
      severity: input.severity,
      category: input.category,
      status: 'open',
      assignee,
      slaDeadline: computeSlaDeadline(input.severity, now),
      firstResponseAt: null,
      escalations: [],
      comments: [],
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this.byId.set(ticket.id, ticket);
    return ticket;
  }

  get(id: string): SupportTicket | null {
    return this.byId.get(id) ?? null;
  }

  list(filter: TicketFilter = {}): SupportTicket[] {
    let rows = Array.from(this.byId.values());
    if (filter.tenantId) rows = rows.filter((r) => r.tenantId === filter.tenantId);
    if (filter.severity) rows = rows.filter((r) => r.severity === filter.severity);
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.category) rows = rows.filter((r) => r.category === filter.category);
    if (filter.assignee) {
      const a = filter.assignee.toLowerCase();
      rows = rows.filter((r) => r.assignee.toLowerCase() === a);
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  patch(id: string, patch: TicketPatch, actor: string = 'system'): SupportTicket {
    const t = this.byId.get(id);
    if (!t) throw new RangeError(`support-tickets: ${id} not found`);
    if (patch.status !== undefined) {
      if (!ALL_STATUSES.has(patch.status)) {
        throw new RangeError('support-tickets: bad status');
      }
      t.status = patch.status;
      if (patch.status === 'resolved' || patch.status === 'closed') {
        t.resolvedAt = t.resolvedAt ?? new Date().toISOString();
      }
    }
    if (patch.assignee !== undefined) {
      if (!EMAIL_RE.test(patch.assignee)) {
        throw new RangeError('support-tickets: bad assignee');
      }
      t.assignee = patch.assignee;
    }
    if (patch.severity !== undefined) {
      if (!ALL_SEVERITIES.has(patch.severity)) {
        throw new RangeError('support-tickets: bad severity');
      }
      t.severity = patch.severity;
      t.slaDeadline = computeSlaDeadline(patch.severity, t.createdAt);
    }
    if (patch.resolution !== undefined) {
      this.appendComment(id, actor, `RESOLUTION: ${patch.resolution}`);
    }
    t.updatedAt = new Date().toISOString();
    return t;
  }

  appendComment(id: string, author: string, body: string): TicketComment {
    const t = this.byId.get(id);
    if (!t) throw new RangeError(`support-tickets: ${id} not found`);
    if (!body || body.trim().length === 0) {
      throw new RangeError('support-tickets: empty comment');
    }
    const comment: TicketComment = {
      id: randomUUID(),
      author,
      body: body.trim().slice(0, 4000),
      postedAt: new Date().toISOString(),
    };
    t.comments.push(comment);
    t.updatedAt = comment.postedAt;
    if (!t.firstResponseAt && !author.toLowerCase().startsWith(t.raisedBy)) {
      t.firstResponseAt = comment.postedAt;
    }
    return comment;
  }

  /** Sweep tickets and auto-escalate any past SLA without a response. */
  sweepEscalations(now: number = Date.now()): TicketEscalation[] {
    const newEscalations: TicketEscalation[] = [];
    for (const t of this.byId.values()) {
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
      t.escalations.push(esc);
      t.assignee = next;
      t.updatedAt = esc.occurredAt;
      newEscalations.push(esc);
    }
    return newEscalations;
  }

  countByStatus(filter: TicketFilter = {}): Record<TicketStatus, number> {
    const out: Record<TicketStatus, number> = {
      open: 0,
      in_progress: 0,
      waiting_customer: 0,
      resolved: 0,
      closed: 0,
    };
    for (const t of this.list(filter)) out[t.status] += 1;
    return out;
  }

  /** Mean time to resolution in hours (only resolved/closed tickets). */
  meanTimeToResolutionHours(filter: TicketFilter = {}): number {
    const closed = this.list(filter).filter(
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

  size(): number {
    return this.byId.size;
  }

  reset(): void {
    this.byId.clear();
  }
}
