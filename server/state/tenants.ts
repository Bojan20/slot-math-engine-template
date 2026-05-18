/**
 * CORTI 200.6-DEVOPS — multi-tenant registry.
 *
 * In-memory tenant store with optional JSON file backing. Each tenant
 * carries:
 *   - id              stable string identifier (used in X-Tenant-Id)
 *   - name            display name
 *   - allowedJurisdictions  whitelist of jurisdiction codes (UKGC/MGA/…)
 *   - rateLimits      { requestsPerMinute }
 *   - brandingConfig  free-form JSON for theme/logo overrides
 *   - contactEmail    operator escalation contact
 *
 * Tenants can be CRUD-managed via /api/admin/tenants/*. A per-tenant
 * rolling window rate limit is enforced inside `consumeRateBudget()`.
 *
 * Real deployment would back this with Postgres + Redis (for the
 * rate-limit window). This module keeps the same shape so swapping
 * the backend is a localized refactor.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TenantBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  [k: string]: unknown;
}

export interface TenantRateLimits {
  /** Requests permitted per rolling 60s window. Defaults to 600. */
  requestsPerMinute: number;
}

export interface Tenant {
  id: string;
  name: string;
  allowedJurisdictions: string[];
  rateLimits: TenantRateLimits;
  brandingConfig: TenantBranding;
  contactEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInput {
  id: string;
  name: string;
  allowedJurisdictions?: string[];
  rateLimits?: Partial<TenantRateLimits>;
  brandingConfig?: TenantBranding;
  contactEmail: string;
}

export interface TenantPatch {
  name?: string;
  allowedJurisdictions?: string[];
  rateLimits?: Partial<TenantRateLimits>;
  brandingConfig?: TenantBranding;
  contactEmail?: string;
}

const TENANT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RPM = 600;

interface RateWindow {
  windowStart: number;
  count: number;
}

export class TenantStore {
  private readonly tenants = new Map<string, Tenant>();
  private readonly rateWindows = new Map<string, RateWindow>();
  private readonly persistPath: string | null;

  constructor(opts: { persistPath?: string | null } = {}) {
    this.persistPath = opts.persistPath ?? null;
    this.loadFromDisk();
    if (this.tenants.size === 0) this.seedDefault();
  }

  /** Seed a single "default" tenant so a fresh install has a baseline. */
  private seedDefault(): void {
    const now = new Date().toISOString();
    this.tenants.set('default', {
      id: 'default',
      name: 'Default Tenant',
      allowedJurisdictions: ['UKGC', 'MGA', 'SE', 'NJ', 'GENERIC'],
      rateLimits: { requestsPerMinute: DEFAULT_RPM },
      brandingConfig: {},
      contactEmail: 'ops@example.com',
      createdAt: now,
      updatedAt: now,
    });
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = readFileSync(this.persistPath, 'utf8');
      const parsed = JSON.parse(raw) as { tenants?: Tenant[] };
      if (!parsed.tenants || !Array.isArray(parsed.tenants)) return;
      for (const t of parsed.tenants) {
        if (this.isValidTenant(t)) this.tenants.set(t.id, t);
      }
    } catch {
      // Corrupt file → ignore, seedDefault kicks in.
    }
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      writeFileSync(
        this.persistPath,
        JSON.stringify({ tenants: this.list() }, null, 2),
        'utf8'
      );
    } catch {
      // Persistence is best-effort; failure mustn't break the request.
    }
  }

  private isValidTenant(t: unknown): t is Tenant {
    if (!t || typeof t !== 'object') return false;
    const r = t as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      TENANT_ID_RE.test(r.id) &&
      typeof r.name === 'string' &&
      Array.isArray(r.allowedJurisdictions) &&
      typeof r.contactEmail === 'string'
    );
  }

  create(input: TenantInput): Tenant {
    if (!TENANT_ID_RE.test(input.id)) {
      throw new RangeError('tenant.id must match /^[a-z0-9][a-z0-9_-]{1,62}$/');
    }
    if (this.tenants.has(input.id)) {
      throw new RangeError(`tenant ${input.id} already exists`);
    }
    if (!EMAIL_RE.test(input.contactEmail)) {
      throw new RangeError('tenant.contactEmail invalid');
    }
    const rpm = input.rateLimits?.requestsPerMinute ?? DEFAULT_RPM;
    if (!Number.isFinite(rpm) || rpm <= 0) {
      throw new RangeError('tenant.rateLimits.requestsPerMinute must be > 0');
    }
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: input.id,
      name: input.name,
      allowedJurisdictions: input.allowedJurisdictions ?? [],
      rateLimits: { requestsPerMinute: rpm },
      brandingConfig: input.brandingConfig ?? {},
      contactEmail: input.contactEmail,
      createdAt: now,
      updatedAt: now,
    };
    this.tenants.set(tenant.id, tenant);
    this.persist();
    return tenant;
  }

  update(id: string, patch: TenantPatch): Tenant {
    const existing = this.tenants.get(id);
    if (!existing) throw new RangeError(`tenant ${id} not found`);
    if (patch.contactEmail !== undefined && !EMAIL_RE.test(patch.contactEmail)) {
      throw new RangeError('tenant.contactEmail invalid');
    }
    if (patch.rateLimits?.requestsPerMinute !== undefined) {
      const rpm = patch.rateLimits.requestsPerMinute;
      if (!Number.isFinite(rpm) || rpm <= 0) {
        throw new RangeError('tenant.rateLimits.requestsPerMinute must be > 0');
      }
    }
    const merged: Tenant = {
      ...existing,
      name: patch.name ?? existing.name,
      allowedJurisdictions:
        patch.allowedJurisdictions ?? existing.allowedJurisdictions,
      rateLimits: {
        requestsPerMinute:
          patch.rateLimits?.requestsPerMinute ??
          existing.rateLimits.requestsPerMinute,
      },
      brandingConfig: patch.brandingConfig ?? existing.brandingConfig,
      contactEmail: patch.contactEmail ?? existing.contactEmail,
      updatedAt: new Date().toISOString(),
    };
    this.tenants.set(id, merged);
    this.persist();
    return merged;
  }

  delete(id: string): boolean {
    const had = this.tenants.delete(id);
    this.rateWindows.delete(id);
    if (had) this.persist();
    return had;
  }

  get(id: string): Tenant | null {
    return this.tenants.get(id) ?? null;
  }

  list(): Tenant[] {
    return Array.from(this.tenants.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
  }

  size(): number {
    return this.tenants.size;
  }

  /**
   * Consume one unit of the tenant's per-minute budget.
   * Returns `{ ok: true }` when there is budget left, or
   * `{ ok: false, retryAfterSeconds }` when over the cap.
   *
   * Rolling 60s window — the simplest correct algorithm without
   * Redis. Sufficient for in-memory dev / smoke deployments.
   */
  consumeRateBudget(
    id: string,
    now: number = Date.now()
  ): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const tenant = this.tenants.get(id);
    if (!tenant) return { ok: true }; // unknown tenant → not rate-limited here
    const window = this.rateWindows.get(id);
    if (!window || now - window.windowStart >= 60_000) {
      this.rateWindows.set(id, { windowStart: now, count: 1 });
      return { ok: true };
    }
    if (window.count >= tenant.rateLimits.requestsPerMinute) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((window.windowStart + 60_000 - now) / 1000)
      );
      return { ok: false, retryAfterSeconds };
    }
    window.count++;
    return { ok: true };
  }

  resetRateBudgets(): void {
    this.rateWindows.clear();
  }

  /** Test-only: nuke all state. */
  reset(): void {
    this.tenants.clear();
    this.rateWindows.clear();
  }
}

/**
 * Helper used by routes/middleware: pluck the tenant id from the
 * `X-Tenant-Id` header, look it up in the store, and return both.
 * Falls back to the `default` tenant when no header is supplied.
 *
 * Returns `null` when the header is set but unknown.
 */
export function resolveTenant(
  store: TenantStore,
  headers: Record<string, string | string[] | undefined>
): Tenant | null {
  const raw = headers['x-tenant-id'] ?? headers['X-Tenant-Id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) return store.get('default');
  return store.get(id);
}
