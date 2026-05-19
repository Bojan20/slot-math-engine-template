// QA: After importing wrath-of-olympus.ir.json and clicking Compute, the
// top-right L1 metrics row must reflect the 500M-spin MC validation
// (rtp_allocation + validated_metrics), NOT the legacy heuristic.
//
// Expected values for Wrath of Olympus v12.0.0:
//
//   RTP    96.0420%     (rtp_allocation.total_mc_5b · 4B-spin)
//   Hit    20.69%       (validated_metrics.hit_rate · 500M-spin)
//   σ      4.51         (validated_metrics.volatility_index)
//   P99    53.82×       (validated_metrics.win_percentiles.p99)
//
// Run:  npx playwright test web/studio/e2e/qa-l1-metrics.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-l1-metrics');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

// Tolerances (the displayed values are rounded — 4dp for RTP, 2dp for hit/σ)
const TOL = {
  rtp: 0.01,    // %
  hit: 0.5,     // %
  sigma: 0.5,
  p99: 5,       // ×
};

test.describe('L1 metrics — validated MC values after Compute', () => {
  test('RTP/Hit/σ/P99 match 500M-MC, not heuristic', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`PAGE-ERR: ${err.message}`));

    expect(existsSync(DESKTOP_IR), `IR missing: ${DESKTOP_IR}`).toBe(true);
    const ir = JSON.parse(readFileSync(DESKTOP_IR, 'utf8'));
    const vm = ir.validated_metrics;
    expect(vm, 'validated_metrics block').toBeTruthy();
    expect(vm.hit_rate, 'hit_rate present').toBeGreaterThan(0);
    expect(vm.volatility_index, 'volatility_index present').toBeGreaterThan(0);
    expect(vm.win_percentiles?.p99, 'p99 present').toBeGreaterThan(0);
    const exp = {
      rtp: ir.rtp_allocation.total_mc_5b * 100,
      hit: vm.hit_rate,
      sigma: vm.volatility_index,
      p99: vm.win_percentiles.p99,
    };
    console.log('  Expected:', exp);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, 'studio-loaded');

    // Import math GDD
    await page.locator('#ws-newgame-btn').click();
    await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
    await page.locator('label:has(input[value="gdd-math"])').click();
    await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
    await page.waitForTimeout(2_500);
    const reviewVisible = await page.locator('#gdd-review').isVisible({ timeout: 1_000 }).catch(() => false);
    if (reviewVisible) {
      await page.locator('#gdd-generate').click().catch(() => {});
      await page.waitForTimeout(1_500);
    }
    await shot(page, 'after-import');

    // Click Compute to refresh L1 row from the now-validated metrics
    const computeBtn = page.locator('#btn-compute');
    if (await computeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await computeBtn.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
      await shot(page, 'after-compute');
    }

    // Debug: inspect raw HTML of L1 row + variant state
    const debug = await page.evaluate(() => {
      const ids = ['l1-rtp', 'l1-hit', 'l1-sigma', 'l1-p99'];
      const hook = (window as any).__studio_ui_hook__;
      const variant = hook?.getActiveVariant?.();
      return {
        l1: Object.fromEntries(ids.map(id => {
          const el = document.getElementById(id);
          return [id, { innerHTML: el?.innerHTML || null }];
        })),
        variant: variant ? {
          name: variant.name,
          rtp: variant.rtp,
          hit: variant.hit,
          sigma: variant.sigma,
          p99: variant.p99,
          maxWin: variant.maxWin,
          hasRtpAlloc: !!variant.rtpAllocation,
          hasValidated: !!variant.validatedMetrics,
          validatedP99: variant.validatedMetrics?.win_percentiles?.p99,
          validatedSigma: variant.validatedMetrics?.volatility_index,
        } : null,
      };
    });
    console.log('\n  DEBUG raw L1:', JSON.stringify(debug.l1, null, 2));
    console.log('  DEBUG variant:', JSON.stringify(debug.variant, null, 2));

    // Read the displayed L1 metrics
    const readNum = async (sel: string) => {
      // textContent on a parent that has child <span class="pct">%</span>
      // concatenates child text — for "96.0420<span>%</span>" we get
      // "96.0420%".  Strip non-numeric chars and take only the first match.
      const txt = (await page.locator(sel).textContent()) || '';
      const m = txt.match(/-?[0-9]+(?:\.[0-9]+)?/);
      const num = m ? parseFloat(m[0]) : NaN;
      return { txt: txt.trim(), num };
    };
    const got = {
      rtp:   await readNum('#l1-rtp'),
      hit:   await readNum('#l1-hit'),
      sigma: await readNum('#l1-sigma'),
      p99:   await readNum('#l1-p99'),
    };
    console.log('\n  L1 displayed:');
    console.log(`    RTP   "${got.rtp.txt}"   → ${got.rtp.num}  (expected ≈ ${exp.rtp.toFixed(4)}%)`);
    console.log(`    Hit   "${got.hit.txt}"   → ${got.hit.num}  (expected ≈ ${exp.hit.toFixed(2)}%)`);
    console.log(`    σ     "${got.sigma.txt}" → ${got.sigma.num}  (expected ≈ ${exp.sigma.toFixed(2)})`);
    console.log(`    P99   "${got.p99.txt}"   → ${got.p99.num}  (expected ≈ ${exp.p99.toFixed(2)}×)`);

    const failures: string[] = [];
    if (Math.abs(got.rtp.num - exp.rtp)     > TOL.rtp)   failures.push(`RTP ${got.rtp.num} ≠ ${exp.rtp.toFixed(4)} (±${TOL.rtp})`);
    if (Math.abs(got.hit.num - exp.hit)     > TOL.hit)   failures.push(`Hit ${got.hit.num} ≠ ${exp.hit.toFixed(2)} (±${TOL.hit})`);
    if (Math.abs(got.sigma.num - exp.sigma) > TOL.sigma) failures.push(`σ ${got.sigma.num} ≠ ${exp.sigma.toFixed(2)} (±${TOL.sigma})`);
    if (Math.abs(got.p99.num - exp.p99)     > TOL.p99)   failures.push(`P99 ${got.p99.num} ≠ ${exp.p99.toFixed(2)} (±${TOL.p99})`);

    if (failures.length) {
      console.log('\n❌ L1 mismatches:');
      for (const f of failures) console.log('    ' + f);
    } else {
      console.log('\n✓ All 4 L1 metrics match validated MC values');
    }

    if (errors.length) {
      console.log(`\n⚠ ${errors.length} page errors:`);
      for (const e of errors) console.log('    ' + e);
    }

    await shot(page, 'final');
    console.log(`\n📁 Screenshots → ${SHOT_DIR}`);

    expect(failures, `L1 metrics QA failed:\n${failures.join('\n')}`).toHaveLength(0);
    expect(errors, 'no page errors').toHaveLength(0);
  });
});
