/**
 * W212 Faza 600.1 — Custom security-headers audit middleware.
 *
 * Sits *next to* Fastify Helmet (already wired in `server/index.ts`)
 * and exposes an explicit policy object plus per-route overrides. The
 * goals are:
 *
 *  1. Make every header the platform sets discoverable in one place,
 *     so audits don't need to grep the helmet config.
 *  2. Allow docs / pitch / marketplace routes to loosen CSP without
 *     touching the global helmet config.
 *  3. Emit a `securityHeaders.audit()` snapshot the security-audit
 *     script can ingest.
 *
 * The middleware applies its policy on every response; on routes that
 * call `setRouteSecurityPolicy(req, override)` (see helpers below) the
 * override is merged with the default before emit.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface SecurityHeaderPolicy {
  /** HSTS max-age (seconds) and modifiers. */
  hsts: {
    maxAgeSec: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  /** X-Content-Type-Options. */
  contentTypeOptions: 'nosniff';
  /** X-Frame-Options value. */
  frameOptions: 'DENY' | 'SAMEORIGIN';
  /** Content-Security-Policy header value (raw). */
  csp: string;
  /** Referrer-Policy. */
  referrerPolicy:
    | 'no-referrer'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin';
  /** Permissions-Policy header value. */
  permissionsPolicy: string;
}

export const DEFAULT_POLICY: SecurityHeaderPolicy = {
  hsts: { maxAgeSec: 31_536_000, includeSubDomains: true, preload: true },
  contentTypeOptions: 'nosniff',
  // SAMEORIGIN matches the existing Helmet config (GaaS iframe friendly).
  // Audits with the strict-DENY policy template can still call
  // auditSecurityHeaders({ ...DEFAULT_POLICY, frameOptions: 'DENY' }).
  frameOptions: 'SAMEORIGIN',
  csp:
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'self'; " +
    "form-action 'self'; " +
    "report-uri /api/csp-report",
  // Matches the existing Helmet config so we don't downgrade the wire
  // header on existing routes.
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy:
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=()",
};

declare module 'fastify' {
  interface FastifyRequest {
    securityHeaderOverride?: Partial<SecurityHeaderPolicy>;
  }
}

/**
 * Per-request override hook. Call this inside a route handler (or a
 * route-scoped preHandler) to relax CSP for that endpoint only.
 */
export function setRouteSecurityPolicy(
  req: FastifyRequest,
  override: Partial<SecurityHeaderPolicy>
): void {
  req.securityHeaderOverride = { ...(req.securityHeaderOverride ?? {}), ...override };
}

function renderHsts(p: SecurityHeaderPolicy['hsts']): string {
  const parts = [`max-age=${p.maxAgeSec}`];
  if (p.includeSubDomains) parts.push('includeSubDomains');
  if (p.preload) parts.push('preload');
  return parts.join('; ');
}

function applyHeaders(
  reply: FastifyReply,
  policy: SecurityHeaderPolicy
): void {
  reply.header('Strict-Transport-Security', renderHsts(policy.hsts));
  reply.header('X-Content-Type-Options', policy.contentTypeOptions);
  reply.header('X-Frame-Options', policy.frameOptions);
  reply.header('Content-Security-Policy', policy.csp);
  reply.header('Referrer-Policy', policy.referrerPolicy);
  reply.header('Permissions-Policy', policy.permissionsPolicy);
}

export interface RegisterSecurityHeadersOptions {
  /** Override the default policy globally. */
  policy?: Partial<SecurityHeaderPolicy>;
  /**
   * Prefix → override map. The first matching prefix wins; route-level
   * overrides via {@link setRouteSecurityPolicy} take precedence.
   */
  routePrefixOverrides?: Record<string, Partial<SecurityHeaderPolicy>>;
}

export async function registerSecurityHeaders(
  app: FastifyInstance,
  opts: RegisterSecurityHeadersOptions = {}
): Promise<void> {
  const base: SecurityHeaderPolicy = { ...DEFAULT_POLICY, ...(opts.policy ?? {}) };
  const overrides = opts.routePrefixOverrides ?? {};
  app.addHook('onSend', async (req, reply, payload) => {
    let effective: SecurityHeaderPolicy = base;
    for (const [prefix, ov] of Object.entries(overrides)) {
      if (req.url.startsWith(prefix)) {
        effective = { ...effective, ...ov };
        break;
      }
    }
    if (req.securityHeaderOverride) {
      effective = { ...effective, ...req.securityHeaderOverride };
    }
    applyHeaders(reply, effective);
    return payload;
  });
}

/**
 * Auditable snapshot for the W212 security-audit script.
 */
export function auditSecurityHeaders(
  policy: SecurityHeaderPolicy = DEFAULT_POLICY
): Array<{ name: string; value: string; verdict: 'pass' | 'warn' | 'fail'; note?: string }> {
  const out: Array<{
    name: string;
    value: string;
    verdict: 'pass' | 'warn' | 'fail';
    note?: string;
  }> = [];
  out.push({
    name: 'Strict-Transport-Security',
    value: renderHsts(policy.hsts),
    verdict: policy.hsts.maxAgeSec >= 31_536_000 ? 'pass' : 'warn',
    ...(policy.hsts.maxAgeSec < 31_536_000 ? { note: 'max-age < 1y' } : {}),
  });
  out.push({
    name: 'X-Content-Type-Options',
    value: policy.contentTypeOptions,
    verdict: policy.contentTypeOptions === 'nosniff' ? 'pass' : 'fail',
  });
  out.push({
    name: 'X-Frame-Options',
    value: policy.frameOptions,
    verdict: policy.frameOptions === 'DENY' ? 'pass' : 'warn',
    ...(policy.frameOptions === 'SAMEORIGIN' ? { note: 'GaaS iframe friendly but loosened' } : {}),
  });
  out.push({
    name: 'Content-Security-Policy',
    value: policy.csp,
    verdict: /default-src 'self'/.test(policy.csp) ? 'pass' : 'fail',
  });
  out.push({
    name: 'Referrer-Policy',
    value: policy.referrerPolicy,
    verdict: policy.referrerPolicy === 'no-referrer' || policy.referrerPolicy.startsWith('strict-')
      ? 'pass'
      : (policy.referrerPolicy === 'same-origin' ? 'pass' : 'warn'),
  });
  out.push({
    name: 'Permissions-Policy',
    value: policy.permissionsPolicy,
    verdict: /camera=\(\)/.test(policy.permissionsPolicy) ? 'pass' : 'warn',
  });
  return out;
}
