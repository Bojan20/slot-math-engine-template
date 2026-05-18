/**
 * CORTI W209 Faza 500.0 — Marketplace state (Postgres-backed).
 *
 * Mirrors the {@link MarketplaceStore} surface but persists every row
 * into the five `marketplace_*` tables added in migrations 006-010.
 * Cache reads of hot paths via the W208 `Cache<T>` abstraction so the
 * lobby listing endpoint stays fast under load.
 */

import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import type { Cache } from '../lib/cache.js';
import {
  sha256Hex,
  type AuthorRecord,
  type AuthorTier,
  type ItemType,
  type KernelFilters,
  type KernelRecord,
  type KernelStatus,
  type KycStatus,
  type LicenseType,
  type PayoutMethod,
  type PayoutRow,
  type PurchaseRecord,
  type SubmitKernelInput,
  type TemplateManifest,
  type TemplateRecord,
  type TestVerdict,
  type UpsertAuthorInput,
} from './marketplace.js';

const CACHE_TTL_MS = 30_000;

function nowIso(): string {
  return new Date().toISOString();
}

interface KernelRow {
  id: string;
  author_id: string;
  manifest: unknown;
  code: string | null;
  storage_url: string | null;
  submission_status: KernelStatus;
  test_verdict: TestVerdict | null;
  certification_level: 'none' | 'self_test' | 'lab_certified';
  install_count: string | number;
  price_usd: number;
  license_type: LicenseType;
  lw_gap: string | null;
  p_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TemplateRow {
  id: string;
  author_id: string | null;
  manifest: unknown;
  price_usd: number;
  license_type: LicenseType;
  preview_asset_url: string | null;
  install_count: string | number;
  status: 'active' | 'archived';
  created_at: Date;
  updated_at: Date;
}

interface AuthorRow {
  id: string;
  name: string;
  email: string;
  tier: number;
  revenue_share_pct: number;
  payout_method: PayoutMethod | null;
  kyc_status: KycStatus;
  api_key_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PurchaseRow {
  id: string;
  tenant_id: string;
  item_id: string;
  item_type: ItemType;
  price_paid: number;
  currency: string;
  license_jwt: string;
  status: 'active' | 'refunded' | 'expired';
  payment_ref: string | null;
  purchased_at: Date;
  refunded_at: Date | null;
}

interface PayoutDbRow {
  id: string;
  author_id: string;
  period_start: Date;
  period_end: Date;
  gross_revenue: number;
  platform_cut: number;
  author_payout: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  payout_ref: string | null;
  created_at: Date;
  paid_at: Date | null;
}

function rowToKernel(r: KernelRow): KernelRecord {
  return {
    id: r.id,
    authorId: r.author_id,
    manifest: (r.manifest as KernelRecord['manifest']) ?? {},
    code: r.code,
    storageUrl: r.storage_url,
    submissionStatus: r.submission_status,
    testVerdict: r.test_verdict,
    certificationLevel: r.certification_level,
    installCount: Number(r.install_count),
    priceUsd: r.price_usd,
    licenseType: r.license_type,
    ...(r.lw_gap ? { lwGap: r.lw_gap } : {}),
    ...(r.p_id ? { pId: r.p_id } : {}),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToTemplate(r: TemplateRow): TemplateRecord {
  return {
    id: r.id,
    authorId: r.author_id,
    manifest: (r.manifest as TemplateManifest) ?? {},
    priceUsd: r.price_usd,
    licenseType: r.license_type,
    previewAssetUrl: r.preview_asset_url,
    installCount: Number(r.install_count),
    status: r.status,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToAuthor(r: AuthorRow): AuthorRecord {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    tier: r.tier as AuthorTier,
    revenueSharePct: r.revenue_share_pct,
    payoutMethod: r.payout_method,
    kycStatus: r.kyc_status,
    apiKeyHash: r.api_key_hash,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function rowToPurchase(r: PurchaseRow): PurchaseRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    itemId: r.item_id,
    itemType: r.item_type,
    pricePaid: r.price_paid,
    currency: r.currency,
    licenseJwt: r.license_jwt,
    status: r.status,
    paymentRef: r.payment_ref,
    purchasedAt: r.purchased_at.toISOString(),
    refundedAt: r.refunded_at ? r.refunded_at.toISOString() : null,
  };
}

function rowToPayout(r: PayoutDbRow): PayoutRow {
  return {
    id: r.id,
    authorId: r.author_id,
    periodStart: r.period_start.toISOString().slice(0, 10),
    periodEnd: r.period_end.toISOString().slice(0, 10),
    grossRevenue: r.gross_revenue,
    platformCut: r.platform_cut,
    authorPayout: r.author_payout,
    currency: r.currency,
    status: r.status,
    payoutRef: r.payout_ref,
    createdAt: r.created_at.toISOString(),
    paidAt: r.paid_at ? r.paid_at.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// PG store
// ---------------------------------------------------------------------------

export class PostgresMarketplaceStore {
  constructor(
    private readonly conn: PgConnection,
    private readonly cache?: Cache<unknown>
  ) {}

  // --- Kernels ---

  async submitKernel(input: SubmitKernelInput): Promise<KernelRecord> {
    const id = randomUUID();
    const lwGap = input.manifest?.lwGap ? String(input.manifest.lwGap) : null;
    const pId = input.manifest?.pId ? String(input.manifest.pId) : null;
    const r = await this.conn.query<KernelRow>(
      `INSERT INTO marketplace_kernels(
         id, author_id, manifest, code, storage_url,
         submission_status, certification_level, install_count,
         price_usd, license_type, lw_gap, p_id, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'pending', 'none', 0, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        input.authorId,
        JSON.stringify(input.manifest ?? {}),
        input.code ?? null,
        input.storageUrl ?? null,
        input.priceUsd ?? 0,
        input.licenseType ?? 'perpetual',
        lwGap,
        pId,
      ]
    );
    await this.invalidateKernelList();
    return rowToKernel(r.rows[0]);
  }

  async getKernelById(id: string): Promise<KernelRecord | null> {
    const ck = `mkt:kernel:${id}`;
    if (this.cache) {
      const hit = (await this.cache.get(ck)) as KernelRecord | null;
      if (hit) return hit;
    }
    const r = await this.conn.query<KernelRow>(
      'SELECT * FROM marketplace_kernels WHERE id = $1',
      [id]
    );
    if (r.rows.length === 0) return null;
    const rec = rowToKernel(r.rows[0]);
    if (this.cache) await this.cache.set(ck, rec, { ttlMs: CACHE_TTL_MS });
    return rec;
  }

  async listKernels(filters: KernelFilters = {}): Promise<KernelRecord[]> {
    const ck = `mkt:kernels:${JSON.stringify(filters)}`;
    if (this.cache) {
      const hit = (await this.cache.get(ck)) as KernelRecord[] | null;
      if (hit) return hit;
    }
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      params.push(filters.status);
      where.push(`submission_status = $${params.length}`);
    }
    if (filters.authorId) {
      params.push(filters.authorId);
      where.push(`author_id = $${params.length}`);
    }
    if (filters.lwGap) {
      params.push(filters.lwGap);
      where.push(`lw_gap = $${params.length}`);
    }
    if (filters.pId) {
      params.push(filters.pId);
      where.push(`p_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.conn.query<KernelRow>(
      `SELECT * FROM marketplace_kernels ${whereSql} ORDER BY created_at ASC`,
      params
    );
    const rows = r.rows.map(rowToKernel);
    if (this.cache) await this.cache.set(ck, rows, { ttlMs: CACHE_TTL_MS });
    return rows;
  }

  async updateKernelStatus(
    id: string,
    status: KernelStatus,
    verdict?: TestVerdict | null
  ): Promise<KernelRecord | null> {
    const certBump =
      status === 'active' ? 'lab_certified' : status === 'approved' ? 'self_test' : null;
    let sql = `UPDATE marketplace_kernels SET submission_status = $2, updated_at = NOW()`;
    const params: unknown[] = [id, status];
    if (verdict !== undefined) {
      params.push(verdict ? JSON.stringify(verdict) : null);
      sql += `, test_verdict = $${params.length}::jsonb`;
    }
    if (certBump) {
      params.push(certBump);
      sql += `, certification_level = $${params.length}`;
    }
    sql += ' WHERE id = $1 RETURNING *';
    const r = await this.conn.query<KernelRow>(sql, params);
    await this.invalidateKernelList();
    if (this.cache) await this.cache.del(`mkt:kernel:${id}`);
    return r.rows.length ? rowToKernel(r.rows[0]) : null;
  }

  // --- Templates ---

  async createTemplate(input: {
    authorId?: string | null;
    manifest: TemplateManifest;
    priceUsd?: number;
    licenseType?: LicenseType;
    previewAssetUrl?: string;
  }): Promise<TemplateRecord> {
    const id = randomUUID();
    const r = await this.conn.query<TemplateRow>(
      `INSERT INTO marketplace_templates(
         id, author_id, manifest, price_usd, license_type, preview_asset_url,
         install_count, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, 0, 'active', NOW(), NOW())
       RETURNING *`,
      [
        id,
        input.authorId ?? null,
        JSON.stringify(input.manifest ?? {}),
        input.priceUsd ?? 0,
        input.licenseType ?? 'perpetual',
        input.previewAssetUrl ?? null,
      ]
    );
    return rowToTemplate(r.rows[0]);
  }

  async getTemplateById(id: string): Promise<TemplateRecord | null> {
    const r = await this.conn.query<TemplateRow>(
      'SELECT * FROM marketplace_templates WHERE id = $1',
      [id]
    );
    return r.rows.length ? rowToTemplate(r.rows[0]) : null;
  }

  async listTemplates(
    filters: { authorId?: string; status?: 'active' | 'archived' } = {}
  ): Promise<TemplateRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.authorId) {
      params.push(filters.authorId);
      where.push(`author_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.conn.query<TemplateRow>(
      `SELECT * FROM marketplace_templates ${whereSql} ORDER BY created_at ASC`,
      params
    );
    return r.rows.map(rowToTemplate);
  }

  // --- Authors ---

  async upsertAuthor(input: UpsertAuthorInput): Promise<AuthorRecord> {
    const existing = await this.conn.query<AuthorRow>(
      'SELECT * FROM marketplace_authors WHERE email = $1',
      [input.email]
    );
    const apiKeyHash = input.apiKey ? sha256Hex(input.apiKey) : null;
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id;
      const r = await this.conn.query<AuthorRow>(
        `UPDATE marketplace_authors SET
           name = COALESCE($2, name),
           tier = COALESCE($3, tier),
           revenue_share_pct = COALESCE($4, revenue_share_pct),
           payout_method = COALESCE($5::jsonb, payout_method),
           kyc_status = COALESCE($6, kyc_status),
           api_key_hash = COALESCE($7, api_key_hash),
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.name,
          input.tier ?? null,
          input.revenueSharePct ?? null,
          input.payoutMethod ? JSON.stringify(input.payoutMethod) : null,
          input.kycStatus ?? null,
          apiKeyHash,
        ]
      );
      return rowToAuthor(r.rows[0]);
    }
    const id = input.id ?? randomUUID();
    const r = await this.conn.query<AuthorRow>(
      `INSERT INTO marketplace_authors(
         id, name, email, tier, revenue_share_pct,
         payout_method, kyc_status, api_key_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        id,
        input.name,
        input.email,
        input.tier ?? 1,
        input.revenueSharePct ?? 0.7,
        input.payoutMethod ? JSON.stringify(input.payoutMethod) : null,
        input.kycStatus ?? 'pending',
        apiKeyHash,
      ]
    );
    return rowToAuthor(r.rows[0]);
  }

  async getAuthorById(id: string): Promise<AuthorRecord | null> {
    const r = await this.conn.query<AuthorRow>(
      'SELECT * FROM marketplace_authors WHERE id = $1',
      [id]
    );
    return r.rows.length ? rowToAuthor(r.rows[0]) : null;
  }

  async getAuthorByApiKey(apiKey: string): Promise<AuthorRecord | null> {
    const r = await this.conn.query<AuthorRow>(
      'SELECT * FROM marketplace_authors WHERE api_key_hash = $1',
      [sha256Hex(apiKey)]
    );
    return r.rows.length ? rowToAuthor(r.rows[0]) : null;
  }

  async setPayoutMethod(
    authorId: string,
    method: PayoutMethod
  ): Promise<AuthorRecord | null> {
    const r = await this.conn.query<AuthorRow>(
      `UPDATE marketplace_authors SET payout_method = $2::jsonb, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [authorId, JSON.stringify(method)]
    );
    return r.rows.length ? rowToAuthor(r.rows[0]) : null;
  }

  // --- Purchases ---

  async recordPurchase(input: {
    tenantId: string;
    itemId: string;
    itemType: ItemType;
    pricePaid: number;
    currency: string;
    licenseJwt: string;
    paymentRef?: string;
  }): Promise<PurchaseRecord> {
    const id = randomUUID();
    const r = await this.conn.query<PurchaseRow>(
      `INSERT INTO marketplace_purchases(
         id, tenant_id, item_id, item_type, price_paid, currency,
         license_jwt, status, payment_ref, purchased_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW())
       RETURNING *`,
      [
        id,
        input.tenantId,
        input.itemId,
        input.itemType,
        input.pricePaid,
        input.currency,
        input.licenseJwt,
        input.paymentRef ?? null,
      ]
    );
    // Bump install count atomically.
    if (input.itemType === 'kernel') {
      await this.conn.query(
        'UPDATE marketplace_kernels SET install_count = install_count + 1 WHERE id = $1',
        [input.itemId]
      );
    } else {
      await this.conn.query(
        'UPDATE marketplace_templates SET install_count = install_count + 1 WHERE id = $1',
        [input.itemId]
      );
    }
    return rowToPurchase(r.rows[0]);
  }

  async getPurchaseById(id: string): Promise<PurchaseRecord | null> {
    const r = await this.conn.query<PurchaseRow>(
      'SELECT * FROM marketplace_purchases WHERE id = $1',
      [id]
    );
    return r.rows.length ? rowToPurchase(r.rows[0]) : null;
  }

  async listPurchasesByTenant(tenantId: string): Promise<PurchaseRecord[]> {
    const r = await this.conn.query<PurchaseRow>(
      `SELECT * FROM marketplace_purchases WHERE tenant_id = $1 ORDER BY purchased_at DESC`,
      [tenantId]
    );
    return r.rows.map(rowToPurchase);
  }

  async refundPurchase(id: string): Promise<PurchaseRecord | null> {
    const r = await this.conn.query<PurchaseRow>(
      `UPDATE marketplace_purchases SET status = 'refunded', refunded_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return r.rows.length ? rowToPurchase(r.rows[0]) : null;
  }

  // --- Payouts ---

  async computeMonthlyPayouts(period: { start: string; end: string }): Promise<PayoutRow[]> {
    // Aggregate per-author revenue from active purchases in the window.
    const r = await this.conn.query<{
      author_id: string;
      gross: number;
      revenue_share_pct: number;
    }>(
      `SELECT
         COALESCE(k.author_id, t.author_id) AS author_id,
         SUM(p.price_paid)::DOUBLE PRECISION AS gross,
         MAX(a.revenue_share_pct)::DOUBLE PRECISION AS revenue_share_pct
       FROM marketplace_purchases p
         LEFT JOIN marketplace_kernels k   ON p.item_type = 'kernel'   AND k.id = p.item_id
         LEFT JOIN marketplace_templates t ON p.item_type = 'template' AND t.id = p.item_id
         LEFT JOIN marketplace_authors a   ON a.id = COALESCE(k.author_id, t.author_id)
       WHERE p.status = 'active'
         AND p.purchased_at >= $1
         AND p.purchased_at <  $2
         AND COALESCE(k.author_id, t.author_id) IS NOT NULL
       GROUP BY COALESCE(k.author_id, t.author_id)`,
      [period.start, period.end]
    );

    // Wipe any pre-existing payouts for that period, then insert fresh rows.
    await this.conn.query(
      `DELETE FROM marketplace_payouts WHERE period_start = $1 AND period_end = $2`,
      [period.start, period.end]
    );

    const out: PayoutRow[] = [];
    for (const row of r.rows) {
      const share = row.revenue_share_pct ?? 0.7;
      const gross = Number(row.gross);
      const authorPayout = Math.round(gross * share * 100) / 100;
      const platformCut = Math.round((gross - authorPayout) * 100) / 100;
      const id = randomUUID();
      const ins = await this.conn.query<PayoutDbRow>(
        `INSERT INTO marketplace_payouts(
           id, author_id, period_start, period_end,
           gross_revenue, platform_cut, author_payout, currency,
           status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 'pending', NOW())
         RETURNING *`,
        [id, row.author_id, period.start, period.end, gross, platformCut, authorPayout]
      );
      out.push(rowToPayout(ins.rows[0]));
    }
    return out;
  }

  async listPayoutsByAuthor(authorId: string): Promise<PayoutRow[]> {
    const r = await this.conn.query<PayoutDbRow>(
      `SELECT * FROM marketplace_payouts WHERE author_id = $1 ORDER BY period_start DESC`,
      [authorId]
    );
    return r.rows.map(rowToPayout);
  }

  async markPayoutPaid(id: string, payoutRef: string): Promise<PayoutRow | null> {
    const r = await this.conn.query<PayoutDbRow>(
      `UPDATE marketplace_payouts SET status = 'paid', payout_ref = $2, paid_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, payoutRef]
    );
    return r.rows.length ? rowToPayout(r.rows[0]) : null;
  }

  // --- Cache helpers ---

  private async invalidateKernelList(): Promise<void> {
    if (this.cache) await this.cache.delByPrefix('mkt:kernels:');
  }

  /** Test-only. */
  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM marketplace_payouts');
    await this.conn.query('DELETE FROM marketplace_purchases');
    await this.conn.query('DELETE FROM marketplace_templates');
    await this.conn.query('DELETE FROM marketplace_kernels');
    await this.conn.query('DELETE FROM marketplace_authors');
  }

  // Touch private nowIso() so we keep the import warning silent.
  _ts(): string {
    return nowIso();
  }
}
