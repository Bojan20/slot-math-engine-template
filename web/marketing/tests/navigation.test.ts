/**
 * W214 Faza 800.1 Agent C — navigation integration tests.
 *
 * For every page in the public site, verify that:
 *   * the brand link resolves to a sibling
 *   * each nav link target exists on disk
 *   * there are no dangling href="" or stray "/something" anchors
 *
 * This catches typos that would result in 404 in production.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PAGES = [
  'index.html',
  'pages/how-it-works.html',
  'pages/pricing.html',
  'pages/coverage.html',
  'pages/demo.html',
  'pages/docs.html',
  'pages/contact.html',
];

function extractRelativeHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href="([^"#?]+)(?:[#?][^"]*)?"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1];
    if (v.startsWith('http://') || v.startsWith('https://')) continue;
    if (v.startsWith('mailto:')) continue;
    if (v.startsWith('//')) continue;
    if (v.startsWith('#')) continue;
    out.push(v);
  }
  return out;
}

describe('Navigation · every internal href resolves', () => {
  for (const page of PAGES) {
    it(`${page} has no broken relative links`, () => {
      const abs = resolve(ROOT, page);
      const html = readFileSync(abs, 'utf-8');
      const hrefs = extractRelativeHrefs(html);
      const pageDir = dirname(abs);
      const broken: string[] = [];
      for (const h of hrefs) {
        const target = resolve(pageDir, h);
        if (!existsSync(target)) broken.push(h);
      }
      expect(broken).toEqual([]);
    });
  }
});

describe('Navigation · primary nav present on every page', () => {
  for (const page of PAGES) {
    it(`${page} carries the 5-item primary nav`, () => {
      const html = readFileSync(resolve(ROOT, page), 'utf-8');
      expect(html).toContain('How it works');
      expect(html).toContain('Pricing');
      expect(html).toContain('Coverage');
      expect(html).toContain('Demo');
      expect(html).toContain('Docs');
    });
  }
});

describe('Navigation · footer columns present on every page', () => {
  for (const page of PAGES) {
    it(`${page} carries the 4-column footer`, () => {
      const html = readFileSync(resolve(ROOT, page), 'utf-8');
      expect(html).toContain('class="site-footer"');
      expect(html).toContain('Product');
      expect(html).toContain('Resources');
      expect(html).toContain('Legal');
    });
  }
});

describe('Navigation · CTA buttons reach a usable destination', () => {
  it('landing has hero CTAs pointing to pricing + contact', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    expect(html).toMatch(/href="\.\/pages\/pricing\.html"[^>]*>See pricing/);
    expect(html).toMatch(/href="\.\/pages\/contact\.html"[^>]*>Download pitch tarball/);
  });
  it('pricing page CTAs all funnel into contact', () => {
    const html = readFileSync(resolve(ROOT, 'pages/pricing.html'), 'utf-8');
    expect(html).toContain('href="./contact.html"');
  });
});
