/**
 * W152 Wave 15 — Faza 11.3 — Sim cancel/resume controller tests.
 *
 * Covers:
 *   * State machine: running → paused → running → finished.
 *   * Cancel from running and from paused.
 *   * `runChunked` resumes from the persisted checkpoint.
 *   * Clean finish clears the checkpoint.
 *   * Pause blocks the runner until resume / cancel.
 *   * Deep clone semantics in `MemoryCheckpoint` (caller mutation
 *     after save does not corrupt stored snapshot).
 */

import { describe, it, expect } from 'vitest';
import {
  MemoryCheckpoint,
  SimController,
  runChunked,
} from '../src/sim/cancel-resume.js';

interface Accum {
  spinSum: number;
}

describe('Faza 11.3 — SimController state machine', () => {
  it('starts running, exposes a non-aborted signal', () => {
    const c = new SimController();
    expect(c.state).toBe('running');
    expect(c.signal.aborted).toBe(false);
  });

  it('pause() flips running → paused; resume() flips back', () => {
    const c = new SimController();
    c.pause();
    expect(c.state).toBe('paused');
    c.resume();
    expect(c.state).toBe('running');
  });

  it('cancel() flips running → cancelled and aborts the signal', () => {
    const c = new SimController();
    c.cancel();
    expect(c.state).toBe('cancelled');
    expect(c.signal.aborted).toBe(true);
  });

  it('cancel from paused also works', () => {
    const c = new SimController();
    c.pause();
    c.cancel();
    expect(c.state).toBe('cancelled');
  });

  it('markFinished() only acts on running state', () => {
    const c = new SimController();
    c.markFinished();
    expect(c.state).toBe('finished');
    const c2 = new SimController();
    c2.cancel();
    c2.markFinished();
    expect(c2.state).toBe('cancelled'); // terminal cancel sticks
  });

  it('waitWhilePaused resolves immediately when running', async () => {
    const c = new SimController();
    await expect(c.waitWhilePaused()).resolves.toBeUndefined();
  });

  it('waitWhilePaused blocks until resume()', async () => {
    const c = new SimController();
    c.pause();
    let resolved = false;
    const p = c.waitWhilePaused().then(() => {
      resolved = true;
    });
    // Tick the microtask queue a few times — must still be paused.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    c.resume();
    await p;
    expect(resolved).toBe(true);
  });

  it('waitWhilePaused exits on cancel from paused', async () => {
    const c = new SimController();
    c.pause();
    const p = c.waitWhilePaused();
    c.cancel();
    await expect(p).resolves.toBeUndefined();
  });
});

describe('Faza 11.3 — MemoryCheckpoint', () => {
  it('save → load round-trips identical content', async () => {
    const cp = new MemoryCheckpoint<{ n: number }>();
    await cp.save('k', { n: 42 });
    expect(await cp.load('k')).toEqual({ n: 42 });
  });

  it('load returns null for unknown key', async () => {
    const cp = new MemoryCheckpoint<unknown>();
    expect(await cp.load('missing')).toBeNull();
  });

  it('clear() drops the snapshot', async () => {
    const cp = new MemoryCheckpoint<number>();
    await cp.save('k', 1);
    await cp.clear('k');
    expect(await cp.load('k')).toBeNull();
  });

  it('save deep-clones (caller mutation after save is safe)', async () => {
    const cp = new MemoryCheckpoint<{ list: number[] }>();
    const obj = { list: [1, 2, 3] };
    await cp.save('k', obj);
    obj.list.push(4); // mutate after save
    const loaded = await cp.load('k');
    expect(loaded?.list).toEqual([1, 2, 3]);
  });
});

describe('Faza 11.3 — runChunked', () => {
  it('runs the entire workload + clears checkpoint on finish', async () => {
    const controller = new SimController();
    const checkpoint = new MemoryCheckpoint<{ spinsDone: number; state: Accum }>();
    const result = await runChunked<Accum>({
      jobId: 'job-A',
      totalSpins: 1000,
      chunkSize: 100,
      initialState: { spinSum: 0 },
      checkpoint,
      controller,
      async processChunk(state, start, end) {
        // Pretend each spin adds 1 to spinSum.
        return { spinSum: state.spinSum + (end - start) };
      },
    });
    expect(result.status).toBe('finished');
    expect(result.spinsDone).toBe(1000);
    expect(result.state.spinSum).toBe(1000);
    expect(await checkpoint.load('job-A')).toBeNull();
    expect(controller.state).toBe('finished');
  });

  it('cancel mid-run returns the last persisted checkpoint', async () => {
    const controller = new SimController();
    const checkpoint = new MemoryCheckpoint<{ spinsDone: number; state: Accum }>();
    let chunkCount = 0;
    const result = await runChunked<Accum>({
      jobId: 'job-B',
      totalSpins: 1000,
      chunkSize: 100,
      initialState: { spinSum: 0 },
      checkpoint,
      controller,
      async processChunk(state, start, end) {
        chunkCount += 1;
        const updated = { spinSum: state.spinSum + (end - start) };
        if (chunkCount === 3) controller.cancel();
        return updated;
      },
    });
    expect(result.status).toBe('cancelled');
    // 3 chunks executed → 300 spins processed and persisted.
    expect(result.spinsDone).toBe(300);
    expect(result.state.spinSum).toBe(300);
    // Checkpoint still on disk for resume.
    const saved = await checkpoint.load('job-B');
    expect(saved?.spinsDone).toBe(300);
  });

  it('resume picks up from saved checkpoint', async () => {
    const checkpoint = new MemoryCheckpoint<{ spinsDone: number; state: Accum }>();
    // Pre-seed checkpoint as if a previous run cancelled after 500 spins.
    await checkpoint.save('job-C', { spinsDone: 500, state: { spinSum: 500 } });
    const controller = new SimController();
    const result = await runChunked<Accum>({
      jobId: 'job-C',
      totalSpins: 1000,
      chunkSize: 100,
      initialState: { spinSum: 0 },
      checkpoint,
      controller,
      async processChunk(state, start, end) {
        return { spinSum: state.spinSum + (end - start) };
      },
    });
    expect(result.status).toBe('finished');
    expect(result.spinsDone).toBe(1000);
    // 500 from resume + 500 fresh = 1000.
    expect(result.state.spinSum).toBe(1000);
  });

  it('pause-resume round-trips correctly (no progress lost)', async () => {
    const controller = new SimController();
    const checkpoint = new MemoryCheckpoint<{ spinsDone: number; state: Accum }>();
    // Pause after 2 chunks, resume on next macrotask.
    let chunkCount = 0;
    const run = runChunked<Accum>({
      jobId: 'job-D',
      totalSpins: 500,
      chunkSize: 100,
      initialState: { spinSum: 0 },
      checkpoint,
      controller,
      async processChunk(state, start, end) {
        chunkCount += 1;
        if (chunkCount === 2) controller.pause();
        return { spinSum: state.spinSum + (end - start) };
      },
    });
    // After 5 microtask ticks the runner should be parked at chunk 2.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    setTimeout(() => controller.resume(), 0);
    const result = await run;
    expect(result.status).toBe('finished');
    expect(result.state.spinSum).toBe(500);
  });

  it('cancel before any chunk runs returns spinsDone=0', async () => {
    const controller = new SimController();
    controller.cancel();
    const checkpoint = new MemoryCheckpoint<{ spinsDone: number; state: Accum }>();
    const result = await runChunked<Accum>({
      jobId: 'job-E',
      totalSpins: 1000,
      chunkSize: 100,
      initialState: { spinSum: 0 },
      checkpoint,
      controller,
      async processChunk(state, start, end) {
        return { spinSum: state.spinSum + (end - start) };
      },
    });
    expect(result.status).toBe('cancelled');
    expect(result.spinsDone).toBe(0);
  });
});
