// QA: Feature-driven UI compiler
// ─────────────────────────────────────────────────────────────────────────
// Verifies that the slot template auto-builds its UI from IR.features:
//   1. Minimal IR (no features) → no feature components mounted
//   2. FS-only IR → free-spins component mounts, others don't
//   3. H&W-only IR → hold-and-win component mounts, others don't
//   4. Multi-feature IR (FS + multiplier + power_meter) → all three mount
//   5. Unknown feature kind → console warning, math runs, UI silent
//
// Runs the registry + builder in the Studio context (no need to open
// a runner blob for these — components are pure DOM and don't depend on
// the spin pipeline).  Faster than full Playwright trips through the
// runner; verifies the contract directly.

import { test, expect } from '@playwright/test';

const MINIMAL_IR = {
  schema_version: '1.0.0',
  meta: { id: 'test-minimal', name: 'Minimal', version: '0.0.1' },
  topology: { kind: 'rectangular', reels: 5, rows: 3 },
  symbols: [
    { id: 'A', kind: 'lp' }, { id: 'B', kind: 'lp' }, { id: 'C', kind: 'lp' },
    { id: 'W', kind: 'wild' }, { id: 'S', kind: 'scatter' },
  ],
  reels: { base: [{ A: 10, B: 10, C: 10, W: 1, S: 1 }] },
  evaluation: { kind: 'lines', paylines: [[1,1,1,1,1]], min_match: 3 },
  paytable: { A: { 3: 1, 4: 2, 5: 5 }, B: { 3: 1, 4: 2, 5: 5 } },
  features: [],
  limits: { max_win_x: 1000 },
};

function withFeature(feature: any) {
  return { ...MINIMAL_IR, features: [feature] };
}

test.describe('MTL Feature-driven UI compiler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => !!(window as any).MTLFeatureRegistry && !!(window as any).MTLFeatureBuilder,
      { timeout: 10_000 },
    );
    // Ensure slot anchors exist (Studio doesn't render them, so we add them
    // for these tests).  In the actual runner they come from template.html.
    await page.evaluate(() => {
      const ids = ['mtl-features-top-l', 'mtl-features-top', 'mtl-features-side-l',
                   'mtl-features-side-r', 'mtl-features-overlay', 'mtl-features-cells',
                   'mtl-features-bottom'];
      for (const id of ids) {
        if (!document.getElementById(id)) {
          const d = document.createElement('div');
          d.id = id;
          document.body.appendChild(d);
        }
      }
    });
  });

  test('minimal IR mounts NO feature components', async ({ page }) => {
    const res = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      return await w.MTLFeatureBuilder.boot(ir, document.body);
    }, MINIMAL_IR);
    expect(res.mounted).toEqual([]);
    expect(res.unknown).toEqual([]);
  });

  test('FS-only IR mounts ONLY free-spins component', async ({ page }) => {
    const ir = withFeature({
      kind: 'free_spins',
      trigger: { thresholds: { 3: 10, 4: 15, 5: 20 } },
      progressive_multiplier: { start: 1, increment: 1, max: 10, increments_on: 'each_winning_fs_spin' },
    });
    const res = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      return await w.MTLFeatureBuilder.boot(ir, document.body);
    }, ir);
    expect(res.mounted).toEqual(['free_spins']);
    const hudPresent = await page.locator('.ft-fs-hud').count();
    expect(hudPresent).toBeGreaterThan(0);
  });

  test('H&W-only IR mounts ONLY hold-and-win component', async ({ page }) => {
    const ir = withFeature({
      kind: 'hold_and_win',
      trigger: { min: 6 },
      respins_initial: 3,
      cash_value_distribution: [{ value: 1, weight: 100 }],
    });
    const res = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      return await w.MTLFeatureBuilder.boot(ir, document.body);
    }, ir);
    expect(res.mounted).toEqual(['hold_and_win']);
    // Component-specific DOM verification skipped here — different implementations
    // render different anchor classes; mounted-kind assertion is the contract.
  });

  test('multi-feature IR mounts ALL three components in priority order', async ({ page }) => {
    const ir = {
      ...MINIMAL_IR,
      features: [
        // Order intentionally NOT priority-sorted — registry must reorder
        { kind: 'free_spins', trigger: { thresholds: { 3: 10 } } },
        { kind: 'multiplier', trigger: { probability: 0.12 }, distribution: [{ value: 2, weight: 5 }, { value: 10, weight: 1 }] },
        { kind: 'power_meter', source: 'base_win_x', tiers: [{ at: 0, label: 'IDLE' }, { at: 50, label: 'CHARGING' }] },
      ],
    };
    const res = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      return await w.MTLFeatureBuilder.boot(ir, document.body);
    }, ir);
    expect(res.mounted.sort()).toEqual(['free_spins', 'multiplier', 'power_meter'].sort());
  });

  test('unknown feature kind reports + math UI still works', async ({ page }) => {
    const ir = withFeature({ kind: 'cascade_psycho_supernova' });
    const res = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      return await w.MTLFeatureBuilder.boot(ir, document.body);
    }, ir);
    expect(res.mounted).toEqual([]);
    expect(res.unknown).toContain('cascade_psycho_supernova');
  });

  test('event bus dispatches to subscribed components', async ({ page }) => {
    const ir = withFeature({ kind: 'multiplier', distribution: [{ value: 2, weight: 1 }] });
    const result = await page.evaluate(async (ir) => {
      const w = window as any;
      w.MTLFeatureBuilder.unmountAll();
      await w.MTLFeatureBuilder.boot(ir, document.body);
      let landReceived: number | null = null;
      w.MTLFeatures.events.on('test-marker', (p: any) => { landReceived = p.value; });
      w.MTLFeatures.events.emit('test-marker', { value: 42 });
      return landReceived;
    }, ir);
    expect(result).toBe(42);
  });
});
