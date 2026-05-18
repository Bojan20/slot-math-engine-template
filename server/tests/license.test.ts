/**
 * CORTI W206-ONBOARDING — license route + store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import {
  LicenseStore,
  TIER_LIMITS,
  makeLicenseKey,
  dailyBucket,
  monthlyBucket,
} from '../state/licenses.js';
import { EmailSender } from '../lib/email.js';
import { registerLicenseRoutes } from '../routes/license.js';

const TRIAL_DAYS = 30;
const DAY_MS = 86_400_000;

async function buildApp(): Promise<{
  app: FastifyInstance;
  licenses: LicenseStore;
  email: EmailSender;
}> {
  const app = Fastify({ logger: false });
  const licenses = new LicenseStore();
  const email = new EmailSender({ devLog: false });
  await registerLicenseRoutes(app, { licenses, email });
  return { app, licenses, email };
}

describe('LicenseStore · core', () => {
  it('TIER_LIMITS shape is well-formed for all 3 tiers', () => {
    expect(TIER_LIMITS.trial.priceUsdPerMonth).toBe(0);
    expect(TIER_LIMITS.pro.priceUsdPerMonth).toBe(5000);
    expect(TIER_LIMITS.enterprise.priceUsdPerMonth).toBe(25000);
    expect(TIER_LIMITS.enterprise.maxGames).toBe(-1);
  });

  it('makeLicenseKey is deterministic per seed', () => {
    const a = makeLicenseKey('seed-1');
    const b = makeLicenseKey('seed-1');
    expect(a).toBe(b);
    expect(a).toMatch(/^lic_[0-9a-f]{32}$/);
  });

  it('create issues a trial with 30-day expiry', () => {
    const s = new LicenseStore();
    const now = new Date('2026-05-18T00:00:00Z');
    const lic = s.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'a@b.co',
      company: 'X',
      useCase: 'demo',
      createdAt: now.toISOString(),
    });
    const expDays = (new Date(lic.expiresAt).getTime() - now.getTime()) / DAY_MS;
    expect(expDays).toBeCloseTo(TRIAL_DAYS, 1);
  });

  it('getByTenant returns the license for a tenant', () => {
    const s = new LicenseStore();
    const lic = s.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'a@b.co',
      company: 'X',
      useCase: 'demo',
    });
    expect(s.getByTenant('t1')?.key).toBe(lic.key);
    expect(s.getByTenant('unknown')).toBeNull();
  });

  it('recordUsage increments and caps games per tier', () => {
    const s = new LicenseStore();
    const lic = s.create({ tenantId: 't1', tier: 'trial', email: 'a@b.co', company: 'X', useCase: 'demo' });
    for (let i = 0; i < 3; i++) expect(s.recordUsage(lic.key, 'game').ok).toBe(true);
    const fourth = s.recordUsage(lic.key, 'game');
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe('games_cap_exceeded');
  });

  it('recordUsage rolls daily mc_run bucket', () => {
    const s = new LicenseStore();
    const lic = s.create({ tenantId: 't1', tier: 'trial', email: 'a@b.co', company: 'X', useCase: 'demo' });
    const today = new Date('2026-05-18T10:00:00Z');
    const tomorrow = new Date('2026-05-19T10:00:00Z');
    for (let i = 0; i < 50; i++) s.recordUsage(lic.key, 'mc_run', today);
    expect(s.recordUsage(lic.key, 'mc_run', today).ok).toBe(false);
    expect(s.recordUsage(lic.key, 'mc_run', tomorrow).ok).toBe(true);
  });

  it('upgrade flips tier and resets expiresAt', () => {
    const s = new LicenseStore();
    const lic = s.create({ tenantId: 't1', tier: 'trial', email: 'a@b.co', company: 'X', useCase: 'demo' });
    const oldExpiry = lic.expiresAt;
    const upgraded = s.upgrade(lic.key, 'pro');
    expect(upgraded.tier).toBe('pro');
    expect(upgraded.expiresAt > oldExpiry).toBe(true);
  });

  it('checkExpiry returns warn within 5 days of expiry', () => {
    const s = new LicenseStore();
    const created = new Date('2026-05-18T00:00:00Z');
    const lic = s.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'a@b.co',
      company: 'X',
      useCase: 'demo',
      createdAt: created.toISOString(),
    });
    const day25 = new Date(created.getTime() + 25 * DAY_MS);
    const res = s.checkExpiry(lic.key, day25);
    expect(res.state).toBe('warn');
    expect(res.daysUntil).toBeLessThanOrEqual(5);
  });

  it('checkExpiry returns lockout >1d past expiry and locks the license', () => {
    const s = new LicenseStore();
    const created = new Date('2026-05-18T00:00:00Z');
    const lic = s.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'a@b.co',
      company: 'X',
      useCase: 'demo',
      createdAt: created.toISOString(),
    });
    const day31 = new Date(created.getTime() + 31 * DAY_MS + 1);
    const res = s.checkExpiry(lic.key, day31);
    expect(res.state).toBe('lockout');
    expect(s.get(lic.key)?.status).toBe('locked');
  });

  it('dailyBucket and monthlyBucket emit ISO-prefixes', () => {
    const d = new Date('2026-05-18T10:23:00Z');
    expect(dailyBucket(d)).toBe('2026-05-18');
    expect(monthlyBucket(d)).toBe('2026-05');
  });
});

describe('License HTTP API', () => {
  let env: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    env = await buildApp();
  });
  afterEach(async () => {
    await env.app.close();
  });

  it('POST /api/license/verify returns valid:true for active license', async () => {
    const lic = env.licenses.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'a@b.co',
      company: 'X',
      useCase: 'demo',
    });
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/license/verify',
      payload: { licenseKey: lic.key },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.tier).toBe('trial');
    expect(body.features.maxGames).toBe(TIER_LIMITS.trial.maxGames);
  });

  it('POST /api/license/verify returns valid:false for unknown key', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/license/verify',
      payload: { licenseKey: 'lic_00000000000000000000000000000000' },
    });
    expect(res.json().valid).toBe(false);
  });

  it('GET /api/license/:tenantId/usage exposes caps + remaining', async () => {
    env.licenses.create({
      tenantId: 't-usage',
      tier: 'trial',
      email: 'u@b.co',
      company: 'X',
      useCase: 'demo',
    });
    const res = await env.app.inject({
      method: 'GET',
      url: '/api/license/t-usage/usage',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tier).toBe('trial');
    expect(body.remaining.games).toBe(TIER_LIMITS.trial.maxGames);
  });

  it('POST /api/license/:tenantId/upgrade flips to pro', async () => {
    env.licenses.create({
      tenantId: 't-up',
      tier: 'trial',
      email: 'up@b.co',
      company: 'X',
      useCase: 'demo',
    });
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/license/t-up/upgrade',
      payload: { tier: 'pro' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tier).toBe('pro');
    const inbox = env.email.outboxFor('up@b.co');
    expect(inbox.some((m) => m.template === 'upgrade')).toBe(true);
  });

  it('POST /api/license/:tenantId/upgrade rejects invalid tier', async () => {
    env.licenses.create({
      tenantId: 't-bad',
      tier: 'trial',
      email: 'bad@b.co',
      company: 'X',
      useCase: 'demo',
    });
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/license/t-bad/upgrade',
      payload: { tier: 'mega' as unknown },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/license/:tenantId/usage caps at trial limit and 429s', async () => {
    env.licenses.create({
      tenantId: 't-cap',
      tier: 'trial',
      email: 'cap@b.co',
      company: 'X',
      useCase: 'demo',
    });
    for (let i = 0; i < 3; i++) {
      const ok = await env.app.inject({
        method: 'POST',
        url: '/api/license/t-cap/usage',
        payload: { kind: 'game' },
      });
      expect(ok.statusCode).toBe(200);
    }
    const deny = await env.app.inject({
      method: 'POST',
      url: '/api/license/t-cap/usage',
      payload: { kind: 'game' },
    });
    expect(deny.statusCode).toBe(429);
  });

  it('GET /api/license/:tenantId/expiry returns ok for fresh trial', async () => {
    env.licenses.create({
      tenantId: 't-fresh',
      tier: 'trial',
      email: 'f@b.co',
      company: 'X',
      useCase: 'demo',
    });
    const res = await env.app.inject({
      method: 'GET',
      url: '/api/license/t-fresh/expiry',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('ok');
  });

  it('GET /api/license/:tenantId/expiry returns 404 for unknown tenant', async () => {
    const res = await env.app.inject({
      method: 'GET',
      url: '/api/license/no-such/expiry',
    });
    expect(res.statusCode).toBe(404);
  });
});
