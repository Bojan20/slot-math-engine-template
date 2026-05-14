/**
 * W152 P2-12 — RG hooks emitter + self-exclusion client tests.
 *
 * Covers:
 *   * `RGHookEmitter`: subscribe / unsubscribe / fan-out / clear.
 *   * `CircuitBreaker`: closed → open → half-open → closed cycle.
 *   * `SelfExclusionClient`: parallel fan-out, first-hit verdict,
 *     fail-closed when every breaker is open, hook emission per
 *     provider with `circuitBreakerTripped` audit flag.
 *   * Timeout handling: slow provider triggers TIMEOUT, breaker
 *     trips on repeated failures.
 *   * Deterministic Date.now via injected `now()`.
 */

import { describe, it, expect } from 'vitest';
import { RGHookEmitter, type RGHookEvent } from '../src/rg/hooks.js';
import {
  CircuitBreaker,
  SelfExclusionClient,
  StubSelfExclusionProvider,
} from '../src/rg/self_exclusion_client.js';

// ─── RGHookEmitter ─────────────────────────────────────────────────────────

describe('W152 P2-12 — RGHookEmitter', () => {
  it('fan-outs to every subscriber in subscription order', () => {
    const e = new RGHookEmitter();
    const order: string[] = [];
    e.subscribe(() => order.push('A'));
    e.subscribe(() => order.push('B'));
    e.subscribe(() => order.push('C'));
    e.emit({
      kind: 'SESSION_TIMER',
      sessionId: 's1',
      ts: 0,
      detail: { elapsedMs: 0, nextCheckAt: 0 },
    });
    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('unsubscribe stops further delivery', () => {
    const e = new RGHookEmitter();
    const received: RGHookEvent[] = [];
    const off = e.subscribe((ev) => received.push(ev));
    e.emit({
      kind: 'REALITY_CHECK_ACK',
      sessionId: 's1',
      ts: 0,
      detail: { acknowledgedAtMs: 100, elapsedSessionMs: 60_000 },
    });
    off();
    e.emit({
      kind: 'REALITY_CHECK_ACK',
      sessionId: 's1',
      ts: 0,
      detail: { acknowledgedAtMs: 200, elapsedSessionMs: 120_000 },
    });
    expect(received).toHaveLength(1);
  });

  it('listenerCount + clear()', () => {
    const e = new RGHookEmitter();
    expect(e.listenerCount()).toBe(0);
    e.subscribe(() => undefined);
    e.subscribe(() => undefined);
    expect(e.listenerCount()).toBe(2);
    e.clear();
    expect(e.listenerCount()).toBe(0);
  });
});

// ─── CircuitBreaker ───────────────────────────────────────────────────────

describe('W152 P2-12 — CircuitBreaker', () => {
  it('closed → open after threshold failures', () => {
    const b = new CircuitBreaker({ failureThreshold: 3, recoveryMs: 1000 });
    expect(b.canPass()).toBe(true);
    b.onFailure();
    b.onFailure();
    expect(b.canPass()).toBe(true); // still closed
    b.onFailure();
    expect(b.canPass()).toBe(false); // open
    expect(b.snapshot().state).toBe('open');
  });

  it('open → half-open after recoveryMs', () => {
    let now = 1_000;
    const b = new CircuitBreaker({
      failureThreshold: 1,
      recoveryMs: 5000,
      now: () => now,
    });
    b.onFailure();
    expect(b.canPass()).toBe(false);
    now += 6000;
    expect(b.canPass()).toBe(true);
    expect(b.snapshot().state).toBe('half-open');
  });

  it('half-open → closed on success', () => {
    let now = 1_000;
    const b = new CircuitBreaker({
      failureThreshold: 1,
      recoveryMs: 100,
      now: () => now,
    });
    b.onFailure();
    now += 200;
    b.canPass();
    b.onSuccess();
    expect(b.snapshot().state).toBe('closed');
    expect(b.snapshot().failures).toBe(0);
  });
});

// ─── SelfExclusionClient ──────────────────────────────────────────────────

describe('W152 P2-12 — SelfExclusionClient', () => {
  function gam(responses: Record<string, { excluded: boolean }>) {
    return new StubSelfExclusionProvider(
      'GAMSTOP',
      new Map(Object.entries(responses)),
    );
  }
  function oasis(responses: Record<string, { excluded: boolean }>) {
    return new StubSelfExclusionProvider(
      'OASIS',
      new Map(Object.entries(responses)),
    );
  }

  it('clears player when no provider excludes', async () => {
    const client = new SelfExclusionClient({
      providers: [
        gam({ p1: { excluded: false } }),
        oasis({ p1: { excluded: false } }),
      ],
    });
    const r = await client.query('s1', 'p1');
    expect(r.excluded).toBe(false);
    expect(r.perProvider).toHaveLength(2);
    expect(r.perProvider.every((p) => p.breakerTripped === false)).toBe(true);
  });

  it('any single excluded:true verdict short-circuits the result', async () => {
    const client = new SelfExclusionClient({
      providers: [
        gam({ p1: { excluded: false } }),
        oasis({ p1: { excluded: true } }),
      ],
    });
    const r = await client.query('s1', 'p1');
    expect(r.excluded).toBe(true);
    expect(r.registry).toBe('OASIS');
  });

  it('emits SELF_EXCLUSION_LOOKUP per provider with audit metadata', async () => {
    const emitter = new RGHookEmitter();
    const events: RGHookEvent[] = [];
    emitter.subscribe((e) => events.push(e));
    const client = new SelfExclusionClient({
      providers: [
        gam({ p1: { excluded: false } }),
        oasis({ p1: { excluded: false } }),
      ],
      emitter,
    });
    await client.query('s1', 'p1');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === 'SELF_EXCLUSION_LOOKUP')).toBe(true);
    const detail = (events[0] as Extract<RGHookEvent, { kind: 'SELF_EXCLUSION_LOOKUP' }>)
      .detail;
    expect(detail.playerId).toBe('p1');
    expect(['GAMSTOP', 'OASIS']).toContain(detail.provider);
  });

  it('timeout triggers failure → breaker counts incremented', async () => {
    const slow = new StubSelfExclusionProvider(
      'GAMSTOP',
      new Map([['p1', { excluded: false, delayMs: 200 }]]),
    );
    const client = new SelfExclusionClient({
      providers: [slow],
      deadlineMs: 50,
      breakerConfig: { failureThreshold: 1 },
      failClosed: true,
    });
    const r = await client.query('s1', 'p1');
    // Single provider timed out; with failClosed=true the verdict is excluded.
    expect(r.excluded).toBe(true);
    // After the failure, the breaker is open.
    expect(client.breakerStates().GAMSTOP).toBe('open');
  });

  it('failClosed=false waves the player through if every breaker is open', async () => {
    const broken = new StubSelfExclusionProvider(
      'GAMSTOP',
      new Map([['p1', { excluded: false, throws: 'upstream-down' }]]),
    );
    const client = new SelfExclusionClient({
      providers: [broken],
      breakerConfig: { failureThreshold: 1 },
      failClosed: false,
    });
    // First call fails and trips the breaker.
    const a = await client.query('s1', 'p1');
    expect(client.breakerStates().GAMSTOP).toBe('open');
    // Subsequent call: breaker open, failClosed=false → excluded:false.
    const b = await client.query('s1', 'p1');
    expect(b.excluded).toBe(false);
    // Audit slice flags `breakerTripped: true`.
    expect(b.perProvider[0].breakerTripped).toBe(true);
    // a was a real failure (not breaker-tripped) → audit flag false there.
    expect(a.perProvider[0].breakerTripped).toBe(false);
  });

  it('thrown provider error is captured in audit slice', async () => {
    const bad = new StubSelfExclusionProvider(
      'GAMSTOP',
      new Map([['p1', { excluded: false, throws: 'http-500' }]]),
    );
    const client = new SelfExclusionClient({ providers: [bad] });
    const r = await client.query('s1', 'p1');
    expect(r.perProvider[0].error).toBeDefined();
    expect(r.perProvider[0].error).toContain('http-500');
  });

  it('multi-registry verdict: GAMSTOP=no, OASIS=yes → blocked via OASIS', async () => {
    const client = new SelfExclusionClient({
      providers: [
        gam({ p1: { excluded: false } }),
        oasis({ p1: { excluded: true } }),
        new StubSelfExclusionProvider(
          'SPELPAUS',
          new Map([['p1', { excluded: false }]]),
        ),
      ],
    });
    const r = await client.query('s1', 'p1');
    expect(r.excluded).toBe(true);
    expect(r.registry).toBe('OASIS');
    expect(r.perProvider).toHaveLength(3);
  });
});
