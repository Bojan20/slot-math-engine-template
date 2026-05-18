/**
 * W212 Faza 600.1 — Chaos fault: DB slow query.
 *
 * Wraps a DB call in a probabilistic delay (200-500 ms uniform). Used
 * to verify that the latency budget tracker fires its warning hook and
 * that route handlers don't deadlock under degraded DB conditions.
 */

import type { ChaosController } from '../index.js';

export interface DbSlowQueryChaosOptions {
  /** Lower bound (inclusive) for the injected delay in ms. */
  minDelayMs?: number;
  /** Upper bound (inclusive) for the injected delay in ms. */
  maxDelayMs?: number;
  /** Injectable RNG (defaults to Math.random). */
  rng?: () => number;
  /** Injectable sleep helper. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Pick a delay uniformly between minDelayMs and maxDelayMs.
 */
export function pickSlowDelayMs(opts: DbSlowQueryChaosOptions = {}): number {
  const min = opts.minDelayMs ?? 200;
  const max = opts.maxDelayMs ?? 500;
  const rng = opts.rng ?? Math.random;
  return Math.floor(min + rng() * (max - min + 1));
}

/**
 * Wrap an arbitrary DB call. If the chaos fault fires, inject a uniform
 * 200-500ms delay before forwarding to the underlying query. Returns
 * the unmodified result + a flag indicating whether the chaos fired.
 */
export async function withDbSlowQueryChaos<T>(
  chaos: ChaosController,
  fn: () => Promise<T>,
  opts: DbSlowQueryChaosOptions = {}
): Promise<{ value: T; delayedMs: number }> {
  if (!chaos.shouldInject('db.slow-query')) {
    const value = await fn();
    return { value, delayedMs: 0 };
  }
  const delay = pickSlowDelayMs(opts);
  const sleep = opts.sleep ?? defaultSleep;
  await sleep(delay);
  const value = await fn();
  return { value, delayedMs: delay };
}

/**
 * Toggle helper for the admin chaos route. Returns the new state.
 */
export function setDbSlowQueryChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.05
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('db.slow-query', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('db.slow-query');
  return { enabled: false, probability: 0 };
}
