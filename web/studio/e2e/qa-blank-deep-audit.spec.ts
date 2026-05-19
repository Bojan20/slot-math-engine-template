// QA: DEEP audit — find every visible numeric value on cold start.
// Boki: "ne zelim da mi se vide vrednosti RTP i ostale, dok ne ubacim
// gdd math ili sam ne podesim vrednosti, do tada mora svaki parametar
// da bude - - prazan."

import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../../../reports/playwright/qa-blank-deep-audit');
mkdirSync(SHOT_DIR, { recursive: true });

test('Blank cold-start: dump every visible number / value across the shell', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (_) {}
    try { indexedDB.deleteDatabase('studio-automc'); } catch (_) {}
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT_DIR}/01-cold-start-full.png`, fullPage: true });

  // Walk every element with mono / numeric text and report what's NOT a dash
  const leaks = await page.evaluate(() => {
    // Heuristic: anything visible that looks like a placeholder number
    // (e.g. 95.42% / 6.42 / 245.5× / +1.82 / 27.83 / etc.) on cold start.
    const out: Array<{ sel: string; text: string; visible: boolean }> = [];
    // Common selectors that historically carried fake numbers
    const targets = [
      '#l1-rtp', '#l1-hit', '#l1-sigma', '#l1-p99', '#l1-vola',
      '#m-mu', '#m-sigma', '#m-skew', '#m-kurt', '#m-p99',
      '#rail-rtp-big', '#rail-rtp-delta',
      '#prod-days', '#prod-saved',
      '#winfeel-pill', '#winfeel-pill-big',
      '#ctx-irname', '#ctx-layout',
      '#status-variant',
      '#t-track',
      '#pool-count',
      '#my-icons-count',
    ];
    const NUMERIC_RE = /-?\d+(?:[.,]\d+)?/;
    const ALL_DASH_RE = /^[—\-\s%×]+$/;
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0
        && getComputedStyle(el as HTMLElement).visibility !== 'hidden'
        && getComputedStyle(el as HTMLElement).display !== 'none';
      const txt = ((el as HTMLElement).textContent || '').trim();
      const hasNumber = NUMERIC_RE.test(txt) && !ALL_DASH_RE.test(txt);
      if (hasNumber && visible) {
        out.push({ sel, text: txt, visible });
      }
    }
    // Also scan any visible .mono / .rt / .v-val / .w-val elements
    const moreSelectors = ['.mono', '.rt', '.w-val', '.v-val', '.var-tab-rtp', '.t-it', '.bp-mc-row b', '.rail-pair-cell b', '.rail-mini-row b', '.winfeel-stats b'];
    for (const ms of moreSelectors) {
      document.querySelectorAll(ms).forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        const visible = rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        if (!visible) return;
        // Walk up — is any ancestor hidden?
        let anc = (el as HTMLElement).parentElement;
        let ancHidden = false;
        while (anc) {
          const acs = getComputedStyle(anc);
          if (acs.display === 'none' || acs.visibility === 'hidden') { ancHidden = true; break; }
          if (anc.hasAttribute('hidden')) { ancHidden = true; break; }
          anc = anc.parentElement;
        }
        if (ancHidden) return;
        const txt = ((el as HTMLElement).textContent || '').trim();
        if (txt.length === 0) return;
        const hasNumber = NUMERIC_RE.test(txt) && !ALL_DASH_RE.test(txt);
        if (hasNumber) {
          // Build a stable selector hint
          const idHint = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
          const classHint = (el as HTMLElement).className && typeof (el as HTMLElement).className === 'string'
            ? '.' + (el as HTMLElement).className.split(' ').filter(Boolean).slice(0, 2).join('.')
            : '';
          out.push({ sel: idHint || classHint || ms, text: txt, visible: true });
        }
      });
    }
    // Dedupe by (sel, text)
    const seen = new Set<string>();
    return out.filter((r) => {
      const k = `${r.sel}|${r.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

  console.log(`\n  Found ${leaks.length} visible numeric leak(s) on cold start:`);
  for (const l of leaks.slice(0, 50)) {
    console.log(`    ${l.sel.padEnd(30)} → "${l.text}"`);
  }

  // Save findings to file for follow-up fixing
  const findings = JSON.stringify(leaks, null, 2);
  await page.evaluate((j) => { (window as any).__leaks__ = j; }, findings);
});
