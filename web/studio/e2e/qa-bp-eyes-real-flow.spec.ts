// CORTEX EYES: stvarni user flow Boki vidi.  Klika po app-u, snima
// svaki korak, registruje SVE konzole + DOM stanje pre i posle X klika.
// Cilj: dokazati da X DA li ili NE radi — bez sintetičkih hack-ova.

import { test } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-bp-eyes-real');
mkdirSync(SHOT_DIR, { recursive: true });

test('CORTEX eyes: real user flow on bottom drawer X', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/01-fresh-load.png`, fullPage: true });

  // Step 1: Open the drawer via header layout-toggle button
  console.log('STEP 1: clicking #btn-toggle-panel (header)');
  await page.locator('#btn-toggle-panel').click({ force: true });
  await page.waitForTimeout(300);
  const afterOpen = await page.evaluate(() => {
    const bp = document.getElementById('bottom-panel');
    const close = document.getElementById('bp-close');
    return {
      bpHidden: bp?.hasAttribute('hidden'),
      bpDisplay: bp ? getComputedStyle(bp).display : null,
      closeExists: !!close,
      closeVisible: close ? (close.getBoundingClientRect().width > 0 && close.getBoundingClientRect().height > 0) : false,
      closePtrEvents: close ? getComputedStyle(close).pointerEvents : null,
      closeZ: close ? getComputedStyle(close).zIndex : null,
      closeBBox: close ? close.getBoundingClientRect() : null,
    };
  });
  console.log('  state after open:', JSON.stringify(afterOpen, null, 2));
  await page.screenshot({ path: `${SHOT_DIR}/02-drawer-open.png`, fullPage: true });

  // Step 2: Try the X click directly via Playwright's pointer simulation
  console.log('STEP 2: clicking #bp-close — Playwright click');
  const xLocator = page.locator('#bp-close');
  const exists = await xLocator.count();
  console.log(`  #bp-close exists: ${exists}`);

  // Click via different strategies — each tested independently
  try {
    await xLocator.click({ timeout: 3000 });
    console.log('  ✓ Playwright .click() succeeded');
  } catch (e) {
    console.log(`  ✗ Playwright .click() failed: ${(e as Error).message.slice(0, 200)}`);
  }
  await page.waitForTimeout(300);

  const afterClick = await page.evaluate(() => {
    const bp = document.getElementById('bottom-panel');
    return { bpHidden: bp?.hasAttribute('hidden') };
  });
  console.log(`  AFTER X CLICK: bp-hidden=${afterClick.bpHidden}`);
  await page.screenshot({ path: `${SHOT_DIR}/03-after-x-click.png`, fullPage: true });

  // Step 3: Try dispatching a native click event directly on the button
  if (!afterClick.bpHidden) {
    console.log('STEP 3: X did NOT close — trying native dispatchEvent');
    await page.evaluate(() => {
      const btn = document.getElementById('bp-close');
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(300);
    const afterDispatch = await page.evaluate(() => {
      const bp = document.getElementById('bottom-panel');
      return { bpHidden: bp?.hasAttribute('hidden') };
    });
    console.log(`  AFTER dispatchEvent: bp-hidden=${afterDispatch.bpHidden}`);
  }

  // Step 4: Inspect what's intercepting clicks on the X position
  const interception = await page.evaluate(() => {
    const btn = document.getElementById('bp-close');
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      target: btn.outerHTML.slice(0, 200),
      topAtPoint: top ? top.outerHTML.slice(0, 200) : null,
      sameAsTarget: top === btn,
      pointInside: rect.width > 0 && rect.height > 0,
    };
  });
  console.log('STEP 4: elementFromPoint at X center:');
  console.log(`  target:      ${interception?.target}`);
  console.log(`  top-at-pt:   ${interception?.topAtPoint}`);
  console.log(`  same:        ${interception?.sameAsTarget}`);

  // Step 5: Tabs — click MC tab, verify pane switches
  console.log('STEP 5: clicking MC tab');
  await page.locator('.bp-tab[data-bp="mc"]').click({ force: true });
  await page.waitForTimeout(200);
  const afterMcTab = await page.evaluate(() => {
    const activity = document.getElementById('bp-pane-activity');
    const mc = document.getElementById('bp-pane-mc');
    const ci = document.getElementById('bp-pane-ci');
    return {
      activityHidden: activity?.hasAttribute('hidden'),
      mcHidden: mc?.hasAttribute('hidden'),
      ciHidden: ci?.hasAttribute('hidden'),
      mcTabActive: document.querySelector('.bp-tab[data-bp="mc"]')?.classList.contains('is-active'),
    };
  });
  console.log('  tab state:', JSON.stringify(afterMcTab));

  // Dump all console messages for diagnosis
  console.log('\n=== ALL CONSOLE MESSAGES ===');
  for (const l of logs.slice(0, 40)) console.log('  ' + l);

  await page.screenshot({ path: `${SHOT_DIR}/04-final.png`, fullPage: true });
  console.log(`\n📁 ${SHOT_DIR}`);
});
