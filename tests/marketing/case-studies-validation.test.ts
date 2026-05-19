/**
 * W215 Faza 800.2 Agent C — case-study content validation.
 *
 * Asserts that each shipped case study has the structural sections
 * the marketing playbook requires (problem / solution / math / timeline
 * / results / lessons / quote with placeholder attribution).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', 'web', 'marketing', 'case-studies');

const CASE_STUDIES = [
  'case-study-1-multi-jurisdiction',
  'case-study-2-rapid-prototype',
  'case-study-3-cert-cost-reduction',
];

function readHtml(slug: string): string {
  const p = resolve(ROOT, `${slug}.html`);
  return readFileSync(p, 'utf-8');
}

function readMd(slug: string): string {
  const p = resolve(ROOT, `${slug}.md`);
  return readFileSync(p, 'utf-8');
}

describe('case studies — file existence', () => {
  for (const slug of CASE_STUDIES) {
    it(`${slug}.html exists`, () => {
      expect(existsSync(resolve(ROOT, `${slug}.html`))).toBe(true);
    });
    it(`${slug}.md exists`, () => {
      expect(existsSync(resolve(ROOT, `${slug}.md`))).toBe(true);
    });
  }
});

describe('case studies — markdown frontmatter', () => {
  for (const slug of CASE_STUDIES) {
    it(`${slug}.md has YAML frontmatter`, () => {
      const md = readMd(slug);
      expect(md.startsWith('---')).toBe(true);
      expect(md).toMatch(/title:/);
      expect(md).toMatch(/operator:/);
      expect(md).toMatch(/publishDate:/);
    });
  }
});

describe('case studies — required sections', () => {
  for (const slug of CASE_STUDIES) {
    it(`${slug}.html has Problem / Solution / Math / Timeline / Results / Lessons`, () => {
      const html = readHtml(slug).toLowerCase();
      expect(html).toContain('problem');
      expect(html).toContain('solution');
      expect(html).toContain('math model');
      expect(html).toContain('timeline');
      expect(html).toContain('results');
      expect(html).toContain('lessons');
    });
  }
});

describe('case studies — no real operator names', () => {
  // Defensive: clean-room labels only.
  const FORBIDDEN = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'Flutter', 'Entain'];
  for (const slug of CASE_STUDIES) {
    it(`${slug}.html uses only clean-room labels`, () => {
      const md = readMd(slug);
      const html = readHtml(slug);
      // body text only; ignore frontmatter / metadata
      for (const name of FORBIDDEN) {
        expect(md.toLowerCase()).not.toContain(name.toLowerCase());
        expect(html.toLowerCase()).not.toContain(name.toLowerCase());
      }
    });
  }
});

describe('case studies — quote attribution placeholder', () => {
  for (const slug of CASE_STUDIES) {
    it(`${slug}.html has <Role at Operator> placeholder quote`, () => {
      const html = readHtml(slug);
      expect(html).toMatch(/&lt;Role at Operator&gt;/);
    });
  }
});

describe('case studies — at least 3 concrete metrics', () => {
  for (const slug of CASE_STUDIES) {
    it(`${slug}.html has 3+ numeric metrics`, () => {
      const html = readHtml(slug);
      const numericMatches = html.match(/\b\d+(?:\.\d+)?\s*(?:%|days|weeks|months|K|hours)\b/gi) ?? [];
      expect(numericMatches.length).toBeGreaterThanOrEqual(3);
    });
  }
});
