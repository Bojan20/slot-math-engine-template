// CORTI 200.1-DUBINA — Math Notebook specs.
//
// Cell-based evaluation with shared variable scope. Tests cover cell
// CRUD, expression evaluation, scope sharing across cells, assignment
// syntax, snapshot/restore round-trip, validation, and error display.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MathNotebook,
  createMathNotebookBridge,
  resetCellSeed,
} from '../src/math-notebook.js';

beforeEach(() => {
  resetCellSeed(1);
});

describe('cell CRUD', () => {
  it('addCell + removeCell + updateCell', () => {
    const nb = new MathNotebook();
    const c1 = nb.addCell('1 + 1');
    const c2 = nb.addCell('2 + 2');
    expect(nb.cells.length).toBe(2);
    expect(nb.updateCell(c1.id, '10')).toBe(true);
    expect(c1.src).toBe('10');
    expect(nb.removeCell(c2.id)).toBe(true);
    expect(nb.cells.length).toBe(1);
  });

  it('removeCell returns false for missing id', () => {
    const nb = new MathNotebook();
    expect(nb.removeCell('nope')).toBe(false);
  });
});

describe('cell evaluation', () => {
  it('evalCell returns numeric result', () => {
    const nb = new MathNotebook();
    const c = nb.addCell('3 * 4');
    const r = nb.evalCell(c.id);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(12);
    expect(c.lastValue).toBe(12);
  });

  it('evalCell reports error on bad expression', () => {
    const nb = new MathNotebook();
    const c = nb.addCell('1 +');
    const r = nb.evalCell(c.id);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(c.lastError).toBeTruthy();
  });

  it('measures execution time', () => {
    const nb = new MathNotebook();
    const c = nb.addCell('1 + 2');
    nb.evalCell(c.id);
    expect(c.lastTookMs).toBeGreaterThanOrEqual(0);
  });
});

describe('assignment + shared scope', () => {
  it('x = expr stores x in scope; next cell can use x', () => {
    const nb = new MathNotebook();
    const c1 = nb.addCell('x = 5 * 4');
    const c2 = nb.addCell('x + 1');
    const r1 = nb.evalCell(c1.id);
    expect(r1.assignedTo).toBe('x');
    expect(nb.scope.x).toBe(20);
    const r2 = nb.evalCell(c2.id);
    expect(r2.value).toBe(21);
  });

  it('evalAll evaluates cells in order with shared scope mutations', () => {
    const nb = new MathNotebook();
    nb.addCell('a = 10');
    nb.addCell('b = a + 5');
    nb.addCell('a + b');
    const reports = nb.evalAll();
    expect(reports.every((r) => r.ok)).toBe(true);
    expect(reports[2]!.value).toBe(25);
    expect(nb.scope.a).toBe(10);
    expect(nb.scope.b).toBe(15);
  });

  it('setScopeVar / getScopeVar', () => {
    const nb = new MathNotebook();
    nb.setScopeVar('foo', 42);
    expect(nb.getScopeVar('foo')).toBe(42);
  });

  it('initial scope is seeded with IR mock context', () => {
    const nb = new MathNotebook();
    // spin_count from defaultMockContext
    expect(nb.scope.spin_count).toBe(100);
  });
});

describe('validate', () => {
  it('detects parse errors without executing', () => {
    const nb = new MathNotebook();
    expect(nb.validate('1 + )').ok).toBe(false);
    expect(nb.validate('1 + 1').ok).toBe(true);
  });

  it('accepts assignment syntax', () => {
    const nb = new MathNotebook();
    expect(nb.validate('y = 1 + 2').ok).toBe(true);
  });
});

describe('snapshot round-trip', () => {
  it('preserves cells + scope', () => {
    const nb = new MathNotebook();
    nb.addCell('z = 7');
    nb.evalAll();
    const snap = nb.snapshot();
    const json = JSON.stringify(snap);
    const restored = JSON.parse(json) as ReturnType<typeof nb.snapshot>;
    const nb2 = new MathNotebook();
    nb2.restore(restored);
    expect(nb2.cells.length).toBe(nb.cells.length);
    expect(nb2.scope.z).toBe(7);
  });

  it('schemaVersion mismatch is a no-op', () => {
    const nb = new MathNotebook();
    nb.addCell('1');
    const before = nb.cells.length;
    // @ts-expect-error — intentional bad input
    nb.restore({ schemaVersion: 99, cells: [], scope: {} });
    expect(nb.cells.length).toBe(before);
  });
});

describe('bridge facade', () => {
  it('createMathNotebookBridge.create returns a fresh notebook', () => {
    const b = createMathNotebookBridge();
    const nb = b.create();
    expect(nb.cells.length).toBe(0);
  });

  it('evaluateLite uses overridden scope', () => {
    const b = createMathNotebookBridge();
    const v = b.evaluateLite('q * 2', { q: 7 });
    expect(v).toBe(14);
  });
});
