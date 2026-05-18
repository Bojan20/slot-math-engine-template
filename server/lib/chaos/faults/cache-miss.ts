/**
 * W212 Faza 600.1 — Chaos fault: cache miss.
 *
 * Wraps a cache get-or-load helper so that, when chaos is enabled and
 * the per-fault probability fires, the cached value is skipped and the
 * loader is invoked even on a real cache hit. This validates that
 * downstream code paths still work when the cache is cold or evicted.
 *
 * Designed for use with `server/lib/cache.ts`:
 *
 *   const v = await withCacheMissChaos(chaos, cache, 'lobby:games',
 *     async () => fetchGamesFromDb());
 */

import type { ChaosController } from '../index.js';
import type { Cache } from '../../cache.js';

export interface CacheMissChaosResult<T> {
  value: T;
  source: 'cache' | 'loader' | 'chaos-forced-loader';
}

/**
 * Cache-or-load with chaos interception. The cache is bypassed if and
 * only if `chaos.shouldInject('cache.miss')` returns true at call time.
 */
export async function withCacheMissChaos<T>(
  chaos: ChaosController,
  cache: Cache<T>,
  key: string,
  loader: () => Promise<T>,
  opts: { ttlMs?: number } = {}
): Promise<CacheMissChaosResult<T>> {
  const forced = chaos.shouldInject('cache.miss');
  if (!forced) {
    const cached = await cache.get(key);
    if (cached !== null) {
      return { value: cached, source: 'cache' };
    }
  }
  const fresh = await loader();
  try {
    await cache.set(key, fresh, { ...(opts.ttlMs ? { ttlMs: opts.ttlMs } : {}) });
  } catch {
    // Cache set failures shouldn't break the request; chaos itself is a
    // diagnostic tool. The miss decision still stands.
  }
  return { value: fresh, source: forced ? 'chaos-forced-loader' : 'loader' };
}

/**
 * Statistics that tests can use to verify the chaos rate matches the
 * configured probability. Returns the share of forced-loader outcomes
 * across a sample. The sample is collected by the caller (chaos
 * controller exposes per-fault `considered/injected` counters that can
 * be reset between samples).
 */
export function chaosForcedRate(controller: ChaosController): number {
  const rec = controller.get('cache.miss');
  if (!rec || rec.considered === 0) return 0;
  return rec.injected / rec.considered;
}

/**
 * Toggle helper used by the admin chaos route. Returns the new state.
 */
export function setCacheMissChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.1
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('cache.miss', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('cache.miss');
  return { enabled: false, probability: 0 };
}
