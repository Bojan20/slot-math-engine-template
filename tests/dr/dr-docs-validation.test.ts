/**
 * W215 Faza 600.4 — Documentation structural validation.
 *
 * These specs guard the required headings and tables in the DR docs
 * so the operator-facing surface never silently degrades.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DR_DOC = resolve(ROOT, 'docs', 'DISASTER_RECOVERY.md');
const IR_DOC = resolve(ROOT, 'docs', 'INCIDENT_RESPONSE.md');
const RUNBOOK_DOC = resolve(ROOT, 'docs', 'RUNBOOK_RTO_RPO.md');

function readDoc(p: string): string {
  expect(existsSync(p)).toBe(true);
  return readFileSync(p, 'utf-8');
}

describe('W215 docs · DISASTER_RECOVERY.md', () => {
  const doc = readDoc(DR_DOC);

  it('exists', () => {
    expect(doc.length).toBeGreaterThan(500);
  });

  it('has Executive summary section', () => {
    expect(doc).toMatch(/##\s+Executive summary|##\s+\d+\.\s+Executive summary/);
  });

  it('has Tier definitions table with all four tiers', () => {
    expect(doc).toMatch(/Tier definitions/i);
    expect(doc).toMatch(/critical/);
    expect(doc).toMatch(/high/);
    expect(doc).toMatch(/medium/);
    expect(doc).toMatch(/low/);
  });

  it('quotes the canonical critical RTO/RPO (15 / 5)', () => {
    expect(doc).toMatch(/15\s*min/);
    expect(doc).toMatch(/5\s*min/);
  });

  it('documents 3-2-1 backup rule', () => {
    expect(doc).toMatch(/3-2-1/);
  });

  it('mentions encryption at rest', () => {
    expect(doc).toMatch(/encryption|encrypted/i);
  });

  it('has a Failover topology ASCII block', () => {
    expect(doc).toMatch(/```[\s\S]*Route53[\s\S]*```/);
  });

  it('lists drill cadence', () => {
    expect(doc).toMatch(/drill/i);
    expect(doc).toMatch(/month|monthly/i);
  });

  it('maps GLI-19 / UKGC / MGA compliance', () => {
    expect(doc).toMatch(/GLI-19/);
    expect(doc).toMatch(/UKGC/);
    expect(doc).toMatch(/MGA/);
  });
});

describe('W215 docs · INCIDENT_RESPONSE.md (W215 supplement)', () => {
  const doc = readDoc(IR_DOC);

  it('exists and is non-trivial', () => {
    expect(doc.length).toBeGreaterThan(500);
  });

  it('mentions the W215 engine-driven section', () => {
    expect(doc).toMatch(/W215/);
    expect(doc).toMatch(/server\/lib\/incident-response\.ts/);
  });

  it('contains a severity matrix with all four severities', () => {
    expect(doc).toMatch(/SEV1/);
    expect(doc).toMatch(/SEV2/);
    expect(doc).toMatch(/SEV3/);
    expect(doc).toMatch(/SEV4/);
  });

  it('lists comms templates (initial / mid / post)', () => {
    expect(doc).toMatch(/Initial/i);
    expect(doc).toMatch(/Mid-incident/i);
    expect(doc).toMatch(/Post-resolution/i);
  });

  it('lists regulator triggers per jurisdiction', () => {
    expect(doc).toMatch(/GLI-19/);
    expect(doc).toMatch(/UKGC/);
    expect(doc).toMatch(/MGA/);
  });

  it('contains a postmortem template block', () => {
    expect(doc).toMatch(/Postmortem/);
    expect(doc).toMatch(/Root cause/i);
    expect(doc).toMatch(/Action items/i);
  });
});

describe('W215 docs · RUNBOOK_RTO_RPO.md', () => {
  const doc = readDoc(RUNBOOK_DOC);

  it('has all four scenario sections', () => {
    expect(doc).toMatch(/##\s+regional-outage/);
    expect(doc).toMatch(/##\s+db-corruption/);
    expect(doc).toMatch(/##\s+ransomware/);
    expect(doc).toMatch(/##\s+hsm-loss/);
  });

  it('quotes RTO + RPO budgets for each scenario', () => {
    const scenarios = ['regional-outage', 'db-corruption', 'ransomware', 'hsm-loss'];
    for (const s of scenarios) {
      const idx = doc.indexOf(`## ${s}`);
      expect(idx).toBeGreaterThan(-1);
      const section = doc.slice(idx, idx + 1200);
      expect(section).toMatch(/RTO budget/);
      expect(section).toMatch(/RPO budget/);
    }
  });

  it('references the deterministic drill script', () => {
    expect(doc).toMatch(/scripts\/dr\/restore-drill\.mjs/);
  });

  it('references the backup verifier', () => {
    expect(doc).toMatch(/scripts\/dr\/backup-verify\.mjs/);
  });
});
