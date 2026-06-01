// LIVE DEMO — Boki QA verification of GDD → playable slot one-click flow.
// Run headed so Boki can watch:
//   npx playwright test gdd-live-demo --headed --project=chromium
// Screenshots land in reports/playwright/qa-gdd-live-demo/.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'reports',
  'playwright',
  'qa-gdd-live-demo',
);

const REPORT_PATH = path.join(SHOT_DIR, 'report.json');

fs.mkdirSync(SHOT_DIR, { recursive: true });

interface Step {
  step: number;
  label: string;
  shot: string;
  durationMs: number;
  notes?: string;
}

const steps: Step[] = [];

async function snap(page: any, n: number, label: string, started: number, notes?: string) {
  const shotName = `${String(n).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  const full = path.join(SHOT_DIR, shotName);
  await page.screenshot({ path: full, fullPage: true });
  steps.push({
    step: n,
    label,
    shot: shotName,
    durationMs: Date.now() - started,
    notes,
  });

  console.log(`[step ${n}] ${label} — ${shotName} (${Date.now() - started}ms)`);
}

test('LIVE — GDD upload → review → generate → playable slot (full screenshot trail)', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  const t0 = Date.now();

  // STEP 1 — Open studio.
  await page.goto('/');
  await page.waitForSelector('#tab-build', { timeout: 15_000 });
  await snap(page, 1, 'studio-loaded', t0, 'Build tab visible — empty workspace shell');

  // STEP 2 — Confirm GDD file input is present.
  const fileInput = page.locator('#gdd-file-input');
  await expect(fileInput).toBeAttached();
  await snap(page, 2, 'pre-upload', t0, 'Hidden file input attached, ready for setInputFiles');

  // STEP 3 — Upload Dragon Spin GDD sample.
  const samplePath = path.resolve(__dirname, '..', 'gdd-samples', 'dragon-spin.json');
  await fileInput.setInputFiles(samplePath);
  await page.waitForTimeout(500);
  await snap(page, 3, 'gdd-uploaded', t0, 'setInputFiles fired — modal opens via change handler');

  // STEP 4 — Review modal appears.
  const reviewModal = page.locator('#gdd-review');
  await expect(reviewModal).toBeVisible({ timeout: 15_000 });
  const overallTxt = (await page.locator('#gdd-overall').textContent()) ?? '';
  const pct = parseInt(overallTxt.replace(/[^0-9]/g, ''), 10) || 0;
  await snap(page, 4, 'review-modal-open', t0, `Confidence pill: ${overallTxt.trim()} (parsed ${pct}%)`);

  // STEP 5 — Set up popup listener BEFORE Generate, then click.
  const popupPromise = context.waitForEvent('page', { timeout: 25_000 });
  await page.locator('#gdd-generate').click();
  await expect(reviewModal).toBeHidden({ timeout: 8_000 });
  await snap(page, 5, 'post-generate-workspace', t0, 'Modal closed, new workspace pill should appear');

  // STEP 6 — New tab with playable slot.
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  await popup.waitForTimeout(1500);
  await snap(popup, 6, 'playable-slot-loaded', t0, 'Play Template tab DOMContentLoaded');

  // STEP 7 — Verify slot UI actually rendered (canvas/stage/IR inline).
  const evidence = await popup.evaluate(() => {
    return {
      hasInlineIr: !!document.getElementById('inline-ir'),
      hasStage: !!document.querySelector('[data-role="runner-stage"]'),
      hasCanvas: !!document.querySelector('canvas'),
      title: document.title,
      bodyChildren: document.body?.children.length || 0,
    };
  });
  await snap(popup, 7, 'slot-rendered-evidence', t0, JSON.stringify(evidence));

  expect(evidence.hasInlineIr || evidence.hasStage || evidence.hasCanvas).toBe(true);

  // STEP 8 — Try a SPIN if a spin button exists (native DOM, no PW selector ext).
  const spinFound = await popup.evaluate(() => {
    const cssCandidates = [
      'button[data-role="spin"]',
      'button#spin',
      'button.spin',
      '[data-role="spin-btn"]',
    ];
    for (const sel of cssCandidates) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) { el.click(); return { matched: sel, mode: 'css' }; }
    }
    const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const spinBtn = btns.find(b => /spin/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
    if (spinBtn) { spinBtn.click(); return { matched: 'button-text-match', mode: 'text', label: (spinBtn.textContent || '').trim() }; }
    return null;
  });
  if (spinFound) {
    await popup.waitForTimeout(2500);
    await snap(popup, 8, 'after-spin-click', t0, `Spin clicked via ${JSON.stringify(spinFound)}`);
  } else {
    await snap(popup, 8, 'no-spin-button-found', t0, 'No spin button matched any selector');
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    totalMs: Date.now() - t0,
    sample: 'dragon-spin.json',
    steps,
    evidence,
  }, null, 2));
});
