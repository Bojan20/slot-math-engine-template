/**
 * W212 Faza 600.1 — Chaos fault: wallet-call timeout.
 *
 * When enabled, a fraction of wallet calls are wrapped with a hard
 * timeout (defaults to 5 s) and a forced sleep so the operation never
 * completes in time. The wallet orchestrator's existing retry +
 * circuit-breaker layer should catch this and fail open with the
 * configured fallback strategy.
 */

import type { ChaosController } from '../index.js';

export class WalletChaosTimeoutError extends Error {
  constructor(public readonly elapsedMs: number) {
    super(`chaos.wallet.timeout after ${elapsedMs}ms`);
    this.name = 'WalletChaosTimeoutError';
  }
}

export interface WalletTimeoutChaosOptions {
  /** Hard timeout the call will hang on. Default 5_000. */
  timeoutMs?: number;
  /** Override sleep helper (tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap an arbitrary wallet call. When the fault rolls in, force a
 * timeout error before the inner call ever runs (so we don't leak
 * partial side-effects like wallet credits).
 */
export async function withWalletTimeoutChaos<T>(
  chaos: ChaosController,
  fn: () => Promise<T>,
  opts: WalletTimeoutChaosOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const sleep = opts.sleep ?? defaultSleep;
  if (chaos.shouldInject('wallet.timeout')) {
    // Sleep up to timeoutMs then reject. Tests inject a fake sleep so
    // they don't actually wait.
    await sleep(timeoutMs);
    throw new WalletChaosTimeoutError(timeoutMs);
  }
  return await fn();
}

/**
 * Toggle helper for the admin chaos route. Returns the new state.
 */
export function setWalletTimeoutChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.05
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('wallet.timeout', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('wallet.timeout');
  return { enabled: false, probability: 0 };
}

/**
 * For dashboard display: estimate the average wallet call slowdown
 * over the last sample window, assuming the configured timeout fires
 * at the recorded injection rate.
 */
export function estimatedSlowdownMs(
  chaos: ChaosController,
  timeoutMs = 5_000
): number {
  const rec = chaos.get('wallet.timeout');
  if (!rec || rec.considered === 0) return 0;
  const rate = rec.injected / rec.considered;
  return rate * timeoutMs;
}
