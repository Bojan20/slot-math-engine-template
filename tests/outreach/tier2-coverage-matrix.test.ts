/**
 * W215 — Tier-2 Coverage Matrix tests.
 *
 * Validates the deterministic coverage-matrix script: structure, filtering,
 * Markdown rendering, JSON snapshot stability, and CLI arg parsing.
 */
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPERATORS,
  MECHANICS,
  COVERAGE_MATRIX,
  getCell,
  operatorCoveragePct,
  mechanicCoveragePct,
  filterByOperator,
  filterByMechanic,
  renderMatrixMarkdown,
  parseArgs,
  buildJsonSnapshot,
  // @ts-expect-error — .mjs import, no .d.ts
} from '../../scripts/outreach/tier2-coverage-matrix.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('tier2-coverage-matrix · constants', () => {
  it('declares exactly 8 operators', () => {
    expect(OPERATORS.length).toBe(8);
  });

  it('declares exactly 12 mechanics', () => {
    expect(MECHANICS.length).toBe(12);
  });

  it('operators are slug-style (lowercase, no spaces)', () => {
    for (const op of OPERATORS) {
      expect(op).toMatch(/^[a-z_]+$/);
    }
  });

  it('mechanics are slug-style (lowercase, no spaces)', () => {
    for (const mech of MECHANICS) {
      expect(mech).toMatch(/^[a-z_]+$/);
    }
  });

  it('all 8 expected operators present', () => {
    const expected = ['aristocrat', 'igt', 'konami', 'novomatic', 'playtech', 'everi', 'ainsworth', 'ags'];
    for (const e of expected) expect(OPERATORS).toContain(e);
  });
});

describe('tier2-coverage-matrix · cells', () => {
  it('every operator × mechanic cell exists', () => {
    for (const op of OPERATORS) {
      for (const mech of MECHANICS) {
        const cell = getCell(op, mech);
        expect(cell).toBeDefined();
        expect(typeof cell.covered).toBe('boolean');
        expect(typeof cell.evidence).toBe('string');
        expect(['high', 'med', 'low']).toContain(cell.confidence);
      }
    }
  });

  it('matrix has 96 cells total (8 × 12)', () => {
    expect(Object.keys(COVERAGE_MATRIX).length).toBe(96);
  });

  it('every evidence string is non-empty', () => {
    for (const op of OPERATORS) {
      for (const mech of MECHANICS) {
        expect(getCell(op, mech).evidence.length).toBeGreaterThan(5);
      }
    }
  });
});

describe('tier2-coverage-matrix · coverage percentages', () => {
  it('operatorCoveragePct returns 0..1', () => {
    for (const op of OPERATORS) {
      const pct = operatorCoveragePct(op);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });

  it('mechanicCoveragePct returns 0..1', () => {
    for (const mech of MECHANICS) {
      const pct = mechanicCoveragePct(mech);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });

  it('aristocrat covers at least 7 of 12 mechanics (P0 expectation)', () => {
    expect(operatorCoveragePct('aristocrat')).toBeGreaterThanOrEqual(7 / 12);
  });

  it('igt covers at least 10 of 12 mechanics (P0 expectation)', () => {
    expect(operatorCoveragePct('igt')).toBeGreaterThanOrEqual(10 / 12);
  });

  it('cluster mechanic is sparse across operators (≤2 covered)', () => {
    const pct = mechanicCoveragePct('cluster');
    expect(pct).toBeLessThanOrEqual(2 / OPERATORS.length);
  });
});

describe('tier2-coverage-matrix · filtering', () => {
  it('filterByOperator returns all 12 mechanics for valid op', () => {
    const v = filterByOperator('aristocrat');
    expect(Object.keys(v).length).toBe(12);
    for (const mech of MECHANICS) expect(v[mech]).toBeDefined();
  });

  it('filterByMechanic returns all 8 operators for valid mech', () => {
    const v = filterByMechanic('wheel_bonus');
    expect(Object.keys(v).length).toBe(8);
    for (const op of OPERATORS) expect(v[op]).toBeDefined();
  });
});

describe('tier2-coverage-matrix · Markdown rendering', () => {
  it('renderMatrixMarkdown produces non-trivial output', () => {
    const md = renderMatrixMarkdown();
    expect(md.length).toBeGreaterThan(1000);
    expect(md).toContain('# Tier-2 Operator Coverage Matrix');
    expect(md).toContain('| Mechanic |');
  });

  it('rendered Markdown references every operator', () => {
    const md = renderMatrixMarkdown();
    for (const op of OPERATORS) {
      expect(md).toContain(op);
    }
  });

  it('rendered Markdown references every mechanic', () => {
    const md = renderMatrixMarkdown();
    for (const mech of MECHANICS) {
      expect(md).toContain(mech);
    }
  });

  it('rendering is byte-identical across calls (deterministic)', () => {
    const md1 = renderMatrixMarkdown();
    const md2 = renderMatrixMarkdown();
    expect(md1).toBe(md2);
  });
});

describe('tier2-coverage-matrix · JSON snapshot', () => {
  it('buildJsonSnapshot returns valid structure', () => {
    const snap = buildJsonSnapshot();
    expect(snap.schemaVersion).toBe('1.0.0');
    expect(snap.sprint).toBe('W215');
    expect(snap.operators).toEqual(OPERATORS);
    expect(snap.mechanics).toEqual(MECHANICS);
    expect(Object.keys(snap.cells).length).toBe(96);
  });

  it('JSON snapshot is byte-identical across calls', () => {
    const a = JSON.stringify(buildJsonSnapshot());
    const b = JSON.stringify(buildJsonSnapshot());
    expect(a).toBe(b);
  });
});

describe('tier2-coverage-matrix · CLI parsing', () => {
  it('parses --json flag', () => {
    const a = parseArgs(['node', 'cli', '--json']);
    expect(a.json).toBe(true);
    expect(a.operator).toBeNull();
  });

  it('parses --operator <name>', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'aristocrat']);
    expect(a.operator).toBe('aristocrat');
  });

  it('parses --operator=<name>', () => {
    const a = parseArgs(['node', 'cli', '--operator=igt']);
    expect(a.operator).toBe('igt');
  });

  it('parses --mechanic <name>', () => {
    const a = parseArgs(['node', 'cli', '--mechanic', 'wheel_bonus']);
    expect(a.mechanic).toBe('wheel_bonus');
  });

  it('parses combined flags', () => {
    const a = parseArgs(['node', 'cli', '--operator', 'konami', '--json']);
    expect(a.operator).toBe('konami');
    expect(a.json).toBe(true);
  });
});

describe('tier2-coverage-matrix · script file', () => {
  it('script source file is co-located', async () => {
    const fs = await import('node:fs/promises');
    const p = resolve(HERE, '..', '..', 'scripts', 'outreach', 'tier2-coverage-matrix.mjs');
    const stat = await fs.stat(p);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(5000);
  });
});
