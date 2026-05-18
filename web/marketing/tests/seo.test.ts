/**
 * W214 Faza 800.1 Agent C — SEO meta + structured data tests.
 *
 * Verifies that every HTML page declares the canonical SEO surface area:
 * <title>, <meta description>, canonical link, OG tags, twitter:card,
 * and that the landing page carries the JSON-LD Organization + Product
 * payload. Robots.txt and sitemap.xml shape are also sanity-checked.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

describe('SEO · every page has core meta', () => {
  for (const p of PAGES) {
    it(`${p} declares <title>, description, canonical`, () => {
      const html = read(p);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).toMatch(/<meta name="description" content="[^"]+"/);
      expect(html).toMatch(/<link rel="canonical"/);
    });
  }
});

describe('SEO · Open Graph + Twitter Card', () => {
  for (const p of PAGES) {
    it(`${p} declares OG title + description`, () => {
      const html = read(p);
      expect(html).toMatch(/property="og:title"/);
      expect(html).toMatch(/property="og:description"/);
    });
    it(`${p} declares a twitter:card`, () => {
      expect(read(p)).toMatch(/name="twitter:card"/);
    });
  }
});

describe('SEO · JSON-LD structured data', () => {
  it('landing page embeds Organization + Product JSON-LD', () => {
    const html = read('index.html');
    expect(html).toMatch(/<script type="application\/ld\+json">/);
    expect(html).toContain('"@type": "Organization"');
    expect(html).toContain('"@type": "Product"');
  });
  it('Product JSON-LD lists all three tier offers', () => {
    const html = read('index.html');
    expect(html).toContain('"name": "Indie"');
    expect(html).toContain('"name": "Platform"');
    expect(html).toContain('"name": "Enterprise"');
  });
});

describe('SEO · sitemap.xml and robots.txt', () => {
  it('sitemap.xml lists every page', () => {
    const xml = read('sitemap.xml');
    for (const p of PAGES) {
      const slug = p === 'index.html' ? '/' : '/' + p;
      expect(xml).toContain(slug);
    }
  });
  it('robots.txt allows everything + cites the sitemap', () => {
    const txt = read('robots.txt');
    expect(txt).toMatch(/^User-agent: \*/m);
    expect(txt).toMatch(/^Allow: \//m);
    expect(txt).toMatch(/^Sitemap:/m);
  });
});

describe('SEO · no external scripts (privacy-first)', () => {
  for (const p of PAGES) {
    it(`${p} loads zero CDN assets`, () => {
      const html = read(p);
      // Allow https only in href values like canonical / OG meta /
      // structured data. Block any <script src="http..."> or
      // <link rel="stylesheet" href="http...">.
      const scriptSrc = /<script[^>]*\bsrc=["']https?:\/\//i;
      const linkExt = /<link[^>]*rel=["']stylesheet["'][^>]*\bhref=["']https?:\/\//i;
      expect(scriptSrc.test(html)).toBe(false);
      expect(linkExt.test(html)).toBe(false);
    });
  }
});
