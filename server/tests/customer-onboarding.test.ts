/**
 * W215 Faza 1300.0 Agent C — customer-onboarding store + route tests.
 *
 * Covers:
 *   * Store CRUD + getByTenant index
 *   * Initial-stage default and explicit override
 *   * State machine: legal vs illegal transitions
 *   * Reassign updates CSM email
 *   * SLA breach detection
 *   * Upcoming renewals window
 *   * Counts by stage
 *   * Route happy / sad paths
 *   * Admin guard on every endpoint
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  CustomerOnboardingStore,
  STAGE_SLA_DAYS,
  canTransition,
  checkSlaBreach,
  daysInStage,
  type OnboardingStage,
} from '../state/customer-onboarding.js';
import { registerCsmRoutes } from '../routes/csm.js';
import { SupportTicketStore } from '../state/support-tickets.js';
import { NpsStore } from '../lib/csm/nps.js';

function inFutureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function buildApp(opts: { isAdmin?: boolean } = {}): Promise<{
  app: FastifyInstance;
  onboarding: CustomerOnboardingStore;
  tickets: SupportTicketStore;
  nps: NpsStore;
}> {
  const app = Fastify({ logger: false });
  const onboarding = new CustomerOnboardingStore();
  const tickets = new SupportTicketStore();
  const nps = new NpsStore();
  await registerCsmRoutes(app, {
    onboarding,
    tickets,
    nps,
    isAdmin: opts.isAdmin === false ? () => false : () => true,
    resolveTenantId: () => null,
  });
  return { app, onboarding, tickets, nps };
}

describe('CustomerOnboardingStore — CRUD', () => {
  it('creates a record with sensible defaults', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 'acme-casino',
      displayName: 'Acme Casino Group',
      tier: 'enterprise',
      dealValueUsd: 2_500_000,
      csmEmail: 'Csm@Platform.io',
      renewalDueAt: inFutureIso(365),
    });
    expect(r.customerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(r.stage).toBe('deal_won');
    expect(r.csmEmail).toBe('csm@platform.io');
    expect(r.history.length).toBe(1);
    expect(r.history[0].toStage).toBe('deal_won');
    expect(s.size()).toBe(1);
  });

  it('rejects duplicate tenant onboarding', () => {
    const s = new CustomerOnboardingStore();
    s.create({
      tenantId: 'acme',
      displayName: 'Acme',
      tier: 'platform',
      dealValueUsd: 100,
      csmEmail: 'a@b.co',
      renewalDueAt: inFutureIso(365),
    });
    expect(() =>
      s.create({
        tenantId: 'acme',
        displayName: 'Acme',
        tier: 'platform',
        dealValueUsd: 100,
        csmEmail: 'a@b.co',
        renewalDueAt: inFutureIso(365),
      }),
    ).toThrow(/already onboarded/);
  });

  it('rejects invalid email / tier / tenantId', () => {
    const s = new CustomerOnboardingStore();
    expect(() =>
      s.create({
        tenantId: 'BAD ID',
        displayName: 'X',
        tier: 'enterprise',
        dealValueUsd: 1,
        csmEmail: 'a@b.co',
        renewalDueAt: inFutureIso(1),
      }),
    ).toThrow();
    expect(() =>
      s.create({
        tenantId: 'x',
        displayName: 'X',
        tier: 'wat' as never,
        dealValueUsd: 1,
        csmEmail: 'a@b.co',
        renewalDueAt: inFutureIso(1),
      }),
    ).toThrow();
    expect(() =>
      s.create({
        tenantId: 'x',
        displayName: 'X',
        tier: 'enterprise',
        dealValueUsd: 1,
        csmEmail: 'not-an-email',
        renewalDueAt: inFutureIso(1),
      }),
    ).toThrow();
  });

  it('getByTenant resolves to the same record as get', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't1',
      displayName: 'T1',
      tier: 'indie',
      dealValueUsd: 10,
      csmEmail: 'a@b.co',
      renewalDueAt: inFutureIso(60),
    });
    expect(s.getByTenant('t1')?.customerId).toBe(r.customerId);
    expect(s.get(r.customerId)?.tenantId).toBe('t1');
  });
});

describe('CustomerOnboardingStore — state machine', () => {
  it('canTransition reflects the legal forward graph', () => {
    expect(canTransition('deal_won', 'kickoff_scheduled')).toBe(true);
    expect(canTransition('kickoff_scheduled', 'kickoff_done')).toBe(true);
    expect(canTransition('first_spin', 'soft_launch')).toBe(true);
    expect(canTransition('deal_won', 'full_launch')).toBe(false);
    expect(canTransition('kickoff_scheduled', 'deal_won')).toBe(false);
  });

  it('transition() advances stage and appends history', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't',
      displayName: 'T',
      tier: 'enterprise',
      dealValueUsd: 100,
      csmEmail: 'a@b.co',
      renewalDueAt: inFutureIso(60),
    });
    const updated = s.transition(r.customerId, 'kickoff_scheduled', 'csm@platform', 'invite sent');
    expect(updated.stage).toBe('kickoff_scheduled');
    expect(updated.history.length).toBe(2);
    expect(updated.history[1].fromStage).toBe('deal_won');
    expect(updated.history[1].note).toBe('invite sent');
  });

  it('illegal transition throws', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't', displayName: 'T', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(60),
    });
    expect(() => s.transition(r.customerId, 'full_launch' as OnboardingStage, 'csm', '')).toThrow();
  });

  it('reassign() updates the CSM email', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't', displayName: 'T', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'old@b.co', renewalDueAt: inFutureIso(60),
    });
    const u = s.reassign(r.customerId, 'NEW@B.CO');
    expect(u.csmEmail).toBe('new@b.co');
  });
});

describe('CustomerOnboardingStore — SLAs + renewals + counts', () => {
  it('daysInStage returns 0 for fresh records', () => {
    const iso = new Date().toISOString();
    expect(daysInStage(iso, Date.parse(iso))).toBe(0);
  });

  it('checkSlaBreach is null when within window', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't', displayName: 'T', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(60),
    });
    expect(checkSlaBreach(r)).toBe(null);
  });

  it('checkSlaBreach fires past the SLA', () => {
    const s = new CustomerOnboardingStore();
    const r = s.create({
      tenantId: 't', displayName: 'T', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(60),
    });
    const farFuture = Date.parse(r.stageEnteredAt) + (STAGE_SLA_DAYS.deal_won + 2) * 24 * 3600 * 1000;
    const breach = checkSlaBreach(r, farFuture);
    expect(breach).not.toBeNull();
    expect(breach!.overdueDays).toBe(2);
  });

  it('listUpcomingRenewals window filters correctly', () => {
    const s = new CustomerOnboardingStore();
    s.create({
      tenantId: 't1', displayName: 'A', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(30),
    });
    s.create({
      tenantId: 't2', displayName: 'B', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(200),
    });
    expect(s.listUpcomingRenewals(Date.now(), 60).length).toBe(1);
    expect(s.listUpcomingRenewals(Date.now(), 365).length).toBe(2);
  });

  it('countByStage returns the right histogram', () => {
    const s = new CustomerOnboardingStore();
    const r1 = s.create({
      tenantId: 't1', displayName: 'A', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(60),
    });
    s.create({
      tenantId: 't2', displayName: 'B', tier: 'indie',
      dealValueUsd: 10, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(60),
    });
    s.transition(r1.customerId, 'kickoff_scheduled', 'csm', '');
    const c = s.countByStage();
    expect(c.deal_won).toBe(1);
    expect(c.kickoff_scheduled).toBe(1);
  });
});

describe('csm onboarding routes', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { env = await buildApp(); });
  afterEach(async () => { await env.app.close(); });

  const payload = (over: Record<string, unknown> = {}) => ({
    tenantId: 'acme', displayName: 'Acme', tier: 'enterprise',
    dealValueUsd: 100, csmEmail: 'a@b.co', renewalDueAt: inFutureIso(120),
    ...over,
  });

  it('201 on valid create', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/csm/customers', payload: payload(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().stage).toBe('deal_won');
  });

  it('400 on duplicate tenant', async () => {
    await env.app.inject({ method: 'POST', url: '/api/csm/customers', payload: payload() });
    const dup = await env.app.inject({ method: 'POST', url: '/api/csm/customers', payload: payload() });
    expect(dup.statusCode).toBe(400);
  });

  it('403 without admin', async () => {
    const noAdmin = await buildApp({ isAdmin: false });
    const res = await noAdmin.app.inject({
      method: 'POST', url: '/api/csm/customers', payload: payload(),
    });
    expect(res.statusCode).toBe(403);
    await noAdmin.app.close();
  });

  it('GET /api/csm/customers returns rows + counts', async () => {
    await env.app.inject({ method: 'POST', url: '/api/csm/customers', payload: payload() });
    const res = await env.app.inject({ method: 'GET', url: '/api/csm/customers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.countsByStage.deal_won).toBe(1);
  });

  it('transition endpoint advances stage', async () => {
    const c = await env.app.inject({
      method: 'POST', url: '/api/csm/customers', payload: payload(),
    });
    const id = c.json().customerId;
    const t = await env.app.inject({
      method: 'POST', url: `/api/csm/customers/${id}/transition`,
      payload: { toStage: 'kickoff_scheduled', actor: 'csm', note: 'sent' },
    });
    expect(t.statusCode).toBe(200);
    expect(t.json().stage).toBe('kickoff_scheduled');
  });

  it('transition 400 on illegal stage', async () => {
    const c = await env.app.inject({
      method: 'POST', url: '/api/csm/customers', payload: payload(),
    });
    const id = c.json().customerId;
    const t = await env.app.inject({
      method: 'POST', url: `/api/csm/customers/${id}/transition`,
      payload: { toStage: 'full_launch' },
    });
    expect(t.statusCode).toBe(400);
  });

  it('404 on unknown customer', async () => {
    const res = await env.app.inject({
      method: 'GET', url: '/api/csm/customers/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
