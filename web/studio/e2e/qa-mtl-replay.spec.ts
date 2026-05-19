// QA: MTL Replay Log (IndexedDB-backed spin journal)
// ─────────────────────────────────────────────────────────────────────────
// 1. Append entries → list returns newest-first
// 2. Replay returns match=true when the IR is unchanged
// 3. Replay returns match=false (drift) when paytable mutates after journaling
// 4. count() honors irDna scoping
// 5. clear(irDna) removes only entries with matching DNA

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;

test.describe('MTL Replay Log', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wipe IDB before each test for isolation
    await page.evaluate(async () => {
      const w = window as any;
      if (w.MTLReplay) await w.MTLReplay.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!(window as any).MTLReplay && !!(window as any).MTLOracle, { timeout: 10_000 });
    await page.evaluate(async () => {
      const w = window as any;
      if (w.MTLReplay) await w.MTLReplay.clear();
    });
  });

  test('append + list returns newest-first', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const R = (window as any).MTLReplay;
      await R.append({ irDna: 'DNA-A', seed: 1, bet: 1, win: 0, outcomeHash: 'aaa', scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      await R.append({ irDna: 'DNA-A', seed: 2, bet: 1, win: 2.5, outcomeHash: 'bbb', scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      await R.append({ irDna: 'DNA-A', seed: 3, bet: 1, win: 0, outcomeHash: 'ccc', scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      const list = await R.list({ irDna: 'DNA-A', limit: 10 });
      return { count: list.length, seeds: list.map((e: any) => e.seed) };
    });
    expect(result.count).toBe(3);
    expect(result.seeds).toEqual([3, 2, 1]);
  });

  test('count honors irDna scoping', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const R = (window as any).MTLReplay;
      await R.append({ irDna: 'DNA-A', seed: 1, bet: 1, win: 0, outcomeHash: 'aaa' });
      await R.append({ irDna: 'DNA-A', seed: 2, bet: 1, win: 0, outcomeHash: 'bbb' });
      await R.append({ irDna: 'DNA-B', seed: 1, bet: 1, win: 0, outcomeHash: 'ccc' });
      const countA = await R.count('DNA-A');
      const countB = await R.count('DNA-B');
      const total = await R.count();
      return { countA, countB, total };
    });
    expect(result.countA).toBe(2);
    expect(result.countB).toBe(1);
    expect(result.total).toBe(3);
  });

  test('replay returns match=true when IR unchanged', async ({ page }) => {
    test.skip(!existsSync(DESKTOP_IR), 'Wrath IR fixture absent');
    const irJson = readFileSync(DESKTOP_IR, 'utf8');
    const result = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const O = (window as any).MTLOracle;
      const R = (window as any).MTLReplay;
      const o = await O.spin(ir, 42, 1);
      const reduced = { win: o.win, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
      const hash = await O.hashOutcome(reduced);
      const entry = { irDna: 'DNA-X', seed: 42, bet: 1, win: o.win, outcomeHash: hash, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
      await R.append(entry);
      const replayed = await R.replay(ir, entry);
      return { match: replayed.match, expected: replayed.expected, observed: replayed.observed };
    }, irJson);
    expect(result.match).toBe(true);
    expect(result.expected).toBe(result.observed);
  });

  test('replay returns match=false when IR drifts', async ({ page }) => {
    test.skip(!existsSync(DESKTOP_IR), 'Wrath IR fixture absent');
    const irJson = readFileSync(DESKTOP_IR, 'utf8');
    const result = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const O = (window as any).MTLOracle;
      const R = (window as any).MTLReplay;
      // Pick a seed that is GUARANTEED to produce a hit — scan up to 200 seeds
      // looking for win > 0, so the paytable mutation actually changes outcome.
      let pickedSeed = -1, pickedSpin: any = null;
      for (let s = 0; s < 200; s++) {
        const o = await O.spin(ir, s, 1);
        if (o.win > 0) { pickedSeed = s; pickedSpin = o; break; }
      }
      if (pickedSeed < 0) return { match: null, error: 'no winning seed in 0..199' };
      const o = pickedSpin;
      const reduced = { win: o.win, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
      const hash = await O.hashOutcome(reduced);
      const entry = { irDna: 'DNA-X', seed: pickedSeed, bet: 1, win: o.win, outcomeHash: hash, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
      // Tamper paytable broadly — double EVERY paytable cell so any winning
      // line, scatter pay, or feature pay produces a different total.
      for (const sym of Object.keys(ir.paytable)) {
        for (const k of Object.keys(ir.paytable[sym])) {
          ir.paytable[sym][k] = Number(ir.paytable[sym][k]) * 2 + 0.1;
        }
      }
      const replayed = await R.replay(ir, entry);
      return { match: replayed.match, expected: replayed.expected, observed: replayed.observed, pickedSeed };
    }, irJson);
    expect(result.match).toBe(false);
    expect(result.expected).not.toBe(result.observed);
  });

  test('clear(irDna) scopes deletion', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const R = (window as any).MTLReplay;
      await R.append({ irDna: 'KEEP', seed: 1, bet: 1, win: 0, outcomeHash: 'a' });
      await R.append({ irDna: 'DROP', seed: 1, bet: 1, win: 0, outcomeHash: 'b' });
      await R.append({ irDna: 'DROP', seed: 2, bet: 1, win: 0, outcomeHash: 'c' });
      await R.clear('DROP');
      return {
        keep: await R.count('KEEP'),
        drop: await R.count('DROP'),
      };
    });
    expect(result.keep).toBe(1);
    expect(result.drop).toBe(0);
  });
});
