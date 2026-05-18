/**
 * CORTI W208-MULTI-TENANT — observability (structured logging + Prom).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import {
  StructuredLogger,
  MetricsRegistry,
  logger,
  metrics,
  withRequestContext,
  currentRequest,
} from '../lib/observability.js';
import { withTenant } from '../lib/tenant-isolation.js';

describe('observability: structured logger', () => {
  it('emits valid JSON with required fields', () => {
    const records: string[] = [];
    const log = new StructuredLogger({ minLevel: 'debug', sink: (l) => records.push(l) });
    log.info('hello', { foo: 1 });
    expect(records).toHaveLength(1);
    const parsed = JSON.parse(records[0]);
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(parsed.meta).toEqual({ foo: 1 });
  });

  it('respects min-level filter', () => {
    const records: string[] = [];
    const log = new StructuredLogger({ minLevel: 'warn', sink: (l) => records.push(l) });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(records).toHaveLength(2);
    const levels = records.map((r) => JSON.parse(r).level);
    expect(levels).toEqual(['warn', 'error']);
  });

  it('includes tenantId when inside a withTenant scope', () => {
    const records: string[] = [];
    const log = new StructuredLogger({ minLevel: 'debug', sink: (l) => records.push(l) });
    withTenant({ tenantId: 'acme' }, () => {
      log.info('scoped');
    });
    const parsed = JSON.parse(records[0]);
    expect(parsed.tenantId).toBe('acme');
  });

  it('includes requestId + route when inside withRequestContext', () => {
    const records: string[] = [];
    const log = new StructuredLogger({ minLevel: 'debug', sink: (l) => records.push(l) });
    withRequestContext(
      { requestId: 'r-1', route: '/api/x', startedAtMs: 0 },
      () => log.info('with-req')
    );
    const parsed = JSON.parse(records[0]);
    expect(parsed.requestId).toBe('r-1');
    expect(parsed.route).toBe('/api/x');
  });

  it('startCapture/stopCapture returns the buffer', () => {
    const log = new StructuredLogger({
      minLevel: 'debug',
      sink: () => {
        /* discard */
      },
    });
    log.startCapture();
    log.info('a');
    log.warn('b');
    const buf = log.stopCapture();
    expect(buf.map((r) => r.msg)).toEqual(['a', 'b']);
  });

  it('emits all five log levels', () => {
    const records: string[] = [];
    const log = new StructuredLogger({ minLevel: 'trace', sink: (l) => records.push(l) });
    log.trace('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(records.map((r) => JSON.parse(r).level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
    ]);
  });
});

describe('observability: Prometheus metrics registry', () => {
  let reg: MetricsRegistry;
  beforeEach(() => {
    reg = new MetricsRegistry();
  });

  it('counter increments + renders in Prometheus format', () => {
    reg.registerCounter('foo_total', 'A counter.');
    reg.inc('foo_total');
    reg.inc('foo_total', {}, 5);
    const out = reg.renderProm();
    expect(out).toContain('# HELP foo_total A counter.');
    expect(out).toContain('# TYPE foo_total counter');
    expect(out).toContain('foo_total 6');
  });

  it('counter with labels emits one line per label set', () => {
    reg.registerCounter('http_requests_total', 'total.');
    reg.inc('http_requests_total', { route: '/a', status: '200' });
    reg.inc('http_requests_total', { route: '/b', status: '500' });
    const out = reg.renderProm();
    expect(out).toMatch(/http_requests_total\{[^}]*route="\/a"[^}]*\} 1/);
    expect(out).toMatch(/http_requests_total\{[^}]*route="\/b"[^}]*\} 1/);
  });

  it('histogram observes values across buckets', () => {
    reg.registerHistogram('latency_seconds', 'Latency.', [0.1, 0.5, 1]);
    reg.observe('latency_seconds', 0.05);
    reg.observe('latency_seconds', 0.3);
    reg.observe('latency_seconds', 2);
    const out = reg.renderProm();
    expect(out).toContain('# TYPE latency_seconds histogram');
    expect(out).toMatch(/latency_seconds_bucket\{le="0.1"\} 1/);
    expect(out).toMatch(/latency_seconds_bucket\{le="0.5"\} 2/);
    expect(out).toMatch(/latency_seconds_bucket\{le="1"\} 2/);
    expect(out).toMatch(/latency_seconds_bucket\{le="\+Inf"\} 3/);
    expect(out).toMatch(/latency_seconds_count 3/);
  });

  it('empty histogram still emits zero bucket lines', () => {
    reg.registerHistogram('empty_seconds', 'Empty.', [0.1, 1]);
    const out = reg.renderProm();
    expect(out).toContain('empty_seconds_count 0');
  });

  it('renderProm output is parseable line-by-line', () => {
    reg.registerCounter('foo_total', 'help.');
    reg.inc('foo_total');
    const out = reg.renderProm();
    for (const line of out.split('\n')) {
      if (!line) continue;
      // Each line is either a comment or `name[{labels}] value`.
      expect(line).toMatch(/^(#|[a-zA-Z_][a-zA-Z0-9_]*)/);
    }
  });
});

describe('observability: Fastify wiring (/api/admin/metrics)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns valid Prometheus text format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/metrics',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.body).toContain('# HELP http_requests_total');
    expect(res.body).toContain('# TYPE http_request_duration_seconds histogram');
  });

  it('http_requests_total counter increments on requests', async () => {
    // Hit a few endpoints to drive counters.
    await app.inject({ method: 'GET', url: '/api/health' });
    await app.inject({ method: 'GET', url: '/api/health' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/metrics',
    });
    expect(res.body).toMatch(/http_requests_total\{[^}]*route="\/api\/health"/);
  });

  it('attaches X-Request-Id header on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('echoes a client-supplied X-Request-Id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'client-req-1' },
    });
    expect(res.headers['x-request-id']).toBe('client-req-1');
  });

  it('canonical metric set is registered', () => {
    // The shared `metrics` instance owns these counters.
    expect(() =>
      metrics.inc('http_requests_total', { route: '/x', status: '200' })
    ).not.toThrow();
    expect(() =>
      metrics.inc('gaas_spins_total', { tenant: 'acme', game: 'g1' })
    ).not.toThrow();
    expect(() =>
      metrics.inc('cache_hits_total')
    ).not.toThrow();
    expect(() =>
      metrics.inc('cache_misses_total')
    ).not.toThrow();
  });

  it('current request context is populated during a request', async () => {
    // Use a custom hook to read currentRequest() inside a real request.
    let seen: ReturnType<typeof currentRequest> = null;
    app.get('/__probe', async () => {
      seen = currentRequest();
      return { ok: true };
    });
    await app.inject({ method: 'GET', url: '/__probe' });
    expect(seen).not.toBeNull();
    expect(seen!.requestId).toMatch(/^[0-9a-f-]+$/i);
    expect(seen!.route).toBe('/__probe');
  });

  it('shared logger does not throw when emitting outside any context', () => {
    expect(() => logger.info('no-ctx-emit')).not.toThrow();
  });
});
