/**
 * W152 Wave 55 — General Entropy Health Monitor tests.
 */

import { describe, it, expect } from 'vitest';
import {
  EntropyHealthMonitor,
  MultiBackendEntropyMonitor,
  DEFAULT_THRESHOLDS,
  type EntropyMonitorConfig,
  type EntropySample,
  type EntropyAlert,
} from '../src/rng/entropyHealthMonitor.js';

// ── Test helpers ───────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function* randomBytes(seed: number): Generator<number> {
  const rng = mulberry32(seed);
  while (true) {
    yield Math.floor(rng() * 256);
  }
}

function* biasedBytes(seed: number, bias: number): Generator<number> {
  // Returns 0 with probability `bias`, uniform [0..255] otherwise
  const rng = mulberry32(seed);
  while (true) {
    if (rng() < bias) {
      yield 0;
    } else {
      yield Math.floor(rng() * 256);
    }
  }
}

function feedN(monitor: EntropyHealthMonitor, gen: Generator<number>, n: number): EntropySample[] {
  const samples: EntropySample[] = [];
  for (let i = 0; i < n; i++) {
    const s = monitor.feed(gen.next().value!);
    if (s) samples.push(s);
  }
  return samples;
}

const baseCfg = (overrides: Partial<EntropyMonitorConfig> = {}): EntropyMonitorConfig => ({
  backendId: 'test',
  windowSizeBytes: 8192,
  assessIntervalBytes: 1024,
  thresholds: DEFAULT_THRESHOLDS,
  ...overrides,
});

// ── Validation ─────────────────────────────────────────────────────────────

describe('validate', () => {
  it('rejects empty backendId', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({ backendId: '' }))).toThrow();
  });
  it('rejects windowSizeBytes < 256', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 100 }))).toThrow();
  });
  it('rejects non-integer windowSizeBytes', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 256.5 }))).toThrow();
  });
  it('rejects assessIntervalBytes < 1', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({ assessIntervalBytes: 0 }))).toThrow();
  });
  it('rejects assessIntervalBytes > windowSizeBytes', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({ assessIntervalBytes: 99999 }))).toThrow();
  });
  it('rejects entropy threshold outside [0, 8]', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({
      thresholds: { minEntropyBitsPerByte: 9, maxChiSquareDeviation: 60 },
    }))).toThrow();
    expect(() => new EntropyHealthMonitor(baseCfg({
      thresholds: { minEntropyBitsPerByte: -1, maxChiSquareDeviation: 60 },
    }))).toThrow();
  });
  it('rejects negative chi deviation', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({
      thresholds: { minEntropyBitsPerByte: 7.9, maxChiSquareDeviation: -1 },
    }))).toThrow();
  });
  it('rejects non-positive maxConsecutiveUnhealthy', () => {
    expect(() => new EntropyHealthMonitor(baseCfg({
      thresholds: { ...DEFAULT_THRESHOLDS, maxConsecutiveUnhealthy: 0 },
    }))).toThrow();
  });
});

// ── Basic feeding & assessment ─────────────────────────────────────────────

describe('feed + assessment', () => {
  it('returns null until window fills', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 256 }));
    const gen = randomBytes(1);
    for (let i = 0; i < 256; i++) {
      // bytes 256..1023 — no assessment because window not yet full
      expect(m.feed(gen.next().value!)).toBeNull();
    }
  });
  it('produces sample after window fills + assess interval', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 256 }));
    const gen = randomBytes(2);
    let sample: EntropySample | null = null;
    for (let i = 0; i < 1024; i++) {
      const s = m.feed(gen.next().value!);
      if (s) sample = s;
    }
    expect(sample).not.toBeNull();
    expect(sample!.byteOffset).toBe(1024);
    expect(sample!.backendId).toBe('test');
  });
  it('windowSize stops growing once full', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    const gen = randomBytes(3);
    for (let i = 0; i < 3000; i++) m.feed(gen.next().value!);
    expect(m.windowSize()).toBe(1024);
  });
});

// ── Quality detection ─────────────────────────────────────────────────────

describe('healthy detection (good RNG)', () => {
  it('mulberry32 random bytes → healthy assessments', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 8192, assessIntervalBytes: 1024 }));
    const gen = randomBytes(42);
    let healthy = 0;
    let total = 0;
    for (let i = 0; i < 20_000; i++) {
      const s = m.feed(gen.next().value!);
      if (s) {
        total++;
        if (s.isHealthy) healthy++;
      }
    }
    expect(total).toBeGreaterThan(5);
    expect(healthy / total).toBeGreaterThan(0.8); // ≥ 80% healthy samples
  });
  it('high entropy means entropyBitsPerByte close to 8', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 8192, assessIntervalBytes: 8192 }));
    const gen = randomBytes(100);
    for (let i = 0; i < 8192; i++) m.feed(gen.next().value!);
    const sample = m.forceAssess()!;
    expect(sample.entropyBitsPerByte).toBeGreaterThan(7.95);
  });
});

describe('unhealthy detection (biased / poor RNG)', () => {
  it('biased bytes (high prob of 0) → unhealthy + alert', () => {
    let alertFired = false;
    let alertReasons: string[] = [];
    const m = new EntropyHealthMonitor(baseCfg({
      windowSizeBytes: 4096,
      assessIntervalBytes: 1024,
      onAlert: (a) => { alertFired = true; alertReasons = a.reasons; },
    }));
    const gen = biasedBytes(7, 0.5); // 50% are 0 → heavy bias
    for (let i = 0; i < 8000; i++) m.feed(gen.next().value!);
    expect(alertFired).toBe(true);
    expect(alertReasons.length).toBeGreaterThan(0);
  });
  it('constant byte → very low entropy + alert', () => {
    let alertCount = 0;
    const m = new EntropyHealthMonitor(baseCfg({
      windowSizeBytes: 4096,
      assessIntervalBytes: 1024,
      onAlert: () => alertCount++,
    }));
    for (let i = 0; i < 8000; i++) m.feed(0);
    const status = m.getStatus();
    expect(status.lastSample!.entropyBitsPerByte).toBeCloseTo(0, 4);
    expect(alertCount).toBeGreaterThan(0);
  });
});

// ── Sample sink ───────────────────────────────────────────────────────────

describe('onSample sink', () => {
  it('called on every assessment', () => {
    const samples: EntropySample[] = [];
    const m = new EntropyHealthMonitor(baseCfg({
      windowSizeBytes: 1024,
      assessIntervalBytes: 256,
      onSample: (s) => samples.push(s),
    }));
    const gen = randomBytes(11);
    for (let i = 0; i < 2048; i++) m.feed(gen.next().value!);
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const s of samples) expect(typeof s.entropyBitsPerByte).toBe('number');
  });
  it('sink errors do not propagate', () => {
    const m = new EntropyHealthMonitor(baseCfg({
      windowSizeBytes: 1024,
      assessIntervalBytes: 256,
      onSample: () => { throw new Error('boom'); },
    }));
    const gen = randomBytes(12);
    // Should not throw
    expect(() => { for (let i = 0; i < 2048; i++) m.feed(gen.next().value!); }).not.toThrow();
  });
});

// ── Alert sink ───────────────────────────────────────────────────────────

describe('onAlert sink', () => {
  it('not called when healthy', () => {
    let alertCount = 0;
    const m = new EntropyHealthMonitor(baseCfg({
      onAlert: () => alertCount++,
    }));
    const gen = randomBytes(33);
    for (let i = 0; i < 20_000; i++) m.feed(gen.next().value!);
    // mulberry32 stream should generally be healthy
    const status = m.getStatus();
    if (status.totalAssessments > 0) {
      // Allow some unhealthy samples but expect alert ratio < 50%
      expect(alertCount).toBeLessThan(status.totalAssessments * 0.5);
    }
  });
  it('consecutive_unhealthy reason fires after threshold', () => {
    const reasons: string[][] = [];
    const m = new EntropyHealthMonitor(baseCfg({
      windowSizeBytes: 1024,
      assessIntervalBytes: 256,
      thresholds: { ...DEFAULT_THRESHOLDS, maxConsecutiveUnhealthy: 2 },
      onAlert: (a) => reasons.push(a.reasons),
    }));
    for (let i = 0; i < 4000; i++) m.feed(0); // constant
    expect(reasons.some((r) => r.includes('consecutive_unhealthy'))).toBe(true);
  });
});

// ── Status & reset ────────────────────────────────────────────────────────

describe('getStatus + reset', () => {
  it('totalBytesProcessed matches feeds', () => {
    const m = new EntropyHealthMonitor(baseCfg());
    const gen = randomBytes(55);
    for (let i = 0; i < 1000; i++) m.feed(gen.next().value!);
    expect(m.getStatus().totalBytesProcessed).toBe(1000);
  });
  it('reset clears all state', () => {
    const m = new EntropyHealthMonitor(baseCfg());
    const gen = randomBytes(66);
    for (let i = 0; i < 10_000; i++) m.feed(gen.next().value!);
    expect(m.getStatus().totalBytesProcessed).toBe(10_000);
    m.reset();
    const s = m.getStatus();
    expect(s.totalBytesProcessed).toBe(0);
    expect(s.totalAssessments).toBe(0);
    expect(s.lastSample).toBeNull();
    expect(m.windowSize()).toBe(0);
  });
  it('forceAssess works after window fills', () => {
    // Use interval = window so auto-assess only fires once per full rotation
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    const gen = randomBytes(77);
    for (let i = 0; i < 1023; i++) m.feed(gen.next().value!); // not yet at interval
    const s = m.forceAssess();
    // Window not yet full (1023 < 1024) → null
    expect(s).toBeNull();
    m.feed(gen.next().value!); // now window full + auto-assess fires
    const s2 = m.forceAssess();
    expect(s2).not.toBeNull();
  });
  it('forceAssess returns null if window not full', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    const gen = randomBytes(78);
    for (let i = 0; i < 500; i++) m.feed(gen.next().value!);
    expect(m.forceAssess()).toBeNull();
  });
});

// ── feedBytes batch ───────────────────────────────────────────────────────

describe('feedBytes batch', () => {
  it('accepts Uint8Array', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 512 }));
    const gen = randomBytes(88);
    const arr = new Uint8Array(2048);
    for (let i = 0; i < arr.length; i++) arr[i] = gen.next().value!;
    const samples = m.feedBytes(arr);
    expect(samples.length).toBeGreaterThan(0);
  });
  it('accepts number[]', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 512 }));
    const gen = randomBytes(89);
    const arr: number[] = [];
    for (let i = 0; i < 2048; i++) arr.push(gen.next().value!);
    const samples = m.feedBytes(arr);
    expect(samples.length).toBeGreaterThan(0);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('same bytes ⇒ identical samples', () => {
    const make = () => new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    const m1 = make();
    const m2 = make();
    const gen1 = randomBytes(123);
    const gen2 = randomBytes(123);
    const bytes: number[] = [];
    for (let i = 0; i < 5000; i++) bytes.push(gen1.next().value!);
    m1.feedBytes(bytes);
    const bytes2: number[] = [];
    for (let i = 0; i < 5000; i++) bytes2.push(gen2.next().value!);
    m2.feedBytes(bytes2);
    const s1 = m1.getStatus().lastSample!;
    const s2 = m2.getStatus().lastSample!;
    expect(s1.entropyBitsPerByte).toBe(s2.entropyBitsPerByte);
    expect(s1.chiSquare).toBe(s2.chiSquare);
  });
});

// ── MultiBackendEntropyMonitor ────────────────────────────────────────────

describe('MultiBackendEntropyMonitor', () => {
  it('registers + retrieves per-backend monitors', () => {
    const multi = new MultiBackendEntropyMonitor();
    multi.register(baseCfg({ backendId: 'pcg64' }));
    multi.register(baseCfg({ backendId: 'mulberry32' }));
    expect(multi.size()).toBe(2);
    expect(multi.get('pcg64')).toBeDefined();
    expect(multi.get('mulberry32')).toBeDefined();
    expect(multi.get('ghost')).toBeUndefined();
  });
  it('rejects duplicate backendId', () => {
    const multi = new MultiBackendEntropyMonitor();
    multi.register(baseCfg({ backendId: 'a' }));
    expect(() => multi.register(baseCfg({ backendId: 'a' }))).toThrow();
  });
  it('globalAlertSink invoked on per-backend alert', () => {
    const alerts: EntropyAlert[] = [];
    const multi = new MultiBackendEntropyMonitor((a) => alerts.push(a));
    const m = multi.register(baseCfg({
      backendId: 'biased',
      windowSizeBytes: 4096,
      assessIntervalBytes: 1024,
    }));
    for (let i = 0; i < 8000; i++) m.feed(0);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].backendId).toBe('biased');
  });
  it('isAnyAlertActive across backends', () => {
    const multi = new MultiBackendEntropyMonitor();
    const good = multi.register(baseCfg({
      backendId: 'good',
      windowSizeBytes: 4096,
      assessIntervalBytes: 1024,
    }));
    const bad = multi.register(baseCfg({
      backendId: 'bad',
      windowSizeBytes: 4096,
      assessIntervalBytes: 1024,
      thresholds: { ...DEFAULT_THRESHOLDS, maxConsecutiveUnhealthy: 2 },
    }));
    const gen = randomBytes(200);
    for (let i = 0; i < 8000; i++) good.feed(gen.next().value!);
    for (let i = 0; i < 8000; i++) bad.feed(0); // constant → alert
    expect(multi.isAnyAlertActive()).toBe(true);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('byte values outside 0..255 are masked to & 0xff', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    for (let i = 0; i < 1024; i++) m.feed(i + 256); // ensures masking works
    // Should not throw; should produce sample
    const s = m.forceAssess();
    expect(s).not.toBeNull();
  });
  it('zero entropy via constant feed', () => {
    const m = new EntropyHealthMonitor(baseCfg({ windowSizeBytes: 1024, assessIntervalBytes: 1024 }));
    for (let i = 0; i < 1024; i++) m.feed(42);
    const s = m.getStatus().lastSample!;
    expect(s.entropyBitsPerByte).toBeCloseTo(0, 6);
  });
});
