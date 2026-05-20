import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;

test('multiplier bolt burst — direct bus emit triggers overlay', async ({ page, context }) => {
  test.setTimeout(60_000);
  expect(existsSync(DESKTOP_IR)).toBe(true);

  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('#ws-newgame-btn').click({ force: true });
  await page.waitForSelector('#new-game-modal:not([hidden])');
  await page.locator('label:has(input[value="gdd-math"])').click();
  await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
  await page.waitForTimeout(2_500);
  await page.evaluate(() => {
    document.querySelectorAll('.modal-base, .modal-backdrop').forEach((el) => {
      (el as HTMLElement).setAttribute('hidden', '');
    });
  });

  const [runner] = await Promise.all([
    context.waitForEvent('page', { timeout: 10_000 }),
    page.locator('#btn-play-template').click({ force: true }),
  ]);
  await runner.waitForLoadState('domcontentloaded');
  await runner.waitForTimeout(2000);

  // Burst overlay should be in DOM regardless of any spin
  const burstExists = await runner.evaluate(() => !!document.querySelector('.ft-mult-burst'));
  expect(burstExists, '.ft-mult-burst mounted at boot').toBe(true);

  // Directly emit spin:lightning with values [2, 5, 10] — burst overlay
  // should pulse on each one, with .is-active class toggling.
  const result = await runner.evaluate(async () => {
    const w = window as any;
    const bus = w.MTLFeatures?.events;
    if (!bus) return { error: 'no bus' };
    const burst = document.querySelector('.ft-mult-burst');
    if (!burst) return { error: 'no burst' };
    const log: any[] = [];
    const obs = new MutationObserver(() => {
      if (burst.classList.contains('is-active')) {
        log.push({
          value: burst.querySelector('[data-burst-value]')?.textContent,
          hi: burst.classList.contains('is-hi'),
        });
      }
    });
    obs.observe(burst, { attributes: true, attributeFilter: ['class'] });
    // Fire 3 lightning events spaced out so each burst has time to play
    bus.emit('spin:lightning', { value: 2 });
    await new Promise((r) => setTimeout(r, 1500));
    bus.emit('spin:lightning', { value: 5 });
    await new Promise((r) => setTimeout(r, 1500));
    bus.emit('spin:lightning', { value: 10 });
    await new Promise((r) => setTimeout(r, 1500));
    obs.disconnect();
    return { log };
  });

  console.log('Burst sequence:', JSON.stringify(result, null, 2));
  expect((result as any).log, 'burst activated 3 times').toBeTruthy();
  expect((result as any).log.length).toBe(3);
  expect((result as any).log[0].value).toBe('2×');
  expect((result as any).log[0].hi).toBe(false);
  expect((result as any).log[1].value).toBe('5×');
  expect((result as any).log[1].hi).toBe(true);
  expect((result as any).log[2].value).toBe('10×');
  expect((result as any).log[2].hi).toBe(true);
});
