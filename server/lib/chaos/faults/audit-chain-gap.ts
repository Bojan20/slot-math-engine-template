/**
 * W212 Faza 600.1 — Chaos fault: audit hash-chain gap.
 *
 * When the fault fires we temporarily break the prev/current link in
 * an in-memory chain copy. The `AuditChainObserver` should detect the
 * tampering on the next verification pass and surface a
 * `chain_gap_detected` event. This validates the audit observer's
 * negative path without touching real audit storage.
 */

import type { ChaosController } from '../index.js';
import { ZERO_HASH, sha256Hex, canonicalize, type ChainedEntry } from '../../hashChain.js';

export interface ChainGapResult {
  /** A copy of the input chain with one entry's `prev` mutated. */
  tampered: ChainedEntry[];
  /** Index of the entry whose `prev` was rewritten. */
  brokenAt: number | null;
  /** True when chaos actually fired. */
  triggered: boolean;
}

/**
 * Verify a chain end-to-end. Returns `null` when intact, otherwise the
 * 0-indexed position of the broken entry. This mirrors the production
 * audit-observer logic so the chaos test path exercises the same code.
 */
export function verifyChain(chain: ChainedEntry[]): number | null {
  let prev = ZERO_HASH;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (e.prev !== prev) return i;
    const recomputed = sha256Hex(
      canonicalize({
        seq: e.seq,
        timestamp: e.timestamp,
        type: e.type,
        payload: e.payload,
        prev: e.prev,
      })
    );
    if (recomputed !== e.current) return i;
    prev = e.current;
  }
  return null;
}

/**
 * Inject a chain gap by rewriting a single entry's `prev` to a
 * deliberately wrong value. Returns a new array (input is not mutated).
 *
 * When chaos is disabled or doesn't fire, returns the original chain
 * untouched with `triggered=false`.
 */
export function injectChainGap(
  chaos: ChaosController,
  chain: ChainedEntry[],
  opts: { rng?: () => number } = {}
): ChainGapResult {
  if (!chaos.shouldInject('audit.chain-gap')) {
    return { tampered: [...chain], brokenAt: null, triggered: false };
  }
  if (chain.length < 2) {
    // Nothing to break — return untouched but mark triggered so the
    // observer sees we tried.
    return { tampered: [...chain], brokenAt: null, triggered: true };
  }
  const rng = opts.rng ?? Math.random;
  const idx = 1 + Math.floor(rng() * (chain.length - 1));
  const tampered = chain.map((e, i) =>
    i === idx ? { ...e, prev: 'f'.repeat(64) } : { ...e }
  );
  return { tampered, brokenAt: idx, triggered: true };
}

/**
 * Observer-style helper: returns true when the supplied chain passes
 * verification, false when the chaos fault is detected. Useful for
 * tests that want to assert "if we inject, the observer catches it".
 */
export function observerVerdict(chain: ChainedEntry[]): {
  ok: boolean;
  brokenAt: number | null;
} {
  const idx = verifyChain(chain);
  return { ok: idx === null, brokenAt: idx };
}

export function setAuditChainGapChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.02
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('audit.chain-gap', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('audit.chain-gap');
  return { enabled: false, probability: 0 };
}
