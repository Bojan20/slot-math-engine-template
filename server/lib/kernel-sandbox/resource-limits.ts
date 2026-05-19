/**
 * W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (Agent A, restart).
 *
 * Resource-limit policy per tier. The executor reads these and refuses to
 * compile/run a kernel that asks for more than the tier allows.
 *
 * Tier mapping:
 *   tier-1 = trusted internal (CI, smoke)            — generous
 *   tier-2 = third-party verified                    — default
 *   tier-3 = third-party unverified / first submit   — tight
 */

import type { ResourceLimits, SandboxTier } from './types.js';

export const DEFAULT_LIMITS: ResourceLimits = Object.freeze({
  cpuMs: 5_000,
  heapMb: 128,
  consoleLines: 1_000,
});

const TIER_LIMITS: Readonly<Record<SandboxTier, ResourceLimits>> = Object.freeze({
  'tier-1': Object.freeze({ cpuMs: 10_000, heapMb: 256, consoleLines: 4_000 }),
  'tier-2': Object.freeze({ cpuMs: 5_000, heapMb: 128, consoleLines: 1_000 }),
  'tier-3': Object.freeze({ cpuMs: 2_000, heapMb: 64, consoleLines: 250 }),
});

/** Lookup limits for a sandbox tier. */
export function limitsForTier(tier: SandboxTier): ResourceLimits {
  return TIER_LIMITS[tier];
}

/**
 * Merge a partial override onto the tier (or default) base, clamping each
 * value to safe operational bounds. Throws on negative / non-finite input
 * — the executor must never be coaxed into an "infinite" budget.
 */
export function mergeLimits(
  base: ResourceLimits = DEFAULT_LIMITS,
  override?: Partial<ResourceLimits>,
): ResourceLimits {
  if (!override) return { ...base };
  const out: ResourceLimits = { ...base };
  if (override.cpuMs !== undefined) out.cpuMs = clamp('cpuMs', override.cpuMs, 50, 60_000);
  if (override.heapMb !== undefined) out.heapMb = clamp('heapMb', override.heapMb, 8, 1_024);
  if (override.consoleLines !== undefined) {
    out.consoleLines = clamp('consoleLines', override.consoleLines, 10, 50_000);
  }
  return out;
}

function clamp(name: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`resource-limit '${name}' must be a positive finite number, got ${value}`);
  }
  if (value < min) return min;
  if (value > max) return max;
  return Math.floor(value);
}

/** True when the observed value crosses the heap limit. */
export function isHeapExceeded(observedMb: number, limitMb: number): boolean {
  if (!Number.isFinite(observedMb) || observedMb < 0) return false;
  return observedMb > limitMb;
}

/** True when the observed CPU wall-time crosses the limit. */
export function isCpuExceeded(observedMs: number, limitMs: number): boolean {
  if (!Number.isFinite(observedMs) || observedMs < 0) return false;
  return observedMs > limitMs;
}

/** Sample current process heap in MiB. Returns 0 when unavailable. */
export function sampleHeapMb(): number {
  try {
    const m = process.memoryUsage();
    return m.heapUsed / (1024 * 1024);
  } catch {
    return 0;
  }
}

/** Format the limits as a one-line summary (for logs). */
export function formatLimits(l: ResourceLimits): string {
  return `cpu=${l.cpuMs}ms heap=${l.heapMb}MiB console=${l.consoleLines}`;
}
