/**
 * W212 Faza 600.1 — Chaos engineering controller.
 *
 * Probabilistic fault injection for dev/staging. NEVER active in
 * production: every entry point is guarded by an env check
 * (`CHAOS_ENABLED=true` AND `NODE_ENV !== 'production'`). The controller
 * is also feature-flagged per fault name so a single rogue setting can
 * be disabled without touching code.
 *
 * Usage:
 *
 *   import { chaos } from './lib/chaos/index.js';
 *   chaos.enable('cache.miss', 0.10);            // 10% probability
 *   await chaos.injectIf('cache.miss', { tenantId }, async () => {
 *     return forceCacheMiss();
 *   });
 *
 * `injectIf(...)` is a no-op when chaos is disabled or the fault's
 * probability roll fails. The roll uses an injectable RNG so tests can
 * exercise deterministic behaviour.
 */

export type FaultName =
  | 'cache.miss'
  | 'wallet.timeout'
  | 'db.slow-query'
  | 'hsm.key-rotation'
  | 'audit.chain-gap'
  | 'tenant.context-loss';

export interface FaultRecord {
  name: FaultName;
  probability: number;
  enabledAtMs: number;
  /** Counts of how often the fault has been considered + actually injected. */
  considered: number;
  injected: number;
}

export interface ChaosContext {
  tenantId?: string;
  route?: string;
  meta?: Record<string, unknown>;
}

export interface ChaosOptions {
  /** Injectable RNG (defaults to Math.random). */
  rng?: () => number;
  /** Hook called every time a fault is actually injected. */
  onInject?: (name: FaultName, ctx: ChaosContext) => void;
  /** Override env gate (tests). When set, ignores process.env. */
  forceEnabled?: boolean;
}

export class ChaosController {
  private readonly faults = new Map<FaultName, FaultRecord>();
  private readonly rng: () => number;
  private readonly onInject?: (n: FaultName, c: ChaosContext) => void;
  private readonly forceEnabled?: boolean;

  constructor(opts: ChaosOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.onInject = opts.onInject;
    this.forceEnabled = opts.forceEnabled;
  }

  /**
   * Returns true when the controller may inject faults. Production is
   * always off; dev/staging require `CHAOS_ENABLED=true`.
   */
  isEnabled(): boolean {
    if (this.forceEnabled !== undefined) return this.forceEnabled;
    if (process.env.NODE_ENV === 'production') return false;
    return process.env.CHAOS_ENABLED === 'true';
  }

  /** Register / overwrite a fault's probability. Clamped to [0, 1]. */
  enable(name: FaultName, probability: number): FaultRecord {
    const p = Math.max(0, Math.min(1, probability));
    const existing = this.faults.get(name);
    const rec: FaultRecord = existing
      ? { ...existing, probability: p, enabledAtMs: Date.now() }
      : {
          name,
          probability: p,
          enabledAtMs: Date.now(),
          considered: 0,
          injected: 0,
        };
    this.faults.set(name, rec);
    return rec;
  }

  /** Remove a fault from the active set. */
  disable(name: FaultName): boolean {
    return this.faults.delete(name);
  }

  /** Remove every fault — used by chaos UI "clear" + tests. */
  disableAll(): void {
    this.faults.clear();
  }

  /** Returns the registered fault record (mutable snapshot). */
  get(name: FaultName): FaultRecord | null {
    const r = this.faults.get(name);
    return r ? { ...r } : null;
  }

  /** Active fault list (sorted by name for stable output). */
  list(): FaultRecord[] {
    return [...this.faults.values()]
      .map((r) => ({ ...r }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Roll for the named fault. Returns true when the action should fire.
   * Updates the per-fault `considered` and `injected` counters.
   */
  shouldInject(name: FaultName): boolean {
    if (!this.isEnabled()) return false;
    const rec = this.faults.get(name);
    if (!rec) return false;
    rec.considered++;
    if (this.rng() < rec.probability) {
      rec.injected++;
      return true;
    }
    return false;
  }

  /**
   * Run `action` only when the probability roll succeeds. Otherwise the
   * promise resolves to `undefined`. Throws are propagated.
   */
  async injectIf<T>(
    name: FaultName,
    ctx: ChaosContext,
    action: () => Promise<T> | T
  ): Promise<T | undefined> {
    if (!this.shouldInject(name)) return undefined;
    this.onInject?.(name, ctx);
    return await action();
  }

  /** Reset all counters (preserves enabled set). */
  resetCounters(): void {
    for (const r of this.faults.values()) {
      r.considered = 0;
      r.injected = 0;
    }
  }

  /** Aggregate counters across all faults. */
  totals(): { considered: number; injected: number } {
    let considered = 0;
    let injected = 0;
    for (const r of this.faults.values()) {
      considered += r.considered;
      injected += r.injected;
    }
    return { considered, injected };
  }
}

/** Default singleton — wired by `server/index.ts` + admin chaos route. */
export const chaos = new ChaosController();

/** Names of every supported fault. Useful for UI dropdowns + validation. */
export const FAULT_NAMES: readonly FaultName[] = [
  'cache.miss',
  'wallet.timeout',
  'db.slow-query',
  'hsm.key-rotation',
  'audit.chain-gap',
  'tenant.context-loss',
];

export function isFaultName(value: string): value is FaultName {
  return (FAULT_NAMES as readonly string[]).includes(value);
}
