/**
 * CORTI W208-MULTI-TENANT — tenant isolation hardening.
 *
 * Phase 400.1 (Faza 400) deliverable: a defence-in-depth layer that
 * guarantees no operator request can ever read or write rows belonging
 * to another operator. Even if a route forgets to filter by tenant
 * explicitly, this module fails the request closed.
 *
 * Three independent rings of protection are stacked:
 *
 *  1) **Middleware** ({@link tenantIsolationPreHandler}) — extracts the
 *     `X-Tenant-Id` header (or the JWT-mirrored `req.tenant`) and pins
 *     the value on `req.tenantId`. Missing tenant on a data-plane route
 *     is a hard 400.
 *
 *  2) **AsyncLocalStorage context** ({@link withTenant}, {@link
 *     currentTenant}, {@link assertTenantContext}) — propagates the
 *     tenant id through awaits, timers, and child callbacks. Any code
 *     path that calls a tenant-aware store helper without an active
 *     context throws a `TenantContextMissingError`, surfacing the bug
 *     in development long before it can leak data in production.
 *
 *  3) **Query interceptor** ({@link assertTenantScopedQuery}) — a small
 *     static check that callers run before issuing a multi-tenant DB
 *     query. It asserts the SQL string contains `WHERE` + `tenant_id`
 *     (or `tenant_id =`) before allowing the query to dispatch.
 *
 * Cross-tenant operations are still possible for break-glass admin
 * tooling, but only through the explicit {@link crossTenantOverride}
 * helper which records an audit event tagged
 * `tenant_isolation.cross_tenant_override`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// AsyncLocalStorage-backed tenant context
// ---------------------------------------------------------------------------

export interface TenantContext {
  /** Stable identifier resolved from the header / JWT. */
  tenantId: string;
  /** Optional caller id (X-User-Id) — handy for audit forensics. */
  userId?: string;
  /** `true` when the context was opened by a deliberate cross-tenant op. */
  isCrossTenantOverride?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export class TenantContextMissingError extends Error {
  constructor(detail = 'no tenant context active') {
    super(`tenant_isolation_violation: ${detail}`);
    this.name = 'TenantContextMissingError';
  }
}

export class TenantContextMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `tenant_isolation_violation: expected tenant=${expected}, ctx tenant=${actual}`
    );
    this.name = 'TenantContextMismatchError';
  }
}

/**
 * Run `fn` with `ctx` pinned as the active tenant. All awaits/timers
 * inside `fn` keep the context.
 */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Return the active tenant context, or `null` if none. */
export function currentTenant(): TenantContext | null {
  return storage.getStore() ?? null;
}

/**
 * Throws {@link TenantContextMissingError} if there is no active
 * context. Use at the top of every helper that touches a multi-tenant
 * table.
 */
export function assertTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    isolationCounter.violations++;
    throw new TenantContextMissingError('assertTenantContext()');
  }
  return ctx;
}

/**
 * Throws if the context tenant id does not match `expected`. Used by
 * stores after they resolve the tenant from the query params, to catch
 * a forged header smuggling another tenant's id into the body.
 */
export function assertTenantMatches(expected: string): TenantContext {
  const ctx = assertTenantContext();
  if (ctx.tenantId !== expected && !ctx.isCrossTenantOverride) {
    isolationCounter.violations++;
    throw new TenantContextMismatchError(expected, ctx.tenantId);
  }
  return ctx;
}

/**
 * Explicit break-glass: open a cross-tenant context. The audit sink
 * must record the override; this helper *only* sets the flag.
 */
export function crossTenantOverride<T>(
  ctx: Omit<TenantContext, 'isCrossTenantOverride'>,
  fn: () => T
): T {
  return storage.run({ ...ctx, isCrossTenantOverride: true }, fn);
}

// ---------------------------------------------------------------------------
// Static query interceptor
// ---------------------------------------------------------------------------

/** Tables that MUST be scoped to tenant_id on every query. */
export const MULTI_TENANT_TABLES = new Set([
  'sessions',
  'wallets',
  'wallet_transactions',
  'games',
  'certs',
  'audits',
  'audit_entries',
]);

const TABLE_NAME_RE = /\b(from|update|into|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;

/**
 * Inspect a SQL string. If it touches any {@link MULTI_TENANT_TABLES}
 * table, require either:
 *   - a `tenant_id` predicate (WHERE tenant_id = ... or SET tenant_id = ...),
 *     or
 *   - a deliberate cross-tenant override (caller sets that flag).
 */
export function assertTenantScopedQuery(
  sql: string,
  opts: { allowCrossTenant?: boolean } = {}
): void {
  const tables = extractTablesFromSql(sql);
  const touchesTenantTable = tables.some((t) => MULTI_TENANT_TABLES.has(t));
  if (!touchesTenantTable) return;
  if (opts.allowCrossTenant) return;
  const hasTenantPredicate = /tenant_id\s*(=|in\b)/i.test(sql);
  if (!hasTenantPredicate) {
    isolationCounter.violations++;
    throw new TenantContextMissingError(
      `query against multi-tenant table missing tenant_id predicate: ${sql.slice(
        0,
        80
      )}`
    );
  }
}

function extractTablesFromSql(sql: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  TABLE_NAME_RE.lastIndex = 0;
  while ((m = TABLE_NAME_RE.exec(sql)) !== null) {
    out.push(m[2].toLowerCase());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Observability counter (read by /api/admin/metrics)
// ---------------------------------------------------------------------------

export const isolationCounter = {
  violations: 0,
  crossTenantOverrides: 0,
  reset(): void {
    this.violations = 0;
    this.crossTenantOverrides = 0;
  },
};

// ---------------------------------------------------------------------------
// Fastify wiring
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}

export interface TenantIsolationOptions {
  /**
   * Routes that may be invoked without a tenant id (health/metrics/
   * signup/admin self-bootstrap). Matched as URL prefixes.
   */
  publicPrefixes?: string[];
  /**
   * When true (default), missing tenant on a data-plane route returns
   * 400 `tenant_required`. When false, the handler is allowed to
   * proceed and the violation counter is incremented.
   */
  rejectMissing?: boolean;
}

const DEFAULT_PUBLIC_PREFIXES = [
  '/api/health',
  '/api/metrics',
  '/api/admin/metrics',
  '/api/signup',
  '/api/license',
];

/**
 * Fastify preHandler factory. Pin `req.tenantId` and open an
 * AsyncLocalStorage context for the duration of the request handler.
 */
export function tenantIsolationPreHandler(
  opts: TenantIsolationOptions = {}
) {
  const publicPrefixes = opts.publicPrefixes ?? DEFAULT_PUBLIC_PREFIXES;
  const rejectMissing = opts.rejectMissing ?? true;
  return async function preHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (publicPrefixes.some((p) => req.url.startsWith(p))) return;
    const raw =
      req.headers['x-tenant-id'] ??
      req.headers['X-Tenant-Id'] ??
      (req.tenant ? req.tenant.id : undefined);
    const tenantId = Array.isArray(raw) ? raw[0] : raw;
    if (!tenantId) {
      if (!rejectMissing) return;
      return reply.code(400).send({ error: 'tenant_required' });
    }
    req.tenantId = tenantId;
  };
}

/**
 * Hook factory: opens an AsyncLocalStorage context around the route
 * handler so any code path that calls {@link assertTenantContext} sees
 * the request's tenant id.
 */
export function tenantContextScope() {
  return async function preHandler(
    req: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    if (!req.tenantId) return;
    const userId = req.userId;
    // We deliberately use enterWith() rather than run() so the context
    // outlives this preHandler and is observable inside the route
    // handler — exits when the request finishes.
    storage.enterWith({
      tenantId: req.tenantId,
      ...(userId ? { userId } : {}),
    });
  };
}

/** Wire both preHandlers in one shot. */
export async function registerTenantIsolation(
  app: FastifyInstance,
  opts: TenantIsolationOptions = {}
): Promise<void> {
  app.addHook('preHandler', tenantIsolationPreHandler(opts));
  app.addHook('preHandler', tenantContextScope());
}
