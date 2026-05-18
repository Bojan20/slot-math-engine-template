/**
 * W212 Faza 600.1 — Chaos fault: tenant context loss.
 *
 * Simulates a buggy upstream that strips `tenantId` from the
 * AsyncLocalStorage scope between two awaits. The downstream call MUST
 * surface a `TenantContextMissingError` (caught by
 * `assertTenantContext()`); silently proceeding would leak data.
 *
 * We don't actually mutate the real ALS — we provide a wrapper that
 * runs the inner function with an *empty* tenant scope when the chaos
 * fires, allowing tests / scenarios to exercise the failure path.
 */

import type { ChaosController } from '../index.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  TenantContextMissingError,
  type TenantContext,
} from '../../tenant-isolation.js';

/**
 * Run `fn` either with the configured tenant context (normal path) or
 * with no context (chaos-induced loss). The function may throw
 * `TenantContextMissingError` from inside its body via the assertion
 * helper — this wrapper propagates it.
 */
export function runWithTenantLossChaos<T>(
  chaos: ChaosController,
  ctx: TenantContext,
  storage: AsyncLocalStorage<TenantContext>,
  fn: () => T
): { value?: T; lostContext: boolean; error?: Error } {
  const triggered = chaos.shouldInject('tenant.context-loss');
  if (!triggered) {
    const value = storage.run(ctx, fn);
    return { value, lostContext: false };
  }
  // Lose the context: do NOT call storage.run.
  try {
    const value = fn();
    return { value, lostContext: true };
  } catch (err) {
    return {
      lostContext: true,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Helper that downstream calls into the chaos wrapper and asserts the
 * tenant context. Returns the result OR a structured caught-error
 * record so observability can record the violation rather than crash.
 */
export function safeAssertTenant(
  cb: () => TenantContext
): { ok: true; tenantId: string } | { ok: false; reason: string } {
  try {
    const ctx = cb();
    return { ok: true, tenantId: ctx.tenantId };
  } catch (err) {
    if (err instanceof TenantContextMissingError) {
      return { ok: false, reason: 'tenant_context_missing' };
    }
    return { ok: false, reason: String(err) };
  }
}

export function setTenantContextLossChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.02
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('tenant.context-loss', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('tenant.context-loss');
  return { enabled: false, probability: 0 };
}
