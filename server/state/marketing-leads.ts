/**
 * W214 Faza 800.1 Agent C — In-memory marketing leads store.
 *
 * One row per submission from the public marketing site's signup form.
 * Mirrors the conventions used by `licenses`, `pilot-runs`, etc.: pure
 * in-memory by default, PG-backed mirror lives in
 * `./marketing-leads-pg.ts`, swapped at boot when USE_POSTGRES=true.
 *
 * A lead is immutable once recorded. The only mutation supported is
 * `markSent()` — flipping the `tarball_sent_at` timestamp when the
 * sales-rep automation actually delivers the tarball.
 *
 * Per-IP rate limiting is enforced via {@link RateLimiter} (5 attempts
 * per hour by default). The limiter is share-able across routes, but
 * for the marketing endpoint we expose a single global instance.
 */

import { randomUUID } from 'node:crypto';

export type LeadRole = 'CTO' | 'CMO' | 'CFO' | 'MathLead' | 'Other';
export type LeadOperatorTier = 'tier1' | 'tier2' | 'tier3' | 'unknown';

export interface MarketingLeadRecord {
  leadId: string;
  name: string;
  email: string;
  company: string;
  role: LeadRole;
  message: string;
  operatorTier: LeadOperatorTier;
  remoteIp: string;
  receivedAt: string;
  tarballSentAt: string | null;
  /** Sales-rep id this lead was routed to (tier-based). */
  routedTo: string;
}

export interface MarketingLeadInput {
  name: string;
  email: string;
  company: string;
  role: LeadRole;
  message?: string;
  remoteIp?: string;
}

export interface MarketingLeadFilters {
  email?: string;
  operatorTier?: LeadOperatorTier;
  sent?: boolean;
}

/** Maps an email domain → {tier1, tier2, tier3, unknown}. */
export function detectOperatorTier(email: string): LeadOperatorTier {
  const dom = email.toLowerCase().split('@')[1] ?? '';
  const tier1 = new Set([
    'flutter.com',
    'entaingroup.com',
    'mgmresorts.com',
    'caesars.com',
    'draftkings.com',
  ]);
  const tier2 = new Set([
    'betsson.com',
    'kindredgroup.com',
    'lvbet.com',
    'leovegas.com',
    'gvc.com',
  ]);
  if (tier1.has(dom)) return 'tier1';
  if (tier2.has(dom)) return 'tier2';
  if (
    dom.endsWith('.com') ||
    dom.endsWith('.co.uk') ||
    dom.endsWith('.eu') ||
    dom.endsWith('.io')
  ) {
    return 'tier3';
  }
  return 'unknown';
}

/** Route by operator tier to a sales rep alias (deterministic). */
export function routeToSalesRep(tier: LeadOperatorTier): string {
  switch (tier) {
    case 'tier1':
      return 'enterprise-sales';
    case 'tier2':
      return 'platform-sales';
    case 'tier3':
      return 'indie-sales';
    default:
      return 'inbound-queue';
  }
}

/** Simple sliding-window rate limit, 1 instance per process. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly maxPerWindow: number = 5,
    private readonly windowMs: number = 60 * 60 * 1000 // 1 hour
  ) {}
  /** Returns true when the key is allowed (and records the hit). */
  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const cur = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (cur.length >= this.maxPerWindow) {
      this.hits.set(key, cur);
      return false;
    }
    cur.push(now);
    this.hits.set(key, cur);
    return true;
  }
  remaining(key: string, now: number = Date.now()): number {
    const cutoff = now - this.windowMs;
    const cur = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    return Math.max(0, this.maxPerWindow - cur.length);
  }
  reset(): void {
    this.hits.clear();
  }
}

export class MarketingLeadStore {
  private readonly byId = new Map<string, MarketingLeadRecord>();
  private readonly byEmail = new Map<string, string>();

  create(input: MarketingLeadInput): MarketingLeadRecord {
    if (!input.email) throw new RangeError('email required');
    if (!input.name) throw new RangeError('name required');
    if (!input.company) throw new RangeError('company required');
    if (!input.role) throw new RangeError('role required');
    const tier = detectOperatorTier(input.email);
    const rec: MarketingLeadRecord = {
      leadId: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      company: input.company.trim(),
      role: input.role,
      message: (input.message ?? '').trim().slice(0, 2000),
      operatorTier: tier,
      remoteIp: input.remoteIp ?? '0.0.0.0',
      receivedAt: new Date().toISOString(),
      tarballSentAt: null,
      routedTo: routeToSalesRep(tier),
    };
    this.byId.set(rec.leadId, rec);
    this.byEmail.set(rec.email, rec.leadId);
    return rec;
  }

  get(leadId: string): MarketingLeadRecord | null {
    return this.byId.get(leadId) ?? null;
  }

  getByEmail(email: string): MarketingLeadRecord | null {
    const id = this.byEmail.get(email.toLowerCase());
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  markSent(leadId: string, when: string = new Date().toISOString()): MarketingLeadRecord | null {
    const r = this.byId.get(leadId);
    if (!r) return null;
    r.tarballSentAt = when;
    return r;
  }

  list(filters: MarketingLeadFilters = {}): MarketingLeadRecord[] {
    let rows = Array.from(this.byId.values());
    if (filters.email) {
      const e = filters.email.toLowerCase();
      rows = rows.filter((r) => r.email === e);
    }
    if (filters.operatorTier) {
      rows = rows.filter((r) => r.operatorTier === filters.operatorTier);
    }
    if (filters.sent !== undefined) {
      rows = rows.filter((r) => (r.tarballSentAt !== null) === filters.sent);
    }
    return rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  count(filters: MarketingLeadFilters = {}): number {
    return this.list(filters).length;
  }

  reset(): void {
    this.byId.clear();
    this.byEmail.clear();
  }
}
