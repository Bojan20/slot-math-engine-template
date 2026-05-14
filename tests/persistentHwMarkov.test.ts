/**
 * W152 P1-7 — TS integration tests for `solvePersistentGridHw`.
 *
 * Loads the same shared fixture as the Rust integration tests:
 *   `tests/fixtures/persistent-hw.json`
 * The cross-language assertion is structural (all cases parse, all payouts
 * finite, identical math relationships). Strict byte-equality of floats is
 * left to the Faza 2 parity gate that runs both engines and diffs JSON
 * output — this suite proves the TS solver alone is mathematically sound.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  solvePersistentGridHw,
  type PersistentHwConfig,
} from '../src/solver/holdAndWinMarkovPersistent.js';

interface FixtureCase {
  name: string;
  occupancy: PersistentHwConfig['occupancy'];
  classes: PersistentHwConfig['classes'];
  terminalGlobalMultiplier: number;
}
interface Fixture {
  _comment?: string;
  cases: FixtureCase[];
}

const FIXTURE_PATH = resolve(__dirname, 'fixtures', 'persistent-hw.json');
const FIXTURE: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

function toCfg(c: FixtureCase): PersistentHwConfig {
  return {
    occupancy: c.occupancy,
    classes: c.classes,
    terminalGlobalMultiplier: c.terminalGlobalMultiplier,
  };
}

describe('W152 P1-7 — persistent-grid H&W solver (TS)', () => {
  it('fixture parses with three labelled cases', () => {
    expect(FIXTURE.cases).toHaveLength(3);
    for (const c of FIXTURE.cases) {
      expect(c.name).toMatch(/^[a-z_0-9]+$/i);
      expect(c.occupancy.totalCells).toBeGreaterThan(0);
      expect(c.occupancy.totalCells).toBeLessThanOrEqual(100);
    }
  });

  it.each(FIXTURE.cases)('case "$name" produces finite, non-negative payout', (c) => {
    const res = solvePersistentGridHw(toCfg(c));
    expect(Number.isFinite(res.expectedPayout)).toBe(true);
    expect(res.expectedPayout).toBeGreaterThanOrEqual(0);
    expect(res.gridFullProbability).toBeGreaterThanOrEqual(0);
    expect(res.gridFullProbability).toBeLessThanOrEqual(1);
  });

  it.each(FIXTURE.cases)('case "$name" terminal occupancy PMF sums to 1', (c) => {
    const res = solvePersistentGridHw(toCfg(c));
    const sum = res.terminalOccupancyPmf.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it.each(FIXTURE.cases)(
    'case "$name" E[k] from PMF equals expectedOrbCount',
    (c) => {
      const res = solvePersistentGridHw(toCfg(c));
      let eK = 0;
      for (let i = 0; i < res.terminalOccupancyPmf.length; i++) {
        eK += i * res.terminalOccupancyPmf[i];
      }
      expect(Math.abs(eK - res.expectedOrbCount)).toBeLessThan(1e-9);
    },
  );

  it('money-train-default payout exceeds the same config with mult class ablated', () => {
    const c = FIXTURE.cases.find((x) => x.name === 'money_train_default_5x3')!;
    const withMult = solvePersistentGridHw(toCfg(c));
    const ablated: PersistentHwConfig = {
      occupancy: c.occupancy,
      classes: {
        ...c.classes,
        pMult: 0,
        muMult: 1.0,
        pInert: c.classes.pInert + c.classes.pMult,
      },
      terminalGlobalMultiplier: c.terminalGlobalMultiplier,
    };
    const noMult = solvePersistentGridHw(ablated);
    expect(withMult.expectedPayout).toBeGreaterThan(noMult.expectedPayout);
  });

  it('tree-of-life terminal global multiplier scales payout 1.5×', () => {
    const c = FIXTURE.cases.find(
      (x) => x.name === 'tree_of_life_6x6_with_terminal_reaper',
    )!;
    const withMult = solvePersistentGridHw(toCfg(c));
    const baseline = solvePersistentGridHw({
      ...toCfg(c),
      terminalGlobalMultiplier: 1.0,
    });
    const ratio = withMult.expectedPayout / baseline.expectedPayout;
    expect(Math.abs(ratio - 1.5)).toBeLessThan(1e-6);
  });

  it('pure-cash baseline payout equals E[orb_count]·μ_cash + P(full)·award', () => {
    const c = FIXTURE.cases.find((x) => x.name === 'pure_cash_baseline_4x5')!;
    const cfg = toCfg(c);
    const res = solvePersistentGridHw(cfg);
    const expected =
      res.expectedOrbCount * c.classes.muCash +
      res.gridFullProbability * c.occupancy.gridFullAward;
    expect(Math.abs(res.expectedPayout - expected)).toBeLessThan(1e-9);
  });

  it('degenerate all-zero class distribution falls back to 100% cash', () => {
    const cfg: PersistentHwConfig = {
      occupancy: FIXTURE.cases[0].occupancy,
      classes: {
        pCash: 0,
        muCash: 1.0,
        pMult: 0,
        muMult: 1.0,
        pCollector: 0,
        muCollector: 0,
        pInert: 0,
      },
      terminalGlobalMultiplier: 1.0,
    };
    const res = solvePersistentGridHw(cfg);
    expect(Number.isFinite(res.expectedPayout)).toBe(true);
    expect(res.expectedPayout).toBeGreaterThan(0);
  });

  it('cap at totalCells>100 throws', () => {
    expect(() =>
      solvePersistentGridHw({
        occupancy: { ...FIXTURE.cases[0].occupancy, totalCells: 200 },
        classes: FIXTURE.cases[0].classes,
        terminalGlobalMultiplier: 1.0,
      }),
    ).toThrow(/totalCells=200/);
  });
});
