/**
 * W215 — Tier-2 operator dossier markdown validators.
 *
 * Ensures every one of the 8 operator markdown files has the required
 * sections: snapshot / gap / coverage / decision-makers / hook / ROI /
 * compliance / CTA.
 *
 * Also enforces clean-room: no real-name strings (well-known executive
 * names are blacklisted as a sanity check).
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const TIER2_DIR = resolve(REPO_ROOT, 'docs', 'outreach', 'operators-tier2');

const OPERATOR_FILES = [
  'aristocrat.md', 'igt.md', 'konami.md', 'novomatic.md',
  'playtech.md', 'everi.md', 'ainsworth.md', 'ags.md',
];

const REQUIRED_SECTIONS = [
  /## Company snapshot/,
  /## Math model gap analysis/,
  /## Coverage assessment/,
  /## Decision-makers/,
  /## Outreach hook/,
  /## ROI ballpark/,
  /## Compliance fit/,
  /## Next-step CTA/,
];

/**
 * Sanity blacklist — a small sample of well-known real executive names
 * from these companies. If any appears, the clean-room invariant is
 * violated.
 */
const CLEAN_ROOM_BLACKLIST = [
  // Known historical Aristocrat / IGT executives (sample only)
  'Trevor Croker', 'Hamish McLennan', 'Vince Sadusky', 'Marco Sala',
  // Known Konami / Novomatic / Playtech executives (sample only)
  'Tom Jingoli', 'Harald Neumann', 'Mor Weizer',
  // Known Everi / Ainsworth / AGS executives (sample only)
  'Randy Taylor', 'Harald Friess', 'David Lopez',
];

describe('tier2 docs · file existence', () => {
  it('all 8 operator dossiers exist', async () => {
    for (const f of OPERATOR_FILES) {
      const p = resolve(TIER2_DIR, f);
      const stat = await fs.stat(p);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(3000);
    }
  });

  it('master README exists in tier2 folder', async () => {
    const p = resolve(TIER2_DIR, 'README.md');
    const stat = await fs.stat(p);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(3000);
  });
});

describe('tier2 docs · required sections per operator', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} contains all 8 required sections`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      for (const re of REQUIRED_SECTIONS) {
        expect(content).toMatch(re);
      }
    });
  }
});

describe('tier2 docs · clean-room invariant', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} contains zero blacklisted real names`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      for (const name of CLEAN_ROOM_BLACKLIST) {
        expect(content).not.toContain(name);
      }
    });
  }

  it('README does not contain blacklisted names', async () => {
    const content = await fs.readFile(resolve(TIER2_DIR, 'README.md'), 'utf8');
    for (const name of CLEAN_ROOM_BLACKLIST) {
      expect(content).not.toContain(name);
    }
  });
});

describe('tier2 docs · decision-maker placeholder format', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} uses <Role at Operator> placeholder format`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      // At least 3 distinct angle-bracket role placeholders
      const placeholders = content.match(/<[^>]+(?:at|of)\s+[^>]+>/gi) ?? [];
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('tier2 docs · outreach hook quality', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} outreach hook is non-trivial (>120 chars)`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      const hookIdx = content.indexOf('## Outreach hook');
      expect(hookIdx).toBeGreaterThan(0);
      const after = content.slice(hookIdx);
      const blockquoteMatch = after.match(/>\s+"([^"]+)"/);
      expect(blockquoteMatch).not.toBeNull();
      expect(blockquoteMatch![1].length).toBeGreaterThan(120);
    });
  }
});

describe('tier2 docs · ROI specificity', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} ROI section mentions per-title savings + 5yr horizon`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      const roiIdx = content.indexOf('## ROI ballpark');
      expect(roiIdx).toBeGreaterThan(0);
      const after = content.slice(roiIdx);
      expect(after).toMatch(/per[- ]title/i);
      expect(after).toMatch(/5yr|5[- ]year|five[- ]year/i);
    });
  }
});

describe('tier2 docs · CTA actionability', () => {
  for (const f of OPERATOR_FILES) {
    it(`${f} CTA mentions NDA + pilot`, async () => {
      const content = await fs.readFile(resolve(TIER2_DIR, f), 'utf8');
      const ctaIdx = content.indexOf('## Next-step CTA');
      expect(ctaIdx).toBeGreaterThan(0);
      const after = content.slice(ctaIdx);
      expect(after).toMatch(/NDA/);
      expect(after).toMatch(/[Pp]ilot/);
    });
  }
});

describe('tier2 docs · companion artifacts', () => {
  it('strategy doc exists at docs/MARKET_EXPANSION_STRATEGY.md', async () => {
    const p = resolve(REPO_ROOT, 'docs', 'MARKET_EXPANSION_STRATEGY.md');
    const stat = await fs.stat(p);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(3000);
  });

  it('tier2 cold-email template exists', async () => {
    const p = resolve(REPO_ROOT, 'docs', 'outreach', 'email-templates', 'tier2-cold-email.md');
    const stat = await fs.stat(p);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(1500);
  });

  it('tier2 cold-email template has all 4 required placeholders', async () => {
    const p = resolve(REPO_ROOT, 'docs', 'outreach', 'email-templates', 'tier2-cold-email.md');
    const content = await fs.readFile(p, 'utf8');
    expect(content).toContain('{{operator_name}}');
    expect(content).toContain('{{flagship_title}}');
    expect(content).toContain('{{coverage_pct}}');
    expect(content).toContain('{{decision_maker_role}}');
  });
});
