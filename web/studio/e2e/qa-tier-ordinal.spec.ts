// QA: Per-tier ordinal pill (HP1, HP2, HP3, ...) — visible next to the
// tier badge, increments per row within each tier, and updates when the
// slider changes (tail-add / tail-drop pattern from buildSymbolPoolFor).
//
// Run:  npx playwright test web/studio/e2e/qa-tier-ordinal.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-tier-ordinal');
mkdirSync(SHOT_DIR, { recursive: true });

async function readPool(page: any) {
  const rows = page.locator('#sym-list .sym-row');
  const n = await rows.count();
  const out: Array<{
    tier: string; ord: string; id: string; name: string;
    tierFullText: string; rowTierOrd: string | null;
  }> = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    // The ordinal pill is a child of .sym-tier — read separately
    const tierFull = ((await r.locator('.sym-tier').textContent()) || '').trim();
    const ord = ((await r.locator('.sym-tier-ord').textContent()) || '').trim();
    out.push({
      tier: tierFull.replace(/\s*\d+$/, '').trim(), // strip trailing number/ord
      ord,
      id: ((await r.locator('.sym-id').textContent()) || '').trim(),
      name: (await r.locator('.sym-name').inputValue()) || '',
      tierFullText: tierFull,
      rowTierOrd: await r.getAttribute('data-tier-ord'),
    });
  }
  return out;
}

test.describe('Tier ordinal pill (HP1, HP2, ...)', () => {
  test('ordinal renders per tier and updates on slider change', async ({ page }) => {
    expect(existsSync(DESKTOP_IR)).toBe(true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import Wrath IR (so HP/MP/LP/WILD/SCATTER/MULT all present)
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
    await page.screenshot({ path: `${SHOT_DIR}/01-imported.png`, fullPage: true });

    // ── Initial verify: each tier counts 1..N ──
    const initial = await readPool(page);
    console.log('\n  Initial rows:');
    for (const r of initial) console.log(`    [${r.tier.padEnd(7)}#${r.ord}] ${r.id.padEnd(3)} "${r.name}"`);

    // Compute expected ordinals per tier from DOM order
    const expectedByTier: Record<string, string[]> = {};
    for (const r of initial) {
      if (!expectedByTier[r.tier]) expectedByTier[r.tier] = [];
      expectedByTier[r.tier].push(r.id);
    }
    const failures: string[] = [];
    let runningCounter: Record<string, number> = {};
    for (const r of initial) {
      runningCounter[r.tier] = (runningCounter[r.tier] || 0) + 1;
      if (r.ord !== String(runningCounter[r.tier])) {
        failures.push(`${r.id}: ordinal "${r.ord}" ≠ expected "${runningCounter[r.tier]}"`);
      }
      // also verify dataset.tierOrd
      if (r.rowTierOrd !== String(runningCounter[r.tier])) {
        failures.push(`${r.id}: data-tier-ord "${r.rowTierOrd}" ≠ "${runningCounter[r.tier]}"`);
      }
    }
    if (failures.length) {
      console.log('\n❌ Initial ordinal mismatches:');
      for (const f of failures) console.log('    ' + f);
    }
    expect(failures, 'initial ordinals correct').toHaveLength(0);

    // Wrath imports as: WILD #1 · HP #1·#2·#3 · MP #1·#2·#3 · LP #1..5 · SCATTER #1 · MULT #1
    expect(initial.filter((r) => r.tier === 'HP').map((r) => r.ord)).toEqual(['1', '2', '3']);
    expect(initial.filter((r) => r.tier === 'MP').map((r) => r.ord)).toEqual(['1', '2', '3']);
    expect(initial.filter((r) => r.tier === 'LP').map((r) => r.ord)).toEqual(['1', '2', '3', '4', '5']);
    expect(initial.filter((r) => r.tier === 'WILD').map((r) => r.ord)).toEqual(['1']);
    console.log('✓ Initial ordinals: HP 1-3, MP 1-3, LP 1-5, WILD 1, SCATTER 1, MULT 1');

    // ── Bump HP slider 3→5 — last two get HP·4, HP·5 ──
    // Open custom drawer first
    const drawerOpen = await page.locator('#pool-custom').isVisible({ timeout: 500 }).catch(() => false);
    if (!drawerOpen) {
      await page.locator('#preset-custom-toggle').click().catch(() => {});
      await page.waitForTimeout(300);
    }
    const hpSlider = page.locator('#pool-custom input[data-tier="HP"]');
    await hpSlider.evaluate((el: HTMLInputElement) => {
      el.value = '5';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}/02-hp5.png`, fullPage: true });

    const afterUp = await readPool(page);
    const hpUp = afterUp.filter((r) => r.tier === 'HP');
    console.log(`\n  HP rows after 3→5:`);
    for (const r of hpUp) console.log(`    [HP#${r.ord}] ${r.id.padEnd(3)} "${r.name}"`);
    expect(hpUp.map((r) => r.ord)).toEqual(['1', '2', '3', '4', '5']);
    // First three IDs preserved
    expect(hpUp[0].id).toBe('Z');
    expect(hpUp[1].id).toBe('H');
    expect(hpUp[2].id).toBe('P');
    console.log('✓ HP 3→5: ordinals continue 1..5, Z/H/P stay');

    // ── Drop HP 5→2 ──
    await hpSlider.evaluate((el: HTMLInputElement) => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const afterDown = await readPool(page);
    const hpDown = afterDown.filter((r) => r.tier === 'HP');
    expect(hpDown.map((r) => r.ord)).toEqual(['1', '2']);
    expect(hpDown[0].id).toBe('Z');
    expect(hpDown[1].id).toBe('H');
    console.log('✓ HP 5→2: ordinals shrink to 1..2');

    // Cross-tier verify: MP still has 1..3
    const mpAfter = afterDown.filter((r) => r.tier === 'MP');
    expect(mpAfter.map((r) => r.ord)).toEqual(['1', '2', '3']);
    console.log('✓ MP ordinals untouched (1..3)');

    if (errors.length) {
      console.log(`\n⚠ ${errors.length} page errors:`);
      for (const e of errors) console.log('    ' + e);
    }
    expect(errors).toHaveLength(0);
    console.log(`\n📁 Screenshots → ${SHOT_DIR}`);
  });
});
