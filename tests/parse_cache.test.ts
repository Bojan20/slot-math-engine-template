/**
 * W152 Wave 15 — IR parseCache test coverage.
 *
 * Goals:
 *   1. Cache hits return the SAME parse result instance (proof of no
 *      re-parse on the hot path).
 *   2. LRU eviction keeps memory bounded under churn.
 *   3. Stats counters report accurate hit/miss/eviction tallies.
 *   4. Invalid IR is NOT cached (re-fetch will surface the same error
 *      after the operator fixes the JSON).
 *   5. Object-input mode skips the JSON parse step but still hits cache
 *      on identical text.
 *   6. configureCache rejects out-of-range values + downsizes correctly.
 *   7. fingerprintText is deterministic and stable across runs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadIrCached,
  getCacheStats,
  clearCache,
  configureCache,
  fingerprintText,
  _hasFingerprint,
} from '../src/ir/parseCache.js';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/parity.json');
const VALID_IR_TEXT = readFileSync(FIXTURE_PATH, 'utf-8');

describe('IR parseCache (W152 Wave 15)', () => {
  beforeEach(() => {
    clearCache();
    configureCache({ capacity: 64 });
  });

  describe('fingerprintText', () => {
    it('is deterministic across calls', () => {
      const a = fingerprintText('hello world');
      const b = fingerprintText('hello world');
      expect(a).toBe(b);
    });

    it('produces different fingerprints for different inputs', () => {
      const a = fingerprintText('hello');
      const b = fingerprintText('world');
      expect(a).not.toBe(b);
    });

    it('returns a 16-char lowercase hex string', () => {
      const fp = fingerprintText('test');
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('handles empty string', () => {
      const fp = fingerprintText('');
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('handles UTF-8 multi-byte characters correctly', () => {
      const a = fingerprintText('café');
      const b = fingerprintText('cafe');
      expect(a).not.toBe(b);
    });
  });

  describe('loadIrCached — string input', () => {
    it('returns ok=true for valid IR', () => {
      const r = loadIrCached(VALID_IR_TEXT);
      expect(r.ok).toBe(true);
    });

    it('returns the SAME result instance on repeated identical input (proof of cache hit)', () => {
      const r1 = loadIrCached(VALID_IR_TEXT);
      const r2 = loadIrCached(VALID_IR_TEXT);
      expect(r1).toBe(r2);
    });

    it('reports hits=1 misses=1 after one miss + one hit', () => {
      loadIrCached(VALID_IR_TEXT);
      loadIrCached(VALID_IR_TEXT);
      const s = getCacheStats();
      expect(s.misses).toBe(1);
      expect(s.hits).toBe(1);
    });

    it('does NOT cache failed parses', () => {
      const broken = '{"meta":{"id":"x"}}'; // missing required fields
      const r1 = loadIrCached(broken);
      const r2 = loadIrCached(broken);
      expect(r1.ok).toBe(false);
      expect(r2.ok).toBe(false);
      // Both calls should be misses — failed parses skip the cache.
      const s = getCacheStats();
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(2);
    });

    it('reports a JSON parse failure with a structured issue', () => {
      const r = loadIrCached('not valid json {{{');
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issues[0].path).toBe('/');
        expect(r.issues[0].message).toMatch(/JSON parse failure/);
      }
    });
  });

  describe('loadIrCached — object input', () => {
    it('accepts a pre-parsed object directly', () => {
      const obj = JSON.parse(VALID_IR_TEXT);
      const r = loadIrCached(obj);
      expect(r.ok).toBe(true);
    });

    it('hits cache when the same object is passed twice', () => {
      const obj = JSON.parse(VALID_IR_TEXT);
      loadIrCached(obj);
      loadIrCached(obj);
      const s = getCacheStats();
      expect(s.misses).toBe(1);
      expect(s.hits).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('evicts the oldest entry when capacity is exceeded', () => {
      configureCache({ capacity: 2 });
      const a = JSON.parse(VALID_IR_TEXT);
      // Three slightly different IRs by tweaking name.
      const aText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'A' } });
      const bText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'B' } });
      const cText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'C' } });

      loadIrCached(aText); // miss → cached
      loadIrCached(bText); // miss → cached
      loadIrCached(cText); // miss → evicts A (oldest)

      const s = getCacheStats();
      expect(s.size).toBe(2);
      expect(s.evictions).toBeGreaterThanOrEqual(1);
      // A should be gone (re-load is a miss).
      const missesBefore = getCacheStats().misses;
      loadIrCached(aText);
      expect(getCacheStats().misses).toBe(missesBefore + 1);
    });

    it('LRU touch on hit refreshes the entry', () => {
      configureCache({ capacity: 2 });
      const a = JSON.parse(VALID_IR_TEXT);
      const aText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'A' } });
      const bText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'B' } });
      const cText = JSON.stringify({ ...a, meta: { ...a.meta, name: 'C' } });

      loadIrCached(aText); // cached
      loadIrCached(bText); // cached
      loadIrCached(aText); // hit → A becomes MRU
      loadIrCached(cText); // miss → should evict B (now LRU), not A

      // A still in cache — re-load is a hit.
      const hitsBefore = getCacheStats().hits;
      loadIrCached(aText);
      expect(getCacheStats().hits).toBe(hitsBefore + 1);
    });
  });

  describe('configureCache', () => {
    it('throws on non-integer capacity', () => {
      expect(() => configureCache({ capacity: 1.5 })).toThrow(TypeError);
      expect(() => configureCache({ capacity: NaN })).toThrow(TypeError);
    });

    it('throws on out-of-range capacity', () => {
      expect(() => configureCache({ capacity: 0 })).toThrow(RangeError);
      expect(() => configureCache({ capacity: -1 })).toThrow(RangeError);
      expect(() => configureCache({ capacity: 10000 })).toThrow(RangeError);
    });

    it('downsizes by evicting LRU when capacity shrinks', () => {
      configureCache({ capacity: 4 });
      const a = JSON.parse(VALID_IR_TEXT);
      for (let i = 0; i < 4; i++) {
        loadIrCached(JSON.stringify({ ...a, meta: { ...a.meta, name: `G${i}` } }));
      }
      expect(getCacheStats().size).toBe(4);
      configureCache({ capacity: 2 });
      expect(getCacheStats().size).toBe(2);
      expect(getCacheStats().evictions).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clearCache', () => {
    it('resets all counters and entries', () => {
      loadIrCached(VALID_IR_TEXT);
      loadIrCached(VALID_IR_TEXT);
      let s = getCacheStats();
      expect(s.size).toBeGreaterThan(0);
      expect(s.hits + s.misses).toBeGreaterThan(0);
      clearCache();
      s = getCacheStats();
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
      expect(s.evictions).toBe(0);
      expect(s.size).toBe(0);
    });
  });

  describe('_hasFingerprint test inspector', () => {
    it('returns true for cached entries, false otherwise', () => {
      const fp = fingerprintText(VALID_IR_TEXT);
      expect(_hasFingerprint(fp)).toBe(false);
      loadIrCached(VALID_IR_TEXT);
      expect(_hasFingerprint(fp)).toBe(true);
    });
  });

  describe('hot-path performance proof', () => {
    it('skips Zod re-parse on 100 consecutive identical loads', () => {
      // Warm + measure hit rate. 1 miss + 99 hits expected.
      for (let i = 0; i < 100; i++) loadIrCached(VALID_IR_TEXT);
      const s = getCacheStats();
      expect(s.misses).toBe(1);
      expect(s.hits).toBe(99);
    });
  });
});
