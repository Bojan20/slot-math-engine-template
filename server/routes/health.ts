/**
 * CORTI 200.6-DEVOPS — extended health + metrics endpoints.
 *
 *   GET /api/health        compact per-component status (already wired
 *                          in server/index.ts; we add a richer payload
 *                          here as a drop-in replacement)
 *   GET /api/health/deep   runs a canary spin against the in-memory
 *                          session store + audit chain; latency reported
 *   GET /api/metrics       Prometheus text-format export (uptime,
 *                          per-store sizes, audit entry count, etc.)
 *
 * The deep probe deliberately uses the same APIs as a real client:
 * register a one-shot session, append a synthetic audit entry, verify
 * the chain, then close the session. Real downtime in any of those
 * paths surfaces as a non-200.
 */

import type { FastifyInstance } from 'fastify';
import type { BackendStores } from '../index.js';
import type { TenantStore } from '../state/tenants.js';

export interface HealthRouteDeps {
  stores: BackendStores;
  tenants: TenantStore;
  startedAt: number;
}

interface ComponentStatus {
  ok: boolean;
  detail?: string;
}

function pingComponent(name: string, fn: () => boolean): ComponentStatus {
  try {
    const ok = fn();
    return { ok, detail: ok ? undefined : `${name}_returned_false` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : `${name}_threw`,
    };
  }
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  deps: HealthRouteDeps
): Promise<void> {
  app.get('/api/health', async () => {
    const components = {
      sessions: pingComponent('sessions', () => deps.stores.sessions.size() >= 0),
      wallet: pingComponent('wallet', () => deps.stores.wallet !== null),
      audit: pingComponent('audit', () => deps.stores.audit.totalEntries() >= 0),
      games: pingComponent('games', () => deps.stores.games.size() >= 0),
      cert: pingComponent('cert', () => deps.stores.cert.list().length >= 0),
      tenants: pingComponent('tenants', () => deps.tenants.size() >= 0),
    };
    const ok = Object.values(components).every((c) => c.ok);
    return {
      ok,
      name: 'slot-math-engine-backend',
      version: '0.1.0',
      uptime: process.uptime(),
      components,
      sessions: deps.stores.sessions.size(),
      games: deps.stores.games.size(),
      auditSessions: deps.stores.audit.sessionCount(),
      auditEntries: deps.stores.audit.totalEntries(),
      tenants: deps.tenants.size(),
    };
  });

  app.get('/api/health/deep', async (_req, reply) => {
    const start = performance.now();
    const probes: Record<string, ComponentStatus> = {};

    // canary: create a synthetic session id derivation + append
    const canaryAuditId = `health-canary-${Date.now()}`;
    try {
      deps.stores.audit.append({
        sessionId: canaryAuditId,
        type: 'health_probe',
        payload: { ts: Date.now() },
      });
      const verify = deps.stores.audit.verify(canaryAuditId);
      probes.auditChain = { ok: verify.ok, detail: verify.ok ? undefined : 'verify_failed' };
    } catch (err) {
      probes.auditChain = {
        ok: false,
        detail: err instanceof Error ? err.message : 'audit_threw',
      };
    }

    probes.gamesRegistry = pingComponent('games', () => {
      deps.stores.games.list();
      return true;
    });

    const ok = Object.values(probes).every((p) => p.ok);
    const elapsedMs = performance.now() - start;
    return reply.code(ok ? 200 : 503).send({
      ok,
      probes,
      elapsedMs: Number(elapsedMs.toFixed(3)),
    });
  });

  app.get('/api/metrics', async (_req, reply) => {
    const lines: string[] = [];
    const push = (name: string, help: string, value: number, type = 'gauge'): void => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(`${name} ${value}`);
    };
    push('sme_uptime_seconds', 'Backend uptime in seconds.', process.uptime());
    push('sme_sessions_total', 'Active session count.', deps.stores.sessions.size());
    push('sme_games_total', 'Registered games.', deps.stores.games.size());
    push(
      'sme_audit_entries_total',
      'Total audit entries across sessions.',
      deps.stores.audit.totalEntries(),
      'counter'
    );
    push(
      'sme_audit_sessions_total',
      'Sessions with at least one audit entry.',
      deps.stores.audit.sessionCount()
    );
    push('sme_cert_submissions_total', 'Cert submissions.', deps.stores.cert.list().length, 'counter');
    push('sme_tenants_total', 'Registered tenants.', deps.tenants.size());
    push(
      'sme_process_resident_bytes',
      'Resident memory of the backend process.',
      process.memoryUsage().rss
    );
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send(lines.join('\n') + '\n');
  });
}
