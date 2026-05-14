/**
 * W152 P2-13 — AML telemetry emitter tests.
 *
 * Validates the public surface in `src/rg/telemetry.ts`:
 *   - canonical event shape (TelemetrySpinEvent)
 *   - 5 backend impls (Noop / Buffering / Stdout / JsonlFile / Composite)
 *   - error propagation, count tracking, JSONL framing
 *   - `buildTelemetryEvent` helper (incl. flag-array empty → undefined)
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildTelemetryEvent,
  BufferingTelemetryBackend,
  CompositeTelemetryBackend,
  JsonlFileTelemetryBackend,
  NoopTelemetryBackend,
  StdoutTelemetryBackend,
  type TelemetryBackend,
  type TelemetrySpinEvent,
} from '../src/rg/telemetry.js';

function sampleEvent(over: Partial<TelemetrySpinEvent> = {}): TelemetrySpinEvent {
  return {
    ts: 1_700_000_000_000,
    bet: 1.0,
    win: 5.0,
    gameId: 'demo-slot',
    roundSeed: 'deadbeef00000000',
    sessionId: 'sess-1234',
    ...over,
  };
}

describe('P2-13 — buildTelemetryEvent helper', () => {
  it('uses Date.now() when ts is omitted', () => {
    const before = Date.now();
    const ev = buildTelemetryEvent({
      bet: 1,
      win: 2,
      gameId: 'g',
      roundSeed: 's',
      sessionId: 's',
    });
    const after = Date.now();
    expect(ev.ts).toBeGreaterThanOrEqual(before);
    expect(ev.ts).toBeLessThanOrEqual(after);
  });

  it('drops empty flags array to undefined (canonicalisation)', () => {
    const ev = buildTelemetryEvent({
      bet: 1,
      win: 2,
      gameId: 'g',
      roundSeed: 's',
      sessionId: 's',
      flags: [],
    });
    expect(ev.flags).toBeUndefined();
  });

  it('preserves non-empty flags', () => {
    const ev = buildTelemetryEvent({
      bet: 1,
      win: 2,
      gameId: 'g',
      roundSeed: 's',
      sessionId: 's',
      flags: ['velocity_high', 'big_win_threshold'],
    });
    expect(ev.flags).toEqual(['velocity_high', 'big_win_threshold']);
  });

  it('passes through jurisdiction / playerHash / spinIndex', () => {
    const ev = buildTelemetryEvent({
      bet: 1,
      win: 2,
      gameId: 'g',
      roundSeed: 's',
      sessionId: 's',
      playerHash: 'h',
      jurisdiction: 'UKGC',
      spinIndex: 42,
      netSessionLoss: 12.5,
    });
    expect(ev.playerHash).toBe('h');
    expect(ev.jurisdiction).toBe('UKGC');
    expect(ev.spinIndex).toBe(42);
    expect(ev.netSessionLoss).toBe(12.5);
  });
});

describe('P2-13 — NoopTelemetryBackend', () => {
  it('counts events but does not retain them', async () => {
    const b = new NoopTelemetryBackend();
    await b.emit(sampleEvent());
    await b.emit(sampleEvent());
    await b.flush();
    expect(b.emittedCount()).toBe(2);
  });
});

describe('P2-13 — BufferingTelemetryBackend', () => {
  it('retains events in order and drain clears the buffer', async () => {
    const b = new BufferingTelemetryBackend();
    await b.emit(sampleEvent({ win: 1 }));
    await b.emit(sampleEvent({ win: 2 }));
    expect(b.emittedCount()).toBe(2);
    expect(b.snapshot().map((e) => e.win)).toEqual([1, 2]);
    const drained = b.drain();
    expect(drained.map((e) => e.win)).toEqual([1, 2]);
    expect(b.snapshot()).toEqual([]);
  });

  it('snapshot returns a copy (callers cannot mutate internal state)', async () => {
    const b = new BufferingTelemetryBackend();
    await b.emit(sampleEvent());
    const snap = b.snapshot() as TelemetrySpinEvent[];
    // Mutation attempt — should not be observable.
    snap.length = 0;
    expect(b.snapshot()).toHaveLength(1);
  });
});

describe('P2-13 — StdoutTelemetryBackend', () => {
  it('writes one JSON line per event via injectable writer', async () => {
    const lines: string[] = [];
    const b = new StdoutTelemetryBackend((line) => lines.push(line));
    await b.emit(sampleEvent({ win: 7 }));
    await b.emit(sampleEvent({ win: 8 }));
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].win).toBe(7);
    expect(parsed[1].win).toBe(8);
  });
});

describe('P2-13 — JsonlFileTelemetryBackend', () => {
  it('writes JSONL framing and creates parent dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'p2-13-aml-'));
    try {
      const path = join(dir, 'nested', 'aml.jsonl');
      const b = new JsonlFileTelemetryBackend(path);
      await b.emit(sampleEvent({ win: 1 }));
      await b.emit(sampleEvent({ win: 2 }));
      const text = readFileSync(path, 'utf8');
      const lines = text.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).win).toBe(1);
      expect(JSON.parse(lines[1]).win).toBe(2);
      expect(b.emittedCount()).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('P2-13 — CompositeTelemetryBackend', () => {
  it('fans out events to every child in order', async () => {
    const a = new BufferingTelemetryBackend();
    const c = new BufferingTelemetryBackend();
    const comp = new CompositeTelemetryBackend([a, c]);
    await comp.emit(sampleEvent({ win: 1 }));
    await comp.emit(sampleEvent({ win: 2 }));
    expect(a.snapshot().map((e) => e.win)).toEqual([1, 2]);
    expect(c.snapshot().map((e) => e.win)).toEqual([1, 2]);
    expect(comp.emittedCount()).toBe(2);
  });

  it('propagates errors from a child backend', async () => {
    class FailingBackend implements TelemetryBackend {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async emit(_event: TelemetrySpinEvent): Promise<void> {
        throw new Error('boom');
      }
      async flush(): Promise<void> {}
      emittedCount(): number {
        return 0;
      }
    }
    const comp = new CompositeTelemetryBackend([
      new BufferingTelemetryBackend(),
      new FailingBackend(),
    ]);
    await expect(comp.emit(sampleEvent())).rejects.toThrow(/boom/);
  });

  it('flush propagates to children', async () => {
    let flushCount = 0;
    class CountingBackend implements TelemetryBackend {
      async emit(): Promise<void> {}
      async flush(): Promise<void> {
        flushCount += 1;
      }
      emittedCount(): number {
        return 0;
      }
    }
    const comp = new CompositeTelemetryBackend([
      new CountingBackend(),
      new CountingBackend(),
    ]);
    await comp.flush();
    expect(flushCount).toBe(2);
  });
});

describe('P2-13 — end-to-end roundtrip', () => {
  it('regulator schema includes the 6 required fields on every event', async () => {
    const b = new BufferingTelemetryBackend();
    await b.emit(
      buildTelemetryEvent({
        bet: 2,
        win: 100,
        gameId: 'demo-slot',
        roundSeed: 'cafebabedeadbeef',
        sessionId: 'sess-2',
        flags: ['big_win_threshold'],
      }),
    );
    const ev = b.snapshot()[0];
    // Required fields (cannot be undefined).
    expect(ev.ts).toBeGreaterThan(0);
    expect(ev.bet).toBe(2);
    expect(ev.win).toBe(100);
    expect(ev.gameId).toBe('demo-slot');
    expect(ev.roundSeed).toBe('cafebabedeadbeef');
    expect(ev.sessionId).toBe('sess-2');
    expect(ev.flags).toEqual(['big_win_threshold']);
  });
});
