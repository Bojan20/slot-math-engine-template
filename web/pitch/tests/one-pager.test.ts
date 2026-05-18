/**
 * W213 Agent B — One-pager HTML structure tests.
 *
 * Asserts that docs/outreach/one-pager.html is offline-self-contained,
 * has the 4 quadrant structure, hero headline, contact CTA, verification
 * block, and is print-friendly via @media print CSS.
 *
 * Pure string assertions on the HTML — no DOM library required, runs in
 * vitest's default Node environment.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const ONE_PAGER = resolve(REPO_ROOT, 'docs', 'outreach', 'one-pager.html');

async function readOnePager(): Promise<string> {
  return await fs.readFile(ONE_PAGER, 'utf8');
}

describe('one-pager · HTML structure', () => {
  it('is a valid HTML5 document with charset utf-8', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/<meta charset="utf-8"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('has a viewport meta for mobile rendering', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/viewport.*width=device-width/);
  });

  it('contains the hero headline with the 14-day pitch', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/14 days/);
    expect(html).toMatch(/lab-cert/);
  });

  it('contains the 4 quadrants with stable IDs', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/id="q-numbers"/);
    expect(html).toMatch(/id="q-diff"/);
    expect(html).toMatch(/id="q-labs"/);
    expect(html).toMatch(/id="q-pilot"/);
  });
});

describe('one-pager · numbers quadrant', () => {
  it('mentions the 77 closed-form solvers headline metric', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/77/);
    expect(html).toMatch(/Closed-form solvers/i);
  });

  it('mentions the 16/16 L&W mechanic gap closure', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/16 ?\/ ?16/);
  });

  it('mentions the +\\$33M five-year NPV anchor', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/\$33M/);
  });

  it('mentions the 7,400+ vitest specs', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/7,?400/);
  });
});

describe('one-pager · labs matrix', () => {
  it('lists all four cert labs with adapter "Plugged" status', async () => {
    const html = await readOnePager();
    for (const lab of ['BMM', 'GLI', 'eCOGRA', 'NMi']) {
      expect(html).toContain(lab);
    }
    const pluggedCount = (html.match(/Plugged/g) ?? []).length;
    expect(pluggedCount).toBeGreaterThanOrEqual(4);
  });
});

describe('one-pager · pilot path', () => {
  it('lists Day 7 / Day 14 / Day 30 milestones', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/Day 7/);
    expect(html).toMatch(/Day 14/);
    expect(html).toMatch(/Day 30/);
  });
});

describe('one-pager · CTA / contact block', () => {
  it('has the contact footer with sender placeholders', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/id="contact-block"/);
    expect(html).toMatch(/\{\{sender_name\}\}/);
    expect(html).toMatch(/\{\{sender_email\}\}/);
    expect(html).toMatch(/\{\{tarball_link\}\}/);
  });

  it('has the verify-yourself code block with 3+ shell commands', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/id="verify-block"/);
    expect(html).toMatch(/curl/);
    expect(html).toMatch(/verify\.mjs/);
    expect(html).toMatch(/closed-form-portfolio/);
  });
});

describe('one-pager · offline self-contained', () => {
  it('has no external script src', async () => {
    const html = await readOnePager();
    const externalScripts = html.match(/<script[^>]*src=/g) ?? [];
    expect(externalScripts.length).toBe(0);
  });

  it('has no external stylesheet link', async () => {
    const html = await readOnePager();
    const externalCss = html.match(/<link[^>]*stylesheet/g) ?? [];
    expect(externalCss.length).toBe(0);
  });

  it('has no Google Fonts / CDN references', async () => {
    const html = await readOnePager();
    expect(html).not.toMatch(/fonts\.googleapis/);
    expect(html).not.toMatch(/cdn\./i);
    expect(html).not.toMatch(/unpkg\./);
    expect(html).not.toMatch(/jsdelivr/);
  });

  it('uses system font stack for offline reliability', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/-apple-system|BlinkMacSystemFont|Segoe UI|Helvetica/);
  });
});

describe('one-pager · print-CSS for PDF export', () => {
  it('contains @media print rules', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/@media print/);
  });

  it('declares @page size for PDF rendering', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/@page/);
    expect(html).toMatch(/A4|letter/i);
  });
});

describe('one-pager · why-now narrative', () => {
  it('contains the why-now paragraph anchor', async () => {
    const html = await readOnePager();
    expect(html).toMatch(/id="why-now"/);
    expect(html).toMatch(/Why now/i);
  });
});
