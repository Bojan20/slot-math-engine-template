/**
 * W215 Faza 800.2 Agent C — in-memory marketing analytics event store.
 *
 * Mirrors the pattern of `./marketing-leads.ts`. One row per event
 * (pageview / scroll-depth / cta-click / form-start / form-submit /
 * video-play / video-complete / signup). Events are append-only and
 * never mutated.
 *
 * Aggregation helpers:
 *   * funnel(windowDays)        — landing → pricing → demo → contact → signup
 *   * pageviewBreakdown()       — per-page counts + uniques
 *   * ctaPerformance()          — per-CTA clicks + simple CTR
 *   * abAggregate(experimentId) — variant × conversion table for the
 *                                  internal A/B dashboard
 *
 * A/B aggregation uses Wilson score intervals (95 %) for conversion
 * rate; the analytics dashboard separately renders the Bayesian CI.
 *
 * All time arithmetic is in UTC milliseconds; the store does not
 * persist anything to disk — that lives in the PG mirror.
 */

import { randomUUID } from 'node:crypto';

export type MarketingEventType =
  | 'pageview'
  | 'scroll-depth-25'
  | 'scroll-depth-50'
  | 'scroll-depth-75'
  | 'scroll-depth-100'
  | 'cta-click'
  | 'form-start'
  | 'form-submit'
  | 'video-play'
  | 'video-complete'
  | 'ab-impression'
  | 'ab-conversion'
  | 'signup';

export interface MarketingEventInput {
  type: MarketingEventType;
  sessionId: string;
  ts?: number;
  page?: string;
  destination?: string;
  formId?: string;
  videoId?: string;
  experimentId?: string;
  variant?: string;
  props?: Record<string, unknown>;
  remoteIp?: string;
}

export interface MarketingEventRecord extends MarketingEventInput {
  eventId: string;
  ts: number;
  remoteIp: string;
}

export interface FunnelSnapshot {
  windowDays: number;
  funnel: {
    landing: number;
    pricing: number;
    demo: number;
    contact: number;
    signup: number;
  };
  computedAt: string;
}

export interface AbVariantRow {
  variant: string;
  impressions: number;
  conversions: number;
  rate: number;
  ciLo: number;
  ciHi: number;
}

const VALID_TYPES = new Set<MarketingEventType>([
  'pageview',
  'scroll-depth-25', 'scroll-depth-50', 'scroll-depth-75', 'scroll-depth-100',
  'cta-click',
  'form-start', 'form-submit',
  'video-play', 'video-complete',
  'ab-impression', 'ab-conversion',
  'signup',
]);

export function isValidEventType(t: string): t is MarketingEventType {
  return VALID_TYPES.has(t as MarketingEventType);
}

/** Wilson 95 % score interval. */
export function wilsonInterval(s: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = s / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - margin), hi: Math.min(1, centre + margin) };
}

export class MarketingEventStore {
  private readonly events: MarketingEventRecord[] = [];

  reset(): void { this.events.length = 0; }

  add(input: MarketingEventInput): MarketingEventRecord {
    if (!isValidEventType(input.type)) {
      throw new RangeError(`invalid_event_type:${input.type}`);
    }
    if (!input.sessionId || typeof input.sessionId !== 'string') {
      throw new RangeError('sessionId required');
    }
    const rec: MarketingEventRecord = {
      ...input,
      eventId: randomUUID(),
      ts: input.ts ?? Date.now(),
      remoteIp: input.remoteIp ?? '0.0.0.0',
    };
    this.events.push(rec);
    return rec;
  }

  addBatch(batch: MarketingEventInput[]): MarketingEventRecord[] {
    return batch.map((e) => this.add(e));
  }

  list(filter: { type?: MarketingEventType; sinceMs?: number; sessionId?: string } = {}): MarketingEventRecord[] {
    return this.events.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.sinceMs != null && e.ts < filter.sinceMs) return false;
      if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
      return true;
    });
  }

  count(filter: Parameters<MarketingEventStore['list']>[0] = {}): number {
    return this.list(filter).length;
  }

  /**
   * Funnel computation — counts UNIQUE sessions that reached each
   * stage within the given window. A session is "in" a stage when at
   * least one matching event exists.
   */
  funnel(windowDays = 30, now: number = Date.now()): FunnelSnapshot {
    const since = now - windowDays * 24 * 60 * 60 * 1000;
    const landing = new Set<string>();
    const pricing = new Set<string>();
    const demo    = new Set<string>();
    const contact = new Set<string>();
    const signup  = new Set<string>();
    for (const e of this.events) {
      if (e.ts < since) continue;
      const page = String(e.page ?? e.props?.path ?? '');
      if (e.type === 'pageview') {
        if (page === '/' || page.endsWith('/index.html') || page === '') landing.add(e.sessionId);
        if (page.includes('/pricing'))    pricing.add(e.sessionId);
        if (page.includes('/demo'))       demo.add(e.sessionId);
        if (page.includes('/contact'))    contact.add(e.sessionId);
      }
      if (e.type === 'signup' || (e.type === 'form-submit' && (e.formId ?? e.props?.formId) === 'signup-form')) {
        signup.add(e.sessionId);
      }
    }
    return {
      windowDays,
      funnel: {
        landing: landing.size,
        pricing: pricing.size,
        demo:    demo.size,
        contact: contact.size,
        signup:  signup.size,
      },
      computedAt: new Date(now).toISOString(),
    };
  }

  pageviewBreakdown(windowDays = 30, now: number = Date.now()): Array<{ page: string; views: number; uniques: number }> {
    const since = now - windowDays * 24 * 60 * 60 * 1000;
    const views = new Map<string, number>();
    const uniqs = new Map<string, Set<string>>();
    for (const e of this.events) {
      if (e.ts < since || e.type !== 'pageview') continue;
      const page = String(e.page ?? e.props?.path ?? '/');
      views.set(page, (views.get(page) ?? 0) + 1);
      if (!uniqs.has(page)) uniqs.set(page, new Set());
      uniqs.get(page)!.add(e.sessionId);
    }
    return Array.from(views.entries())
      .map(([page, v]) => ({ page, views: v, uniques: uniqs.get(page)!.size }))
      .sort((a, b) => b.views - a.views);
  }

  ctaPerformance(windowDays = 30, now: number = Date.now()): Array<{ destination: string; clicks: number }> {
    const since = now - windowDays * 24 * 60 * 60 * 1000;
    const clicks = new Map<string, number>();
    for (const e of this.events) {
      if (e.ts < since || e.type !== 'cta-click') continue;
      const dest = String(e.destination ?? e.props?.destination ?? 'unknown');
      clicks.set(dest, (clicks.get(dest) ?? 0) + 1);
    }
    return Array.from(clicks.entries())
      .map(([destination, c]) => ({ destination, clicks: c }))
      .sort((a, b) => b.clicks - a.clicks);
  }

  abAggregate(experimentId: string, windowDays = 30, now: number = Date.now()): AbVariantRow[] {
    const since = now - windowDays * 24 * 60 * 60 * 1000;
    const impressions = new Map<string, number>();
    const conversions = new Map<string, number>();
    for (const e of this.events) {
      if (e.ts < since) continue;
      if (e.experimentId !== experimentId) continue;
      const v = e.variant ?? 'unknown';
      if (e.type === 'ab-impression') {
        impressions.set(v, (impressions.get(v) ?? 0) + 1);
      } else if (e.type === 'ab-conversion') {
        conversions.set(v, (conversions.get(v) ?? 0) + 1);
      }
    }
    const variants = new Set([...impressions.keys(), ...conversions.keys()]);
    return Array.from(variants).map((variant) => {
      const i = impressions.get(variant) ?? 0;
      const c = conversions.get(variant) ?? 0;
      const ci = wilsonInterval(c, i);
      return {
        variant,
        impressions: i,
        conversions: c,
        rate: i > 0 ? c / i : 0,
        ciLo: ci.lo,
        ciHi: ci.hi,
      };
    }).sort((a, b) => a.variant.localeCompare(b.variant));
  }
}
