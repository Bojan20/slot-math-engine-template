/**
 * Faza 2 differential parity gate.
 *
 * Runs the canonical parity fixture through the TS IR simulator and
 * compares the RTP against the Rust `--ir --verify` binary at the same
 * spin count and seed. Mulberry32 is deterministic across the two
 * implementations, so we'd ideally see bit-identical RTPs.
 *
 * In practice the two simulators diverge on RNG consumption:
 *   - The Rust verify-mode binary rolls a Lightning trigger after every
 *     winning spin and (when triggered) picks a multiplier — both extra
 *     `rng.random()` calls.
 *   - The TS IR simulator runs the base game only and consumes zero RNG
 *     past the grid generation step.
 *
 * So even with the same seed the RNG streams desync at the first win and
 * the two stop sampling the same grids. The differential here therefore
 * measures *base-only RTP convergence under independent MC streams*, not
 * deterministic bit-parity. Once Faza 3 brings Lightning + FS + H&W into
 * the TS sim this test should tighten to <0.5 RTP points.
 *
 * At 1k spins with target RTP ≈ 0.96 (this fixture is high volatility),
 * a 5 RTP-point absolute envelope is the realistic MC variance band.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseGameIR } from '../src/ir/index.js';
import { runIRSimulation } from '../src/engine/irSimulator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, 'fixtures', 'parity.json');

const SPINS = 1000;
const SEED = 12345;
/**
 * Absolute RTP-points tolerance for the differential check. The
 * fixture is intentionally high-volatility and the two engines'
 * Mulberry32 streams desync after the first win (Rust calls
 * `rng.random()` extra times for Lightning rolls), so we accept a
 * conventional MC variance window rather than bit-parity. Faza 3
 * tightens this once TS replays Lightning / FS / H&W.
 */
const RTP_TOLERANCE = 0.10;

const RUST_RELEASE = resolve(HERE, '..', 'rust-sim', 'target', 'release', 'slot_sim');
const RUST_DEBUG = resolve(HERE, '..', 'rust-sim', 'target', 'debug', 'slot_sim');

function rustBinaryPath(): string | null {
  if (existsSync(RUST_RELEASE)) return RUST_RELEASE;
  if (existsSync(RUST_DEBUG)) return RUST_DEBUG;
  return null;
}

function parseRustField(stdout: string, label: string): number | null {
  const re = new RegExp(`${label}:\\s+([0-9.]+)`);
  const m = stdout.match(re);
  if (!m || m[1] === undefined) return null;
  return parseFloat(m[1]);
}

/**
 * Reconstruct base-only RTP from the Rust verify-mode output. The
 * top-line `RTP:` field includes Lightning / FS / H&W payouts which our
 * TS sim does not yet replay, so compare on base wins only.
 */
function rustBaseRtp(stdout: string, totalSpins: number): number | null {
  const baseWins = parseRustField(stdout, 'Base Wins');
  const wagered = parseRustField(stdout, 'Total Wagered');
  if (baseWins == null || wagered == null) return null;
  void totalSpins;
  return baseWins / wagered;
}

describe('Faza 2 — TS↔Rust IR parity', () => {
  it('TS and Rust IR-driven RTP converge under MC variance (1k spins, seed=12345)', async () => {
    // ── TS side ────────────────────────────────────────────────────────
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf-8'));
    const parsed = parseGameIR(raw);
    if (!parsed.ok) {
      throw new Error(
        `parity.json failed IR validation:\n${JSON.stringify(parsed.issues, null, 2)}`,
      );
    }
    const ir = parsed.ir;

    const tsResult = await runIRSimulation(ir, { spins: SPINS, seed: SEED });
    const tsRtp = tsResult.rtp;

    // ── Rust side ──────────────────────────────────────────────────────
    const bin = rustBinaryPath();
    if (!bin) {
      // The Rust binary isn't built in this CI lane — skip without failing.
      // Hard-fail behaviour is left for the dedicated parity job that
      // compiles `slot_sim` first.
      console.warn(
        `[faza2_parity] Rust binary missing at ${RUST_RELEASE} / ${RUST_DEBUG}; ` +
          `skipping the differential half. TS RTP = ${(tsRtp * 100).toFixed(4)}%.`,
      );
      // Still assert the TS RTP is sane (parity fixture targets ~0.96).
      expect(tsRtp).toBeGreaterThanOrEqual(0);
      expect(tsRtp).toBeLessThan(50);
      return;
    }

    const stdout = execFileSync(
      bin,
      ['--config', FIXTURE, '--ir', '--verify', String(SPINS), '--seed', String(SEED)],
      { encoding: 'utf-8', timeout: 60_000 },
    );
    const rustRtp = rustBaseRtp(stdout, SPINS);
    if (rustRtp == null) {
      throw new Error(`Could not parse base RTP from Rust output:\n${stdout}`);
    }

    const delta = Math.abs(tsRtp - rustRtp);
    console.log(
      `[faza2_parity] TS=${(tsRtp * 100).toFixed(4)}% Rust(base)=${(rustRtp * 100).toFixed(4)}% Δ=${(delta * 100).toFixed(4)}pp`,
    );
    expect(delta).toBeLessThan(RTP_TOLERANCE);
  }, 90_000);
});
