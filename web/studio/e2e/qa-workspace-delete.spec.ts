// QA: Hover-X delete on workspace items in the left sidebar.
//
//   1. Hover over a workspace → X fades in (opacity transition).
//   2. Click X → workspace removed, toast with Undo action.
//   3. Click Undo → workspace restored at original position.
//   4. Deleting the active workspace → falls back to a sibling without
//      crashing.
//   5. Cannot delete the LAST workspace — X is not rendered.
//   6. Reload after delete → workspace stays gone (persistence captures
//      the new wsOrder).
//
// Run:  npx playwright test web/studio/e2e/qa-workspace-delete.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-workspace-delete');
mkdirSync(SHOT_DIR, { recursive: true });

async function importIR(page: any, filepath: string) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await page.locator('#ws-newgame-btn').click({ force: true });
  await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(filepath);
  await page.waitForTimeout(2_500);
  // Hard-close any leftover modal so subsequent sidebar interactions
  // aren\'t intercepted by lingering backdrops.
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => {
      (el as HTMLElement).setAttribute('hidden', '');
    });
  });
  await page.waitForTimeout(150);
}

async function readSidebar(page: any) {
  return page.evaluate(() => {
    const hook = (window as { __studio_ui_hook__?: { getWorkspaces(): Record<string, { name?: string }>; getWsOrder(): string[]; getActiveWorkspaceId(): string } }).__studio_ui_hook__;
    if (!hook) return null;
    const wss = hook.getWorkspaces();
    return {
      activeId: hook.getActiveWorkspaceId(),
      list: hook.getWsOrder().map((id) => ({ id, name: wss[id]?.name ?? '?' })),
    };
  });
}

test.describe('Sidebar hover-X delete', () => {
  test.beforeEach(async ({ page }) => {
    expect(existsSync(DESKTOP_IR)).toBe(true);
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('1) X visible on hover · click deletes · Undo restores', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`PAGE-ERR: ${e.message}`));

    // Seed two workspaces: blank + Wrath
    await importIR(page, DESKTOP_IR);
    await page.waitForTimeout(500);

    const before = await readSidebar(page);
    console.log(`  Sidebar before delete: ${before?.list.map((w: any) => w.name).join(' · ')}`);
    expect(before?.list.length).toBe(2);
    const wrathId = before!.list.find((w: any) => /wrath/i.test(w.name))?.id;
    expect(wrathId).toBeTruthy();

    // X should NOT be visible without hover
    const xBtn = page.locator(`.side-item-delete[data-del-ws="${wrathId}"]`);
    await expect(xBtn).toHaveCount(1);
    const opacityIdle = await xBtn.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacityIdle)).toBe(0);
    console.log(`✓ X hidden when not hovering (opacity ${opacityIdle})`);

    // Hover the row → X fades in
    const row = page.locator(`.side-item-row[data-ws="${wrathId}"]`);
    await row.hover();
    await page.waitForTimeout(200);
    const opacityHover = await xBtn.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacityHover)).toBe(1);
    console.log(`✓ X visible on hover (opacity ${opacityHover})`);
    await page.screenshot({ path: `${SHOT_DIR}/01-hover.png`, fullPage: true });

    // Click X → workspace removed
    await xBtn.click({ force: true });
    await page.waitForTimeout(400);
    const afterDelete = await readSidebar(page);
    console.log(`  Sidebar after delete: ${afterDelete?.list.map((w: any) => w.name).join(' · ')}`);
    expect(afterDelete?.list.length).toBe(1);
    expect(afterDelete?.list[0].id).not.toBe(wrathId);
    console.log('✓ Workspace deleted');
    await page.screenshot({ path: `${SHOT_DIR}/02-deleted.png`, fullPage: true });

    // Undo via toast action button (Studio class is `.toast-act`)
    const undoBtn = page.locator('.toast-act').filter({ hasText: /Undo/i }).first();
    await expect(undoBtn).toBeVisible({ timeout: 3_000 });
    await undoBtn.click();
    await page.waitForTimeout(400);
    const afterUndo = await readSidebar(page);
    console.log(`  Sidebar after undo: ${afterUndo?.list.map((w: any) => w.name).join(' · ')}`);
    expect(afterUndo?.list.length).toBe(2);
    expect(afterUndo?.list.find((w: any) => /wrath/i.test(w.name))).toBeTruthy();
    console.log('✓ Workspace restored via Undo');
    await page.screenshot({ path: `${SHOT_DIR}/03-undo.png`, fullPage: true });

    expect(errors).toHaveLength(0);
  });

  test('2) Deleting the active workspace falls back cleanly', async ({ page }) => {
    await importIR(page, DESKTOP_IR);
    await page.waitForTimeout(500);

    const before = await readSidebar(page);
    const wrathId = before!.list.find((w: any) => /wrath/i.test(w.name))?.id;
    // Wrath should be active (importCanonicalIR switches to new workspace)
    expect(before?.activeId).toBe(wrathId);

    const row = page.locator(`.side-item-row[data-ws="${wrathId}"]`);
    await row.hover();
    await page.waitForTimeout(150);
    await page.locator(`.side-item-delete[data-del-ws="${wrathId}"]`).click({ force: true });
    await page.waitForTimeout(400);

    const after = await readSidebar(page);
    expect(after?.list.length).toBe(1);
    expect(after?.activeId).not.toBe(wrathId);
    expect(after?.activeId).toBe(after?.list[0].id);
    console.log(`✓ Active fell back to "${after?.list[0].name}"`);
  });

  test('3) Last workspace cannot be deleted — X not rendered', async ({ page }) => {
    // Default cold start has exactly 1 workspace (ws-blank)
    const state = await readSidebar(page);
    expect(state?.list.length).toBe(1);
    const xCount = await page.locator('.side-item-delete').count();
    expect(xCount, 'no X button when only one workspace remains').toBe(0);
    console.log('✓ Last workspace protected — no X button rendered');
  });

  test('4) Delete persists across reload', async ({ page }) => {
    await importIR(page, DESKTOP_IR);
    await page.waitForTimeout(500);
    const before = await readSidebar(page);
    const wrathId = before!.list.find((w: any) => /wrath/i.test(w.name))?.id;

    await page.locator(`.side-item-row[data-ws="${wrathId}"]`).hover();
    await page.waitForTimeout(150);
    await page.locator(`.side-item-delete[data-del-ws="${wrathId}"]`).click({ force: true });
    await page.waitForTimeout(400);

    // Force a save so the deleted state is committed before reload
    await page.evaluate(() => {
      const w = window as unknown as { __studio__?: { saveNow?: () => void } };
      w.__studio__?.saveNow?.();
    });
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const after = await readSidebar(page);
    expect(after?.list.length).toBe(1);
    expect(after?.list.find((w: any) => /wrath/i.test(w.name))).toBeUndefined();
    console.log('✓ Delete persisted across reload');
  });
});
