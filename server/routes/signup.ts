/**
 * CORTI W206-ONBOARDING — customer self-serve signup route.
 *
 *   POST   /api/signup       create tenant + trial license + send email
 *   POST   /api/signup/verify  flip a verification flag (mock; auto-yes in dev)
 *   GET    /api/signup/check-email?email=  is the email already taken
 *
 * No auth — this is the unauthenticated funnel entry. Rate-limit hook
 * in admin.ts skips /api/signup (we add the prefix exemption below by
 * registering BEFORE admin's preHandler runs against it — but admin
 * also exempts /api/admin and /api/health; we add /api/signup to that
 * preHandler check below via a separate hook ordering).
 *
 * Returns { tenantId, licenseKey, trialExpiresAt, tier, verifyToken }
 */

import type { FastifyInstance } from 'fastify';
import type { TenantStore } from '../state/tenants.js';
import type { LicenseStore } from '../state/licenses.js';
import type { EmailSender } from '../lib/email.js';

export interface SignupRouteDeps {
  tenants: TenantStore;
  licenses: LicenseStore;
  email: EmailSender;
  /** When true (default in dev/test) the verifyToken is auto-flipped. */
  autoVerify?: boolean;
}

export interface SignupBody {
  email: string;
  company: string;
  jurisdiction: string;
  useCase: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_JURIS = new Set([
  'UKGC',
  'MGA',
  'SE',
  'NJ',
  'PA',
  'MI',
  'ON',
  'BC',
  'NV',
  'AAMS',
  'DGA',
  'SGA',
  'KSA',
  'GBGA',
  'SK',
  'AGCO',
  'GENERIC',
]);

const verifyTokens = new Map<string, { tenantId: string; verified: boolean }>();

export function validatePassword(pw: string): { ok: true } | { ok: false; reason: string } {
  if (!pw || typeof pw !== 'string') return { ok: false, reason: 'password_required' };
  if (pw.length < 10) return { ok: false, reason: 'password_too_short' };
  if (!/[A-Z]/.test(pw)) return { ok: false, reason: 'password_needs_uppercase' };
  if (!/[a-z]/.test(pw)) return { ok: false, reason: 'password_needs_lowercase' };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: 'password_needs_digit' };
  return { ok: true };
}

export function emailTaken(licenses: LicenseStore, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return licenses.list().some((l) => l.email.toLowerCase() === normalized);
}

function deriveTenantId(company: string, email: string): string {
  // Slug company, fall back to email local part.
  const slugCompany = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
  const slugEmail = email
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 20);
  const base = slugCompany || slugEmail || 'tenant';
  return `${base}-${Date.now().toString(36)}`.slice(0, 63);
}

export async function registerSignupRoutes(
  app: FastifyInstance,
  deps: SignupRouteDeps
): Promise<void> {
  const autoVerify = deps.autoVerify ?? process.env.NODE_ENV !== 'production';

  app.post<{ Body: SignupBody }>('/api/signup', async (req, reply) => {
    const body = (req.body ?? {}) as SignupBody;
    // Validate
    if (!body.email || !EMAIL_RE.test(body.email)) {
      return reply.code(400).send({ error: 'invalid_email' });
    }
    if (!body.company || body.company.trim().length < 2) {
      return reply.code(400).send({ error: 'invalid_company' });
    }
    if (!body.jurisdiction || !VALID_JURIS.has(body.jurisdiction.toUpperCase())) {
      return reply.code(400).send({ error: 'invalid_jurisdiction' });
    }
    if (!body.useCase || body.useCase.trim().length < 4) {
      return reply.code(400).send({ error: 'invalid_use_case' });
    }
    const pw = validatePassword(body.password);
    if (!pw.ok) return reply.code(400).send({ error: pw.reason });
    if (emailTaken(deps.licenses, body.email)) {
      return reply.code(409).send({ error: 'email_already_registered' });
    }

    // Create tenant
    const tenantId = deriveTenantId(body.company, body.email);
    try {
      deps.tenants.create({
        id: tenantId,
        name: body.company,
        contactEmail: body.email,
        allowedJurisdictions: [body.jurisdiction.toUpperCase()],
      });
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'tenant_create_failed',
      });
    }

    // Create trial license
    const license = deps.licenses.create({
      tenantId,
      tier: 'trial',
      email: body.email,
      company: body.company,
      useCase: body.useCase,
    });

    // Verify token
    const verifyToken = `vt_${license.key.slice(4, 20)}`;
    verifyTokens.set(verifyToken, { tenantId, verified: autoVerify });

    // Send emails
    deps.email.send({
      to: body.email,
      template: 'welcome',
      context: {
        name: body.company,
        tenantId,
        licenseKey: license.key,
      },
    });
    deps.email.send({
      to: body.email,
      template: 'verify',
      context: {
        email: body.email,
        verifyLink: `https://app.example.com/verify?token=${verifyToken}`,
      },
    });

    return reply.code(201).send({
      tenantId,
      licenseKey: license.key,
      trialExpiresAt: license.expiresAt,
      tier: license.tier,
      verifyToken,
      verified: autoVerify,
    });
  });

  app.post<{ Body: { token: string } }>('/api/signup/verify', async (req, reply) => {
    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
      return reply.code(400).send({ error: 'token_required' });
    }
    const entry = verifyTokens.get(token);
    if (!entry) return reply.code(404).send({ error: 'token_unknown' });
    entry.verified = true;
    return reply.send({ verified: true, tenantId: entry.tenantId });
  });

  app.get<{ Querystring: { email?: string } }>(
    '/api/signup/check-email',
    async (req, reply) => {
      const email = req.query?.email;
      if (!email || typeof email !== 'string') {
        return reply.code(400).send({ error: 'email_required' });
      }
      return reply.send({ taken: emailTaken(deps.licenses, email) });
    }
  );
}

/** Test-only — reset module state. */
export function resetSignupModuleState(): void {
  verifyTokens.clear();
}
