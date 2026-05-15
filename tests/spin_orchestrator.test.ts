/**
 * W152 Wave 18 — spinOrchestrator tests (Faza 15.A.7).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  LinearOrchestrator,
  StateMachineOrchestrator,
  EventDrivenOrchestrator,
  orchestratorByKind,
  renderTrace,
  tracesEqual,
  type Orchestrator,
} from '../src/sim/spinOrchestrator.js';

describe('LinearOrchestrator', () => {
  it('emits 7 phases for a no-feature spin', () => {
    const o = new LinearOrchestrator();
    const events = o.run();
    expect(events.map((e) => e.phase)).toEqual([
      'init',
      'wager',
      'spin',
      'evaluate',
      'rollup',
      'settle',
      'cleanup',
    ]);
  });
  it('emits 10 phases for a feature spin without sub-loop', () => {
    const o = new LinearOrchestrator();
    const events = o.run({ triggerFeature: true });
    expect(events.map((e) => e.phase)).toEqual([
      'init',
      'wager',
      'spin',
      'evaluate',
      'feature_entry',
      'feature_loop',
      'feature_exit',
      'rollup',
      'settle',
      'cleanup',
    ]);
  });
  it('expands feature_loop for sub-loops', () => {
    const o = new LinearOrchestrator();
    const events = o.run({ triggerFeature: true, featureLoopCount: 3 });
    const loops = events.filter((e) => e.phase === 'feature_loop');
    expect(loops).toHaveLength(3);
  });
  it('decorate callback populates payload', () => {
    const o = new LinearOrchestrator();
    const events = o.run({ decorate: (p) => ({ tag: p }) });
    expect(events[0].payload).toEqual({ tag: 'init' });
  });
  it('event indices are monotonic', () => {
    const o = new LinearOrchestrator();
    const events = o.run({ triggerFeature: true });
    for (let i = 0; i < events.length; i++) {
      expect(events[i].index).toBe(i);
    }
  });
});

describe('StateMachineOrchestrator', () => {
  it('produces same trace as Linear for no-feature spin', () => {
    const linear = new LinearOrchestrator().run();
    const fsm = new StateMachineOrchestrator().run();
    expect(tracesEqual(linear, fsm)).toBe(true);
  });
  it('produces same trace as Linear for feature spin', () => {
    const linear = new LinearOrchestrator().run({ triggerFeature: true, featureLoopCount: 2 });
    const fsm = new StateMachineOrchestrator().run({ triggerFeature: true, featureLoopCount: 2 });
    expect(tracesEqual(linear, fsm)).toBe(true);
  });
});

describe('EventDrivenOrchestrator', () => {
  it('broadcasts to subscribers', () => {
    const o = new EventDrivenOrchestrator();
    const captured: string[] = [];
    o.subscribe((ev) => captured.push(ev.phase));
    o.run();
    expect(captured).toEqual(['init', 'wager', 'spin', 'evaluate', 'rollup', 'settle', 'cleanup']);
  });
  it('unsubscribe stops further deliveries', () => {
    const o = new EventDrivenOrchestrator();
    const cb = vi.fn();
    const unsub = o.subscribe(cb);
    o.run();
    expect(cb).toHaveBeenCalledTimes(7);
    cb.mockReset();
    unsub();
    o.run();
    expect(cb).not.toHaveBeenCalled();
  });
  it('subscriberCount tracks active subscribers', () => {
    const o = new EventDrivenOrchestrator();
    expect(o.subscriberCount()).toBe(0);
    const u1 = o.subscribe(() => {});
    expect(o.subscriberCount()).toBe(1);
    o.subscribe(() => {});
    expect(o.subscriberCount()).toBe(2);
    u1();
    expect(o.subscriberCount()).toBe(1);
  });
  it('subscriber throw does not break orchestrator', () => {
    const o = new EventDrivenOrchestrator();
    o.subscribe(() => {
      throw new Error('plugin crashed');
    });
    expect(() => o.run()).not.toThrow();
  });
});

describe('Cross-orchestrator parity', () => {
  it('all 3 produce identical trace for no-feature spin', () => {
    const a = new LinearOrchestrator().run();
    const b = new StateMachineOrchestrator().run();
    const c = new EventDrivenOrchestrator().run();
    expect(tracesEqual(a, b)).toBe(true);
    expect(tracesEqual(a, c)).toBe(true);
  });
  it('all 3 produce identical trace for feature spin with loops', () => {
    const opts = { triggerFeature: true, featureLoopCount: 5 };
    const a = new LinearOrchestrator().run(opts);
    const b = new StateMachineOrchestrator().run(opts);
    const c = new EventDrivenOrchestrator().run(opts);
    expect(tracesEqual(a, b)).toBe(true);
    expect(tracesEqual(a, c)).toBe(true);
  });
});

describe('orchestratorByKind factory', () => {
  it('returns the right kind for each enum', () => {
    const cases: Array<{ kind: Orchestrator['kind']; ctor: string }> = [
      { kind: 'linear', ctor: 'LinearOrchestrator' },
      { kind: 'state_machine', ctor: 'StateMachineOrchestrator' },
      { kind: 'event_driven', ctor: 'EventDrivenOrchestrator' },
    ];
    for (const c of cases) {
      const o = orchestratorByKind(c.kind);
      expect(o.kind).toBe(c.kind);
      expect(o.constructor.name).toBe(c.ctor);
    }
  });
  it('throws on unknown kind', () => {
    expect(() => orchestratorByKind('xyz' as 'linear')).toThrow(/unknown kind/);
  });
});

describe('renderTrace', () => {
  it('produces line-per-event text', () => {
    const o = new LinearOrchestrator();
    const text = renderTrace(o.run());
    const lines = text.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('000  init');
    expect(lines[6]).toBe('006  cleanup');
  });
});
