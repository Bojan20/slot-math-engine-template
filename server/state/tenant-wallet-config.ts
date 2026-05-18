/**
 * W210 Faza 600.0 — In-memory tenant→wallet-provider config store.
 *
 * Used in tests and when USE_POSTGRES is false. Mirrors the surface of
 * `PostgresTenantWalletConfigStore` so callers can swap freely.
 *
 * Credentials are encrypted with AES-256-GCM via `wallet/crypto.ts`
 * even in memory, so unit specs exercise the same path as production.
 */
import { randomUUID } from 'node:crypto';
import type { ProviderConfig } from '../lib/wallet/types.js';
import {
  decryptConfigBase64,
  encryptConfigBase64,
} from '../lib/wallet/crypto.js';

export type HealthStatus = 'unknown' | 'healthy' | 'degraded' | 'down';

export interface TenantWalletConfigRow {
  id: string;
  tenantId: string;
  providerName: string;
  /** Base64-encoded encrypted blob (in memory) / Buffer (Postgres). */
  configEncrypted: string;
  healthStatus: HealthStatus;
  lastCheckAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWalletConfig {
  id: string;
  tenantId: string;
  providerName: string;
  config: ProviderConfig;
  healthStatus: HealthStatus;
  lastCheckAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class TenantWalletConfigStore {
  private readonly byTenant = new Map<string, TenantWalletConfigRow>();

  setTenantWalletConfig(
    tenantId: string,
    providerName: string,
    config: ProviderConfig
  ): TenantWalletConfig {
    const now = new Date().toISOString();
    const existing = this.byTenant.get(tenantId);
    const row: TenantWalletConfigRow = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      providerName,
      configEncrypted: encryptConfigBase64(config),
      healthStatus: 'unknown',
      lastCheckAt: null,
      active: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.byTenant.set(tenantId, row);
    return this.hydrate(row);
  }

  getTenantWalletConfig(tenantId: string): TenantWalletConfig | null {
    const row = this.byTenant.get(tenantId);
    if (!row) return null;
    return this.hydrate(row);
  }

  listConfigs(): TenantWalletConfig[] {
    return Array.from(this.byTenant.values()).map((r) => this.hydrate(r));
  }

  updateHealth(tenantId: string, status: HealthStatus): void {
    const row = this.byTenant.get(tenantId);
    if (!row) return;
    row.healthStatus = status;
    row.lastCheckAt = new Date().toISOString();
    row.updatedAt = row.lastCheckAt;
  }

  deactivate(tenantId: string): void {
    const row = this.byTenant.get(tenantId);
    if (!row) return;
    row.active = false;
    row.updatedAt = new Date().toISOString();
  }

  reset(): void {
    this.byTenant.clear();
  }

  /** Test-only: peek at raw encrypted blob to confirm at-rest crypto. */
  rawEncrypted(tenantId: string): string | null {
    return this.byTenant.get(tenantId)?.configEncrypted ?? null;
  }

  private hydrate(row: TenantWalletConfigRow): TenantWalletConfig {
    return {
      id: row.id,
      tenantId: row.tenantId,
      providerName: row.providerName,
      config: decryptConfigBase64<ProviderConfig>(row.configEncrypted),
      healthStatus: row.healthStatus,
      lastCheckAt: row.lastCheckAt,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
