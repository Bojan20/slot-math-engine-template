/**
 * W215 Faza 800.2 Agent C — blog content validation.
 *
 * Validates frontmatter, structure and read-time estimate consistency
 * for every blog post under web/marketing/blog/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', 'web', 'marketing', 'blog');

const POSTS = [
  'blog-1-closed-form-rtp',
  'blog-2-rng-cert-pitfalls',
  'blog-3-megaways-implementation',
  'blog-4-volatility-tuning',
];

function readMd(slug: string): string {
  return readFileSync(resolve(ROOT, `${slug}.md`), 'utf-8');
}
function readHtml(slug: string): string {
  return readFileSync(resolve(ROOT, `${slug}.html`), 'utf-8');
}

function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k && !k.startsWith('-')) out[k] = v;
  }
  return out;
}

function estimateReadingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

describe('blog — files exist + index lists every post', () => {
  for (const slug of POSTS) {
    it(`${slug}.md and ${slug}.html exist`, () => {
      expect(existsSync(resolve(ROOT, `${slug}.md`))).toBe(true);
      expect(existsSync(resolve(ROOT, `${slug}.html`))).toBe(true);
    });
  }
  it('blog/index.html lists every post', () => {
    const idx = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
    for (const slug of POSTS) expect(idx).toContain(`${slug}.html`);
  });
});

describe('blog — frontmatter completeness', () => {
  for (const slug of POSTS) {
    it(`${slug}.md has title + slug + publishDate + tags + excerpt + readingTimeMinutes`, () => {
      const fm = parseFrontmatter(readMd(slug));
      for (const key of ['title', 'slug', 'publishDate', 'tags', 'excerpt', 'readingTimeMinutes']) {
        expect(Object.keys(fm)).toContain(key);
      }
    });
  }
});

describe('blog — reading time estimate sanity', () => {
  for (const slug of POSTS) {
    it(`${slug}.md declared readingTime matches text within ±2 min`, () => {
      const md = readMd(slug);
      const fm = parseFrontmatter(md);
      const declared = Number(fm.readingTimeMinutes);
      const body = md.replace(/^---[\s\S]*?---\n?/, '');
      const computed = estimateReadingTime(body);
      expect(Math.abs(declared - computed)).toBeLessThanOrEqual(2);
    });
  }
});

describe('blog — HTML has required structure', () => {
  for (const slug of POSTS) {
    it(`${slug}.html has <title>, <h1>, JSON-LD BlogPosting`, () => {
      const html = readHtml(slug);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).toMatch(/<h1[\s>][\s\S]*?<\/h1>/);
      expect(html).toContain('"@type": "BlogPosting"');
    });
  }
});
