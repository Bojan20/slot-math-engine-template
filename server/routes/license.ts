/**
 * CORTI W206-ONBOARDING — license API.
 *
 *   POST  /api/license/verify             body { licenseKey } → { valid, tier, expiresAt, features }
 *   GET   /api/license/:tenantId/usage    daily/monthly metrics + caps + remaining
 *   POST  /api/license/:tenantId/upgrade  body { tier } request upgrade to pro/enterprise
 *   POST  /api/license/:tenantId/usage    body { kind } record game/mc_run/cert_sub (cap-checked)
 *   GET   /api/license/:tenantId/expiry   trial expiry classification + warning/lockout fire
 *
 * Trial expiry hooks fire here on /expiry probe — the operator-side
 * cron would simply call this endpoint for each trial tenant once a
 * day. That keeps the cron lockless and the lockout deterministic.
 */

import type { FastifyInstance } from 'fastify';
import {
  type LicenseStore,
  type LicenseTier,
  TIER_LIMITS,
} from '../state/licenses.js';
import type { EmailSender } from '../lib/email.js';

export interface LicenseRouteDeps {
  licenses: LicenseStore;
  email: EmailSender;
}

export async function registerLicenseRoutes(
  app: FastifyInstance,
  deps: LicenseRouteDeps
): Promise<void> {
  app.post<{ Body: { licenseKey?: string } }>('/api/license/verify', async (req, reply) => {
    const key = req.body?.licenseKey;
    if (!key || typeof key !== 'string') {
      return reply.code(400).send({ error: 'license_key_required' });
    }
    const license = deps.licenses.get(key);
    if (!license) {
      return reply.send({ valid: false, reason: 'unknown' });
    }
    const exp = deps.licenses.checkExpiry(key);
    const limits = TIER_LIMITS[license.tier];
    return reply.send({
      valid: license.status === 'active',
      tenantId: license.tenantId,
      tier: license.tier,
      status: license.status,
      expiresAt: license.expiresAt,
      expiryState: exp.state,
      daysUntilExpiry: exp.daysUntil,
      features: {
        maxGames: limits.maxGames,
        mcRunsPerDay: limits.mcRunsPerDay,
        certSubmissionsPerMonth: limits.certSubmissionsPerMonth,
        supportLevel: limits.supportLevel,
      },
    });
  });

  app.get<{ Params: { tenantId: string } }>(
    '/api/license/:tenantId/usage',
    async (req, reply) => {
      const license = deps.licenses.getByTenant(req.params.tenantId);
      if (!license) return reply.code(404).send({ error: 'license_not_found' });
      const limits = TIER_LIMITS[license.tier];
      const remaining = (cap: number, used: number): number =>
        cap === -1 ? -1 : Math.max(0, cap - used);
      return reply.send({
        tenantId: license.tenantId,
        tier: license.tier,
        status: license.status,
        usage: license.usage,
        limits: {
          maxGames: limits.maxGames,
          mcRunsPerDay: limits.mcRunsPerDay,
          certSubmissionsPerMonth: limits.certSubmissionsPerMonth,
        },
        remaining: {
          games: remaining(limits.maxGames, license.usage.gamesCreated),
          mcRunsToday: remaining(limits.mcRunsPerDay, license.usage.mcRunsToday),
          certSubsThisMonth: remaining(
            limits.certSubmissionsPerMonth,
            license.usage.certSubmissionsThisMonth
          ),
        },
      });
    }
  );

  app.post<{ Params: { tenantId: string }; Body: { tier?: LicenseTier } }>(
    '/api/license/:tenantId/upgrade',
    async (req, reply) => {
      const newTier = req.body?.tier;
      if (newTier !== 'pro' && newTier !== 'enterprise') {
        return reply.code(400).send({ error: 'invalid_tier' });
      }
      const license = deps.licenses.getByTenant(req.params.tenantId);
      if (!license) return reply.code(404).send({ error: 'license_not_found' });
      const updated = deps.licenses.upgrade(license.key, newTier);
      deps.email.send({
        to: license.email,
        template: 'upgrade',
        context: { email: license.email, tier: newTier },
      });
      return reply.send({
        ok: true,
        tier: updated.tier,
        expiresAt: updated.expiresAt,
        status: updated.status,
      });
    }
  );

  app.post<{
    Params: { tenantId: string };
    Body: { kind?: 'game' | 'mc_run' | 'cert_sub' };
  }>('/api/license/:tenantId/usage', async (req, reply) => {
    const license = deps.licenses.getByTenant(req.params.tenantId);
    if (!license) return reply.code(404).send({ error: 'license_not_found' });
    const kind = req.body?.kind;
    if (kind !== 'game' && kind !== 'mc_run' && kind !== 'cert_sub') {
      return reply.code(400).send({ error: 'invalid_kind' });
    }
    const res = deps.licenses.recordUsage(license.key, kind);
    if (!res.ok) return reply.code(429).send(res);
    return reply.send({ ok: true, usage: license.usage });
  });

  app.get<{ Params: { tenantId: string } }>(
    '/api/license/:tenantId/expiry',
    async (req, reply) => {
      const license = deps.licenses.getByTenant(req.params.tenantId);
      if (!license) return reply.code(404).send({ error: 'license_not_found' });
      const exp = deps.licenses.checkExpiry(license.key);
      // Hook: fire warning at warn state, lockout email at expired/lockout.
      if (exp.state === 'warn') {
        deps.email.send({
          to: license.email,
          template: 'trial-expiring',
          context: {
            email: license.email,
            daysUntil: exp.daysUntil,
            upgradeLink: `https://app.example.com/upgrade?tenant=${license.tenantId}`,
          },
        });
      } else if (exp.state === 'expired' || exp.state === 'lockout') {
        deps.email.send({
          to: license.email,
          template: 'trial-expired',
          context: {
            email: license.email,
            upgradeLink: `https://app.example.com/upgrade?tenant=${license.tenantId}`,
          },
        });
      }
      return reply.send({
        tenantId: license.tenantId,
        tier: license.tier,
        status: license.status,
        state: exp.state,
        daysUntilExpiry: exp.daysUntil,
        expiresAt: license.expiresAt,
      });
    }
  );
}
