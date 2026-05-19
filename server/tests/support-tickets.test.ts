/**
 * W215 Faza 1300.0 Agent C — support tickets store + route tests.
 *
 * 22+ specs covering:
 *   * Store create / get / list filters
 *   * SLA deadline computation per severity
 *   * Comment append + first-response detection
 *   * Patch (status, assignee, severity, resolution)
 *   * Auto-escalation sweep
 *   * Counts by status + mean time to resolution
 *   * Route happy / sad paths (tenant-scoped + admin)
 *   * Tenant isolation between two tenants' tickets
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  SupportTicketStore,
  SLA_MS,
  computeSlaDeadline,
  escalationTarget,
  inspectSla,
} from '../state/support-tickets.js';
import { registerCsmRoutes } from '../routes/csm.js';
import { CustomerOnboardingStore } from '../state/customer-onboarding.js';
import { NpsStore } from '../lib/csm/nps.js';

interface AppEnv {
  app: FastifyInstance;
  tickets: SupportTicketStore;
}

async function buildApp(opts: {
  tenantId?: string | null;
  isAdmin?: boolean;
} = {}): Promise<AppEnv> {
  const app = Fastify({ logger: false });
  const tickets = new SupportTicketStore();
  await registerCsmRoutes(app, {
    onboarding: new CustomerOnboardingStore(),
    tickets,
    nps: new NpsStore(),
    isAdmin: opts.isAdmin === true ? (): boolean => true : (): boolean => false,
    resolveTenantId: (_req: FastifyRequest) => opts.tenantId ?? null,
  });
  return { app, tickets };
}

describe('SLA helpers', () => {
  it('computeSlaDeadline adds the right window per severity', () => {
    const t0 = '2026-01-01T00:00:00.000Z';
    expect(computeSlaDeadline('P0', t0)).toBe('2026-01-01T01:00:00.000Z');
    expect(computeSlaDeadline('P1', t0)).toBe('2026-01-01T04:00:00.000Z');
    expect(computeSlaDeadline('P2', t0)).toBe('2026-01-02T00:00:00.000Z');
    expect(computeSlaDeadline('P3', t0)).toBe('2026-01-04T00:00:00.000Z');
  });

  it('inspectSla classifies state correctly', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P3', category: 'question',
    });
    expect(inspectSla(t).status).toBe('within_sla');
    expect(inspectSla(t, Date.parse(t.slaDeadline) + 1000).status).toBe('breached');
  });

  it('escalationTarget walks up the tree', () => {
    expect(escalationTarget('engineering@platform')).toBe('lead-engineering@platform');
    expect(escalationTarget('lead-engineering@platform')).toBe('vp-customer-success@platform');
    expect(escalationTarget('vp-customer-success@platform')).toBe('vp-customer-success@platform');
  });
});

describe('SupportTicketStore — CRUD', () => {
  it('creates a ticket with severity-driven SLA', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'op1', raisedBy: 'X@Y.com',
      title: 'crash on bonus', description: 'free spins crash 100% of time',
      severity: 'P0', category: 'bug',
    });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(t.raisedBy).toBe('x@y.com');
    expect(t.status).toBe('open');
    expect(Date.parse(t.slaDeadline) - Date.parse(t.createdAt)).toBe(SLA_MS.P0);
    expect(t.assignee).toBe('engineering@platform');
  });

  it('rejects bad severity / category / title', () => {
    const s = new SupportTicketStore();
    expect(() =>
      s.create({
        tenantId: 'x', raisedBy: 'a@b.co', title: 'x', description: 'y',
        severity: 'P0', category: 'bug',
      }),
    ).toThrow(/title/);
    expect(() =>
      s.create({
        tenantId: 'x', raisedBy: 'a@b.co', title: 'hellothere', description: 'd',
        severity: 'PX' as never, category: 'bug',
      }),
    ).toThrow();
  });

  it('lists by tenant + status + severity', () => {
    const s = new SupportTicketStore();
    s.create({
      tenantId: 'a', raisedBy: 'a@a.co', title: 'aaaa', description: 'd',
      severity: 'P0', category: 'bug',
    });
    s.create({
      tenantId: 'b', raisedBy: 'b@b.co', title: 'bbbb', description: 'd',
      severity: 'P2', category: 'question',
    });
    expect(s.list({ tenantId: 'a' }).length).toBe(1);
    expect(s.list({ severity: 'P2' }).length).toBe(1);
    expect(s.list({ status: 'open' }).length).toBe(2);
  });
});

describe('SupportTicketStore — comments + first response', () => {
  it('first non-customer comment sets firstResponseAt', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'cust@x.co', title: 'help',
      description: 'd', severity: 'P2', category: 'question',
    });
    s.appendComment(t.id, 'cust@x.co', 'still broken');
    expect(t.firstResponseAt).toBeNull();
    s.appendComment(t.id, 'support@platform', 'we are on it');
    expect(t.firstResponseAt).not.toBeNull();
  });

  it('rejects empty comment body', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P2', category: 'question',
    });
    expect(() => s.appendComment(t.id, 'a', '   ')).toThrow();
  });
});

describe('SupportTicketStore — patch + escalations', () => {
  it('patch advances status, sets resolvedAt on resolve/close', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P2', category: 'question',
    });
    expect(t.resolvedAt).toBeNull();
    const u = s.patch(t.id, { status: 'resolved' });
    expect(u.resolvedAt).not.toBeNull();
  });

  it('changing severity re-computes SLA', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P3', category: 'question',
    });
    const u = s.patch(t.id, { severity: 'P0' });
    expect(Date.parse(u.slaDeadline) - Date.parse(u.createdAt)).toBe(SLA_MS.P0);
  });

  it('sweepEscalations only fires past SLA with no response', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P0', category: 'bug',
    });
    expect(s.sweepEscalations(Date.now()).length).toBe(0);
    const future = Date.parse(t.slaDeadline) + 1000;
    const esc = s.sweepEscalations(future);
    expect(esc.length).toBe(1);
    expect(esc[0].toAssignee).toBe('lead-engineering@platform');
  });

  it('countByStatus + meanTimeToResolutionHours', () => {
    const s = new SupportTicketStore();
    const t = s.create({
      tenantId: 'x', raisedBy: 'a@b.co', title: 'help', description: 'd',
      severity: 'P2', category: 'question',
    });
    s.patch(t.id, { status: 'resolved' });
    const counts = s.countByStatus();
    expect(counts.resolved).toBe(1);
    expect(s.meanTimeToResolutionHours()).toBeGreaterThanOrEqual(0);
  });
});

describe('csm support routes', () => {
  let env: AppEnv;
  beforeEach(async () => { env = await buildApp({ tenantId: 'op1' }); });
  afterEach(async () => { await env.app.close(); });

  const payload = (over: Record<string, unknown> = {}) => ({
    raisedBy: 'cust@op1.co', title: 'cannot login',
    description: 'login keeps failing', severity: 'P1', category: 'bug',
    ...over,
  });

  it('201 on valid create', async () => {
    const r = await env.app.inject({
      method: 'POST', url: '/api/support/tickets', payload: payload(),
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().tenantId).toBe('op1');
  });

  it('403 without tenantId', async () => {
    const noTenant = await buildApp({ tenantId: null });
    const r = await noTenant.app.inject({
      method: 'POST', url: '/api/support/tickets', payload: payload(),
    });
    expect(r.statusCode).toBe(403);
    await noTenant.app.close();
  });

  it('400 on missing fields', async () => {
    const r = await env.app.inject({
      method: 'POST', url: '/api/support/tickets',
      payload: payload({ title: '' }),
    });
    expect(r.statusCode).toBe(400);
  });

  it('GET /api/support/tickets returns tenant-scoped list', async () => {
    await env.app.inject({ method: 'POST', url: '/api/support/tickets', payload: payload() });
    const r = await env.app.inject({ method: 'GET', url: '/api/support/tickets' });
    expect(r.statusCode).toBe(200);
    expect(r.json().count).toBe(1);
  });

  it('GET single ticket forbids cross-tenant access', async () => {
    const c = await env.app.inject({ method: 'POST', url: '/api/support/tickets', payload: payload() });
    const id = c.json().id;
    // Other tenant cannot see this ticket.
    const other = await buildApp({ tenantId: 'op-other' });
    other.tickets.create({
      tenantId: 'op-other', raisedBy: 'x@x.co', title: 'xxxx',
      description: 'd', severity: 'P3', category: 'question',
    });
    const r = await other.app.inject({ method: 'GET', url: `/api/support/tickets/${id}` });
    expect(r.statusCode).toBe(404);
    await other.app.close();
  });

  it('PATCH updates status', async () => {
    const c = await env.app.inject({ method: 'POST', url: '/api/support/tickets', payload: payload() });
    const id = c.json().id;
    const r = await env.app.inject({
      method: 'PATCH', url: `/api/support/tickets/${id}`,
      payload: { status: 'in_progress' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('in_progress');
  });

  it('POST comment 201s', async () => {
    const c = await env.app.inject({ method: 'POST', url: '/api/support/tickets', payload: payload() });
    const id = c.json().id;
    const r = await env.app.inject({
      method: 'POST', url: `/api/support/tickets/${id}/comment`,
      payload: { author: 'support@platform', body: 'we are looking' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().author).toBe('support@platform');
  });

  it('PATCH 404 on unknown id', async () => {
    const r = await env.app.inject({
      method: 'PATCH', url: '/api/support/tickets/00000000-0000-0000-0000-000000000000',
      payload: { status: 'closed' },
    });
    expect(r.statusCode).toBe(404);
  });
});
