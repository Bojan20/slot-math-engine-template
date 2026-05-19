/*
 * W215 Faza 800.2 Agent C — deterministic client-side A/B bucketing.
 *
 * Pure ESM, no external deps. Buckets a (sessionId, experimentId) pair
 * into one of N variants using a stable 64-bit-style hash and
 * cumulative weight table. Same inputs → same variant forever, so the
 * UX never flickers between page navigations or reloads.
 *
 * Pre-registered experiments (sync-loaded so the page paints with the
 * correct variant first time — no flash of original content):
 *   hero_headline_v2   variants: A / B / C
 *   pricing_tier_order variants: indie-first / platform-first
 *   cta_button_color   variants: cyan / amber / emerald
 *
 * A variant is applied by setting `data-ab-variant` on the document
 * root and on any element marked with `data-ab="<experimentId>"`.
 * CSS can then target `[data-ab-variant="…"]` selectors.
 *
 * To register more experiments at runtime:
 *   import {registerExperiment, applyAll} from './ab-testing.js';
 *   registerExperiment({id:'foo', variants:['v1','v2'], weights:[1,1]});
 *   applyAll(getSessionId());
 *
 * Hash:  xxhash-flavoured 32-bit mix.  We re-implement instead of
 * pulling `xxhashjs` so the browser bundle stays dependency-free.
 */

const EXPERIMENTS = new Map();

export function registerExperiment(exp) {
  if (!exp || typeof exp.id !== 'string') {
    throw new TypeError('experiment.id required');
  }
  if (!Array.isArray(exp.variants) || exp.variants.length === 0) {
    throw new TypeError('experiment.variants must be non-empty array');
  }
  const weights = exp.weights ?? exp.variants.map(() => 1);
  if (weights.length !== exp.variants.length) {
    throw new RangeError('weights length must equal variants length');
  }
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new RangeError('weights must sum > 0');
  EXPERIMENTS.set(exp.id, { id: exp.id, variants: exp.variants.slice(), weights: weights.slice(), total });
  return exp.id;
}

export function listExperiments() {
  return Array.from(EXPERIMENTS.values()).map((e) => ({ ...e, variants: e.variants.slice(), weights: e.weights.slice() }));
}

/** Stable 32-bit hash (xxhash-style mix). Returns Uint32. */
export function abHash(key) {
  const s = String(key);
  let h = 0x9e3779b1;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
    h = ((h << 13) | (h >>> 19)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35);
  }
  h ^= s.length;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Bucket (sessionId, experimentId) → variant. Returns null when unknown. */
export function bucket(sessionId, experimentId) {
  const exp = EXPERIMENTS.get(experimentId);
  if (!exp) return null;
  const h = abHash(`${sessionId}::${experimentId}`);
  const r = (h / 0x100000000) * exp.total; // [0, total)
  let acc = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    acc += exp.weights[i];
    if (r < acc) return exp.variants[i];
  }
  return exp.variants[exp.variants.length - 1];
}

/** Apply a single experiment to the DOM. */
export function applyExperiment(sessionId, experimentId, doc = typeof document !== 'undefined' ? document : null) {
  const v = bucket(sessionId, experimentId);
  if (!v || !doc) return v;
  const root = doc.documentElement;
  if (root) root.setAttribute(`data-ab-${experimentId}`, v);
  doc.querySelectorAll(`[data-ab="${experimentId}"]`).forEach((el) => {
    el.setAttribute('data-ab-variant', v);
  });
  return v;
}

/** Apply every registered experiment. Returns map experimentId→variant. */
export function applyAll(sessionId, doc = typeof document !== 'undefined' ? document : null) {
  const out = {};
  for (const id of EXPERIMENTS.keys()) {
    out[id] = applyExperiment(sessionId, id, doc);
  }
  return out;
}

/** Reset registry (test-only). */
export function _reset() {
  EXPERIMENTS.clear();
  registerDefaults();
}

function registerDefaults() {
  registerExperiment({ id: 'hero_headline_v2',  variants: ['A', 'B', 'C'],                        weights: [1, 1, 1] });
  registerExperiment({ id: 'pricing_tier_order', variants: ['indie-first', 'platform-first'],     weights: [1, 1] });
  registerExperiment({ id: 'cta_button_color',  variants: ['cyan', 'amber', 'emerald'],           weights: [1, 1, 1] });
}

registerDefaults();

// Auto-apply on load so the very first paint already shows the chosen variant.
if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.__SME_AB_AUTO__ !== false) {
  try {
    const sid = window.smeAnalytics?.sessionId ?? `anon-${Math.floor(performance?.timeOrigin ?? Date.now())}`;
    applyAll(typeof sid === 'function' ? sid() : sid);
  } catch { /* swallow — bucketing is best-effort */ }
}
