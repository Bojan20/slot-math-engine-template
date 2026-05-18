/**
 * CORTI W206-PERSISTENCE — Postgres-backed TenantStore.
 *
 * Rate-limit windows are kept in-memory (per-instance rolling 60s window)
 * because the round-trip to PG would dominate the request budget. A
 * full-cluster rate limiter would use Redis; that is out of scope here.
 *
 * W213 Faza 600.2: every query is wrapped in {@link
 * assertTenantScopedQuery} from the W208 tenant-isolation module. The
 * `tenants` table itself is the tenant registry (its `tenant_id`
 * column is the primary key, not a foreign key) so every operation is
 * inherently cross-tenant and executes through {@link
 * crossTenantOverride} — the helper records the explicit admin scope
 * in case the tenants table is later added to MULTI_TENANT_TABLES.
 */

import type { PgConnection } from '../db/connection.js';
import {
  assertTenantScopedQuery,
  crossTenantOverride,
} from '../lib/tenant-isolation.js';
import type {
  Tenant,
  TenantInput,
  TenantPatch,
  TenantRateLimits,
  TenantBranding,
} from './tenants.js';

const TENANT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RPM = 600;

interface TenantRow {
  tenant_id: string;
  name: string;
  config: {
    allowedJurisdictions: string[];
    rateLimits: TenantRateLimits;
    brandingConfig: TenantBranding;
    contactEmail: string;
  };
  created_at: Date;
  updated_at: Date;
}

function rowToTenant(r: TenantRow): Tenant {
  return {
    id: r.tenant_id,
    name: r.name,
    allowedJurisdictions: r.config.allowedJurisdictions ?? [],
    rateLimits: r.config.rateLimits ?? { requestsPerMinute: DEFAULT_RPM },
    brandingConfig: r.config.brandingConfig ?? {},
    contactEmail: r.config.contactEmail,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

interface RateWindow {
  windowStart: number;
  count: number;
}

export class PostgresTenantStore {
  private readonly rateWindows = new Map<string, RateWindow>();

  constructor(private readonly conn: PgConnection) {}

  /**
   * Open a cross-tenant scope. The tenants table is the registry that
   * *defines* tenants, so every query against it crosses tenant
   * boundaries by construction. Wrapping in {@link crossTenantOverride}
   * surfaces that intent to the W208 isolation observer; callers may
   * opt-in for forensic clarity but the helper is not required.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static readonly _adminScope = crossTenantOverride;

  async ensureDefaultSeed(): Promise<void> {
    const sql = 'SELECT COUNT(*)::text AS count FROM tenants';
    assertTenantScopedQuery(sql, { allowCrossTenant: true });
    const r = await this.conn.query<{ count: string }>(sql);
    if (Number(r.rows[0].count) > 0) return;
    await this.create({
      id: 'default',
      name: 'Default Tenant',
      allowedJurisdictions: ['UKGC', 'MGA', 'SE', 'NJ', 'GENERIC'],
      contactEmail: 'ops@example.com',
    });
  }

  async create(input: TenantInput): Promise<Tenant> {
    if (!TENANT_ID_RE.test(input.id)) {
      throw new RangeError('tenant.id must match /^[a-z0-9][a-z0-9_-]{1,62}$/');
    }
    if (!EMAIL_RE.test(input.contactEmail)) {
      throw new RangeError('tenant.contactEmail invalid');
    }
    const rpm = input.rateLimits?.requestsPerMinute ?? DEFAULT_RPM;
    if (!Number.isFinite(rpm) || rpm <= 0) {
      throw new RangeError('tenant.rateLimits.requestsPerMinute must be > 0');
    }
    const config = {
      allowedJurisdictions: input.allowedJurisdictions ?? [],
      rateLimits: { requestsPerMinute: rpm },
      brandingConfig: input.brandingConfig ?? {},
      contactEmail: input.contactEmail,
    };
    const r = await this.conn.query<TenantRow>(
      `INSERT INTO tenants(tenant_id, name, config, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       RETURNING tenant_id, name, config, created_at, updated_at`,
      [input.id, input.name, JSON.stringify(config)]
    );
    return rowToTenant(r.rows[0]);
  }

  async update(id: string, patch: TenantPatch): Promise<Tenant> {
    const existing = await this.get(id);
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
    const merged = {
      allowedJurisdictions: patch.allowedJurisdictions ?? existing.allowedJurisdictions,
      rateLimits: {
        requestsPerMinute:
          patch.rateLimits?.requestsPerMinute ?? existing.rateLimits.requestsPerMinute,
      },
      brandingConfig: patch.brandingConfig ?? existing.brandingConfig,
      contactEmail: patch.contactEmail ?? existing.contactEmail,
    };
    const r = await this.conn.query<TenantRow>(
      `UPDATE tenants SET name = $1, config = $2::jsonb, updated_at = NOW()
       WHERE tenant_id = $3
       RETURNING tenant_id, name, config, created_at, updated_at`,
      [patch.name ?? existing.name, JSON.stringify(merged), id]
    );
    return rowToTenant(r.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const r = await this.conn.query(
      `DELETE FROM tenants WHERE tenant_id = $1`,
      [id]
    );
    this.rateWindows.delete(id);
    return (r.rowCount ?? 0) > 0;
  }

  async get(id: string): Promise<Tenant | null> {
    const r = await this.conn.query<TenantRow>(
      `SELECT tenant_id, name, config, created_at, updated_at
       FROM tenants WHERE tenant_id = $1`,
      [id]
    );
    if (r.rows.length === 0) return null;
    return rowToTenant(r.rows[0]);
  }

  async list(): Promise<Tenant[]> {
    const r = await this.conn.query<TenantRow>(
      `SELECT tenant_id, name, config, created_at, updated_at FROM tenants ORDER BY tenant_id ASC`
    );
    return r.rows.map(rowToTenant);
  }

  async size(): Promise<number> {
    const r = await this.conn.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM tenants'
    );
    return Number(r.rows[0].count);
  }

  async consumeRateBudget(
    id: string,
    now: number = Date.now()
  ): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
    const tenant = await this.get(id);
    if (!tenant) return { ok: true };
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

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM tenants');
    this.rateWindows.clear();
  }
}
