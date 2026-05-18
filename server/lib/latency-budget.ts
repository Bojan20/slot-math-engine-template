/**
 * W208 Faza 400.1 — Latency budget tracker.
 *
 * Wraps Fastify routes (and arbitrary code paths via `track()`) to
 * record per-route duration samples. Maintains a rolling reservoir
 * per route so we can compute p50 / p95 / p99 cheaply without pulling
 * in `hdr-histogram-js` everywhere.
 *
 * Default budgets reflect Faza 400.1 production targets:
 *   /api/lobby/games            p99 < 50ms   (cached)
 *   /api/license/*              p99 < 30ms   (cached)
 *   /api/catalog                p99 < 50ms   (cached)
 *   /api/session/spin           p99 < 100ms
 *   gaas.ws.spin                p99 < 80ms
 *
 * Each breach increments a counter and emits a warning. The latest
 * percentile snapshot is exposed via `/api/admin/latency-budgets`.
 */

import type { FastifyInstance } from 'fastify';

export interface LatencyBudget {
  /** Route key, e.g. `/api/lobby/games` or `gaas.ws.spin`. */
  route: string;
  /** p99 budget in milliseconds. */
  p99Ms: number;
  /** Whether this route is expected to be served from cache. */
  cached?: boolean;
}

export interface PercentileSnapshot {
  route: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  budgetP99: number;
  breaches: number;
  withinBudget: boolean;
}

const DEFAULT_BUDGETS: LatencyBudget[] = [
  { route: '/api/lobby/games', p99Ms: 50, cached: true },
  { route: '/api/license/verify', p99Ms: 30, cached: true },
  { route: '/api/license/:tenantId/usage', p99Ms: 30, cached: true },
  { route: '/api/license/:tenantId/expiry', p99Ms: 30, cached: true },
  { route: '/api/catalog', p99Ms: 50, cached: true },
  { route: '/api/session/spin', p99Ms: 100, cached: false },
  { route: 'gaas.ws.spin', p99Ms: 80, cached: false },
];

const RESERVOIR_CAP = 1024;

interface Reservoir {
  samples: number[];
  breaches: number;
  totalCount: number;
}

export class LatencyBudgetTracker {
  private readonly budgets = new Map<string, LatencyBudget>();
  private readonly reservoirs = new Map<string, Reservoir>();
  private readonly warnSink: (msg: string, ctx: Record<string, unknown>) => void;

  constructor(opts: {
    budgets?: LatencyBudget[];
    warn?: (msg: string, ctx: Record<string, unknown>) => void;
  } = {}) {
    const list = opts.budgets ?? DEFAULT_BUDGETS;
    for (const b of list) this.budgets.set(b.route, b);
    this.warnSink = opts.warn ?? ((_m, _c) => { /* default no-op */ });
  }

  /** Update / add a budget at runtime. */
  setBudget(b: LatencyBudget): void {
    this.budgets.set(b.route, b);
  }

  /** Lookup budget for a route (or `undefined` if untracked). */
  getBudget(route: string): LatencyBudget | undefined {
    return this.budgets.get(route);
  }

  /** Record a duration (milliseconds) for a route. */
  record(route: string, durationMs: number): void {
    let r = this.reservoirs.get(route);
    if (!r) {
      r = { samples: [], breaches: 0, totalCount: 0 };
      this.reservoirs.set(route, r);
    }
    r.totalCount++;
    if (r.samples.length < RESERVOIR_CAP) {
      r.samples.push(durationMs);
    } else {
      // Reservoir sampling — replace a random slot with prob k/n.
      const idx = Math.floor(Math.random() * r.totalCount);
      if (idx < RESERVOIR_CAP) r.samples[idx] = durationMs;
    }
    const budget = this.budgets.get(route);
    if (budget && durationMs > budget.p99Ms) {
      r.breaches++;
      this.warnSink('latency_budget_breach', {
        route,
        durationMs: Math.round(durationMs * 100) / 100,
        budgetP99: budget.p99Ms,
      });
    }
  }

  /** Wrap an arbitrary async op with timing. */
  async track<T>(route: string, fn: () => Promise<T>): Promise<T> {
    const t0 = perfNow();
    try {
      return await fn();
    } finally {
      this.record(route, perfNow() - t0);
    }
  }

  /** Compute current p50/p95/p99 for a route. */
  snapshot(route: string): PercentileSnapshot {
    const budget = this.budgets.get(route);
    const r = this.reservoirs.get(route);
    if (!r || r.samples.length === 0) {
      return {
        route,
        count: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        max: 0,
        budgetP99: budget?.p99Ms ?? 0,
        breaches: 0,
        withinBudget: true,
      };
    }
    const sorted = [...r.samples].sort((a, b) => a - b);
    const at = (q: number): number => {
      const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor(q * (sorted.length - 1)))
      );
      return sorted[idx];
    };
    const p99 = at(0.99);
    return {
      route,
      count: r.totalCount,
      p50: at(0.5),
      p95: at(0.95),
      p99,
      max: sorted[sorted.length - 1],
      budgetP99: budget?.p99Ms ?? 0,
      breaches: r.breaches,
      withinBudget: budget ? p99 <= budget.p99Ms : true,
    };
  }

  /** Snapshot every tracked route. */
  snapshotAll(): PercentileSnapshot[] {
    const out: PercentileSnapshot[] = [];
    const seen = new Set<string>();
    for (const route of this.budgets.keys()) {
      out.push(this.snapshot(route));
      seen.add(route);
    }
    for (const route of this.reservoirs.keys()) {
      if (!seen.has(route)) out.push(this.snapshot(route));
    }
    return out;
  }

  reset(): void {
    this.reservoirs.clear();
  }
}

function perfNow(): number {
  // hrtime when available, else Date.now().
  if (typeof process !== 'undefined' && typeof process.hrtime?.bigint === 'function') {
    return Number(process.hrtime.bigint()) / 1e6;
  }
  return Date.now();
}

/**
 * Install Fastify hooks that record duration of every request.
 *
 * Also exposes `GET /api/admin/latency-budgets` returning the current
 * percentile snapshot per route (admin RBAC enforced via the global
 * pre-handler since this lives under /api/admin/).
 */
export function attachLatencyMiddleware(
  app: FastifyInstance,
  tracker: LatencyBudgetTracker
): void {
  app.decorateRequest('_latencyStart', 0);

  app.addHook('onRequest', async (req) => {
    (req as any)._latencyStart = perfNow();
  });

  app.addHook('onResponse', async (req) => {
    const start = (req as any)._latencyStart as number;
    if (!start) return;
    const dur = perfNow() - start;
    // Use routerPath (Fastify normalises params), else fall back to url.
    const route = (req as any).routerPath || req.url || 'unknown';
    tracker.record(String(route), dur);
  });

  app.get('/api/admin/latency-budgets', async (_req, reply) => {
    return reply.send({
      ts: new Date().toISOString(),
      routes: tracker.snapshotAll(),
    });
  });
}

export const DEFAULTS = DEFAULT_BUDGETS;
