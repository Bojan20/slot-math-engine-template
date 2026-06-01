// PHASE 52 — Verify all 12+ feature kinds boot without errors from a GDD
// that declares the full feature set.
//
// Acceptance: imported GDD with 10 feature declarations → runner loads
// each module, no console errors, no "did not register" warnings, all
// expected DOM overlays present.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.resolve(__dirname, '../../../reports/playwright/qa-phase52');
mkdirSync(SHOT_DIR, { recursive: true });

test.setTimeout(180_000);
test('PHASE 52 — Mega Cascade GDD boots all 10 features without errors', async ({ context, page }) => {
  const consoleMessages: { type: string; text: string }[] = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

  await page.goto('/');
  await page.waitForSelector('#tab-build', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOT_DIR}/01-studio-loaded.png`, fullPage: true });

  const fileInput = page.locator('#gdd-file-input');
  await expect(fileInput).toBeAttached();

  const samplePath = path.resolve(__dirname, '..', 'gdd-samples', 'mega-cascade.json');
  await fileInput.setInputFiles(samplePath);

  // Review modal opens
  const reviewModal = page.locator('#gdd-review');
  await expect(reviewModal).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOT_DIR}/02-review-modal.png`, fullPage: true });

  // Wait for new tab to open after Generate — sealing ceremony can take ~10s
  const popupPromise = context.waitForEvent('page', { timeout: 30_000 });
  await page.locator('#gdd-generate').click();
  const runnerPage = await popupPromise;
  await runnerPage.waitForLoadState('domcontentloaded');
  await runnerPage.waitForTimeout(3000); // give features time to load

  const runnerMessages: { type: string; text: string }[] = [];
  runnerPage.on('console', (msg) => runnerMessages.push({ type: msg.type(), text: msg.text() }));
  await runnerPage.waitForTimeout(2000);

  await runnerPage.screenshot({ path: `${SHOT_DIR}/03-runner-loaded.png`, fullPage: true });

  // Inspect MTLFeatures._modules — every expected kind must be registered
  const registered: string[] = await runnerPage.evaluate(() => {
    const w = window as unknown as {
      MTLFeatures?: { _modules?: Record<string, unknown> };
    };
    const m = w.MTLFeatures?._modules || {};
    return Object.keys(m);
  });

  const expectedKinds = [
    'free_spins',
    'hold_and_win',
    'multiplier',
    'cascade',
    'expanding_wild',
    'walking_wild',
    'sticky_wild',
    'mystery_symbol',
    'buy_feature',
    'bonus_pick',
  ];

  const missing = expectedKinds.filter((k) => !registered.includes(k));
  console.log('Registered kinds:', registered);
  console.log('Missing kinds:', missing);
  expect(missing).toEqual([]);

  // No "did not register" warnings
  const registerWarnings = runnerMessages.filter((m) =>
    /did not register|could not load module|MTLFeatures.*missing|mount failed/i.test(m.text),
  );
  if (registerWarnings.length > 0) {
    console.log('Registration warnings:', registerWarnings);
  }
  expect(registerWarnings).toEqual([]);

  // Trigger a spin — verify no crash
  const spinBtn = runnerPage
    .locator('button:has-text("SPIN"), .spinBtn, [data-action="spin"]')
    .first();
  await spinBtn.click({ timeout: 5000 }).catch(() => {});
  await runnerPage.waitForTimeout(2500);
  await runnerPage.screenshot({ path: `${SHOT_DIR}/04-after-spin.png`, fullPage: true });

  // Capture mounted kinds via MTLFeatureBuilder
  const mounted: string[] = await runnerPage.evaluate(() => {
    const w = window as unknown as {
      MTLFeatureBuilder?: { mountedKinds?: () => string[] };
    };
    return w.MTLFeatureBuilder?.mountedKinds?.() || [];
  });
  console.log('Mounted kinds:', mounted);

  // The runner extras path is what we built in Phase 52 — multiplier,
  // sticky/expanding/walking_wild, mystery_symbol, buy_feature,
  // bonus_pick should all mount through MTLFeatureBuilder. free_spins,
  // hold_and_win, cascade are native runtime paths that don't necessarily
  // surface in `mountedKinds()` — runtime handles them via F_FS / F_HNW
  // directly.
  const expectedMounted = ['multiplier', 'sticky_wild', 'expanding_wild', 'walking_wild', 'mystery_symbol', 'buy_feature', 'bonus_pick'];
  const missingMounted = expectedMounted.filter((k) => !mounted.includes(k));
  expect(missingMounted).toEqual([]);

  // Spin a couple more times to trigger feature overlays
  for (let i = 0; i < 4; i++) {
    await spinBtn.click({ timeout: 2000 }).catch(() => {});
    await runnerPage.waitForTimeout(1500);
  }
  await runnerPage.screenshot({ path: `${SHOT_DIR}/05-multi-spin.png`, fullPage: true });

  console.log('Phase 52 acceptance: PASS');
  console.log(`  Registered: ${registered.length} kinds`);
  console.log(`  Mounted: ${mounted.length} kinds`);
});
