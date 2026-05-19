/**
 * W215 Faza 800.2 Agent C — Postgres-backed marketing analytics event store.
 *
 * Mirror of {@link MarketingEventStore} against the `marketing_events`
 * table (migration `015_marketing_events.sql`). The funnel CTE is the
 * non-trivial bit: it counts DISTINCT sessions per stage in a single
 * pass so even moderately-sized event tables (~10M rows) stay fast.
 */

import { randomUUID } from 'node:crypto';
import type { PgConnection } from '../db/connection.js';
import {
  wilsonInterval,
  isValidEventType,
  type AbVariantRow,
  type FunnelSnapshot,
  type MarketingEventInput,
  type MarketingEventRecord,
  type MarketingEventType,
} from './marketing-events.js';

interface EventRow {
  event_id: string;
  type: MarketingEventType;
  session_id: string;
  ts: Date | string;
  page: string | null;
  destination: string | null;
  form_id: string | null;
  video_id: string | null;
  experiment_id: string | null;
  variant: string | null;
  props: Record<string, unknown> | null;
  remote_ip: string;
}

function rowToRecord(r: EventRow): MarketingEventRecord {
  return {
    eventId: r.event_id,
    type: r.type,
    sessionId: r.session_id,
    ts: r.ts instanceof Date ? r.ts.getTime() : new Date(r.ts).getTime(),
    page: r.page ?? undefined,
    destination: r.destination ?? undefined,
    formId: r.form_id ?? undefined,
    videoId: r.video_id ?? undefined,
    experimentId: r.experiment_id ?? undefined,
    variant: r.variant ?? undefined,
    props: r.props ?? undefined,
    remoteIp: r.remote_ip,
  };
}

export class PostgresMarketingEventStore {
  constructor(private readonly conn: PgConnection) {}

  async add(input: MarketingEventInput): Promise<MarketingEventRecord> {
    if (!isValidEventType(input.type)) {
      throw new RangeError(`invalid_event_type:${input.type}`);
    }
    if (!input.sessionId) throw new RangeError('sessionId required');
    const eventId = randomUUID();
    const ts = new Date(input.ts ?? Date.now()).toISOString();
    await this.conn.query(
      `INSERT INTO marketing_events (
         event_id, type, session_id, ts, page, destination,
         form_id, video_id, experiment_id, variant, props, remote_ip
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        eventId,
        input.type,
        input.sessionId,
        ts,
        input.page ?? null,
        input.destination ?? null,
        input.formId ?? null,
        input.videoId ?? null,
        input.experimentId ?? null,
        input.variant ?? null,
        input.props ? JSON.stringify(input.props) : null,
        input.remoteIp ?? '0.0.0.0',
      ]
    );
    return {
      eventId,
      type: input.type,
      sessionId: input.sessionId,
      ts: new Date(ts).getTime(),
      page: input.page,
      destination: input.destination,
      formId: input.formId,
      videoId: input.videoId,
      experimentId: input.experimentId,
      variant: input.variant,
      props: input.props,
      remoteIp: input.remoteIp ?? '0.0.0.0',
    };
  }

  async addBatch(batch: MarketingEventInput[]): Promise<MarketingEventRecord[]> {
    const out: MarketingEventRecord[] = [];
    for (const e of batch) out.push(await this.add(e));
    return out;
  }

  async funnel(windowDays = 30, now: number = Date.now()): Promise<FunnelSnapshot> {
    const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const sql = `
      WITH win AS (
        SELECT session_id, type, COALESCE(page, props->>'path', '') AS page, form_id
          FROM marketing_events
         WHERE ts >= $1
      )
      SELECT
        (SELECT COUNT(DISTINCT session_id) FROM win
           WHERE type = 'pageview' AND (page = '/' OR page LIKE '%/index.html' OR page = '')) AS landing,
        (SELECT COUNT(DISTINCT session_id) FROM win
           WHERE type = 'pageview' AND page LIKE '%/pricing%') AS pricing,
        (SELECT COUNT(DISTINCT session_id) FROM win
           WHERE type = 'pageview' AND page LIKE '%/demo%') AS demo,
        (SELECT COUNT(DISTINCT session_id) FROM win
           WHERE type = 'pageview' AND page LIKE '%/contact%') AS contact,
        (SELECT COUNT(DISTINCT session_id) FROM win
           WHERE type = 'signup' OR (type = 'form-submit' AND form_id = 'signup-form')) AS signup
    `;
    const r = await this.conn.query<{
      landing: string | number; pricing: string | number; demo: string | number;
      contact: string | number; signup: string | number;
    }>(sql, [since]);
    const row = r.rows[0] ?? { landing: 0, pricing: 0, demo: 0, contact: 0, signup: 0 };
    return {
      windowDays,
      funnel: {
        landing: Number(row.landing),
        pricing: Number(row.pricing),
        demo:    Number(row.demo),
        contact: Number(row.contact),
        signup:  Number(row.signup),
      },
      computedAt: new Date(now).toISOString(),
    };
  }

  async pageviewBreakdown(windowDays = 30, now: number = Date.now()): Promise<Array<{ page: string; views: number; uniques: number }>> {
    const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const r = await this.conn.query<{ page: string; views: string | number; uniques: string | number }>(
      `SELECT COALESCE(page, props->>'path', '/') AS page,
              COUNT(*)::int AS views,
              COUNT(DISTINCT session_id)::int AS uniques
         FROM marketing_events
        WHERE type = 'pageview' AND ts >= $1
        GROUP BY 1
        ORDER BY views DESC`,
      [since]
    );
    return r.rows.map((x) => ({ page: x.page, views: Number(x.views), uniques: Number(x.uniques) }));
  }

  async ctaPerformance(windowDays = 30, now: number = Date.now()): Promise<Array<{ destination: string; clicks: number }>> {
    const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const r = await this.conn.query<{ destination: string; clicks: string | number }>(
      `SELECT COALESCE(destination, props->>'destination', 'unknown') AS destination,
              COUNT(*)::int AS clicks
         FROM marketing_events
        WHERE type = 'cta-click' AND ts >= $1
        GROUP BY 1
        ORDER BY clicks DESC`,
      [since]
    );
    return r.rows.map((x) => ({ destination: x.destination, clicks: Number(x.clicks) }));
  }

  async abAggregate(experimentId: string, windowDays = 30, now: number = Date.now()): Promise<AbVariantRow[]> {
    const since = new Date(now - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const r = await this.conn.query<{ variant: string; impressions: string | number; conversions: string | number }>(
      `SELECT variant,
              SUM(CASE WHEN type = 'ab-impression' THEN 1 ELSE 0 END)::int AS impressions,
              SUM(CASE WHEN type = 'ab-conversion' THEN 1 ELSE 0 END)::int AS conversions
         FROM marketing_events
        WHERE experiment_id = $1 AND ts >= $2 AND variant IS NOT NULL
        GROUP BY variant
        ORDER BY variant`,
      [experimentId, since]
    );
    return r.rows.map((row) => {
      const impressions = Number(row.impressions);
      const conversions = Number(row.conversions);
      const ci = wilsonInterval(conversions, impressions);
      return {
        variant: row.variant,
        impressions,
        conversions,
        rate: impressions > 0 ? conversions / impressions : 0,
        ciLo: ci.lo,
        ciHi: ci.hi,
      };
    });
  }

  async list(filter: { type?: MarketingEventType; sinceMs?: number; sessionId?: string } = {}): Promise<MarketingEventRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.type) { params.push(filter.type); where.push(`type = $${params.length}`); }
    if (filter.sinceMs != null) {
      params.push(new Date(filter.sinceMs).toISOString());
      where.push(`ts >= $${params.length}`);
    }
    if (filter.sessionId) { params.push(filter.sessionId); where.push(`session_id = $${params.length}`); }
    const sql =
      `SELECT event_id, type, session_id, ts, page, destination,
              form_id, video_id, experiment_id, variant, props, remote_ip
         FROM marketing_events
         ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY ts DESC LIMIT 5000`;
    const r = await this.conn.query<EventRow>(sql, params);
    return r.rows.map(rowToRecord);
  }

  async reset(): Promise<void> {
    await this.conn.query(`DELETE FROM marketing_events`);
  }
}
