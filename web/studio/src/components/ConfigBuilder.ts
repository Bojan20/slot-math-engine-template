/**
 * W216 Faza 11.1 — Web Config Builder UI.
 *
 * Closes the last open M7-milestone slot: operator-facing IR config
 * builder. Without this UI, operators integrate the wire format by
 * hand-editing JSON, which is the #1 friction point in the demo flow
 * ("5-minute pitch") + the W210 pilot onboarding.
 *
 * Design goals
 * ────────────
 *   1. **Pure DOM, no PIXI/Vue/React** — drops into any host page,
 *      bundle stays clean.
 *   2. **Zero global side-effects** — caller owns the host element;
 *      ConfigBuilder mounts/unmounts via explicit lifecycle.
 *   3. **Type-safe** — input/output are typed `SlotGameIR` from
 *      `@engine/ir/types`. Invalid edits fail closed (zod parse).
 *   4. **Snapshot testable** — render functions return DOM nodes
 *      that can be inspected without happy-dom-only APIs.
 *
 * Scope — what is intentionally NOT here:
 *   * Live preview (that lives in `playTab.ts` and `engine.ts`)
 *   * Persistence (that lives in `persistence.ts`)
 *   * I18n labels (caller wraps strings if needed; this module ships
 *     English defaults that the production studio overrides via the
 *     i18n.ts framework)
 *   * RTP solver wiring (lives in `engine.ts`)
 *
 * Integration shape:
 *   ```ts
 *   import { ConfigBuilder } from './components/ConfigBuilder.js';
 *   const builder = new ConfigBuilder({
 *     host: document.getElementById('cfg-host')!,
 *     initial: starterIr,
 *     onChange: (ir) => persistence.draft(ir),
 *     onValidate: (result) => updateStatusBar(result),
 *   });
 *   builder.mount();
 *   // …
 *   const current = builder.getValue();
 *   builder.unmount();
 *   ```
 *
 * For tests, see `tests/configBuilder.test.ts` — 25 vitest specs
 * covering rendering, change events, validation, edit round-trips,
 * and corner cases (negative bet, malformed topology, empty paytable).
 */

import type { SlotGameIR, Meta, Topology, Symbol as IRSymbol } from '@engine/ir/types.js';
import { parseGameIR } from '@engine/ir/index.js';

export interface ConfigBuilderValidation {
  valid: boolean;
  errors: string[];
}

export interface ConfigBuilderOptions {
  host: HTMLElement;
  initial: SlotGameIR;
  /** Fired on every field change (debounced caller-side if needed). */
  onChange?: (ir: SlotGameIR) => void;
  /** Fired when the user clicks "Validate" or on every change if `validateLive`. */
  onValidate?: (result: ConfigBuilderValidation) => void;
  validateLive?: boolean;
  /** Override section labels — caller supplies i18n strings. */
  labels?: Partial<ConfigBuilderLabels>;
}

export interface ConfigBuilderLabels {
  meta: string;
  topology: string;
  symbols: string;
  paytable: string;
  validate: string;
  download: string;
  reset: string;
}

const DEFAULT_LABELS: ConfigBuilderLabels = {
  meta: 'Game metadata',
  topology: 'Reel topology',
  symbols: 'Symbol roster',
  paytable: 'Paytable',
  validate: 'Validate',
  download: 'Download JSON',
  reset: 'Reset to initial',
};

export class ConfigBuilder {
  private readonly host: HTMLElement;
  private readonly initial: SlotGameIR;
  private current: SlotGameIR;
  private readonly opts: ConfigBuilderOptions;
  private readonly labels: ConfigBuilderLabels;
  private rootNode: HTMLElement | null = null;
  private validateNode: HTMLElement | null = null;

  constructor(opts: ConfigBuilderOptions) {
    this.opts = opts;
    this.host = opts.host;
    this.initial = deepClone(opts.initial);
    this.current = deepClone(opts.initial);
    this.labels = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
  }

  /** Mount into the host element (idempotent). */
  mount(): void {
    if (this.rootNode) return;
    const root = document.createElement('div');
    root.className = 'cb-root';
    root.setAttribute('data-component', 'config-builder');
    root.appendChild(this.renderMeta());
    root.appendChild(this.renderTopology());
    root.appendChild(this.renderSymbols());
    root.appendChild(this.renderPaytable());
    root.appendChild(this.renderActions());
    this.validateNode = document.createElement('div');
    this.validateNode.className = 'cb-validate';
    root.appendChild(this.validateNode);
    this.host.appendChild(root);
    this.rootNode = root;
    if (this.opts.validateLive) this.fireValidate();
  }

  /** Remove from the host element (idempotent). */
  unmount(): void {
    if (!this.rootNode) return;
    this.rootNode.remove();
    this.rootNode = null;
    this.validateNode = null;
  }

  /** Current draft IR (cloned for safety). */
  getValue(): SlotGameIR {
    return deepClone(this.current);
  }

  /** Replace draft IR — caller's responsibility to keep it parseable. */
  setValue(next: SlotGameIR): void {
    this.current = deepClone(next);
    if (this.rootNode) {
      this.unmount();
      this.mount();
    }
  }

  /** Reset to initial. */
  reset(): void {
    this.setValue(this.initial);
  }

  /** Validate via zod and surface errors. Caller can also subscribe via `onValidate`. */
  validate(): ConfigBuilderValidation {
    try {
      const r = parseGameIR(this.current);
      if (r.ok) return { valid: true, errors: [] };
      return { valid: false, errors: r.issues.map((i) => `${i.path}: ${i.message}`) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, errors: msg.split('\n').filter((s) => s.length > 0) };
    }
  }

  // ─── Renderers ───────────────────────────────────────────────────────

  private renderMeta(): HTMLElement {
    const section = section1(this.labels.meta);
    section.appendChild(
      labelledInput('Game ID', this.current.meta.id, (v) => {
        this.current.meta.id = v;
        this.fireChange();
      }),
    );
    section.appendChild(
      labelledInput('Display Name', this.current.meta.name, (v) => {
        this.current.meta.name = v;
        this.fireChange();
      }),
    );
    section.appendChild(
      labelledInput('Schema Version', this.current.meta.version, (v) => {
        this.current.meta.version = v as Meta['version'];
        this.fireChange();
      }),
    );
    section.appendChild(
      labelledInput('Theme Tags (comma)', this.current.meta.theme_tags.join(','), (v) => {
        this.current.meta.theme_tags = v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        this.fireChange();
      }),
    );
    return section;
  }

  private renderTopology(): HTMLElement {
    const section = section1(this.labels.topology);
    const t = this.current.topology;
    section.appendChild(
      labelledInput('Topology kind', t.kind, (v) => {
        // Read-only in this build — changing kind is a structural edit
        // that bins the rest of the draft. Future work: kind-switcher
        // wizard that maps fields between topologies.
        const node = section.querySelector('input[data-label="Topology kind"]') as HTMLInputElement | null;
        if (node) node.value = t.kind; // force-revert
        void v;
      }, true),
    );
    if (t.kind === 'rectangular') {
      section.appendChild(
        labelledNumber('Reels', t.reels, (n) => {
          (this.current.topology as { kind: 'rectangular'; reels: number; rows: number }).reels = n;
          this.fireChange();
        }),
      );
      section.appendChild(
        labelledNumber('Rows', t.rows, (n) => {
          (this.current.topology as { kind: 'rectangular'; reels: number; rows: number }).rows = n;
          this.fireChange();
        }),
      );
    } else if (t.kind === 'cluster_grid') {
      section.appendChild(
        labelledNumber('Columns', t.columns, (n) => {
          (this.current.topology as { kind: 'cluster_grid'; columns: number; rows: number; adjacency: string }).columns = n;
          this.fireChange();
        }),
      );
      section.appendChild(
        labelledNumber('Rows', t.rows, (n) => {
          (this.current.topology as { kind: 'cluster_grid'; columns: number; rows: number; adjacency: string }).rows = n;
          this.fireChange();
        }),
      );
      section.appendChild(
        labelledInput('Adjacency', t.adjacency, (v) => {
          (this.current.topology as { adjacency: 'orthogonal' | 'diagonal' | 'hex' }).adjacency =
            v as 'orthogonal' | 'diagonal' | 'hex';
          this.fireChange();
        }),
      );
    } else if (t.kind === 'variable_rows') {
      section.appendChild(
        labelledNumber('Reels', t.reels, (n) => {
          (this.current.topology as Topology & { kind: 'variable_rows' }).reels = n;
          this.fireChange();
        }),
      );
    }
    return section;
  }

  private renderSymbols(): HTMLElement {
    const section = section1(this.labels.symbols);
    const list = document.createElement('div');
    list.className = 'cb-symbol-list';
    section.appendChild(list);
    for (let i = 0; i < this.current.symbols.length; i++) {
      list.appendChild(this.renderSymbolRow(i));
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'cb-add-symbol';
    addBtn.textContent = 'Add symbol';
    addBtn.addEventListener('click', () => {
      this.current.symbols.push({ id: `SYM_${this.current.symbols.length}`, name: 'New', kind: 'lp' });
      this.fireChange();
      list.appendChild(this.renderSymbolRow(this.current.symbols.length - 1));
    });
    section.appendChild(addBtn);
    return section;
  }

  private renderSymbolRow(idx: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cb-symbol-row';
    row.dataset.idx = String(idx);
    const sym = this.current.symbols[idx];
    row.appendChild(
      labelledInput('ID', sym.id, (v) => {
        sym.id = v;
        this.fireChange();
      }),
    );
    row.appendChild(
      labelledInput('Name', sym.name, (v) => {
        sym.name = v;
        this.fireChange();
      }),
    );
    row.appendChild(
      labelledInput('Kind', sym.kind, (v) => {
        sym.kind = v as IRSymbol['kind'];
        this.fireChange();
      }),
    );
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'cb-remove-symbol';
    removeBtn.textContent = '−';
    removeBtn.addEventListener('click', () => {
      this.current.symbols.splice(idx, 1);
      this.fireChange();
      // Caller re-mounts to keep idx-bound listeners consistent; for now
      // re-render the symbols section in place via the cheap path.
      const newRoot = this.renderSymbols();
      const old = this.rootNode?.querySelector('.cb-section[data-section="symbols"]');
      if (old && newRoot) old.replaceWith(newRoot);
    });
    row.appendChild(removeBtn);
    return row;
  }

  private renderPaytable(): HTMLElement {
    const section = section1(this.labels.paytable);
    const table = document.createElement('table');
    table.className = 'cb-paytable';
    const head = document.createElement('thead');
    head.innerHTML = `<tr><th>Symbol</th><th>Count</th><th>Multiplier</th></tr>`;
    table.appendChild(head);
    const body = document.createElement('tbody');
    for (const [symbolId, tiers] of Object.entries(this.current.paytable)) {
      for (const [count, mult] of Object.entries(tiers)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${esc(symbolId)}</td><td>${esc(count)}</td>`;
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.value = String(mult);
        input.addEventListener('input', () => {
          const n = Number(input.value);
          if (Number.isFinite(n) && n >= 0) {
            this.current.paytable[symbolId][count] = n;
            this.fireChange();
          }
        });
        td.appendChild(input);
        tr.appendChild(td);
        body.appendChild(tr);
      }
    }
    table.appendChild(body);
    section.appendChild(table);
    return section;
  }

  private renderActions(): HTMLElement {
    const section = section1('Actions');
    const validate = document.createElement('button');
    validate.type = 'button';
    validate.className = 'cb-validate-btn';
    validate.textContent = this.labels.validate;
    validate.addEventListener('click', () => this.fireValidate());
    section.appendChild(validate);

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'cb-download-btn';
    download.textContent = this.labels.download;
    download.addEventListener('click', () => this.downloadJson());
    section.appendChild(download);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'cb-reset-btn';
    reset.textContent = this.labels.reset;
    reset.addEventListener('click', () => this.reset());
    section.appendChild(reset);
    return section;
  }

  // ─── Events ──────────────────────────────────────────────────────────

  private fireChange(): void {
    this.opts.onChange?.(deepClone(this.current));
    if (this.opts.validateLive) this.fireValidate();
  }

  private fireValidate(): void {
    const result = this.validate();
    if (this.validateNode) {
      this.validateNode.innerHTML = result.valid
        ? '<span class="cb-ok">Valid ✓</span>'
        : `<ul class="cb-errors">${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
    }
    this.opts.onValidate?.(result);
  }

  private downloadJson(): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([JSON.stringify(this.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.current.meta.id || 'config'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

// ─── Helpers (exported for tests) ─────────────────────────────────────

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function section1(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'cb-section';
  section.dataset.section = title.toLowerCase().split(' ')[0];
  const h = document.createElement('h3');
  h.textContent = title;
  section.appendChild(h);
  return section;
}

function labelledInput(
  label: string,
  initial: string,
  onChange: (v: string) => void,
  readOnly = false,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'cb-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initial;
  input.dataset.label = label;
  if (readOnly) input.readOnly = true;
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

function labelledNumber(label: string, initial: number, onChange: (n: number) => void): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'cb-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(initial);
  input.step = '1';
  input.min = '0';
  input.dataset.label = label;
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) onChange(n);
  });
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}
