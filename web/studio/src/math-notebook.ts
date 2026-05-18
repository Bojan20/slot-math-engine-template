// CORTI 200.1-DUBINA — Math Notebook (Jupyter-style sandbox).
//
// Cells share a single mutable variable scope (`Notebook.vars`). Each cell
// is an expression evaluated with the rule-editor's safe evaluator + the
// extended math/distribution library. Cells can also be "assignments"
// (e.g. `x = clamp(0.5, 0, 1)`) — the LHS lands in the shared scope.
//
// Persistence: simple JSON snapshot of cells + last-known scope. The
// scope is *not* persisted automatically across reloads (designer is
// expected to re-run cells) but is exported for round-trip in tests.

import {
  parse,
  evaluate,
  evaluateExpression,
  validateRule,
  defaultMockContext,
  type EvalContext,
  type RpnNode,
} from './rule-editor.js';

export interface NotebookCell {
  id: string;
  /** Source text — single expression OR `name = expr` assignment. */
  src: string;
  /** Last successful numeric output. */
  lastValue?: number;
  /** Last error message (if any). */
  lastError?: string;
  /** Computed at evaluate-time — display only. */
  lastTookMs?: number;
}

export interface NotebookSnapshot {
  schemaVersion: 1;
  cells: NotebookCell[];
  scope: Record<string, number>;
}

export interface NotebookEvalReport {
  cellId: string;
  ok: boolean;
  value?: number;
  error?: string;
  assignedTo?: string;
}

let _cellSeed = 1;
export function resetCellSeed(n = 1): void { _cellSeed = n; }
function nextCellId(): string { return `cell-${_cellSeed++}`; }

export class MathNotebook {
  cells: NotebookCell[] = [];
  scope: Record<string, number>;

  constructor(initialScope: Record<string, number> = {}) {
    // Pre-seed scope with mock context's vars so the notebook can reference
    // canonical IR variables (spin_count, scatters_landed, …) without the
    // user re-typing them.
    const base = defaultMockContext().vars;
    this.scope = { ...base, ...initialScope };
  }

  addCell(src = ''): NotebookCell {
    const cell: NotebookCell = { id: nextCellId(), src };
    this.cells.push(cell);
    return cell;
  }

  removeCell(id: string): boolean {
    const before = this.cells.length;
    this.cells = this.cells.filter((c) => c.id !== id);
    return this.cells.length !== before;
  }

  updateCell(id: string, src: string): boolean {
    const c = this.cells.find((x) => x.id === id);
    if (!c) return false;
    c.src = src;
    // Invalidate cached value.
    c.lastValue = undefined;
    c.lastError = undefined;
    return true;
  }

  /**
   * Evaluate a cell. If `src` matches `name = expression`, the result is
   * stored in `scope[name]` and the cell's `lastValue` becomes that value.
   */
  evalCell(id: string): NotebookEvalReport {
    const cell = this.cells.find((c) => c.id === id);
    if (!cell) return { cellId: id, ok: false, error: 'cell not found' };
    const start = Date.now();
    try {
      const m = cell.src.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^=].*)$/s);
      const ctx: EvalContext = { vars: { ...this.scope }, maxMs: 200, maxIterations: 20000 };
      let val: number;
      let assigned: string | undefined;
      if (m) {
        assigned = m[1]!;
        const expr = m[2]!;
        val = evaluateExpression(expr, ctx);
        this.scope[assigned] = val;
      } else {
        val = evaluateExpression(cell.src, ctx);
      }
      cell.lastValue = val;
      cell.lastError = undefined;
      cell.lastTookMs = Date.now() - start;
      return { cellId: id, ok: true, value: val, assignedTo: assigned };
    } catch (err) {
      const msg = (err as Error).message;
      cell.lastError = msg;
      cell.lastValue = undefined;
      cell.lastTookMs = Date.now() - start;
      return { cellId: id, ok: false, error: msg };
    }
  }

  /** Evaluate all cells in order; later cells see scope mutations from earlier ones. */
  evalAll(): NotebookEvalReport[] {
    return this.cells.map((c) => this.evalCell(c.id));
  }

  /** Validate a cell's expression — does not execute. */
  validate(src: string): { ok: boolean; error?: string } {
    const m = src.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^=].*)$/s);
    const expr = m ? m[2]! : src;
    const report = validateRule(expr);
    if (report.parseError) return { ok: false, error: report.parseError };
    if (report.typeIssues.length > 0) {
      return { ok: false, error: report.typeIssues.join('; ') };
    }
    return { ok: true };
  }

  snapshot(): NotebookSnapshot {
    return {
      schemaVersion: 1,
      cells: this.cells.map((c) => ({ ...c })),
      scope: { ...this.scope },
    };
  }

  restore(snap: NotebookSnapshot): void {
    if (!snap || snap.schemaVersion !== 1) return;
    this.cells = snap.cells.map((c) => ({ ...c }));
    this.scope = { ...snap.scope };
  }

  setScopeVar(name: string, value: number): void {
    this.scope[name] = value;
  }
  getScopeVar(name: string): number | undefined {
    return this.scope[name];
  }
}

// ── Bridge ─────────────────────────────────────────────────────────

export interface NotebookBridge {
  create(): MathNotebook;
  parse(src: string): RpnNode[];
  evaluateLite(src: string, scope?: Record<string, number>): number;
}

export function createMathNotebookBridge(): NotebookBridge {
  return {
    create: () => new MathNotebook(),
    parse,
    evaluateLite: (src, scope) => {
      const ctx: EvalContext = { vars: { ...defaultMockContext().vars, ...(scope ?? {}) } };
      return evaluate(parse(src), ctx);
    },
  };
}
