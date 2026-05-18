// W200 polish-pass tests.
//
// The polish module is DOM-heavy but the vitest suite runs under node
// (no jsdom). We stub the slice of `document`/`window` we need so the
// module's public functions can be exercised without dragging in
// happy-dom.

import { describe, it, expect, beforeEach } from 'vitest';

// ── Minimal DOM stub ────────────────────────────────────────────────
interface StubNode {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  innerHTML: string;
  style: Record<string, string> & { cssText?: string };
  attributes: Record<string, string>;
  parent: StubNode | null;
  children: StubNode[];
  appendChild(c: StubNode): StubNode;
  removeChild(c: StubNode): StubNode;
  remove(): void;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  hasAttribute(k: string): boolean;
  addEventListener(_e: string, _h: unknown): void;
  classList: { add(n: string): void; remove(n: string): void; contains(n: string): boolean };
  querySelector(sel: string): StubNode | null;
  querySelectorAll(sel: string): StubNode[];
}

function makeNode(tag = 'div'): StubNode {
  const node: StubNode = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    style: {},
    attributes: {},
    parent: null,
    children: [],
    appendChild(c) {
      c.parent = this;
      this.children.push(c);
      return c;
    },
    removeChild(c) {
      const ix = this.children.indexOf(c);
      if (ix >= 0) this.children.splice(ix, 1);
      c.parent = null;
      return c;
    },
    remove() {
      if (this.parent) this.parent.removeChild(this);
    },
    setAttribute(k, v) {
      this.attributes[k] = v;
      if (k === 'id') this.id = v;
      if (k === 'class') this.className = v;
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    hasAttribute(k) {
      return k in this.attributes;
    },
    addEventListener() {
      // no-op
    },
    classList: {
      add(n) {
        const cls = (node.className || '').split(/\s+/).filter(Boolean);
        if (!cls.includes(n)) cls.push(n);
        node.className = cls.join(' ');
      },
      remove(n) {
        node.className = (node.className || '')
          .split(/\s+/)
          .filter((x) => x && x !== n)
          .join(' ');
      },
      contains(n) {
        return (node.className || '').split(/\s+/).includes(n);
      },
    },
    querySelector(sel) {
      return findOne(node, sel);
    },
    querySelectorAll(sel) {
      return findAll(node, sel);
    },
  };
  return node;
}

function findOne(root: StubNode, sel: string): StubNode | null {
  for (const r of findAll(root, sel)) return r;
  return null;
}

function findAll(root: StubNode, sel: string): StubNode[] {
  const out: StubNode[] = [];
  const idMatch = sel.startsWith('#') ? sel.slice(1) : null;
  const attrMatch = sel.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/);
  walk(root, (n) => {
    if (idMatch && n.id === idMatch) out.push(n);
    if (attrMatch) {
      const [, attr, val] = attrMatch;
      if (val === undefined ? n.hasAttribute(attr!) : n.attributes[attr!] === val) out.push(n);
    }
  });
  return out;
}

function walk(n: StubNode, fn: (n: StubNode) => void): void {
  fn(n);
  for (const c of n.children) walk(c, fn);
}

function installStubDom(): { document: { body: StubNode; head: StubNode; getElementById: (id: string) => StubNode | null; createElement: (t: string) => StubNode; querySelector: (s: string) => StubNode | null; querySelectorAll: (s: string) => StubNode[] }; window: Record<string, unknown> } {
  const body = makeNode('body');
  body.id = 'body';
  const head = makeNode('head');
  head.id = 'head';
  const document = {
    body,
    head,
    getElementById(id: string): StubNode | null {
      return findOne(body, `#${id}`) ?? findOne(head, `#${id}`);
    },
    createElement(t: string): StubNode {
      return makeNode(t);
    },
    querySelector(sel: string): StubNode | null {
      return findOne(body, sel) ?? findOne(head, sel);
    },
    querySelectorAll(sel: string): StubNode[] {
      return [...findAll(body, sel), ...findAll(head, sel)];
    },
  };
  const win: Record<string, unknown> = {
    innerWidth: 1440,
    addEventListener: () => undefined,
    setTimeout: (fn: () => void, _ms: number) => {
      // Synchronous in tests — keeps assertions sequential.
      fn();
      return 1;
    },
    getComputedStyle: () => ({ position: 'relative' }),
    document,
  };
  (globalThis as Record<string, unknown>).document = document;
  (globalThis as Record<string, unknown>).window = win;
  return { document, window: win };
}

describe('W200 polish module', () => {
  beforeEach(() => {
    installStubDom();
  });

  it('exports the expected public surface', async () => {
    const mod = await import('../src/polish.js');
    expect(typeof mod.installPolish).toBe('function');
    expect(typeof mod.showSpinner).toBe('function');
    expect(typeof mod.renderEmptyState).toBe('function');
    expect(typeof mod.pushToast).toBe('function');
    expect(typeof mod.setMobileGuard).toBe('function');
    expect(typeof mod.applyTooltips).toBe('function');
  });

  it('renders a spinner overlay and removes it via the returned disposer', async () => {
    const { showSpinner } = await import('../src/polish.js');
    const host = (globalThis as unknown as { document: { createElement: (t: string) => StubNode; body: StubNode } }).document.createElement('div');
    (globalThis as unknown as { document: { body: StubNode } }).document.body.appendChild(host);

    const dismiss = showSpinner(host as unknown as HTMLElement, 'Parsing…');
    const overlay = host.children.find((c) => c.className.includes('w200-spinner-overlay'));
    expect(overlay).toBeDefined();
    expect(overlay!.innerHTML).toContain('Parsing…');

    dismiss();
    const stillThere = host.children.find((c) => c.className.includes('w200-spinner-overlay'));
    expect(stillThere).toBeUndefined();
  });

  it('renders an empty state with title + sub', async () => {
    const { renderEmptyState } = await import('../src/polish.js');
    const host = (globalThis as unknown as { document: { createElement: (t: string) => StubNode; body: StubNode } }).document.createElement('div');
    (globalThis as unknown as { document: { body: StubNode } }).document.body.appendChild(host);

    renderEmptyState(host as unknown as HTMLElement, {
      title: 'No patterns match',
      sub: 'Try different filters',
    });
    const el = host.children.find((c) => c.className.includes('w200-empty-state'));
    expect(el).toBeDefined();
    expect(el!.innerHTML).toContain('No patterns match');
    expect(el!.innerHTML).toContain('Try different filters');
  });

  it('mobile guard toggles visibility class', async () => {
    const { setMobileGuard } = await import('../src/polish.js');
    setMobileGuard(true);
    const guard = (globalThis as unknown as { document: { getElementById: (id: string) => StubNode | null } }).document.getElementById('w200-mobile-guard');
    expect(guard).toBeTruthy();
    expect(guard!.className).toContain('is-visible');
    setMobileGuard(false);
    expect(guard!.className).not.toContain('is-visible');
  });

  it('applyTooltips is idempotent — does not overwrite existing titles', async () => {
    const { applyTooltips } = await import('../src/polish.js');
    const doc = (globalThis as unknown as { document: { createElement: (t: string) => StubNode; body: StubNode } }).document;
    const btn = doc.createElement('button');
    btn.id = 'btn-spin';
    btn.setAttribute('id', 'btn-spin');
    btn.setAttribute('title', 'pre-existing');
    doc.body.appendChild(btn);

    applyTooltips();
    expect(btn.getAttribute('title')).toBe('pre-existing');
  });

  it('applyTooltips sets title on a known selector when missing', async () => {
    const { applyTooltips } = await import('../src/polish.js');
    const doc = (globalThis as unknown as { document: { createElement: (t: string) => StubNode; body: StubNode } }).document;
    const btn = doc.createElement('button');
    btn.id = 'btn-run-mc';
    btn.setAttribute('id', 'btn-run-mc');
    doc.body.appendChild(btn);

    applyTooltips();
    expect(btn.getAttribute('title')).toContain('Monte');
  });

  it('installPolish wires up all sub-systems and exposes the API', async () => {
    const { installPolish } = await import('../src/polish.js');
    const api = installPolish();
    expect(api).toBeDefined();
    expect(typeof api.showSpinner).toBe('function');
    expect(typeof api.toast).toBe('function');
    expect(typeof api.setMobileGuard).toBe('function');
    expect(typeof api.applyTooltips).toBe('function');
    expect(typeof api.renderEmptyState).toBe('function');
  });
});
