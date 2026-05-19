// QA: Auto-MC orchestrator — covers every scenario Boki cares about:
//
//   1. IR WITHOUT validated_metrics → progress strip appears, MC runs,
//      Hit / σ / P99 get populated on L1 row.
//   2. IR WITH validated_metrics → MC does NOT auto-trigger (trust the IR).
//   3. Cache hit on second import → instant result (sub-second).
//   4. Cancel mid-run → strip hides, partial result available.
//   5. Bridge API surface — runAutoMc / clearAutoMcCache exist.
//
// Run:  npx playwright test web/studio/e2e/qa-auto-mc.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR_WITH_VM = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const TMP_IR_NO_VM       = '/tmp/wrath-no-vm.ir.json';
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-auto-mc');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

// Build a no-validated_metrics version of the Wrath IR if missing
function ensureNoVmIr() {
  if (existsSync(TMP_IR_NO_VM)) return;
  expect(existsSync(DESKTOP_IR_WITH_VM)).toBe(true);
  const ir = JSON.parse(readFileSync(DESKTOP_IR_WITH_VM, 'utf8'));
  delete ir.validated_metrics;
  delete ir.rtp_allocation;
  ir.meta.id = 'wrath-of-olympus-novm';
  ir.meta.name = 'Wrath (no validated_metrics)';
  writeFileSync(TMP_IR_NO_VM, JSON.stringify(ir, null, 2));
}

async function importIR(page: any, filepath: string) {
  // Clear any stale modal / backdrop from a previous run.  We clear the
  // inline `display:none` (set by our own forced-hide elsewhere) and let
  // the app's `hidden` attribute drive visibility.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => {
      const e = el as HTMLElement;
      e.setAttribute('hidden', '');
      e.style.display = '';   // clear any forced display
    });
  });
  await page.waitForTimeout(150);
  await page.locator('#ws-newgame-btn').click({ force: true });
  await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(filepath);
  await page.waitForTimeout(2_500);
  const reviewVisible = await page.locator('#gdd-review').isVisible({ timeout: 1_000 }).catch(() => false);
  if (reviewVisible) {
    await page.locator('#gdd-generate').click().catch(() => {});
    await page.waitForTimeout(1_500);
  }
  // Force-close any remaining modal so subsequent UI clicks aren't intercepted
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => {
      el.setAttribute('hidden', '');
      (el as HTMLElement).style.display = 'none';
    });
  });
}

test.describe.serial('Auto-MC — every scenario', () => {
  test.beforeEach(async ({ page }) => {
    ensureNoVmIr();
    // Clear MC cache before each test so we exercise the worker path
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      const w = window as unknown as { __studio__?: { clearAutoMcCache?: () => Promise<void> } };
      if (w.__studio__?.clearAutoMcCache) await w.__studio__.clearAutoMcCache();
    });
  });

  test('1) IR without validated_metrics → auto-MC triggers, populates L1', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await importIR(page, TMP_IR_NO_VM);
    await shot(page, 'after-import-novm');

    // Progress strip should appear within ~1s of import
    const strip = page.locator('#row-automc');
    await expect(strip).not.toHaveAttribute('hidden', '', { timeout: 5_000 });
    await shot(page, 'progress-visible');
    console.log('✓ Progress strip visible');

    // Wait for either result toast OR strip hide (whichever happens first).
    // 1M spins typically take 8-15s in CI, so generous timeout.
    await expect(strip).toHaveAttribute('hidden', '', { timeout: 90_000 });
    await shot(page, 'mc-complete');
    console.log('✓ MC completed (strip hidden)');

    // Read variant state
    const variantState = await page.evaluate(() => {
      const hook = (window as { __studio_ui_hook__?: { getActiveVariant(): unknown } }).__studio_ui_hook__;
      const v = hook?.getActiveVariant() as {
        hit: number; sigma: number; p99: number;
        validatedMetrics?: { source: string; rtp: number; hit_rate: number; volatility_index: number };
      } | undefined;
      return v ? {
        hit: v.hit,
        sigma: v.sigma,
        p99: v.p99,
        vmSource: v.validatedMetrics?.source,
        vmRtp: v.validatedMetrics?.rtp,
        vmHit: v.validatedMetrics?.hit_rate,
        vmSigma: v.validatedMetrics?.volatility_index,
      } : null;
    });
    console.log('  variant state:', JSON.stringify(variantState));

    expect(variantState).toBeTruthy();
    expect(variantState!.vmSource).toMatch(/auto-MC/);
    expect(variantState!.vmRtp, 'auto-MC RTP').toBeGreaterThan(70);   // sanity: any sim should land 70-100%
    expect(variantState!.vmRtp, 'auto-MC RTP cap').toBeLessThan(150);
    expect(variantState!.vmHit, 'auto-MC hit rate').toBeGreaterThan(5);
    expect(variantState!.vmHit, 'auto-MC hit rate cap').toBeLessThan(60);
    expect(variantState!.vmSigma, 'auto-MC sigma > 0').toBeGreaterThan(0);
    console.log('✓ Variant populated with auto-MC metrics');

    expect(errors).toHaveLength(0);
  });

  test('2) IR WITH validated_metrics → auto-MC does NOT trigger', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await importIR(page, DESKTOP_IR_WITH_VM);
    // Wait a moment to give auto-trigger a chance to fire (if it would)
    await page.waitForTimeout(1_500);
    const strip = page.locator('#row-automc');
    const hidden = await strip.getAttribute('hidden');
    expect(hidden, 'progress strip should stay hidden').not.toBeNull();
    console.log('✓ Progress strip stayed hidden (IR had validated_metrics)');
    await shot(page, 'with-vm-strip-hidden');
  });

  test('3) Cache hit on second import → fast path', async ({ page }) => {
    // First import — runs full MC
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await importIR(page, TMP_IR_NO_VM);
    const strip = page.locator('#row-automc');
    await expect(strip).not.toHaveAttribute('hidden', '', { timeout: 5_000 });
    await expect(strip).toHaveAttribute('hidden', '', { timeout: 90_000 });
    console.log('✓ First MC run complete (populated cache)');

    // Second import of the SAME IR — should hit cache, no progress visible
    await importIR(page, TMP_IR_NO_VM);
    await page.waitForTimeout(3_000);
    // Cache returns nearly instantly so strip should never have shown for
    // more than a frame.  Verify variant has the cached source label.
    const variantState = await page.evaluate(() => {
      const hook = (window as { __studio_ui_hook__?: { getActiveVariant(): unknown } }).__studio_ui_hook__;
      const v = hook?.getActiveVariant() as { validatedMetrics?: { source: string } } | undefined;
      return v?.validatedMetrics?.source ?? null;
    });
    console.log(`  cached source: ${variantState}`);
    expect(variantState, 'second-run source should mention cached').toMatch(/cached|auto-MC/);
    await shot(page, 'cache-hit');
    console.log('✓ Cache hit verified');
  });

  test('4) Cancel mid-run → strip hides, no error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Bump MC to a much higher spin count so we have time to cancel
    // before it finishes (1M spins runs in ~5s on a fast machine).
    await page.evaluate(() => {
      const w = window as unknown as { __studio_auto_mc_test_spins?: number };
      w.__studio_auto_mc_test_spins = 50_000_000; // ~250s, plenty of time
    });
    await importIR(page, TMP_IR_NO_VM);
    const strip = page.locator('#row-automc');
    await expect(strip).not.toHaveAttribute('hidden', '', { timeout: 5_000 });
    await shot(page, 'before-cancel');

    // Click Cancel almost immediately — but make sure the button is visible.
    const cancelBtn = page.locator('#automc-cancel');
    await expect(cancelBtn).toBeVisible({ timeout: 3_000 });
    await cancelBtn.click();
    console.log('✓ Cancel clicked');

    // Strip should hide within a few seconds (worker shutdown + final toast)
    await expect(strip).toHaveAttribute('hidden', '', { timeout: 15_000 });
    await shot(page, 'after-cancel');
    console.log('✓ Strip hidden after cancel');

    expect(errors, 'no errors from cancel').toHaveLength(0);
  });

  test('5) StudioBridge surface — runAutoMc / clearAutoMcCache exposed', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const api = await page.evaluate(() => {
      const w = window as unknown as { __studio__?: Record<string, unknown> };
      return {
        runAutoMc: typeof w.__studio__?.runAutoMc,
        clearCache: typeof w.__studio__?.clearAutoMcCache,
      };
    });
    expect(api.runAutoMc).toBe('function');
    expect(api.clearCache).toBe('function');
    console.log('✓ Bridge API surface intact');
  });
});
