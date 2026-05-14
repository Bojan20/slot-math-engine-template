import { describe, it, expect } from 'vitest';
import {
  advanceRunningDigest,
  buildReplayCapture,
  differentialReplay,
  type ReplayCapture,
} from '../src/replay/longRunDifferential.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mkSpinDigests(seed: number, n: number): string[] {
  // Deterministic synthetic digests — pseudo-LCG hashed to hex strings.
  // (Real spin digests are SHA-256 of the per-spin evaluator output.)
  let state = seed >>> 0;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out.push(state.toString(16).padStart(8, '0').repeat(8)); // 64-char hex
  }
  return out;
}

// ─── advanceRunningDigest ────────────────────────────────────────────────────

describe('advanceRunningDigest', () => {
  it('returns a 64-char hex (SHA-256)', () => {
    const d = advanceRunningDigest('a'.repeat(64), 'b'.repeat(64));
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it('order matters — chain is non-commutative', () => {
    const a = advanceRunningDigest('aa', 'bb');
    const b = advanceRunningDigest('bb', 'aa');
    expect(a).not.toBe(b);
  });

  it('deterministic — same inputs ⇒ same digest', () => {
    expect(advanceRunningDigest('x', 'y')).toBe(advanceRunningDigest('x', 'y'));
  });
});

// ─── buildReplayCapture ──────────────────────────────────────────────────────

describe('buildReplayCapture', () => {
  it('emits checkpoint at every cadence and at the final spin', () => {
    const cap = buildReplayCapture({
      engineCommit: 'abc',
      capturedAt: '2026-05-15T00:00:00Z',
      configHashHex: 'cfg',
      seed: 1,
      spinDigests: mkSpinDigests(1, 50),
      checkpointEverySpins: 10,
    });
    // 10, 20, 30, 40 are at boundaries (spinIndex 9, 19, 29, 39) and 49 is the final.
    expect(cap.checkpoints.length).toBe(5);
    expect(cap.checkpoints[0].spinIndex).toBe(9);
    expect(cap.checkpoints[4].spinIndex).toBe(49);
  });

  it('totalSpins matches input length', () => {
    const cap = buildReplayCapture({
      engineCommit: 'a',
      capturedAt: 't',
      configHashHex: 'c',
      seed: 0,
      spinDigests: mkSpinDigests(7, 25),
    });
    expect(cap.totalSpins).toBe(25);
  });

  it('rejects cadence ≤ 0', () => {
    expect(() =>
      buildReplayCapture({
        engineCommit: 'a',
        capturedAt: 't',
        configHashHex: 'c',
        seed: 0,
        spinDigests: ['x'],
        checkpointEverySpins: 0,
      })
    ).toThrow(/positive integer/);
  });

  it('rejects non-integer cadence', () => {
    expect(() =>
      buildReplayCapture({
        engineCommit: 'a',
        capturedAt: 't',
        configHashHex: 'c',
        seed: 0,
        spinDigests: ['x'],
        checkpointEverySpins: 1.5,
      })
    ).toThrow(/positive integer/);
  });

  it('determinism — same inputs ⇒ same capture digests', () => {
    const a = buildReplayCapture({
      engineCommit: 'X',
      capturedAt: 'Y',
      configHashHex: 'Z',
      seed: 42,
      spinDigests: mkSpinDigests(42, 100),
      checkpointEverySpins: 25,
    });
    const b = buildReplayCapture({
      engineCommit: 'X',
      capturedAt: 'Y',
      configHashHex: 'Z',
      seed: 42,
      spinDigests: mkSpinDigests(42, 100),
      checkpointEverySpins: 25,
    });
    expect(JSON.stringify(a.checkpoints)).toBe(JSON.stringify(b.checkpoints));
  });
});

// ─── differentialReplay ──────────────────────────────────────────────────────

function makeCapture(seed: number, n: number, commit = 'commit-A'): ReplayCapture {
  return buildReplayCapture({
    engineCommit: commit,
    capturedAt: '2025-01-01T00:00:00Z',
    configHashHex: 'cfg',
    seed,
    spinDigests: mkSpinDigests(seed, n),
    checkpointEverySpins: 10,
  });
}

describe('differentialReplay', () => {
  it('bit_identical when live = capture and commits match', () => {
    const cap = makeCapture(1, 100, 'commit-A');
    const r = differentialReplay(
      { capture: cap, liveSpinDigests: mkSpinDigests(1, 100) },
      'commit-A'
    );
    expect(r.status).toBe('bit_identical');
    expect(r.firstMismatchSpin).toBeNull();
  });

  it('count_mismatch when live stream length ≠ capture totalSpins', () => {
    const cap = makeCapture(1, 100);
    const r = differentialReplay(
      { capture: cap, liveSpinDigests: mkSpinDigests(1, 50) },
      'commit-A'
    );
    expect(r.status).toBe('count_mismatch');
  });

  it('checkpoint_mismatch detects the first divergent spin', () => {
    const cap = makeCapture(1, 100);
    const live = mkSpinDigests(1, 100);
    // Tamper at spin 7 (before the spin-9 checkpoint).
    live[7] = 'f'.repeat(64);
    const r = differentialReplay(
      { capture: cap, liveSpinDigests: live },
      'commit-A'
    );
    expect(r.status).toBe('checkpoint_mismatch');
    expect(r.firstMismatchSpin).toBe(9); // hash chain fires at next checkpoint
  });

  it('checkpoint_mismatch surfaces both digests for triage', () => {
    const cap = makeCapture(1, 50);
    const live = mkSpinDigests(1, 50);
    live[15] = '0'.repeat(64);
    const r = differentialReplay(
      { capture: cap, liveSpinDigests: live },
      'commit-A'
    );
    expect(r.capturedDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.liveDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.capturedDigest).not.toBe(r.liveDigest);
  });

  it('engine_changed_warning when contents match but commit differs', () => {
    const cap = makeCapture(1, 50, 'commit-A');
    const r = differentialReplay(
      { capture: cap, liveSpinDigests: mkSpinDigests(1, 50) },
      'commit-B-newer'
    );
    expect(r.status).toBe('engine_changed_warning');
    expect(r.reason).toContain('commit-A→commit-B-newer');
  });

  it('all-zero divergence at spin 0 reports spin 9 as first checkpoint failure', () => {
    const cap = makeCapture(1, 100);
    const live = mkSpinDigests(2, 100); // totally different seed
    const r = differentialReplay({ capture: cap, liveSpinDigests: live }, 'commit-A');
    expect(r.status).toBe('checkpoint_mismatch');
    expect(r.firstMismatchSpin).toBe(9);
  });

  it('handles zero-spin capture as bit_identical when live is also empty', () => {
    const cap = buildReplayCapture({
      engineCommit: 'X',
      capturedAt: 't',
      configHashHex: 'c',
      seed: 0,
      spinDigests: [],
      checkpointEverySpins: 10,
    });
    const r = differentialReplay({ capture: cap, liveSpinDigests: [] }, 'X');
    expect(r.status).toBe('bit_identical');
  });
});

// ─── snapshot stability ──────────────────────────────────────────────────────

describe('snapshot stability', () => {
  it('1k-spin capture digest is stable across runs', () => {
    const cap1 = buildReplayCapture({
      engineCommit: 'X',
      capturedAt: 't',
      configHashHex: 'c',
      seed: 12345,
      spinDigests: mkSpinDigests(12345, 1000),
      checkpointEverySpins: 100,
    });
    const cap2 = buildReplayCapture({
      engineCommit: 'X',
      capturedAt: 't',
      configHashHex: 'c',
      seed: 12345,
      spinDigests: mkSpinDigests(12345, 1000),
      checkpointEverySpins: 100,
    });
    expect(cap1.checkpoints[cap1.checkpoints.length - 1].runningDigestHex).toBe(
      cap2.checkpoints[cap2.checkpoints.length - 1].runningDigestHex
    );
  });
});
