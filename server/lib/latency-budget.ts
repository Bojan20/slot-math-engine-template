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

/**
 * W212 Faza 600.1 — Circuit Breaker for latency budget enforcement.
 *
 * Wraps a `LatencyBudgetTracker` with the classic three-state circuit
 * breaker pattern. Routes whose p99 stays over budget for N consecutive
 * seconds trip the breaker, which then short-circuits subsequent calls
 * for `openDurationMs` before transitioning to `half-open` (probe) and
 * either back to `closed` or back to `open` depending on the probe result.
 *
 * States
 * ──────
 *   - closed     normal traffic; tracker records every sample.
 *   - open       traffic is rejected at the gate; `enforceLatencyBudget`
 *                throws `CircuitOpenError`.
 *   - half-open  next request is allowed through as a probe; verdict
 *                determines the next state.
 *
 * Wall-clock evaluation runs on `evaluate()` which the host should call
 * from a periodic tick (or it's invoked implicitly by `record()` if
 * `autoEvaluate` is set).
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive evaluations the p99 must exceed budget to trip. */
  consecutiveBreachesToOpen?: number;
  /** Window during which evaluations are counted, in ms. */
  evaluationWindowMs?: number;
  /** How long the breaker stays open before transitioning to half-open. */
  openDurationMs?: number;
  /** Whether `record()` triggers `evaluate()` automatically. */
  autoEvaluate?: boolean;
  /** Time source (for tests). */
  now?: () => number;
  /** Logger sink. */
  warn?: (msg: string, ctx: Record<string, unknown>) => void;
}

export class CircuitOpenError extends Error {
  constructor(public route: string) {
    super(`circuit open for ${route}`);
    this.name = 'CircuitOpenError';
  }
}

interface BreakerState {
  state: CircuitState;
  consecutiveBreaches: number;
  openedAtMs: number;
  lastEvaluationMs: number;
  trips: number;
  probesSinceOpen: number;
}

export class LatencyBudgetCircuitBreaker {
  private readonly tracker: LatencyBudgetTracker;
  private readonly opts: Required<CircuitBreakerOptions>;
  private readonly breakers = new Map<string, BreakerState>();

  constructor(tracker: LatencyBudgetTracker, opts: CircuitBreakerOptions = {}) {
    this.tracker = tracker;
    this.opts = {
      consecutiveBreachesToOpen: opts.consecutiveBreachesToOpen ?? 3,
      evaluationWindowMs: opts.evaluationWindowMs ?? 1_000,
      openDurationMs: opts.openDurationMs ?? 30_000,
      autoEvaluate: opts.autoEvaluate ?? true,
      now: opts.now ?? (() => Date.now()),
      warn: opts.warn ?? ((_m, _c) => { /* noop */ }),
    };
  }

  /** Get state for a route (defaults to closed). */
  getState(route: string): CircuitState {
    return this.breakers.get(route)?.state ?? 'closed';
  }

  /** Stats per route for observability. */
  snapshot(route: string): BreakerState & { route: string } {
    const s = this.breakers.get(route) ?? this.empty();
    return { route, ...s };
  }

  snapshotAll(): Array<BreakerState & { route: string }> {
    return Array.from(this.breakers.entries()).map(([route, s]) => ({ route, ...s }));
  }

  private empty(): BreakerState {
    return {
      state: 'closed',
      consecutiveBreaches: 0,
      openedAtMs: 0,
      lastEvaluationMs: 0,
      trips: 0,
      probesSinceOpen: 0,
    };
  }

  /** Enforce the breaker — throws CircuitOpenError if route is open. */
  enforce(route: string): void {
    const s = this.breakers.get(route);
    if (!s) return;
    const now = this.opts.now();
    if (s.state === 'open') {
      if (now - s.openedAtMs >= this.opts.openDurationMs) {
        s.state = 'half-open';
        s.probesSinceOpen = 0;
        this.opts.warn('circuit_half_open', { route });
      } else {
        throw new CircuitOpenError(route);
      }
    }
    if (s.state === 'half-open') {
      // Only let one probe through at a time.
      if (s.probesSinceOpen >= 1) throw new CircuitOpenError(route);
      s.probesSinceOpen++;
    }
  }

  /** Record a duration sample through the underlying tracker + breaker. */
  record(route: string, durationMs: number): void {
    this.tracker.record(route, durationMs);
    if (this.opts.autoEvaluate) this.evaluate(route);
  }

  /** Evaluate the breaker for a route (call periodically or via record). */
  evaluate(route: string): void {
    const snapshot = this.tracker.snapshot(route);
    const budget = this.tracker.getBudget(route);
    if (!budget) return;
    let s = this.breakers.get(route);
    if (!s) { s = this.empty(); this.breakers.set(route, s); }
    const now = this.opts.now();
    s.lastEvaluationMs = now;
    const breached = snapshot.count > 0 && snapshot.p99 > budget.p99Ms;
    if (s.state === 'closed') {
      if (breached) {
        s.consecutiveBreaches++;
        if (s.consecutiveBreaches >= this.opts.consecutiveBreachesToOpen) {
          s.state = 'open';
          s.openedAtMs = now;
          s.trips++;
          s.consecutiveBreaches = 0;
          this.opts.warn('circuit_open', { route, p99: snapshot.p99, budget: budget.p99Ms });
        }
      } else {
        s.consecutiveBreaches = 0;
      }
    } else if (s.state === 'half-open') {
      if (breached) {
        s.state = 'open';
        s.openedAtMs = now;
        s.trips++;
        s.probesSinceOpen = 0;
        this.opts.warn('circuit_re_open', { route, p99: snapshot.p99, budget: budget.p99Ms });
      } else {
        s.state = 'closed';
        s.consecutiveBreaches = 0;
        s.probesSinceOpen = 0;
        this.opts.warn('circuit_closed', { route });
      }
    }
  }

  /** Manually trip a route (admin override). */
  trip(route: string): void {
    const now = this.opts.now();
    let s = this.breakers.get(route);
    if (!s) { s = this.empty(); this.breakers.set(route, s); }
    s.state = 'open';
    s.openedAtMs = now;
    s.trips++;
    this.opts.warn('circuit_manual_trip', { route });
  }

  /** Manually reset (close) a route. */
  reset(route?: string): void {
    if (route) {
      this.breakers.delete(route);
    } else {
      this.breakers.clear();
    }
  }
}

/**
 * Convenience wrapper — returns a middleware option that enforces the
 * latency budget via a circuit breaker. Intended to be invoked from a
 * Fastify onRequest hook so over-budget routes shed load fast.
 */
export function enforceLatencyBudget(
  breaker: LatencyBudgetCircuitBreaker,
): (route: string) => void {
  return (route: string) => breaker.enforce(route);
}
