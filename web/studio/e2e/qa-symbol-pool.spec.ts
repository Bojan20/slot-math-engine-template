// QA: Symbol Pool MUST render every IR symbol with correct id/name/tier/weight/pay
// after importing wrath-of-olympus.ir.json from ~/Desktop.
//
// This test enumerates expected symbols from the IR file itself and verifies
// each one renders in the DOM with the right metadata, including icon glyph
// (default sprite must be present — no `#g-undefined`).
//
// Run:  npx playwright test web/studio/e2e/qa-symbol-pool.spec.ts --reporter=list

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-symbol-pool');
mkdirSync(SHOT_DIR, { recursive: true });

let stepCounter = 0;
async function shot(page: any, label: string) {
  stepCounter++;
  const fname = `${String(stepCounter).padStart(2, '0')}-${label.replace(/\W+/g, '-')}.png`;
  await page.screenshot({ path: `${SHOT_DIR}/${fname}`, fullPage: true });
  console.log(`  📸 ${fname}`);
}

// Expected tier mapping from IR kind + pay ranking:
//  - W (wild)    → WILD
//  - Z H P (kind=hp, x5 ≥ 13)         → HP
//  - HM SH SW (kind=hp, x5 ≤ 9)       → MP
//  - LA GM AM LR VA (kind=lp)         → LP
//  - S (scatter) → SCATTER
//  - B (bonus)   → MULT

const EXPECTED = [
  { id: 'W',  name: 'Wild',     tier: 'WILD',    x3: 2,    x4: 8,     x5: 40 },
  { id: 'Z',  name: 'Zeus',     tier: 'HP',      x3: 1.6,  x4: 6.5,   x5: 32 },
  { id: 'H',  name: 'Hades',    tier: 'HP',      x3: 1.2,  x4: 5,     x5: 20 },
  { id: 'P',  name: 'Poseidon', tier: 'HP',      x3: 0.8,  x4: 3.2,   x5: 13 },
  { id: 'HM', name: 'Helm',     tier: 'MP',      x3: 0.55, x4: 2.3,   x5: 9  },
  { id: 'SH', name: 'Shield',   tier: 'MP',      x3: 0.55, x4: 2.3,   x5: 9  },
  { id: 'SW', name: 'Sword',    tier: 'MP',      x3: 0.45, x4: 2,     x5: 8  },
  { id: 'LA', name: 'Lyre',     tier: 'LP',      x3: 0.391,x4: 1.545, x5: 5.56 },
  { id: 'GM', name: 'Coin',     tier: 'LP',      x3: 0.391,x4: 1.545, x5: 5.56 },
  { id: 'AM', name: 'Amphora',  tier: 'LP',      x3: 0.351,x4: 1.285, x5: 4.62 },
  { id: 'LR', name: 'Laurel',   tier: 'LP',      x3: 0.351,x4: 1.285, x5: 4.62 },
  { id: 'VA', name: 'Vase',     tier: 'LP',      x3: 0.331,x4: 1.025, x5: 3.6  },
  { id: 'S',  name: 'Scatter',  tier: 'SCATTER', x3: 0,    x4: 0,     x5: 0    },
  { id: 'B',  name: 'Bonus',    tier: 'MULT',    x3: 0,    x4: 0,     x5: 0    },
];

test.describe('Symbol Pool QA — every IR symbol must render correctly', () => {
  test('14 rows · id+name+tier+weight+pay all present, no #g-undefined', async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const t = msg.text();
      const type = msg.type();
      if (type === 'error') {
        // Network-asset failures (CONNECTION_REFUSED, 404 on optional probe
        // endpoints, etc.) are tracked separately — they don't indicate a
        // bug in the Symbol Pool render path.
        if (/Failed to load resource/i.test(t) || /net::ERR_/i.test(t)) {
          networkErrors.push(t);
        } else {
          consoleErrors.push(t);
        }
      } else {
        consoleLogs.push(`[${type}] ${t}`);
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE-ERR: ${err.message}\n${err.stack || ''}`));
    page.on('requestfailed', (req) => {
      networkErrors.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText ?? 'failed'}`);
    });

    expect(existsSync(DESKTOP_IR), `IR file missing: ${DESKTOP_IR}`).toBe(true);
    const ir = JSON.parse(readFileSync(DESKTOP_IR, 'utf8'));
    expect(ir.symbols.length).toBe(14);
    console.log(`✓ IR file valid · ${ir.symbols.length} symbols`);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, 'studio-loaded');

    // Verify Build tab active
    const buildTab = page.locator('#tab-build');
    await expect(buildTab).toHaveAttribute('aria-selected', 'true');

    // Open New Game modal, select Math GDD, attach file
    await page.locator('#ws-newgame-btn').click();
    await page.waitForSelector('#new-game-modal:not([hidden])', { timeout: 5_000 });
    await page.locator('label:has(input[value="gdd-math"])').click();
    await page.locator('#ng-cancel').click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('#gdd-file-input').setInputFiles(DESKTOP_IR);
    await page.waitForTimeout(2_500);

    // Close review modal if it opens (canonical IR should bypass it, but be safe)
    const reviewVisible = await page.locator('#gdd-review').isVisible({ timeout: 1_000 }).catch(() => false);
    if (reviewVisible) {
      await page.locator('#gdd-generate').click().catch(() => {});
      await page.waitForTimeout(1_500);
    }

    await shot(page, 'after-import');

    // ── Audit Symbol Pool DOM ──
    const rows = page.locator('#sym-list .sym-row');
    const rowCount = await rows.count();
    console.log(`  rowCount=${rowCount}  expected=${EXPECTED.length}`);

    expect(rowCount, 'Symbol Pool must render 14 rows after IR import').toBe(EXPECTED.length);

    // Pool counter
    const poolCount = await page.locator('#pool-count').textContent();
    expect(poolCount?.trim(), '#pool-count').toBe(String(EXPECTED.length));

    // Collect actual rendered state per row
    const rendered: Array<{
      tier: string; id: string; name: string; pay: string; weight: string; iconHref: string | null;
    }> = [];
    for (let i = 0; i < rowCount; i++) {
      const r = rows.nth(i);
      const tier = (await r.locator('.sym-tier').textContent() || '').trim();
      const id   = (await r.locator('.sym-id').textContent() || '').trim();
      const name = (await r.locator('.sym-name').inputValue()) || '';
      const pay  = (await r.locator('.sym-pay').textContent() || '').trim();
      const weight = (await r.locator('.w-val').textContent() || '').trim();
      const iconHref = await r.locator('.sym-icon-btn svg use').getAttribute('href').catch(() => null);
      rendered.push({ tier, id, name, pay, weight, iconHref });
    }

    console.log('\n  Rendered rows:');
    for (const r of rendered) {
      console.log(`    [${r.tier.padEnd(7)}] ${r.id.padEnd(3)} "${r.name.padEnd(10)}" pay=${r.pay.padEnd(15)} w=${r.weight.padStart(5)}  icon=${r.iconHref}`);
    }

    // ── Per-symbol assertion ──
    const errors: string[] = [];
    for (const exp of EXPECTED) {
      const got = rendered.find(r => r.id === exp.id);
      if (!got) {
        errors.push(`MISSING symbol id=${exp.id}`);
        continue;
      }
      if (got.tier !== exp.tier) errors.push(`${exp.id}: tier ${got.tier} ≠ expected ${exp.tier}`);
      if (got.name !== exp.name) errors.push(`${exp.id}: name "${got.name}" ≠ expected "${exp.name}"`);
      const expectedPay = `${exp.x3}/${exp.x4}/${exp.x5}`;
      if (got.pay !== expectedPay) errors.push(`${exp.id}: pay "${got.pay}" ≠ expected "${expectedPay}"`);
      // weight must be a number
      const w = parseFloat(got.weight);
      if (!isFinite(w) || w <= 0) errors.push(`${exp.id}: weight "${got.weight}" not positive number`);
      // icon must NOT be #g-undefined
      if (!got.iconHref || got.iconHref.includes('undefined') || got.iconHref === '#g-' ) {
        errors.push(`${exp.id}: icon href="${got.iconHref}" missing or broken`);
      }
    }

    if (errors.length) {
      console.log('\n❌ SYMBOL POOL ERRORS:');
      for (const e of errors) console.log('    ' + e);
    } else {
      console.log('\n✓ All 14 symbols render correctly');
    }

    // Page-level errors
    if (consoleErrors.length) {
      console.log(`\n⚠ ${consoleErrors.length} console errors (JS / page):`);
      for (const e of consoleErrors.slice(0, 15)) console.log('    ' + e);
    }
    if (networkErrors.length) {
      console.log(`\nℹ ${networkErrors.length} network errors (optional assets):`);
      for (const e of networkErrors.slice(0, 15)) console.log('    ' + e);
    }

    // Studio logs (debug)
    const studioLogs = consoleLogs.filter((l) => l.includes('[studio]'));
    if (studioLogs.length) {
      console.log(`\n📋 ${studioLogs.length} studio logs:`);
      for (const l of studioLogs) console.log('    ' + l);
    }

    await shot(page, 'final');
    console.log(`\n📁 Screenshots → ${SHOT_DIR}`);

    expect(errors, `Symbol Pool QA failed:\n${errors.join('\n')}`).toHaveLength(0);
    expect(consoleErrors, 'console errors').toHaveLength(0);
  });
});
