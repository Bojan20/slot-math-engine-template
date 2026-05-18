/**
 * W210 Faza 600.0 — Canary deployment controller behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  CanaryController,
  evaluateGates,
  planStages,
  adaptHold,
  runRehearsal,
  type HealthSample,
} from '../lib/deployment/canary.js';
import { defaultManifest } from '../lib/deployment/manifest.js';

function goodSample(tsMs: number, overrides: Partial<HealthSample> = {}): HealthSample {
  return {
    tsMs,
    rtpCanary: 0.96,
    rtpProduction: 0.96,
    errorRate: 0,
    latencyP99Ms: 50,
    baselineLatencyP99Ms: 50,
    replayDeterministic: true,
    ...overrides,
  };
}

describe('canary controller — stage planning', () => {
  it('linear strategy: 1 → 5 → 25 → 100 percent', () => {
    const stages = planStages('linear', 1_000);
    expect(stages.map((s) => s.rolloutPercent)).toEqual([1, 5, 25, 100]);
    expect(stages[3].holdDurationMs).toBe(Infinity);
  });

  it('exponential strategy: 1 → 10 → 50 → 100', () => {
    const stages = planStages('exponential', 1_000);
    expect(stages.map((s) => s.rolloutPercent)).toEqual([1, 10, 50, 100]);
  });

  it('adaptive uses linear shape', () => {
    const stages = planStages('adaptive', 1_000);
    expect(stages.map((s) => s.rolloutPercent)).toEqual([1, 5, 25, 100]);
  });
});

describe('canary controller — gate evaluation', () => {
  const manifest = defaultManifest();

  it('passes when sample is healthy', () => {
    expect(evaluateGates(goodSample(0), manifest)).toBeNull();
  });

  it('detects RTP drift', () => {
    expect(
      evaluateGates(goodSample(0, { rtpCanary: 0.92, rtpProduction: 0.96 }), manifest)
    ).toBe('rtp_drift');
  });

  it('detects error rate gate failure', () => {
    expect(
      evaluateGates(goodSample(0, { errorRate: 0.5 }), manifest)
    ).toBe('error_rate');
  });

  it('detects latency p99 multiplier breach', () => {
    expect(
      evaluateGates(
        goodSample(0, { latencyP99Ms: 100, baselineLatencyP99Ms: 50 }),
        manifest
      )
    ).toBe('latency_p99');
  });

  it('detects replay nondeterminism', () => {
    expect(
      evaluateGates(goodSample(0, { replayDeterministic: false }), manifest)
    ).toBe('replay_nondeterministic');
  });
});

describe('canary controller — stage transitions', () => {
  it('advances through 4 stages on healthy samples', () => {
    const m = defaultManifest();
    const events: string[] = [];
    const c = new CanaryController(m, { stageHoldMs: 1_000, onStageLog: (l) => events.push(l) });
    c.start(0);
    const d1 = c.ingest(goodSample(500));
    expect(d1.kind).toBe('hold');
    const d2 = c.ingest(goodSample(1_500));
    expect(d2.kind).toBe('promote');
    const d3 = c.ingest(goodSample(3_000));
    expect(d3.kind).toBe('promote');
    const d4 = c.ingest(goodSample(4_500));
    // Promoting into the terminal stage emits 'live'.
    expect(d4.kind).toBe('live');
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((l) => l.includes('promoted'))).toBe(true);
    expect(events.some((l) => l.includes('live'))).toBe(true);
  });

  it('rollback fires on RTP drift mid-stage', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 10_000 });
    c.start(0);
    const d = c.ingest(goodSample(500, { rtpCanary: 0.85, rtpProduction: 0.96 }));
    expect(d.kind).toBe('rollback');
    if (d.kind === 'rollback') expect(d.trigger).toBe('rtp_drift');
  });

  it('rollback fires on error rate gate', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 10_000 });
    c.start(0);
    const d = c.ingest(goodSample(100, { errorRate: 0.5 }));
    expect(d.kind).toBe('rollback');
    if (d.kind === 'rollback') expect(d.trigger).toBe('error_rate');
  });

  it('rollback fires on latency p99 multiplier breach', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 10_000 });
    c.start(0);
    const d = c.ingest(goodSample(100, { latencyP99Ms: 1000, baselineLatencyP99Ms: 50 }));
    expect(d.kind).toBe('rollback');
    if (d.kind === 'rollback') expect(d.trigger).toBe('latency_p99');
  });

  it('rollback fires on replay nondeterminism', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 10_000 });
    c.start(0);
    const d = c.ingest(goodSample(100, { replayDeterministic: false }));
    expect(d.kind).toBe('rollback');
    if (d.kind === 'rollback') expect(d.trigger).toBe('replay_nondeterministic');
  });

  it('after rollback subsequent ingests stay rolled back', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 10_000 });
    c.start(0);
    c.ingest(goodSample(100, { errorRate: 1 }));
    const d2 = c.ingest(goodSample(200));
    expect(d2.kind).toBe('rollback');
  });

  it('rolloutPercent reflects current stage', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 1_000 });
    c.start(0);
    expect(c.rolloutPercent()).toBe(1);
    c.ingest(goodSample(1_500)); // promote to s1
    expect(c.rolloutPercent()).toBe(5);
    c.ingest(goodSample(3_000)); // promote to s2
    expect(c.rolloutPercent()).toBe(25);
    c.ingest(goodSample(4_500)); // promote to s3 (live)
    expect(c.rolloutPercent()).toBe(100);
  });

  it('healthScore in [0,1]; 1 on perfect sample', () => {
    const c = new CanaryController(defaultManifest());
    expect(c.healthScore(goodSample(0))).toBeCloseTo(1, 6);
    const score = c.healthScore(goodSample(0, { errorRate: 0.005 }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('snapshot reflects current state', () => {
    const c = new CanaryController(defaultManifest(), { stageHoldMs: 1_000 });
    c.start(0);
    c.ingest(goodSample(500));
    const s1 = c.snapshot();
    expect(s1.stage).toBe(0);
    expect(s1.rolloutPercent).toBe(1);
    expect(s1.rolledBack).toBe(false);
  });

  it('after rollback snapshot.rolledBack is true', () => {
    const c = new CanaryController(defaultManifest());
    c.start(0);
    c.ingest(goodSample(0, { errorRate: 1 }));
    expect(c.snapshot().rolledBack).toBe(true);
  });

  it('runRehearsal stops at first rollback', () => {
    const samples = [
      goodSample(0),
      goodSample(100, { errorRate: 1 }),
      goodSample(200),
    ];
    const out = runRehearsal(defaultManifest(), samples, { stageHoldMs: 10_000 });
    expect(out.length).toBe(2);
    expect(out[1].kind).toBe('rollback');
  });

  it('runRehearsal terminates on live state', () => {
    const samples = [
      goodSample(0),
      goodSample(1_500),
      goodSample(3_000),
      goodSample(4_500),
    ];
    const out = runRehearsal(defaultManifest(), samples, { stageHoldMs: 1_000 });
    expect(out[out.length - 1].kind).toBe('live');
  });

  it('returns empty decision array for empty sample stream', () => {
    expect(runRehearsal(defaultManifest(), [])).toEqual([]);
  });

  it('adaptive strategy can halve hold under comfortable margin', () => {
    const m = defaultManifest({ canaryStrategy: 'adaptive' });
    const baseHold = 10 * 60_000;
    const out = adaptHold(goodSample(0), m, baseHold);
    expect(out).toBeLessThan(baseHold);
    expect(out).toBeGreaterThanOrEqual(60_000);
  });

  it('adaptive strategy keeps full hold on marginal sample', () => {
    const m = defaultManifest({ canaryStrategy: 'adaptive' });
    const baseHold = 10 * 60_000;
    const out = adaptHold(
      goodSample(0, { errorRate: m.rollbackTriggers.errorRate * 0.99 }),
      m,
      baseHold
    );
    expect(out).toBe(baseHold);
  });

  it('emits stage transition log lines', () => {
    const events: string[] = [];
    const c = new CanaryController(defaultManifest(), {
      stageHoldMs: 1_000,
      onStageLog: (l) => events.push(l),
    });
    c.start(0);
    expect(events[0]).toMatch(/stage=s0/);
    expect(events[0]).toMatch(/started/);
  });
});
