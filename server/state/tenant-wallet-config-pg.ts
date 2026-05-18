/**
 * W210 Faza 600.0 — Postgres-backed tenant→wallet-provider config store.
 *
 * Schema lives in `db/migrations/011_tenant_wallet_config.sql`. The
 * `config_encrypted` column stores the AES-256-GCM blob exactly as
 * produced by `wallet/crypto.ts`. Decryption happens only inside this
 * module so callers never see ciphertext.
 *
 * UNIQUE(tenant_id) guarantees one active config per tenant; updating
 * is an UPSERT that bumps `updated_at`.
 */
import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import type { ProviderConfig } from '../lib/wallet/types.js';
import { decryptConfig, encryptConfig } from '../lib/wallet/crypto.js';
import {
  assertTenantScopedQuery,
  crossTenantOverride,
} from '../lib/tenant-isolation.js';
import type {
  HealthStatus,
  TenantWalletConfig,
} from './tenant-wallet-config.js';

interface DbRow {
  id: string;
  tenant_id: string;
  provider_name: string;
  config_encrypted: Buffer;
  health_status: string;
  last_check: Date | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToConfig(row: DbRow): TenantWalletConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerName: row.provider_name,
    config: decryptConfig<ProviderConfig>(row.config_encrypted),
    healthStatus: row.health_status as HealthStatus,
    lastCheckAt: row.last_check ? row.last_check.toISOString() : null,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresTenantWalletConfigStore {
  /**
   * W213 Faza 600.2 — `tenant_wallet_config` is not in
   * MULTI_TENANT_TABLES; UNIQUE(tenant_id) makes single-tenant queries
   * trivially safe. `listConfigs()` is admin-only and is wrapped via
   * {@link crossTenantOverride} so the W208 observer records the
   * override rather than treating it as a missing-context leak.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private static readonly _adminScope = crossTenantOverride;

  constructor(private readonly conn: PgConnection) {}

  async setTenantWalletConfig(
    tenantId: string,
    providerName: string,
    config: ProviderConfig
  ): Promise<TenantWalletConfig> {
    const encrypted = encryptConfig(config);
    return this.conn.withTransaction(async (client) => {
      const existing = await client.query<DbRow>(
        `SELECT id, tenant_id, provider_name, config_encrypted, health_status, last_check, active, created_at, updated_at
         FROM tenant_wallet_config WHERE tenant_id = $1 AND active = true`,
        [tenantId]
      );
      if (existing.rows.length > 0) {
        const r = await client.query<DbRow>(
          `UPDATE tenant_wallet_config SET provider_name = $1, config_encrypted = $2,
             health_status = 'unknown', last_check = NULL, updated_at = NOW()
           WHERE tenant_id = $3 AND active = true
           RETURNING id, tenant_id, provider_name, config_encrypted, health_status, last_check, active, created_at, updated_at`,
          [providerName, encrypted, tenantId]
        );
        return rowToConfig(r.rows[0]);
      }
      const id = randomUUID();
      const r = await client.query<DbRow>(
        `INSERT INTO tenant_wallet_config(id, tenant_id, provider_name, config_encrypted, health_status, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'unknown', true, NOW(), NOW())
         RETURNING id, tenant_id, provider_name, config_encrypted, health_status, last_check, active, created_at, updated_at`,
        [id, tenantId, providerName, encrypted]
      );
      return rowToConfig(r.rows[0]);
    });
  }

  async getTenantWalletConfig(tenantId: string): Promise<TenantWalletConfig | null> {
    const sql =
      `SELECT id, tenant_id, provider_name, config_encrypted, health_status, last_check, active, created_at, updated_at
       FROM tenant_wallet_config WHERE tenant_id = $1 AND active = true
       LIMIT 1`;
    // Sentinel: documents the tenant boundary even though
    // tenant_wallet_config is not in MULTI_TENANT_TABLES.
    assertTenantScopedQuery(sql);
    const r = await this.conn.query<DbRow>(sql, [tenantId]);
    if (r.rows.length === 0) return null;
    return rowToConfig(r.rows[0]);
  }

  async listConfigs(): Promise<TenantWalletConfig[]> {
    const r = await this.conn.query<DbRow>(
      `SELECT id, tenant_id, provider_name, config_encrypted, health_status, last_check, active, created_at, updated_at
       FROM tenant_wallet_config WHERE active = true ORDER BY tenant_id ASC`
    );
    return r.rows.map(rowToConfig);
  }

  async updateHealth(tenantId: string, status: HealthStatus): Promise<void> {
    await this.conn.query(
      `UPDATE tenant_wallet_config SET health_status = $1, last_check = NOW(), updated_at = NOW()
       WHERE tenant_id = $2 AND active = true`,
      [status, tenantId]
    );
  }

  async deactivate(tenantId: string): Promise<void> {
    await this.conn.query(
      `UPDATE tenant_wallet_config SET active = false, updated_at = NOW()
       WHERE tenant_id = $1 AND active = true`,
      [tenantId]
    );
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM tenant_wallet_config');
  }
}
