/**
 * CORTI W206-SECURITY — Role-Based Access Control (RBAC).
 *
 * OWASP A01 remediation. Five-tier role hierarchy with an explicit
 * per-endpoint permission matrix. Requests carry the role in the
 * `X-User-Role` header (or implicitly via `X-API-Key` mapping in GaaS).
 * Production deployments would replace the header with a verified JWT/
 * OIDC claim; the in-memory implementation here exercises the same
 * middleware contract so we can swap the auth source without touching
 * route code.
 *
 * Hierarchy (most-privileged → least):
 *   admin      — full CRUD on tenants, system config, audit
 *   operator   — game library CRUD, MC runs, submission, RTP monitoring
 *   regulator  — read-only audit + review workflow (approve/reject)
 *   player     — wallet ops, spin, session
 *   guest      — limited preview only
 *
 * Each role's permission set is the union of its own permissions plus
 * the {@link ROLE_INHERITS} chain — `admin` therefore inherits everything
 * below it.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

export type Role = 'admin' | 'operator' | 'regulator' | 'player' | 'guest';

export const ROLES: readonly Role[] = ['admin', 'operator', 'regulator', 'player', 'guest'];

/** Numeric weight — higher number = more privilege. Used for `requireMinRole`. */
export const ROLE_WEIGHT: Record<Role, number> = {
  guest: 0,
  player: 1,
  regulator: 2,
  operator: 3,
  admin: 4,
};

/** Permission tokens map 1:1 to route capabilities. */
export type Permission =
  | 'tenant:read' | 'tenant:write' | 'tenant:delete'
  | 'game:read' | 'game:write' | 'game:launch'
  | 'wallet:read:own' | 'wallet:read:any' | 'wallet:write:own' | 'wallet:write:any'
  | 'session:create' | 'session:read:own' | 'session:read:any' | 'session:spin'
  | 'audit:read' | 'audit:write'
  | 'cert:submit' | 'cert:read' | 'cert:approve' | 'cert:reject'
  | 'health:read' | 'metrics:read'
  | 'gaas:invoke';

const PERMS = (...ps: Permission[]): Set<Permission> => new Set(ps);

/**
 * Base permissions owned directly by each role (before inheritance).
 * Use {@link permissionsFor} to expand with the inheritance chain.
 */
export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  guest: PERMS('game:read', 'health:read'),
  player: PERMS(
    'wallet:read:own', 'wallet:write:own',
    'session:create', 'session:read:own', 'session:spin',
    'game:launch'
  ),
  regulator: PERMS('audit:read', 'cert:read', 'cert:approve', 'cert:reject', 'metrics:read'),
  operator: PERMS(
    'game:write', 'cert:submit', 'cert:read',
    'session:read:any', 'audit:read', 'metrics:read',
    'gaas:invoke'
  ),
  admin: PERMS(
    'tenant:read', 'tenant:write', 'tenant:delete',
    'wallet:read:any', 'wallet:write:any',
    'audit:write'
  ),
};

/** `child → parents` — each role implicitly receives its parents' permissions. */
export const ROLE_INHERITS: Record<Role, readonly Role[]> = {
  admin: ['operator', 'regulator', 'player', 'guest'],
  operator: ['player', 'guest'],
  regulator: ['guest'],
  player: ['guest'],
  guest: [],
};

/** Expand a role into its full permission set (including inherited). */
export function permissionsFor(role: Role): Set<Permission> {
  const out = new Set<Permission>();
  const visit = (r: Role): void => {
    for (const p of ROLE_PERMISSIONS[r]) out.add(p);
    for (const parent of ROLE_INHERITS[r]) visit(parent);
  };
  visit(role);
  return out;
}

export function hasPermission(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return permissionsFor(role).has(perm);
}

/** Parse the X-User-Role header. Returns `undefined` when missing/invalid. */
export function parseRoleHeader(value: string | string[] | undefined): Role | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const candidate = String(raw).trim().toLowerCase();
  return (ROLES as readonly string[]).includes(candidate) ? (candidate as Role) : undefined;
}

/** Audit-friendly escalation event. Mirrored to the AuditStore by callers. */
export interface EscalationEvent {
  attemptedAt: string;
  callerRole: Role | 'unknown';
  requiredRole: Role | 'permission';
  requiredPermission?: Permission;
  url: string;
  method: string;
  userId?: string;
}

/**
 * In-memory ring buffer of escalation attempts. Audit-store integration
 * is opt-in (see `wireEscalationLogger`). Kept simple for tests.
 */
export class EscalationLog {
  private readonly buf: EscalationEvent[] = [];
  private readonly cap: number;
  constructor(cap = 1024) { this.cap = cap; }
  push(ev: EscalationEvent): void {
    this.buf.push(ev);
    if (this.buf.length > this.cap) this.buf.shift();
  }
  list(): EscalationEvent[] { return [...this.buf]; }
  size(): number { return this.buf.length; }
  clear(): void { this.buf.length = 0; }
}

export const escalationLog = new EscalationLog();

declare module 'fastify' {
  interface FastifyRequest {
    userRole?: Role;
    userId?: string;
  }
}

export interface RbacOptions {
  /** When true, treat unsigned requests as 'guest' (default). When false, 401. */
  allowGuestFallback?: boolean;
  /** Audit logger sink — defaults to the in-process {@link escalationLog}. */
  log?: EscalationLog;
}

/**
 * Fastify hook factory: resolves the caller's role from `X-User-Role`
 * (and `X-User-Id` when present) and stashes it on the request.
 */
export function attachRolePreHandler(opts: RbacOptions = {}) {
  const allowGuest = opts.allowGuestFallback ?? true;
  return async function attachRole(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const headerRole = parseRoleHeader(req.headers['x-user-role']);
    if (!headerRole) {
      if (allowGuest) {
        req.userRole = 'guest';
        return;
      }
      return reply.code(401).send({ error: 'role_required' });
    }
    req.userRole = headerRole;
    const userId = req.headers['x-user-id'];
    if (typeof userId === 'string' && userId.length > 0) req.userId = userId;
  };
}

/** Guard: require the caller's role weight to meet a minimum. */
export function requireRole(min: Role, log: EscalationLog = escalationLog) {
  const minWeight = ROLE_WEIGHT[min];
  return async function guard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const role = req.userRole;
    if (!role || ROLE_WEIGHT[role] < minWeight) {
      log.push({
        attemptedAt: new Date().toISOString(),
        callerRole: role ?? 'unknown',
        requiredRole: min,
        url: req.url,
        method: req.method,
        ...(req.userId ? { userId: req.userId } : {}),
      });
      return reply.code(403).send({
        error: 'forbidden',
        requiredRole: min,
        callerRole: role ?? 'unknown',
      });
    }
  };
}

/** Guard: require a specific permission token (inheritance-aware). */
export function requirePermission(perm: Permission, log: EscalationLog = escalationLog) {
  return async function guard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const role = req.userRole;
    if (!hasPermission(role, perm)) {
      log.push({
        attemptedAt: new Date().toISOString(),
        callerRole: role ?? 'unknown',
        requiredRole: 'permission',
        requiredPermission: perm,
        url: req.url,
        method: req.method,
        ...(req.userId ? { userId: req.userId } : {}),
      });
      return reply.code(403).send({
        error: 'forbidden',
        requiredPermission: perm,
        callerRole: role ?? 'unknown',
      });
    }
  };
}
