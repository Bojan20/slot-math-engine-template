/**
 * CORTI W208-MULTI-TENANT — structured logging + Prometheus metrics.
 *
 * Two responsibilities live here:
 *
 *  1) **Structured JSON logger** ({@link logger}). Every record is a
 *     single-line JSON object with the canonical fields:
 *       ts          ISO timestamp
 *       level       trace | debug | info | warn | error
 *       msg         message
 *       tenantId    when in tenant context
 *       requestId   when in request context
 *       route       request URL (without query)
 *       latencyMs   request handler latency
 *       userId      optional caller id
 *       meta        opaque payload
 *
 *  2) **Prometheus metrics registry** ({@link metrics}). Counters and
 *     histograms exposed at GET /api/admin/metrics. Encoded in the
 *     Prometheus text format v0.0.4 — verified by parsing in tests.
 *
 * Both are intentionally zero-dependency. Pino / prom-client would add
 * features but also a transitive footprint we don't need for the
 * minimal Faza 400.1 deliverable.
 */

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  isolationCounter,
  currentTenant,
} from './tenant-isolation.js';
import { rateLimitMetrics } from './rate-limit.js';

// ---------------------------------------------------------------------------
// Request context (request id + tenant + latency)
// ---------------------------------------------------------------------------

export interface RequestContext {
  requestId: string;
  route: string;
  startedAtMs: number;
  tenantId?: string;
  userId?: string;
}

const requestStorage = new AsyncLocalStorage<RequestContext>();

export function currentRequest(): RequestContext | null {
  return requestStorage.getStore() ?? null;
}

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  tenantId?: string;
  requestId?: string;
  route?: string;
  latencyMs?: number;
  userId?: string;
  meta?: Record<string, unknown>;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  /** Sink — defaults to process.stdout via console.log; tests override. */
  sink?: (line: string) => void;
}

export class StructuredLogger {
  private minLevel: LogLevel;
  private sink: (line: string) => void;
  private buffer: LogRecord[] | null = null;

  constructor(opts: LoggerOptions = {}) {
    this.minLevel = opts.minLevel ?? 'info';
    // eslint-disable-next-line no-console
    this.sink = opts.sink ?? ((line) => console.log(line));
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Capture all subsequent records into a buffer (test introspection). */
  startCapture(): void {
    this.buffer = [];
  }
  stopCapture(): LogRecord[] {
    const out = this.buffer ?? [];
    this.buffer = null;
    return out;
  }

  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;
    const req = currentRequest();
    const tenant = currentTenant();
    const rec: LogRecord = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(tenant?.tenantId ? { tenantId: tenant.tenantId } : {}),
      ...(req?.requestId ? { requestId: req.requestId } : {}),
      ...(req?.route ? { route: req.route } : {}),
      ...(req?.userId ?? tenant?.userId
        ? { userId: req?.userId ?? tenant?.userId }
        : {}),
      ...(meta ? { meta } : {}),
    };
    if (this.buffer) this.buffer.push(rec);
    this.sink(JSON.stringify(rec));
  }

  trace(msg: string, meta?: Record<string, unknown>): void {
    this.log('trace', msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log('debug', msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log('info', msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log('warn', msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.log('error', msg, meta);
  }
}

export const logger = new StructuredLogger({
  minLevel: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
});

// ---------------------------------------------------------------------------
// Prometheus metrics registry
// ---------------------------------------------------------------------------

type LabelSet = Record<string, string | number>;

interface CounterState {
  help: string;
  values: Map<string, number>;
}
interface HistogramState {
  help: string;
  buckets: number[];
  counts: Map<string, number[]>;
  sums: Map<string, number>;
  totals: Map<string, number>;
}

function labelKey(labels: LabelSet): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(',');
}

export class MetricsRegistry {
  private readonly counters = new Map<string, CounterState>();
  private readonly histograms = new Map<string, HistogramState>();

  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) this.counters.set(name, { help, values: new Map() });
  }

  registerHistogram(name: string, help: string, buckets: number[]): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        help,
        buckets: [...buckets].sort((a, b) => a - b),
        counts: new Map(),
        sums: new Map(),
        totals: new Map(),
      });
    }
  }

  inc(name: string, labels: LabelSet = {}, by = 1): void {
    const c = this.counters.get(name);
    if (!c) throw new Error(`unknown counter: ${name}`);
    const k = labelKey(labels);
    c.values.set(k, (c.values.get(k) ?? 0) + by);
  }

  observe(name: string, value: number, labels: LabelSet = {}): void {
    const h = this.histograms.get(name);
    if (!h) throw new Error(`unknown histogram: ${name}`);
    const k = labelKey(labels);
    let counts = h.counts.get(k);
    if (!counts) {
      counts = new Array(h.buckets.length).fill(0);
      h.counts.set(k, counts);
    }
    for (let i = 0; i < h.buckets.length; i++) {
      if (value <= h.buckets[i]) counts[i]++;
    }
    h.sums.set(k, (h.sums.get(k) ?? 0) + value);
    h.totals.set(k, (h.totals.get(k) ?? 0) + 1);
  }

  /** Set / overwrite a gauge-style counter value (used for snapshot exports). */
  setCounter(name: string, value: number, labels: LabelSet = {}): void {
    const c = this.counters.get(name);
    if (!c) throw new Error(`unknown counter: ${name}`);
    c.values.set(labelKey(labels), value);
  }

  reset(): void {
    for (const c of this.counters.values()) c.values.clear();
    for (const h of this.histograms.values()) {
      h.counts.clear();
      h.sums.clear();
      h.totals.clear();
    }
  }

  /** Render the entire registry as Prometheus text format v0.0.4. */
  renderProm(): string {
    const lines: string[] = [];
    for (const [name, c] of this.counters) {
      lines.push(`# HELP ${name} ${c.help}`);
      lines.push(`# TYPE ${name} counter`);
      if (c.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [k, v] of c.values) {
          lines.push(k ? `${name}{${k}} ${v}` : `${name} ${v}`);
        }
      }
    }
    for (const [name, h] of this.histograms) {
      lines.push(`# HELP ${name} ${h.help}`);
      lines.push(`# TYPE ${name} histogram`);
      const allKeys = new Set([
        ...h.counts.keys(),
        ...h.sums.keys(),
        ...h.totals.keys(),
      ]);
      if (allKeys.size === 0) {
        for (const b of h.buckets) lines.push(`${name}_bucket{le="${b}"} 0`);
        lines.push(`${name}_bucket{le="+Inf"} 0`);
        lines.push(`${name}_sum 0`);
        lines.push(`${name}_count 0`);
      } else {
        for (const k of allKeys) {
          const counts = h.counts.get(k) ?? new Array(h.buckets.length).fill(0);
          const sum = h.sums.get(k) ?? 0;
          const total = h.totals.get(k) ?? 0;
          for (let i = 0; i < h.buckets.length; i++) {
            const lbl = k ? `${k},le="${h.buckets[i]}"` : `le="${h.buckets[i]}"`;
            lines.push(`${name}_bucket{${lbl}} ${counts[i]}`);
          }
          const infLbl = k ? `${k},le="+Inf"` : 'le="+Inf"';
          lines.push(`${name}_bucket{${infLbl}} ${total}`);
          lines.push(k ? `${name}_sum{${k}} ${sum}` : `${name}_sum ${sum}`);
          lines.push(k ? `${name}_count{${k}} ${total}` : `${name}_count ${total}`);
        }
      }
    }
    return lines.join('\n') + '\n';
  }
}

export const metrics = new MetricsRegistry();

// Canonical metric set --------------------------------------------------------
metrics.registerHistogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds.',
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
);
metrics.registerCounter('http_requests_total', 'Total HTTP requests.');
metrics.registerCounter('rate_limit_breaches_total', 'Rate limit rejections.');
metrics.registerCounter(
  'tenant_isolation_violations_total',
  'Tenant isolation violations (defensive — should be 0).'
);
metrics.registerCounter('gaas_spins_total', 'GaaS spin requests.');
metrics.registerCounter('cache_hits_total', 'Cache hits.');
metrics.registerCounter('cache_misses_total', 'Cache misses.');

// ---------------------------------------------------------------------------
// Fastify wiring (request id + duration + metrics endpoint)
// ---------------------------------------------------------------------------

export function requestContextHook() {
  return async function onRequest(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const headerId =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['X-Request-Id'] as string | undefined);
    const requestId = headerId && headerId.length > 0 ? headerId : randomUUID();
    reply.header('X-Request-Id', requestId);
    const ctx: RequestContext = {
      requestId,
      route: req.url.split('?')[0],
      startedAtMs: Date.now(),
      ...(req.tenantId ? { tenantId: req.tenantId } : {}),
      ...(req.userId ? { userId: req.userId } : {}),
    };
    requestStorage.enterWith(ctx);
  };
}

export function responseMetricsHook() {
  return async function onResponse(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const ctx = currentRequest();
    if (!ctx) return;
    const durMs = Date.now() - ctx.startedAtMs;
    const route = ctx.route || req.url.split('?')[0];
    const status = String(reply.statusCode ?? 0);
    metrics.inc('http_requests_total', { route, status });
    metrics.observe('http_request_duration_seconds', durMs / 1000, { route });
  };
}

/**
 * Snapshot the counters that live outside the registry (rate-limit,
 * tenant isolation) before rendering. Cheap; called on every scrape.
 */
function snapshotExternalCounters(): void {
  metrics.setCounter(
    'tenant_isolation_violations_total',
    isolationCounter.violations
  );
  metrics.setCounter('rate_limit_breaches_total', rateLimitMetrics.breaches);
  for (const [route, count] of Object.entries(rateLimitMetrics.byRoute)) {
    metrics.setCounter('rate_limit_breaches_total', count, { route });
  }
}

/**
 * Register `/api/admin/metrics` (admin-scoped Prometheus endpoint).
 * The existing public `/api/metrics` endpoint (legacy) is left intact.
 */
export async function registerObservability(
  app: FastifyInstance
): Promise<void> {
  app.addHook('onRequest', requestContextHook());
  app.addHook('onResponse', responseMetricsHook());
  app.get('/api/admin/metrics', async (_req, reply) => {
    snapshotExternalCounters();
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send(metrics.renderProm());
  });
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

/** Force a request context for tests outside the Fastify hook chain. */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestStorage.run(ctx, fn);
}
