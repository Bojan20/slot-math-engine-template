// QA: MTL Watchtower (Chi² rolling-window sentinel)
// ─────────────────────────────────────────────────────────────────────────
// Drives the pure watchtower module directly to verify:
//   1. Green status while observed metrics stay within target bands
//   2. Warn fires when RTP drifts > 0.5pp
//   3. Critical fires when RTP drifts > 2.0pp
//   4. Poisson breach fires when FS hit-rate drifts > 3σ
//   5. Warmup gating — under 500 spins always returns 'warmup'

import { test, expect } from '@playwright/test';

test.describe('MTL Watchtower', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!(window as any).MTLWatchtower, { timeout: 10_000 });
  });

  test('warmup gates premature evaluation under 500 spins', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20, fs_frequency: 100, hnw_frequency: 100 } });
      for (let i = 0; i < 100; i++) wt.observeSpin({ win: 0, bet: 1, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      return wt.report();
    });
    expect(result.status).toBe('warmup');
    expect(result.spinsObserved).toBe(100);
  });

  test('green status when observed RTP/hit match target', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20, fs_frequency: 100, hnw_frequency: 100 } });
      // 800 spins: 20% hit rate, total RTP ≈ 96%
      // Pattern: 4 wins of 4.80x, 16 losses, repeated → mean win = 4.80*4/20 = 0.96 per spin → 96% RTP
      for (let i = 0; i < 800; i++) {
        const win = i % 5 === 0 ? 4.8 : 0;
        wt.observeSpin({ win: win, bet: 1, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      }
      return wt.report();
    });
    expect(result.status).toBe('green');
    expect(result.metrics.rtp).toBeCloseTo(96, 1);
    expect(result.metrics.hitPct).toBeCloseTo(20, 1);
  });

  test('warn fires on RTP drift 0.6pp', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20, fs_frequency: 100, hnw_frequency: 100 } });
      // Force RTP ≈ 96.6% — over warn (0.5pp) but under critical (2.0pp)
      for (let i = 0; i < 800; i++) {
        const win = i % 5 === 0 ? 4.83 : 0;
        wt.observeSpin({ win: win, bet: 1, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      }
      return wt.report();
    });
    expect(['warn', 'critical']).toContain(result.status);
    expect(result.breaches.length).toBeGreaterThanOrEqual(1);
  });

  test('critical fires on RTP drift > 2.0pp', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20, fs_frequency: 100, hnw_frequency: 100 } });
      // RTP ≈ 73% — matches the actual Wrath runner drift observed in qa-runner-math-verify
      for (let i = 0; i < 800; i++) {
        const win = i % 5 === 0 ? 3.65 : 0;
        wt.observeSpin({ win: win, bet: 1, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      }
      return wt.report();
    });
    expect(result.status).toBe('critical');
    const rtp = result.breaches.find((b: any) => b.metric === 'rtp');
    expect(rtp).toBeTruthy();
    expect(rtp.status).toBe('critical');
  });

  test('Poisson breach fires on FS hit divergence', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      // Target 1-in-100 → 8 FS triggers expected in 800 spins.  σ = √8 ≈ 2.83.
      // Force 25 triggers → z = (25-8)/2.83 ≈ 6 → critical.
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20, fs_frequency: 100, hnw_frequency: 100 } });
      for (let i = 0; i < 800; i++) {
        // Fake an FS trigger for first 25 spins
        const fsWin = i < 25 ? 10 : 0;
        wt.observeSpin({ win: 0.96, bet: 1, scCount: i < 25 ? 3 : 0, bonusCount: 0, lightning: 1, fsWin: fsWin, hnwWin: 0 });
      }
      return wt.report();
    });
    const fs = result.breaches.find((b: any) => b.metric === 'fs');
    expect(fs).toBeTruthy();
    expect(['warn', 'critical']).toContain(fs.status);
  });

  test('ring buffer evicts oldest at windowSize', async ({ page }) => {
    const result = await page.evaluate(() => {
      const W = (window as any).MTLWatchtower;
      const wt = W.create({ validated_metrics: { rtp: 96, hit_rate: 20 }, options: { windowSize: 100 } });
      for (let i = 0; i < 250; i++) wt.observeSpin({ win: 1, bet: 1, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 });
      const m = wt.metrics();
      return { n: m.n, totalWagered: m.totalWagered, totalWon: m.totalWon };
    });
    // After 250 inserts with windowSize=100, ring holds 100 entries
    expect(result.n).toBe(100);
    expect(result.totalWagered).toBe(100);
  });
});
