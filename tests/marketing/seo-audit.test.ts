/**
 * W215 Faza 800.2 Agent C — SEO audit unit tests.
 *
 * Drives the validator functions exported by scripts/marketing/seo-audit.mjs
 * with hand-crafted HTML fixtures so the test never touches the real
 * marketing site.
 */

import { describe, it, expect } from 'vitest';
// @ts-expect-error vanilla ESM JS imported into TS test
import {
  extractTitle,
  extractMetaDescription,
  extractCanonical,
  extractOgImage,
  countH1,
  imgsWithoutAlt,
  jsonLdValidity,
  extractRelativeLinks,
  validatePage,
  toMarkdown,
  summarise,
} from '../../scripts/marketing/seo-audit.mjs';

const PASSING = `
  <html><head>
  <title>A nicely sized marketing page title — slot-math-engine</title>
  <meta name="description" content="${'a'.repeat(140)}" />
  <link rel="canonical" href="https://example.com/" />
  <meta property="og:image" content="/og.png" />
  <script type="application/ld+json">{"@type":"Article"}</script>
  </head>
  <body>
    <h1>Hello</h1>
    <img src="/ok.png" alt="ok" />
  </body></html>
`;

describe('extractTitle', () => {
  it('reads the title text', () => {
    expect(extractTitle('<title>Foo</title>')).toBe('Foo');
  });
  it('returns null when missing', () => {
    expect(extractTitle('<html></html>')).toBe(null);
  });
});

describe('extractMetaDescription', () => {
  it('reads the description content', () => {
    expect(extractMetaDescription('<meta name="description" content="hi" />')).toBe('hi');
  });
  it('null when missing', () => {
    expect(extractMetaDescription('<html></html>')).toBe(null);
  });
});

describe('extractCanonical / extractOgImage', () => {
  it('detects canonical', () => {
    expect(extractCanonical('<link rel="canonical" href="x" />')).toBe(true);
    expect(extractCanonical('<html></html>')).toBe(false);
  });
  it('detects og:image', () => {
    expect(extractOgImage('<meta property="og:image" content="x" />')).toBe(true);
    expect(extractOgImage('<html></html>')).toBe(false);
  });
});

describe('countH1', () => {
  it('counts h1 tags', () => {
    expect(countH1('<h1>a</h1><h1>b</h1>')).toBe(2);
    expect(countH1('<h2>a</h2>')).toBe(0);
  });
});

describe('imgsWithoutAlt', () => {
  it('catches missing alt', () => {
    expect(imgsWithoutAlt('<img src="x.png">')).toBe(1);
    expect(imgsWithoutAlt('<img src="x.png" alt="ok">')).toBe(0);
  });
});

describe('jsonLdValidity', () => {
  it('passes valid JSON-LD', () => {
    expect(jsonLdValidity('<script type="application/ld+json">{"a":1}</script>')).toEqual([]);
  });
  it('reports invalid JSON-LD', () => {
    const issues = jsonLdValidity('<script type="application/ld+json">{not json}</script>');
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('extractRelativeLinks', () => {
  it('returns relative hrefs and src only', () => {
    const html = '<a href="./pages/x.html"></a><a href="https://x.com"></a><img src="../img.png">';
    const links = extractRelativeLinks(html);
    expect(links).toEqual(expect.arrayContaining(['./pages/x.html', '../img.png']));
    expect(links).not.toContain('https://x.com');
  });
});

describe('validatePage', () => {
  it('full pass on a clean fixture (no link / sitemap check)', () => {
    const r = validatePage('test.html', PASSING, null, '/tmp', '/tmp/test.html');
    // Drop the link-resolves check since we passed a fake page file.
    const non = r.checks.filter((c: { name: string }) => c.name !== 'relative links resolve');
    expect(non.every((c: { pass: boolean }) => c.pass)).toBe(true);
  });
  it('flags short title', () => {
    const html = PASSING.replace(/<title>[^<]*<\/title>/, '<title>Short</title>');
    const r = validatePage('test.html', html, null, '/tmp', '/tmp/test.html');
    const titleCheck = r.checks.find((c: { name: string }) => c.name === 'title 30-60 chars');
    expect(titleCheck.pass).toBe(false);
  });
  it('flags missing canonical', () => {
    const html = PASSING.replace(/<link rel="canonical"[^>]*\/>/, '');
    const r = validatePage('test.html', html, null, '/tmp', '/tmp/test.html');
    const cur = r.checks.find((c: { name: string }) => c.name === 'canonical link');
    expect(cur.pass).toBe(false);
  });
});

describe('summarise / toMarkdown', () => {
  it('summarise reports counts', () => {
    const s = summarise([
      { page: 'a', checks: [], ok: true },
      { page: 'b', checks: [], ok: false },
    ]);
    expect(s).toEqual({ total: 2, passed: 1, failed: 1 });
  });
  it('toMarkdown emits a table', () => {
    const md = toMarkdown([
      { page: 'a', checks: [{ name: 'x', pass: true, detail: 'y' }], ok: true },
    ]);
    expect(md).toContain('# SEO Audit Report');
    expect(md).toContain('## a');
  });
});
