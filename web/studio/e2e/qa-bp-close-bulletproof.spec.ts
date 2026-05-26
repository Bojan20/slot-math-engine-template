// QA: X close on the bottom drawer MUST work in every scenario.
// Bug history: this is the 3rd time we've fixed it.  This time we
// exhaustively cover every interaction order Boki could hit so it
// never regresses again.
//
// Run:  npx playwright test web/studio/e2e/qa-bp-close-bulletproof.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-bp-close-bulletproof');
mkdirSync(SHOT_DIR, { recursive: true });

test.describe('Bottom drawer X close — bulletproof', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Open the drawer
    await page.locator('#btn-toggle-panel').click({ force: true });
    await page.waitForTimeout(200);
  });

  test('1) X works on fresh boot — first click after open', async ({ page }) => {
    const panel = page.locator('#bottom-panel');
    await expect(panel).not.toHaveAttribute('hidden', '');
    await page.locator('#bp-close').click();
    await page.waitForTimeout(200);
    await expect(panel).toHaveAttribute('hidden', '');
    // CRITICAL: also verify pixel-level invisibility — the previous bug was
    // that `display:flex` on `.bottom-panel` clobbered the UA `[hidden]`
    // rule, so `hidden` attribute was set but the drawer stayed visually
    // on top of the page content. Attribute-only assertions missed it.
    await expect(panel).toBeHidden();
    console.log('✓ First-click after open: drawer closes (attr + display)');
  });

  test('2) X works after switching tabs (Activity → MC → CI → X)', async ({ page }) => {
    const panel = page.locator('#bottom-panel');
    await page.locator('.bp-tab[data-bp="mc"]').click();
    await page.waitForTimeout(150);
    await page.locator('.bp-tab[data-bp="ci"]').click();
    await page.waitForTimeout(150);
    await page.locator('.bp-tab[data-bp="activity"]').click();
    await page.waitForTimeout(150);
    await page.locator('#bp-close').click();
    await page.waitForTimeout(200);
    await expect(panel).toHaveAttribute('hidden', '');
    console.log('✓ X works after 3 tab switches');
  });

  test('3) X works after open → close → reopen → close cycle (5×)', async ({ page }) => {
    const panel = page.locator('#bottom-panel');
    for (let i = 0; i < 5; i++) {
      await expect(panel).not.toHaveAttribute('hidden', '', { timeout: 2_000 });
      await page.locator('#bp-close').click();
      await page.waitForTimeout(150);
      await expect(panel).toHaveAttribute('hidden', '');
      await page.locator('#btn-toggle-panel').click({ force: true });
      await page.waitForTimeout(150);
    }
    await page.locator('#bp-close').click();
    await page.waitForTimeout(150);
    await expect(panel).toHaveAttribute('hidden', '');
    console.log('✓ X survives 5 open/close cycles');
  });

  test('4) X works on MC pane (post auto-MC completion)', async ({ page }) => {
    // Switch to MC tab → mock a completed MC update via the bridge
    await page.locator('.bp-tab[data-bp="mc"]').click();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const w = window as unknown as { __studio_bp_mc__?: { update(p: unknown): void } };
      w.__studio_bp_mc__?.update({
        status: 'complete · 1,000,000 spins',
        spinsDone: 1_000_000,
        totalSpins: 1_000_000,
        runningRtp: 0.9604,
        elapsedMs: 8000,
        etaMs: 0,
      });
    });
    await page.waitForTimeout(200);
    await page.locator('#bp-close').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#bottom-panel')).toHaveAttribute('hidden', '');
    console.log('✓ X works on MC pane after content fills');
  });

  test('5) Document-level delegate catches click even if direct listener fails', async ({ page }) => {
    // Simulate the "stale-bundle" case: rip out the direct listener and
    // verify the delegated handler still closes the drawer.
    await page.evaluate(() => {
      const btn = document.getElementById('bp-close');
      if (btn) {
        const clone = btn.cloneNode(true) as HTMLElement;
        btn.parentNode?.replaceChild(clone, btn);  // strips ALL listeners attached directly to btn
      }
    });
    await page.waitForTimeout(100);
    await page.locator('#bp-close').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#bottom-panel')).toHaveAttribute('hidden', '');
    console.log('✓ Delegated handler closes drawer even when direct listener is destroyed');
  });

  test('6) ⌘J shortcut still works as a fallback', async ({ page }) => {
    await page.keyboard.press('Meta+j');
    await page.waitForTimeout(200);
    await expect(page.locator('#bottom-panel')).toHaveAttribute('hidden', '');
    console.log('✓ ⌘J closes drawer');
  });

  test('7) Header layout-toggle button stays in sync', async ({ page }) => {
    await expect(page.locator('#btn-toggle-panel')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#bp-close').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#btn-toggle-panel')).toHaveAttribute('aria-pressed', 'false');
    console.log('✓ Header button aria-pressed syncs with drawer state');
  });
});
