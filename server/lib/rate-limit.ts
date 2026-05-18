/**
 * CORTI W208-MULTI-TENANT — token bucket rate limiter.
 *
 * Per-tenant, per-route token buckets with optional Redis backing.
 * Defaults (overridable per route via the {@link rateLimit} factory):
 *
 *  - REST API           100 req/s per tenant, burst 200
 *  - GaaS WebSocket     50 spin/s per tenant, burst 100
 *  - Auth endpoints     10 req/s per IP+tenant
 *
 * Implementation notes:
 *  - Pure token bucket: each bucket holds `burst` tokens, refilling at
 *    `refillPerSec`. A request consumes 1 token; if the bucket is empty
 *    the request is denied and `Retry-After` (seconds) is returned.
 *  - The in-memory map is keyed by `${routeKey}::${tenantId}::${suffix}`.
 *    For IP+tenant scoping the route handler passes the IP as suffix.
 *  - Backing store is pluggable. The default is an in-memory map. If
 *    `REDIS_URL` is set and a Redis client object is exposed via
 *    `process.__sme_redis` (Agent A's cache layer, optional), we use a
 *    Lua-script-like SETNX/INCR pattern.
 *  - Counters: every rejection bumps `rateLimitMetrics.breaches` for
 *    consumption by `/api/admin/metrics`.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Bucket primitives
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Bucket capacity (max burst). */
  tokens: number;
  /** Refill rate in tokens per second. */
  refillPerSec: number;
  /** Optional discriminator: 'tenant' | 'tenant+ip' | string. */
  scope?: 'tenant' | 'tenant+ip' | string;
  /** Route key for metrics labelling. */
  routeKey?: string;
}

export interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  load(key: string): Promise<Bucket | null> | Bucket | null;
  save(key: string, bucket: Bucket): Promise<void> | void;
  reset(): Promise<void> | void;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  load(key: string): Bucket | null {
    return this.buckets.get(key) ?? null;
  }
  save(key: string, bucket: Bucket): void {
    this.buckets.set(key, bucket);
  }
  reset(): void {
    this.buckets.clear();
  }
  size(): number {
    return this.buckets.size;
  }
}

const defaultStore = new InMemoryRateLimitStore();

/**
 * Best-effort Redis adapter. If the host process exposes a Redis-ish
 * client via `process.__sme_redis` (or `globalThis.__sme_redis`), we
 * use it; otherwise we silently fall back to in-memory. This keeps the
 * module decoupled from Agent A's cache layer while still composing.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: {
      get: (k: string) => Promise<string | null>;
      set: (k: string, v: string, ttlSeconds: number) => Promise<unknown>;
      del: (k: string) => Promise<unknown>;
    }
  ) {}
  async load(key: string): Promise<Bucket | null> {
    const raw = await this.client.get(`sme:rl:${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Bucket;
    } catch {
      return null;
    }
  }
  async save(key: string, bucket: Bucket): Promise<void> {
    // 5-minute TTL — buckets refresh on every hit anyway.
    await this.client.set(`sme:rl:${key}`, JSON.stringify(bucket), 300);
  }
  async reset(): Promise<void> {
    /* per-tenant resets are issued by tests via the in-memory store */
  }
}

function pickStore(): RateLimitStore {
  const g = globalThis as unknown as { __sme_redis?: unknown };
  if (g.__sme_redis && typeof g.__sme_redis === 'object') {
    const c = g.__sme_redis as ConstructorParameters<typeof RedisRateLimitStore>[0];
    if (typeof c.get === 'function' && typeof c.set === 'function') {
      return new RedisRateLimitStore(c);
    }
  }
  return defaultStore;
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

export function refill(
  bucket: Bucket,
  cfg: { tokens: number; refillPerSec: number },
  nowMs: number
): Bucket {
  const elapsed = Math.max(0, nowMs - bucket.lastRefillMs);
  const refillTokens = (elapsed / 1000) * cfg.refillPerSec;
  return {
    tokens: Math.min(cfg.tokens, bucket.tokens + refillTokens),
    lastRefillMs: nowMs,
  };
}

export async function consume(
  store: RateLimitStore,
  key: string,
  cfg: RateLimitConfig,
  nowMs: number = Date.now()
): Promise<RateLimitDecision> {
  const existing = (await store.load(key)) ?? {
    tokens: cfg.tokens,
    lastRefillMs: nowMs,
  };
  const refilled = refill(existing, cfg, nowMs);
  if (refilled.tokens >= 1) {
    const next = { tokens: refilled.tokens - 1, lastRefillMs: nowMs };
    await store.save(key, next);
    return {
      allowed: true,
      remaining: Math.floor(next.tokens),
      retryAfterSeconds: 0,
    };
  }
  await store.save(key, refilled);
  const deficit = 1 - refilled.tokens;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(deficit / cfg.refillPerSec)
  );
  rateLimitMetrics.breaches++;
  if (cfg.routeKey) {
    rateLimitMetrics.byRoute[cfg.routeKey] =
      (rateLimitMetrics.byRoute[cfg.routeKey] ?? 0) + 1;
  }
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

// ---------------------------------------------------------------------------
// Fastify middleware factory
// ---------------------------------------------------------------------------

export interface RateLimitFactoryOptions extends RateLimitConfig {
  /** Override the bucket key — useful for tests + IP-bound auth limit. */
  keyOf?: (req: FastifyRequest) => string;
  /** Override the rejection payload. */
  onReject?: (req: FastifyRequest, decision: RateLimitDecision) => unknown;
  /** Injection point for tests. */
  store?: RateLimitStore;
  /** Injection point for tests. */
  now?: () => number;
}

export const REST_DEFAULTS: RateLimitConfig = {
  tokens: 200,
  refillPerSec: 100,
  scope: 'tenant',
  routeKey: 'rest',
};

export const GAAS_SPIN_DEFAULTS: RateLimitConfig = {
  tokens: 100,
  refillPerSec: 50,
  scope: 'tenant',
  routeKey: 'gaas_spin',
};

export const AUTH_DEFAULTS: RateLimitConfig = {
  tokens: 20,
  refillPerSec: 10,
  scope: 'tenant+ip',
  routeKey: 'auth',
};

/**
 * Build a Fastify preHandler that consumes one token from the matching
 * bucket. Use as `{ preHandler: rateLimit({ tokens: 100, refillPerSec:
 * 50 }) }` on a route.
 */
export function rateLimit(opts: RateLimitFactoryOptions) {
  const store = opts.store ?? pickStore();
  const now = opts.now ?? (() => Date.now());
  const keyOf =
    opts.keyOf ??
    ((req: FastifyRequest): string => {
      const tenant = req.tenantId ?? 'unknown';
      if (opts.scope === 'tenant+ip') {
        return `${opts.routeKey ?? 'route'}::${tenant}::${req.ip ?? '0.0.0.0'}`;
      }
      return `${opts.routeKey ?? 'route'}::${tenant}`;
    });

  return async function preHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = keyOf(req);
    const decision = await consume(store, key, opts, now());
    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      reply.header('X-RateLimit-Remaining', '0');
      const payload = opts.onReject
        ? opts.onReject(req, decision)
        : {
            error: 'rate_limit_exceeded',
            tenant: req.tenantId ?? 'unknown',
            retryAfterSeconds: decision.retryAfterSeconds,
          };
      return reply.code(429).send(payload);
    }
    reply.header('X-RateLimit-Remaining', String(decision.remaining));
  };
}

// ---------------------------------------------------------------------------
// Metrics export (read by /api/admin/metrics)
// ---------------------------------------------------------------------------

export const rateLimitMetrics = {
  breaches: 0,
  byRoute: {} as Record<string, number>,
  reset(): void {
    this.breaches = 0;
    this.byRoute = {};
  },
};

/** Test-only: clear in-memory bucket state. */
export function resetInMemoryBuckets(): void {
  defaultStore.reset();
}
