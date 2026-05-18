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
import helmet from '@fastify/helmet';

import { SessionStore } from './state/sessions.js';
import { WalletStore } from './state/wallet.js';
import { AuditStore } from './state/audit.js';
import { GamesRegistry } from './state/games.js';
import { CertStore } from './state/cert.js';
import { TenantStore } from './state/tenants.js';
import { HsmStore } from './state/hsm.js';
import { UserStore, seedDefaultUsers } from './state/users.js';
import { attachRolePreHandler } from './state/rbac.js';
import { LicenseStore } from './state/licenses.js';
import { EmailSender } from './lib/email.js';

// CORTI W206-PERSISTENCE — optional Postgres lifecycle. The pool is
// only created when USE_POSTGRES=true; otherwise the legacy in-memory
// stores remain authoritative.
import { PgConnection } from './db/connection.js';
import { runMigrations } from './db/migrate.js';

import { registerSessionRoutes } from './routes/session.js';
import { registerWalletRoutes } from './routes/wallet.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerLobbyRoutes } from './routes/lobby.js';
import { registerCertRoutes } from './routes/cert.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerGaasRoutes } from './routes/gaas.js';
import { registerSignupRoutes } from './routes/signup.js';
import { registerLicenseRoutes } from './routes/license.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { createCache } from './lib/cache.js';
import { LatencyBudgetTracker, attachLatencyMiddleware } from './lib/latency-budget.js';

// CORTI W208-MULTI-TENANT — tenant isolation hardening, rate limiter,
// structured logger + Prometheus metrics endpoint.
import { registerObservability } from './lib/observability.js';
import {
  tenantIsolationPreHandler,
  tenantContextScope,
} from './lib/tenant-isolation.js';
import { rateLimit, REST_DEFAULTS } from './lib/rate-limit.js';

export interface BackendStores {
  sessions: SessionStore;
  wallet: WalletStore;
  audit: AuditStore;
  games: GamesRegistry;
  cert: CertStore;
  tenants: TenantStore;
  hsm: HsmStore;
  users: UserStore;
  licenses: LicenseStore;
  email: EmailSender;
  /** Optional Postgres pool (when USE_POSTGRES=true). */
  pg?: PgConnection;
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

  // CORTI W206-SECURITY — security headers (OWASP A05 remediation).
  // Helmet attaches CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
  // Referrer-Policy, Permissions-Policy, etc. CSP is intentionally
  // conservative (`'self'` only) — tighten further with nonces when the
  // SPAs ship their first inline script.
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // GaaS iframe needs to load on operator sites
    crossOriginResourcePolicy: { policy: 'same-site' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  });

  // CORTI W206-SECURITY — RBAC pre-handler resolves caller role from
  // X-User-Role header (or implicit 'guest'). Per-route guards live
  // inside the registerXRoutes calls. Skip the resolver for health /
  // metrics / admin tenant-resolution path so existing CI gates don't
  // need to inject a role header.
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/health') || req.url.startsWith('/api/metrics')) return;
    await attachRolePreHandler({ allowGuestFallback: true })(req, reply);
  });

  const usersStore = opts.stores?.users ?? new UserStore();
  if (!opts.stores?.users) seedDefaultUsers(usersStore);
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
    users: usersStore,
    licenses: opts.stores?.licenses ?? new LicenseStore(),
    email: opts.stores?.email ?? new EmailSender(),
  };
  // Best-effort: load games up-front so first /api/lobby/games is fast.
  try {
    stores.games.load();
  } catch (err) {
    app.log.warn({ err }, 'games registry load failed (continuing with empty registry)');
  }

  // CORTI W206-PERSISTENCE — opt-in Postgres connect + migrate.
  // Default is OFF so the existing in-memory test suite still passes.
  // When USE_POSTGRES=true (typically in docker-compose / staging /
  // prod) we connect, run idempotent migrations, and attach the pool to
  // the stores struct. Postgres-backed store wrappers can then pick up
  // the connection from `app.stores.pg`.
  if (process.env.USE_POSTGRES === 'true') {
    try {
      const pg = new PgConnection();
      await pg.connect();
      const result = await runMigrations(pg);
      app.log.info(
        { applied: result.applied.length, skipped: result.skipped.length },
        '[backend] postgres connected + migrations ok'
      );
      stores.pg = pg;
      app.addHook('onClose', async () => {
        await pg.shutdown();
      });
    } catch (err) {
      app.log.error({ err }, '[backend] postgres bring-up failed');
      throw err;
    }
  }

  // Attach stores to the instance so tests can introspect.
  app.decorate('stores', stores);

  // W208 Faza 400.1 — shared cache + latency budget tracker.
  // The cache backend auto-selects: NODE_ENV=test → memory, otherwise
  // REDIS_URL → Redis, else memory. Routes can override per-call.
  const sharedCache = createCache<unknown>({ namespace: 'svc' });
  const latencyTracker = new LatencyBudgetTracker({
    warn: (msg, ctx) => app.log.warn(ctx, msg),
  });
  app.decorate('cache', sharedCache);
  app.decorate('latency', latencyTracker);
  attachLatencyMiddleware(app, latencyTracker);
  app.addHook('onClose', async () => {
    await sharedCache.close();
  });

  // CORTI W208-MULTI-TENANT — observability MUST be registered first so
  // the request id / latency hooks wrap every other handler. The
  // /api/admin/metrics endpoint exposes Prometheus scrape data.
  await registerObservability(app);

  // Admin (tenant CRUD + tenant resolution preHandler) must register
  // BEFORE the data-plane routes so its preHandler hook runs first.
  await registerAdminRoutes(app, { tenants: stores.tenants });

  // CORTI W208-MULTI-TENANT — bridge admin's req.tenant → req.tenantId,
  // then open the AsyncLocalStorage tenant context for the rest of the
  // request handler. This guarantees that any helper which calls
  // assertTenantContext() inside a data-plane route can see the tenant.
  app.addHook('preHandler', async (req) => {
    if (!req.tenantId && req.tenant) req.tenantId = req.tenant.id;
  });
  app.addHook('preHandler', tenantIsolationPreHandler({
    publicPrefixes: [
      '/api/health',
      '/api/metrics',
      '/api/admin',
      '/api/signup',
      '/api/license',
    ],
    rejectMissing: false,
  }));
  app.addHook('preHandler', tenantContextScope());

  // CORTI W208-MULTI-TENANT — default REST rate limit (100 req/s per
  // tenant, burst 200). The legacy per-tenant minute window from
  // admin.ts continues to fire alongside this layer, providing
  // defence-in-depth. Tests can disable via DISABLE_RATE_LIMIT=1, and
  // we skip in NODE_ENV=test by default so the existing suite isn't
  // throttled across rapid-fire requests.
  const rlDisabled =
    process.env.DISABLE_RATE_LIMIT === '1' || process.env.NODE_ENV === 'test';
  if (!rlDisabled) {
    app.addHook('preHandler', async (req, reply) => {
      if (!req.url.startsWith('/api/')) return;
      if (req.url.startsWith('/api/admin/')) return;
      if (req.url.startsWith('/api/health')) return;
      if (req.url.startsWith('/api/metrics')) return;
      return rateLimit(REST_DEFAULTS)(req, reply);
    });
  }
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
  await registerLobbyRoutes(app, {
    games: stores.games,
    sessions: stores.sessions,
    cache: sharedCache,
  });
  await registerCatalogRoutes(app, { games: stores.games, cache: sharedCache });
  await registerCertRoutes(app, { cert: stores.cert, hsm: stores.hsm });
  await registerGaasRoutes(app, {
    games: stores.games,
    sessions: stores.sessions,
    wallet: stores.wallet,
    audit: stores.audit,
    apiKeys: process.env.GAAS_API_KEYS ? process.env.GAAS_API_KEYS.split(',') : [],
    cache: sharedCache,
    latency: latencyTracker,
  });

  // CORTI W206-ONBOARDING — customer-facing signup + license API.
  await registerSignupRoutes(app, {
    tenants: stores.tenants,
    licenses: stores.licenses,
    email: stores.email,
  });
  await registerLicenseRoutes(app, {
    licenses: stores.licenses,
    email: stores.email,
    cache: sharedCache,
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    stores: BackendStores;
    cache: import('./lib/cache.js').Cache<unknown>;
    latency: import('./lib/latency-budget.js').LatencyBudgetTracker;
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
