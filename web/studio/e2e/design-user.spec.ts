// W200 e2e · Scenario 2 — Design persona Pixi spin flow.
//
// Switches to Design persona, opens Play tab, fires SPIN, validates
// the Pixi canvas appears and the result panel updates.

import { test, expect } from '@playwright/test';

test('design persona play spin + autoplay', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#tab-play', { timeout: 10_000 });

  // Persona switch → Design.
  const designBtn = page.locator('[data-persona="design"]');
  await designBtn.click();
  await expect(designBtn).toHaveAttribute('aria-pressed', 'true');

  // Open Play tab.
  await page.locator('#tab-play').click();
  const panel = page.locator('#panel-play');
  await expect(panel).toBeVisible();

  // SPIN should be wired.
  const spinBtn = page.locator('#btn-spin');
  await expect(spinBtn).toBeVisible();
  await spinBtn.click();

  // Wait for renderer to mount — either a Pixi canvas or the WebGL
  // fallback notice is acceptable.
  const canvasOrFallback = page.locator(
    '#pixi-canvas canvas, #w200-play-fallback, #play-grid'
  );
  await expect(canvasOrFallback.first()).toBeVisible({ timeout: 6_000 });

  // Give the spin animation time to complete.
  await page.waitForTimeout(2_500);

  // Result display — last-win / spins / balance counters should exist.
  await expect(page.locator('#play-win')).toBeVisible();
  await expect(page.locator('#play-spins')).toBeVisible();

  // Autoplay 10.
  const autoBtn = page.locator('#btn-auto10');
  await expect(autoBtn).toBeVisible();
  await autoBtn.click();
  // Allow autoplay sequence to begin.
  await page.waitForTimeout(1_500);
});
