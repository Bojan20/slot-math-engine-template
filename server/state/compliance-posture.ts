/**
 * W214 Faza 600.3 — Compliance posture tracker.
 *
 * Tracks per-jurisdiction × per-tenant × per-game compliance state and
 * surfaces upcoming expiry / outstanding-finding alerts. The store is
 * in-memory (Postgres backing can be added later via the same
 * interface); routes mount it under `/api/admin/compliance-posture`.
 *
 * Fields tracked per entry:
 *   - certValidUntil       ISO timestamp
 *   - rtsComplianceStatus  'compliant' | 'non_compliant' | 'pending_review'
 *   - findingsOutstanding  number
 *   - lastReviewedAt       ISO timestamp
 *
 * Auto-alerts fire 60 days before cert expiry — caller pulls them via
 * `listUpcomingExpiries()` (the daily cron observability sweep wires
 * this).
 */

export type RtsComplianceStatus = 'compliant' | 'non_compliant' | 'pending_review';

export interface CompliancePostureEntry {
  /** Tenant operating the game. */
  tenantId: string;
  /** Game identifier (matches IR `gameId`). */
  gameId: string;
  /** ISO-3166 country code or regulator slug. */
  jurisdiction: string;
  /** Lab cert expiry (ISO). */
  certValidUntil: string;
  rtsComplianceStatus: RtsComplianceStatus;
  findingsOutstanding: number;
  lastReviewedAt: string;
  /** Optional human-readable note. */
  note?: string;
}

export interface UpcomingExpiryAlert {
  tenantId: string;
  gameId: string;
  jurisdiction: string;
  certValidUntil: string;
  daysRemaining: number;
}

export const EXPIRY_WARNING_DAYS = 60;

/** Stable key for one (tenant, game, jurisdiction) triple. */
export function makeKey(tenantId: string, gameId: string, jurisdiction: string): string {
  return `${tenantId}::${gameId}::${jurisdiction}`;
}

export interface CompliancePostureStore {
  upsert(entry: CompliancePostureEntry): void;
  remove(tenantId: string, gameId: string, jurisdiction: string): boolean;
  get(tenantId: string, gameId: string, jurisdiction: string): CompliancePostureEntry | null;
  list(filter?: PostureFilter): CompliancePostureEntry[];
  listUpcomingExpiries(now?: Date, windowDays?: number): UpcomingExpiryAlert[];
  countByStatus(): Record<RtsComplianceStatus, number>;
  outstandingFindingsTotal(): number;
  snapshot(): CompliancePostureEntry[];
}

export interface PostureFilter {
  tenantId?: string;
  jurisdiction?: string;
  status?: RtsComplianceStatus;
}

export class InMemoryCompliancePostureStore implements CompliancePostureStore {
  private readonly entries = new Map<string, CompliancePostureEntry>();

  upsert(entry: CompliancePostureEntry): void {
    validateEntry(entry);
    const key = makeKey(entry.tenantId, entry.gameId, entry.jurisdiction);
    this.entries.set(key, { ...entry });
  }

  remove(tenantId: string, gameId: string, jurisdiction: string): boolean {
    return this.entries.delete(makeKey(tenantId, gameId, jurisdiction));
  }

  get(tenantId: string, gameId: string, jurisdiction: string): CompliancePostureEntry | null {
    return this.entries.get(makeKey(tenantId, gameId, jurisdiction)) ?? null;
  }

  list(filter: PostureFilter = {}): CompliancePostureEntry[] {
    const out: CompliancePostureEntry[] = [];
    for (const e of this.entries.values()) {
      if (filter.tenantId && e.tenantId !== filter.tenantId) continue;
      if (filter.jurisdiction && e.jurisdiction !== filter.jurisdiction) continue;
      if (filter.status && e.rtsComplianceStatus !== filter.status) continue;
      out.push({ ...e });
    }
    return out.sort((a, b) => makeKey(a.tenantId, a.gameId, a.jurisdiction)
      .localeCompare(makeKey(b.tenantId, b.gameId, b.jurisdiction)));
  }

  listUpcomingExpiries(now: Date = new Date(), windowDays: number = EXPIRY_WARNING_DAYS): UpcomingExpiryAlert[] {
    const nowMs = now.getTime();
    const cutoffMs = nowMs + windowDays * 24 * 60 * 60 * 1000;
    const out: UpcomingExpiryAlert[] = [];
    for (const e of this.entries.values()) {
      const ts = Date.parse(e.certValidUntil);
      if (!Number.isFinite(ts)) continue;
      if (ts <= cutoffMs && ts >= nowMs) {
        const daysRemaining = Math.max(0, Math.floor((ts - nowMs) / (24 * 60 * 60 * 1000)));
        out.push({
          tenantId: e.tenantId,
          gameId: e.gameId,
          jurisdiction: e.jurisdiction,
          certValidUntil: e.certValidUntil,
          daysRemaining,
        });
      }
    }
    return out.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  countByStatus(): Record<RtsComplianceStatus, number> {
    const out: Record<RtsComplianceStatus, number> = {
      compliant: 0,
      non_compliant: 0,
      pending_review: 0,
    };
    for (const e of this.entries.values()) {
      out[e.rtsComplianceStatus] += 1;
    }
    return out;
  }

  outstandingFindingsTotal(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.findingsOutstanding;
    return n;
  }

  snapshot(): CompliancePostureEntry[] {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }
}

function validateEntry(e: CompliancePostureEntry): void {
  if (!e.tenantId || typeof e.tenantId !== 'string') throw new Error('compliance: bad tenantId');
  if (!e.gameId || typeof e.gameId !== 'string') throw new Error('compliance: bad gameId');
  if (!e.jurisdiction || typeof e.jurisdiction !== 'string') throw new Error('compliance: bad jurisdiction');
  if (!Number.isFinite(Date.parse(e.certValidUntil))) throw new Error('compliance: bad certValidUntil');
  if (!Number.isFinite(Date.parse(e.lastReviewedAt))) throw new Error('compliance: bad lastReviewedAt');
  if (typeof e.findingsOutstanding !== 'number' || e.findingsOutstanding < 0
      || !Number.isInteger(e.findingsOutstanding)) {
    throw new Error('compliance: bad findingsOutstanding');
  }
  if (!['compliant', 'non_compliant', 'pending_review'].includes(e.rtsComplianceStatus)) {
    throw new Error('compliance: bad rtsComplianceStatus');
  }
}

/**
 * Convenience: render the store contents as the response body shape
 * expected by the admin endpoint.
 */
export function renderPostureReport(store: CompliancePostureStore, now: Date = new Date()) {
  return {
    generatedAt: now.toISOString(),
    counts: store.countByStatus(),
    outstandingFindings: store.outstandingFindingsTotal(),
    upcomingExpiries: store.listUpcomingExpiries(now),
    entries: store.list(),
  };
}
