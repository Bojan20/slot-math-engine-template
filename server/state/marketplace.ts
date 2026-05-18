/**
 * CORTI W209 Faza 500.0 — Marketplace state (in-memory).
 *
 * In-memory backing for the marketplace REST API. Mirrors what the
 * `marketplace-pg.ts` store does against Postgres so both can be
 * swapped at boot time (driven by USE_POSTGRES). Tests default to the
 * in-memory store for zero external dependencies.
 *
 * Entity overview:
 *   - Kernel       — author-submitted IR, runs through gates → active
 *   - Template     — author-submitted UI/animation pack
 *   - Author       — submitter identity, KYC, payout method
 *   - Purchase     — operator-side purchase record with license JWT
 *   - Payout       — monthly aggregated payout row per author
 */

import { randomUUID, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KernelStatus =
  | 'pending'
  | 'testing'
  | 'approved'
  | 'rejected'
  | 'active';

export type AuthorTier = 1 | 2 | 3;
export type KycStatus = 'pending' | 'approved' | 'rejected';
export type PurchaseStatus = 'active' | 'refunded' | 'expired';
export type PayoutStatus = 'pending' | 'paid' | 'failed';
export type LicenseType = 'perpetual' | 'subscription' | 'metered';
export type ItemType = 'kernel' | 'template';

export interface KernelManifest {
  name?: string;
  description?: string;
  version?: string;
  irFile?: string;
  badges?: string[];
  /** L&W gap id, e.g. "M14_P1". */
  lwGap?: string;
  /** Portfolio P-id, e.g. "P-071". */
  pId?: string;
  /** Free-form key/values from the IR. */
  [k: string]: unknown;
}

export interface KernelRecord {
  id: string;
  authorId: string;
  manifest: KernelManifest;
  code?: string | null;
  storageUrl?: string | null;
  submissionStatus: KernelStatus;
  testVerdict: TestVerdict | null;
  certificationLevel: 'none' | 'self_test' | 'lab_certified';
  installCount: number;
  priceUsd: number;
  licenseType: LicenseType;
  lwGap?: string;
  pId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestVerdict {
  passed: boolean;
  totalSpecs: number;
  failures: number;
  rtpMean?: number;
  rtpCi?: [number, number];
  signedAt?: string;
  detail?: Record<string, unknown>;
}

export interface TemplateManifest {
  name?: string;
  description?: string;
  category?: string;
  thumbnail?: string;
  [k: string]: unknown;
}

export interface TemplateRecord {
  id: string;
  authorId: string | null;
  manifest: TemplateManifest;
  priceUsd: number;
  licenseType: LicenseType;
  previewAssetUrl: string | null;
  installCount: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface AuthorRecord {
  id: string;
  name: string;
  email: string;
  tier: AuthorTier;
  revenueSharePct: number;
  payoutMethod: PayoutMethod | null;
  kycStatus: KycStatus;
  apiKeyHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutMethod {
  type: 'bank' | 'paypal' | 'crypto';
  account?: string;
  routing?: string;
  iban?: string;
  email?: string;
  wallet?: string;
}

export interface PurchaseRecord {
  id: string;
  tenantId: string;
  itemId: string;
  itemType: ItemType;
  pricePaid: number;
  currency: string;
  licenseJwt: string;
  status: PurchaseStatus;
  paymentRef?: string | null;
  purchasedAt: string;
  refundedAt?: string | null;
}

export interface PayoutRow {
  id: string;
  authorId: string;
  periodStart: string;
  periodEnd: string;
  grossRevenue: number;
  platformCut: number;
  authorPayout: number;
  currency: string;
  status: PayoutStatus;
  payoutRef: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface KernelFilters {
  status?: KernelStatus;
  authorId?: string;
  lwGap?: string;
  pId?: string;
}

export interface SubmitKernelInput {
  authorId: string;
  manifest: KernelManifest;
  code?: string;
  storageUrl?: string;
  priceUsd?: number;
  licenseType?: LicenseType;
}

export interface UpsertAuthorInput {
  id?: string;
  name: string;
  email: string;
  tier?: AuthorTier;
  revenueSharePct?: number;
  payoutMethod?: PayoutMethod;
  kycStatus?: KycStatus;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

export class MarketplaceStore {
  private readonly kernels = new Map<string, KernelRecord>();
  private readonly templates = new Map<string, TemplateRecord>();
  private readonly authors = new Map<string, AuthorRecord>();
  private readonly authorsByEmail = new Map<string, string>();
  private readonly authorsByApiKeyHash = new Map<string, string>();
  private readonly purchases = new Map<string, PurchaseRecord>();
  private readonly payouts = new Map<string, PayoutRow>();

  // -------------------------------------------------------------------------
  // Kernels
  // -------------------------------------------------------------------------

  submitKernel(input: SubmitKernelInput): KernelRecord {
    if (!input.authorId) throw new RangeError('authorId required');
    const id = randomUUID();
    const now = nowIso();
    const rec: KernelRecord = {
      id,
      authorId: input.authorId,
      manifest: input.manifest ?? {},
      code: input.code ?? null,
      storageUrl: input.storageUrl ?? null,
      submissionStatus: 'pending',
      testVerdict: null,
      certificationLevel: 'none',
      installCount: 0,
      priceUsd: input.priceUsd ?? 0,
      licenseType: input.licenseType ?? 'perpetual',
      ...(input.manifest?.lwGap ? { lwGap: String(input.manifest.lwGap) } : {}),
      ...(input.manifest?.pId ? { pId: String(input.manifest.pId) } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.kernels.set(id, rec);
    return rec;
  }

  getKernelById(id: string): KernelRecord | null {
    return this.kernels.get(id) ?? null;
  }

  listKernels(filters: KernelFilters = {}): KernelRecord[] {
    let rows = Array.from(this.kernels.values());
    if (filters.status) rows = rows.filter((r) => r.submissionStatus === filters.status);
    if (filters.authorId) rows = rows.filter((r) => r.authorId === filters.authorId);
    if (filters.lwGap) rows = rows.filter((r) => r.lwGap === filters.lwGap);
    if (filters.pId) rows = rows.filter((r) => r.pId === filters.pId);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  updateKernelStatus(
    id: string,
    status: KernelStatus,
    verdict?: TestVerdict | null
  ): KernelRecord | null {
    const rec = this.kernels.get(id);
    if (!rec) return null;
    rec.submissionStatus = status;
    if (verdict !== undefined) rec.testVerdict = verdict;
    if (status === 'active') rec.certificationLevel = 'lab_certified';
    if (status === 'approved' && rec.certificationLevel === 'none')
      rec.certificationLevel = 'self_test';
    rec.updatedAt = nowIso();
    return rec;
  }

  bumpInstallCount(id: string, delta = 1): void {
    const k = this.kernels.get(id);
    if (k) {
      k.installCount += delta;
      k.updatedAt = nowIso();
    }
    const t = this.templates.get(id);
    if (t) {
      t.installCount += delta;
      t.updatedAt = nowIso();
    }
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  createTemplate(input: {
    authorId?: string | null;
    manifest: TemplateManifest;
    priceUsd?: number;
    licenseType?: LicenseType;
    previewAssetUrl?: string;
  }): TemplateRecord {
    const id = randomUUID();
    const now = nowIso();
    const rec: TemplateRecord = {
      id,
      authorId: input.authorId ?? null,
      manifest: input.manifest ?? {},
      priceUsd: input.priceUsd ?? 0,
      licenseType: input.licenseType ?? 'perpetual',
      previewAssetUrl: input.previewAssetUrl ?? null,
      installCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(id, rec);
    return rec;
  }

  getTemplateById(id: string): TemplateRecord | null {
    return this.templates.get(id) ?? null;
  }

  listTemplates(filters: { authorId?: string; status?: 'active' | 'archived' } = {}): TemplateRecord[] {
    let rows = Array.from(this.templates.values());
    if (filters.authorId) rows = rows.filter((r) => r.authorId === filters.authorId);
    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // -------------------------------------------------------------------------
  // Authors
  // -------------------------------------------------------------------------

  upsertAuthor(input: UpsertAuthorInput): AuthorRecord {
    if (!input.email) throw new RangeError('email required');
    const existingId = this.authorsByEmail.get(input.email);
    const now = nowIso();
    const apiKeyHash = input.apiKey ? sha256Hex(input.apiKey) : null;
    if (existingId) {
      const rec = this.authors.get(existingId)!;
      rec.name = input.name ?? rec.name;
      if (input.tier !== undefined) rec.tier = input.tier;
      if (input.revenueSharePct !== undefined) rec.revenueSharePct = input.revenueSharePct;
      if (input.payoutMethod !== undefined) rec.payoutMethod = input.payoutMethod;
      if (input.kycStatus !== undefined) rec.kycStatus = input.kycStatus;
      if (apiKeyHash) {
        if (rec.apiKeyHash) this.authorsByApiKeyHash.delete(rec.apiKeyHash);
        rec.apiKeyHash = apiKeyHash;
        this.authorsByApiKeyHash.set(apiKeyHash, rec.id);
      }
      rec.updatedAt = now;
      return rec;
    }
    const id = input.id ?? randomUUID();
    const rec: AuthorRecord = {
      id,
      name: input.name,
      email: input.email,
      tier: input.tier ?? 1,
      revenueSharePct: input.revenueSharePct ?? 0.70,
      payoutMethod: input.payoutMethod ?? null,
      kycStatus: input.kycStatus ?? 'pending',
      apiKeyHash,
      createdAt: now,
      updatedAt: now,
    };
    this.authors.set(id, rec);
    this.authorsByEmail.set(input.email, id);
    if (apiKeyHash) this.authorsByApiKeyHash.set(apiKeyHash, id);
    return rec;
  }

  getAuthorById(id: string): AuthorRecord | null {
    return this.authors.get(id) ?? null;
  }

  getAuthorByApiKey(apiKey: string): AuthorRecord | null {
    const id = this.authorsByApiKeyHash.get(sha256Hex(apiKey));
    if (!id) return null;
    return this.authors.get(id) ?? null;
  }

  listAuthors(): AuthorRecord[] {
    return Array.from(this.authors.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  setPayoutMethod(authorId: string, method: PayoutMethod): AuthorRecord | null {
    const rec = this.authors.get(authorId);
    if (!rec) return null;
    rec.payoutMethod = method;
    rec.updatedAt = nowIso();
    return rec;
  }

  // -------------------------------------------------------------------------
  // Purchases
  // -------------------------------------------------------------------------

  recordPurchase(input: {
    tenantId: string;
    itemId: string;
    itemType: ItemType;
    pricePaid: number;
    currency: string;
    licenseJwt: string;
    paymentRef?: string;
  }): PurchaseRecord {
    if (!input.tenantId) throw new RangeError('tenantId required');
    if (!input.itemId) throw new RangeError('itemId required');
    const id = randomUUID();
    const rec: PurchaseRecord = {
      id,
      tenantId: input.tenantId,
      itemId: input.itemId,
      itemType: input.itemType,
      pricePaid: input.pricePaid,
      currency: input.currency,
      licenseJwt: input.licenseJwt,
      status: 'active',
      paymentRef: input.paymentRef ?? null,
      purchasedAt: nowIso(),
      refundedAt: null,
    };
    this.purchases.set(id, rec);
    this.bumpInstallCount(input.itemId, 1);
    return rec;
  }

  getPurchaseById(id: string): PurchaseRecord | null {
    return this.purchases.get(id) ?? null;
  }

  listPurchasesByTenant(tenantId: string): PurchaseRecord[] {
    return Array.from(this.purchases.values())
      .filter((p) => p.tenantId === tenantId)
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  }

  listAllPurchases(): PurchaseRecord[] {
    return Array.from(this.purchases.values());
  }

  refundPurchase(id: string): PurchaseRecord | null {
    const rec = this.purchases.get(id);
    if (!rec) return null;
    rec.status = 'refunded';
    rec.refundedAt = nowIso();
    return rec;
  }

  // -------------------------------------------------------------------------
  // Payouts
  // -------------------------------------------------------------------------

  /**
   * Compute monthly payouts for every author. Walks the purchase ledger
   * looking for sales of items authored by each author within the
   * window, sums revenue, splits via revenue_share_pct.
   *
   * Idempotent: re-running for the same period overwrites the row(s).
   */
  computeMonthlyPayouts(period: { start: string; end: string }): PayoutRow[] {
    const out: PayoutRow[] = [];
    const startMs = new Date(period.start).getTime();
    const endMs = new Date(period.end).getTime();
    const authorRevenue = new Map<string, number>();

    for (const p of this.purchases.values()) {
      if (p.status !== 'active') continue;
      const t = new Date(p.purchasedAt).getTime();
      if (t < startMs || t >= endMs) continue;
      const owner = this.findItemAuthorId(p.itemId, p.itemType);
      if (!owner) continue;
      authorRevenue.set(owner, (authorRevenue.get(owner) ?? 0) + p.pricePaid);
    }

    // Drop existing payout rows for that exact period.
    for (const existing of Array.from(this.payouts.values())) {
      if (existing.periodStart === period.start && existing.periodEnd === period.end) {
        this.payouts.delete(existing.id);
      }
    }

    for (const [authorId, gross] of authorRevenue) {
      const author = this.authors.get(authorId);
      const share = author?.revenueSharePct ?? 0.70;
      const authorPayout = Math.round(gross * share * 100) / 100;
      const platformCut = Math.round((gross - authorPayout) * 100) / 100;
      const row: PayoutRow = {
        id: randomUUID(),
        authorId,
        periodStart: period.start,
        periodEnd: period.end,
        grossRevenue: gross,
        platformCut,
        authorPayout,
        currency: 'USD',
        status: 'pending',
        payoutRef: null,
        createdAt: nowIso(),
        paidAt: null,
      };
      this.payouts.set(row.id, row);
      out.push(row);
    }
    return out;
  }

  listPayoutsByAuthor(authorId: string): PayoutRow[] {
    return Array.from(this.payouts.values())
      .filter((p) => p.authorId === authorId)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }

  markPayoutPaid(id: string, payoutRef: string): PayoutRow | null {
    const row = this.payouts.get(id);
    if (!row) return null;
    row.status = 'paid';
    row.payoutRef = payoutRef;
    row.paidAt = nowIso();
    return row;
  }

  private findItemAuthorId(itemId: string, itemType: ItemType): string | null {
    if (itemType === 'kernel') {
      return this.kernels.get(itemId)?.authorId ?? null;
    }
    return this.templates.get(itemId)?.authorId ?? null;
  }

  /** Test-only reset. */
  reset(): void {
    this.kernels.clear();
    this.templates.clear();
    this.authors.clear();
    this.authorsByEmail.clear();
    this.authorsByApiKeyHash.clear();
    this.purchases.clear();
    this.payouts.clear();
  }
}
