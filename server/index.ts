/**
 * CORTI 200.4-BACKEND — Fastify bootstrap.
 *
 * Boots a Fastify server on PORT (default 4000) with CORS enabled for
 * `web/studio` to call directly. All app state is in-memory — a real
 * deployment would back this with Postgres + Redis + S3 for the
 * audit/wallet/cert stores.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { SessionStore } from './state/sessions.js';
import { WalletStore } from './state/wallet.js';
import { AuditStore } from './state/audit.js';
import { GamesRegistry } from './state/games.js';
import { CertStore } from './state/cert.js';
import { TenantStore } from './state/tenants.js';
import { HsmStore } from './state/hsm.js';

import { registerSessionRoutes } from './routes/session.js';
import { registerWalletRoutes } from './routes/wallet.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerLobbyRoutes } from './routes/lobby.js';
import { registerCertRoutes } from './routes/cert.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerGaasRoutes } from './routes/gaas.js';

export interface BackendStores {
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  games: GamesRegistry;
  cert: CertStore;
  tenants: TenantStore;
  hsm: HsmStore;
}

export interface BuildOptions {
  /** Inject pre-built stores (used by tests). */
  stores?: Partial<BackendStores>;
  /** Override Fastify logger config. */
  logger?: boolean | object;
}

/** Build (but do not listen) an app instance.
 *  Used by tests via `app.inject(...)` and by the bootstrap below. */
export async function build(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
  });

  // CORTI W205-SECURITY — tightened CORS. In production, set
  // `CORS_ALLOWED_ORIGINS=https://op.example.com,https://reg.example.com`
  // to enforce an explicit allowlist. The unset / development default
  // still reflects the request Origin, but `credentials` are only
  // enabled when an explicit allowlist is in place — combining
  // `origin: true` with `credentials: true` is a Critical OWASP A05
  // finding (credential exfiltration via any origin).
  const corsAllowlist =
    process.env.CORS_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  await app.register(cors, {
    origin: corsAllowlist.length > 0 ? corsAllowlist : true,
    credentials: corsAllowlist.length > 0,
  });

  const stores: BackendStores = {
    sessions: opts.stores?.sessions ?? new SessionStore(),
    wallet: opts.stores?.wallet ?? new WalletStore(),
    audit: opts.stores?.audit ?? new AuditStore(),
    games: opts.stores?.games ?? new GamesRegistry(),
    cert: opts.stores?.cert ?? new CertStore(),
    tenants:
      opts.stores?.tenants ??
      new TenantStore({ persistPath: process.env.TENANT_REGISTRY_FILE ?? null }),
    hsm:
      opts.stores?.hsm ??
      new HsmStore({ keyFile: process.env.HSM_KEY_FILE ?? null }),
  };
  // Best-effort: load games up-front so first /api/lobby/games is fast.
  try {
    stores.games.load();
  } catch (err) {
    app.log.warn({ err }, 'games registry load failed (continuing with empty registry)');
  }

  // Attach stores to the instance so tests can introspect.
  app.decorate('stores', stores);

  // Admin (tenant CRUD + tenant resolution preHandler) must register
  // BEFORE the data-plane routes so its preHandler hook runs first.
  await registerAdminRoutes(app, { tenants: stores.tenants });
  await registerHealthRoutes(app, {
    stores,
    tenants: stores.tenants,
    startedAt: Date.now(),
  });

  await registerSessionRoutes(app, {
    sessions: stores.sessions,
    wallet: stores.wallet,
    audit: stores.audit,
    games: stores.games,
  });
  await registerWalletRoutes(app, {
    wallet: stores.wallet,
    audit: stores.audit,
  });
  await registerAuditRoutes(app, { audit: stores.audit });
  await registerLobbyRoutes(app, { games: stores.games, sessions: stores.sessions });
  await registerCertRoutes(app, { cert: stores.cert, hsm: stores.hsm });
  await registerGaasRoutes(app, {
    games: stores.games,
    sessions: stores.sessions,
    wallet: stores.wallet,
    audit: stores.audit,
    apiKeys: process.env.GAAS_API_KEYS ? process.env.GAAS_API_KEYS.split(',') : [],
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    stores: BackendStores;
  }
}

const isMainModule = (() => {
  try {
    return process.argv[1]?.endsWith('server/index.ts') ||
      process.argv[1]?.endsWith('server/index.js') ||
      process.argv[1]?.endsWith('dist/server/server/index.js') ||
      process.argv[1]?.endsWith('dist/server/index.js');
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? '0.0.0.0';
  build({ logger: true })
    .then((app) => app.listen({ port, host }))
    .then((addr) => {
      // eslint-disable-next-line no-console
      console.log(`[backend] listening on ${addr}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[backend] failed to start:', err);
      process.exit(1);
    });
}
