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

import { registerSessionRoutes } from './routes/session.js';
import { registerWalletRoutes } from './routes/wallet.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerLobbyRoutes } from './routes/lobby.js';
import { registerCertRoutes } from './routes/cert.js';

export interface BackendStores {
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  games: GamesRegistry;
  cert: CertStore;
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

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  const stores: BackendStores = {
    sessions: opts.stores?.sessions ?? new SessionStore(),
    wallet: opts.stores?.wallet ?? new WalletStore(),
    audit: opts.stores?.audit ?? new AuditStore(),
    games: opts.stores?.games ?? new GamesRegistry(),
    cert: opts.stores?.cert ?? new CertStore(),
  };
  // Best-effort: load games up-front so first /api/lobby/games is fast.
  try {
    stores.games.load();
  } catch (err) {
    app.log.warn({ err }, 'games registry load failed (continuing with empty registry)');
  }

  // Health check (used by studio for backend auto-detection).
  app.get('/api/health', async () => ({
    ok: true,
    name: 'slot-math-engine-backend',
    version: '0.1.0',
    uptime: process.uptime(),
    sessions: stores.sessions.size(),
    games: stores.games.size(),
    auditSessions: stores.audit.sessionCount(),
    auditEntries: stores.audit.totalEntries(),
  }));

  // Attach stores to the instance so tests can introspect.
  app.decorate('stores', stores);

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
  await registerCertRoutes(app, { cert: stores.cert });

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
