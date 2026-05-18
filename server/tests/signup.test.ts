/**
 * CORTI W206-ONBOARDING — signup route tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { TenantStore } from '../state/tenants.js';
import { LicenseStore } from '../state/licenses.js';
import { EmailSender } from '../lib/email.js';
import {
  registerSignupRoutes,
  validatePassword,
  emailTaken,
  resetSignupModuleState,
} from '../routes/signup.js';

async function buildSignupApp(): Promise<{
  app: FastifyInstance;
  tenants: TenantStore;
  licenses: LicenseStore;
  email: EmailSender;
}> {
  const app = Fastify({ logger: false });
  const tenants = new TenantStore();
  const licenses = new LicenseStore();
  const email = new EmailSender({ devLog: false });
  await registerSignupRoutes(app, { tenants, licenses, email, autoVerify: true });
  return { app, tenants, licenses, email };
}

describe('signup · validation helpers', () => {
  beforeEach(() => resetSignupModuleState());

  it('rejects passwords under 10 chars', () => {
    const r = validatePassword('Aa1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('password_too_short');
  });

  it('requires uppercase, lowercase, digit', () => {
    expect(validatePassword('alllowercase1').ok).toBe(false);
    expect(validatePassword('ALLUPPER1XYZ').ok).toBe(false);
    expect(validatePassword('NoDigitsHere').ok).toBe(false);
    expect(validatePassword('GoodPass123!').ok).toBe(true);
  });

  it('emailTaken returns false for empty store', () => {
    const lic = new LicenseStore();
    expect(emailTaken(lic, 'nobody@example.com')).toBe(false);
  });

  it('emailTaken returns true after creating a license', () => {
    const lic = new LicenseStore();
    lic.create({
      tenantId: 't1',
      tier: 'trial',
      email: 'taken@example.com',
      company: 'X',
      useCase: 'demo',
    });
    expect(emailTaken(lic, 'taken@example.com')).toBe(true);
    expect(emailTaken(lic, 'TAKEN@EXAMPLE.COM')).toBe(true);
  });
});

describe('POST /api/signup', () => {
  let env: Awaited<ReturnType<typeof buildSignupApp>>;

  beforeEach(async () => {
    resetSignupModuleState();
    env = await buildSignupApp();
  });
  afterEach(async () => {
    await env.app.close();
  });

  const validPayload = (override: Partial<Record<string, unknown>> = {}) => ({
    email: 'boki@example.com',
    company: 'Acme Slots LLC',
    jurisdiction: 'UKGC',
    useCase: 'L&W cert pipeline',
    password: 'Sup3rSecret!',
    ...override,
  });

  it('creates tenant + trial license + returns 201', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tenantId).toMatch(/^acme-slots-llc-/);
    expect(body.licenseKey).toMatch(/^lic_[0-9a-f]{32}$/);
    expect(body.tier).toBe('trial');
    expect(body.verified).toBe(true);
    expect(typeof body.trialExpiresAt).toBe('string');
    expect(env.tenants.get(body.tenantId)).not.toBeNull();
    expect(env.licenses.get(body.licenseKey)).not.toBeNull();
  });

  it('sends welcome + verify emails', async () => {
    await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'mail@example.com' }),
    });
    const inbox = env.email.outboxFor('mail@example.com');
    expect(inbox.length).toBe(2);
    expect(inbox.map((m) => m.template).sort()).toEqual(['verify', 'welcome']);
  });

  it('rejects invalid email', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'not-an-email' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_email');
  });

  it('rejects short company', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ company: 'X' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown jurisdiction', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ jurisdiction: 'ATLANTIS' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_jurisdiction');
  });

  it('rejects weak password', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ password: 'weak' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate email with 409', async () => {
    await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'dup@example.com' }),
    });
    const second = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'dup@example.com', company: 'Other Co' }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('email_already_registered');
  });

  it('trial expiry is ~30 days from createdAt', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'time@example.com' }),
    });
    const body = res.json();
    const created = Date.now();
    const exp = new Date(body.trialExpiresAt).getTime();
    const days = (exp - created) / 86_400_000;
    expect(days).toBeGreaterThan(29.5);
    expect(days).toBeLessThan(30.5);
  });

  it('check-email returns taken=false initially, true after signup', async () => {
    const before = await env.app.inject({
      method: 'GET',
      url: '/api/signup/check-email?email=fresh@example.com',
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().taken).toBe(false);
    await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'fresh@example.com' }),
    });
    const after = await env.app.inject({
      method: 'GET',
      url: '/api/signup/check-email?email=fresh@example.com',
    });
    expect(after.json().taken).toBe(true);
  });

  it('verify endpoint flips token state', async () => {
    const signup = await env.app.inject({
      method: 'POST',
      url: '/api/signup',
      payload: validPayload({ email: 'v@example.com' }),
    });
    const { verifyToken } = signup.json();
    const v = await env.app.inject({
      method: 'POST',
      url: '/api/signup/verify',
      payload: { token: verifyToken },
    });
    expect(v.statusCode).toBe(200);
    expect(v.json().verified).toBe(true);
  });

  it('verify endpoint 404 on unknown token', async () => {
    const v = await env.app.inject({
      method: 'POST',
      url: '/api/signup/verify',
      payload: { token: 'vt_unknown' },
    });
    expect(v.statusCode).toBe(404);
  });
});
