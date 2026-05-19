// QA: After importing wrath-of-olympus.ir.json, moving the tier-count
// sliders (HP / MP / LP / etc.) must NOT replace imported symbol IDs and
// names with placeholders like "HP1 / Sapphire".  Existing entries are
// preserved in order; only the tail is dropped (count down) or new
// placeholders appended (count up).
//
// Run:  npx playwright test web/studio/e2e/qa-slider-preserve.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-slider-preserve');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

// Read the current Symbol Pool rows from the DOM
async function readPool(page: any) {
  const rows = page.locator('#sym-list .sym-row');
  const n = await rows.count();
  const out: Array<{ tier: string; id: string; name: string; pay: string }> = [];
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    out.push({
      tier: ((await r.locator('.sym-tier').textContent()) || '').trim(),
      id:   ((await r.locator('.sym-id').textContent()) || '').trim(),
      name: (await r.locator('.sym-name').inputValue()) || '',
      pay:  ((await r.locator('.sym-pay').textContent()) || '').trim(),
    });
  }
  return out;
}

test.describe('Tier slider preserves imported symbols', () => {
  test('moving HP slider does NOT rename Zeus/Hades/Poseidon to placeholders', async ({ page }) => {
    expect(existsSync(DESKTOP_IR)).toBe(true);

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`PAGE-ERR: ${err.message}`));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Import IR
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

    // Open the Custom slider drawer
    const drawerOpen = await page.locator('#pool-custom').isVisible({ timeout: 500 }).catch(() => false);
    if (!drawerOpen) {
      await page.locator('#preset-custom-toggle').click().catch(() => {});
      await page.waitForTimeout(300);
    }
    await shot(page, 'custom-drawer-open');

    // ── Initial pool snapshot ──
    const before = await readPool(page);
    console.log(`\n  Initial pool (${before.length} rows):`);
    for (const r of before) console.log(`    [${r.tier.padEnd(7)}] ${r.id.padEnd(3)} "${r.name}"`);

    const initialHP = before.filter(r => r.tier === 'HP');
    expect(initialHP.length, 'expect 3 HP rows after import').toBe(3);
    const hpNames = initialHP.map(r => r.name).sort();
    expect(hpNames, 'HP names').toEqual(['Hades', 'Poseidon', 'Zeus']);

    // ── Bump HP slider UP (3 → 5) ──
    const hpSlider = page.locator('#pool-custom input[data-tier="HP"]');
    await expect(hpSlider).toHaveCount(1);
    await hpSlider.evaluate((el: HTMLInputElement) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    await shot(page, 'after-HP-5');

    const afterUp = await readPool(page);
    const hpUp = afterUp.filter(r => r.tier === 'HP');
    console.log(`\n  After HP 3→5: ${hpUp.length} HP rows:`);
    for (const r of hpUp) console.log(`    HP ${r.id.padEnd(3)} "${r.name}"`);

    expect(hpUp.length, 'HP count').toBe(5);
    // First three MUST still be Zeus / Hades / Poseidon in original order
    expect(hpUp[0].id, 'HP[0] id').toBe('Z');
    expect(hpUp[0].name, 'HP[0] name').toBe('Zeus');
    expect(hpUp[1].id, 'HP[1] id').toBe('H');
    expect(hpUp[1].name, 'HP[1] name').toBe('Hades');
    expect(hpUp[2].id, 'HP[2] id').toBe('P');
    expect(hpUp[2].name, 'HP[2] name').toBe('Poseidon');
    // New entries (HP[3], HP[4]) should be placeholders with non-colliding IDs
    expect(['Z','H','P']).not.toContain(hpUp[3].id);
    expect(['Z','H','P']).not.toContain(hpUp[4].id);
    console.log('✓ HP 3→5: Z, H, P preserved verbatim · 2 placeholders appended');

    // ── Bump HP slider DOWN (5 → 2) ──
    await hpSlider.evaluate((el: HTMLInputElement) => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    await shot(page, 'after-HP-2');

    const afterDown = await readPool(page);
    const hpDown = afterDown.filter(r => r.tier === 'HP');
    console.log(`\n  After HP 5→2: ${hpDown.length} HP rows:`);
    for (const r of hpDown) console.log(`    HP ${r.id.padEnd(3)} "${r.name}"`);

    expect(hpDown.length, 'HP count').toBe(2);
    expect(hpDown[0].id, 'HP[0] still Z').toBe('Z');
    expect(hpDown[0].name).toBe('Zeus');
    expect(hpDown[1].id, 'HP[1] still H').toBe('H');
    expect(hpDown[1].name).toBe('Hades');
    console.log('✓ HP 5→2: drops from TAIL only · Z, H preserved');

    // ── Restore HP slider (2 → 3) ──
    // After dropping P, bumping back to 3 SHOULD add one new placeholder
    // (we don't auto-resurrect dropped entries — that was the user's choice).
    await hpSlider.evaluate((el: HTMLInputElement) => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    await shot(page, 'after-HP-3-restored');

    const afterRestore = await readPool(page);
    const hpRestored = afterRestore.filter(r => r.tier === 'HP');
    expect(hpRestored.length).toBe(3);
    expect(hpRestored[0].id).toBe('Z');
    expect(hpRestored[1].id).toBe('H');
    // Third slot is a placeholder (NOT "P" — Poseidon was dropped)
    expect(['Z', 'H'], 'placeholder is fresh id').not.toContain(hpRestored[2].id);
    console.log(`✓ HP 2→3: ${hpRestored[2].id} appended ("${hpRestored[2].name}")`);

    // ── Cross-tier: nudging MP slider must not touch HP names ──
    const mpSlider = page.locator('#pool-custom input[data-tier="MP"]');
    await mpSlider.evaluate((el: HTMLInputElement) => { el.value = '4'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    const afterMP = await readPool(page);
    const hpAfterMP = afterMP.filter(r => r.tier === 'HP');
    expect(hpAfterMP[0].name).toBe('Zeus');
    expect(hpAfterMP[1].name).toBe('Hades');
    const mpAfterMP = afterMP.filter(r => r.tier === 'MP');
    expect(mpAfterMP.length).toBe(4);
    expect(mpAfterMP.slice(0, 3).map(r => r.name).sort()).toEqual(['Helm', 'Shield', 'Sword']);
    console.log(`✓ MP 3→4: HP intact, MP keeps Helm/Shield/Sword + 1 new`);

    if (errors.length) {
      console.log(`\n⚠ ${errors.length} page errors:`);
      for (const e of errors) console.log('    ' + e);
    }
    expect(errors).toHaveLength(0);
    console.log(`\n📁 Screenshots → ${SHOT_DIR}`);
  });
});
