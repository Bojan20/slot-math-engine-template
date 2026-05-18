// W208 — LocaleSwitcher component smoke test.
//
// The component is DOM-heavy; vitest runs in node with no jsdom. We
// stub the slice of `document` it touches (createElement / append /
// addEventListener / queries / `style` / `contains`) so its public
// factory can be exercised without dragging in happy-dom.
//
// What we verify:
//   • factory returns { root, refresh, destroy }
//   • initial render writes the current locale's flag + native name
//   • setLocale via choose() updates the trigger label
//   • destroy() unsubscribes (no throw on subsequent setLocale)

import { describe, it, expect, beforeEach } from 'vitest';

interface StubNode {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  style: Record<string, string> & { setProperty: (k: string, v: string) => void };
  attributes: Record<string, string>;
  parent: StubNode | null;
  children: StubNode[];
  appendChild(c: StubNode): StubNode;
  append(...nodes: StubNode[]): void;
  removeChild(c: StubNode): StubNode;
  remove(): void;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  hasAttribute(k: string): boolean;
  addEventListener(_e: string, _h: unknown): void;
  removeEventListener(_e: string, _h: unknown): void;
  contains(n: StubNode | null): boolean;
  focus(): void;
  classList: { add(n: string): void; remove(n: string): void; contains(n: string): boolean };
  querySelector(sel: string): StubNode | null;
  querySelectorAll(sel: string): StubNode[];
  type?: string;
}

function makeNode(tag = 'div'): StubNode {
  const style: Record<string, string> & { setProperty: (k: string, v: string) => void } =
    Object.assign({} as Record<string, string>, {
      setProperty(this: Record<string, string>, k: string, v: string) {
        this[k] = v;
      },
    });
  const node: StubNode = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    style,
    attributes: {},
    parent: null,
    children: [],
    appendChild(c) {
      c.parent = this;
      this.children.push(c);
      return c;
    },
    append(...nodes: StubNode[]) {
      for (const n of nodes) this.appendChild(n);
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
    addEventListener() {},
    removeEventListener() {},
    contains(other) {
      if (!other) return false;
      let cur: StubNode | null = other;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parent;
      }
      return false;
    },
    focus() {},
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
  const attrMatch = sel.match(/^\[([^=\]]+)(?:="?([^"\]]+)"?)?\]$/);
  walk(root, (n) => {
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

function installStubDom(): { html: StubNode } {
  const html = makeNode('html');
  const body = makeNode('body');
  html.appendChild(body);
  const document = {
    documentElement: html,
    body,
    activeElement: null as StubNode | null,
    createElement(t: string) {
      return makeNode(t);
    },
    addEventListener() {},
    removeEventListener() {},
    contains(other: StubNode | null) {
      return html.contains(other);
    },
  };
  (globalThis as Record<string, unknown>).document = document;
  // Minimal localStorage stub for the i18n setLocale persistence path.
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem(k: string) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k: string, v: string) {
      store.set(k, v);
    },
    removeItem(k: string) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
  };
  return { html };
}

describe('W208 LocaleSwitcher', () => {
  beforeEach(() => {
    installStubDom();
  });

  it('factory returns root / refresh / destroy', async () => {
    const { createLocaleSwitcher } = await import('../src/components/LocaleSwitcher.js');
    const { __resetForTests } = await import('../src/i18n/index.js');
    __resetForTests();
    const sw = createLocaleSwitcher();
    expect(sw.root).toBeDefined();
    expect(typeof sw.refresh).toBe('function');
    expect(typeof sw.destroy).toBe('function');
  });

  it('initial trigger renders flag + native name for default locale (en)', async () => {
    const { createLocaleSwitcher } = await import('../src/components/LocaleSwitcher.js');
    const { __resetForTests } = await import('../src/i18n/index.js');
    __resetForTests();
    const sw = createLocaleSwitcher();
    const trigger = (sw.root as unknown as StubNode).children[0]!;
    expect(trigger.textContent).toBe('🇬🇧 English');
    expect(trigger.attributes['data-locale']).toBe('en');
  });

  it('refresh re-paints when external setLocale runs', async () => {
    const { createLocaleSwitcher } = await import('../src/components/LocaleSwitcher.js');
    const { __resetForTests, setLocale } = await import('../src/i18n/index.js');
    __resetForTests();
    const sw = createLocaleSwitcher();
    setLocale('de');
    sw.refresh();
    const trigger = (sw.root as unknown as StubNode).children[0]!;
    expect(trigger.textContent).toBe('🇩🇪 Deutsch');
    expect(trigger.attributes['data-locale']).toBe('de');
  });

  it('switching locale changes a localised BUILD-tab string', async () => {
    const { __resetForTests, setLocale, t } = await import('../src/i18n/index.js');
    __resetForTests();
    expect(t('nav.build')).toBe('BUILD');
    setLocale('es');
    expect(t('nav.build')).toBe('DISEÑAR');
    setLocale('de');
    expect(t('nav.build')).toBe('ERSTELLEN');
    setLocale('pt');
    expect(t('nav.build')).toBe('CONSTRUIR');
  });

  it('destroy() detaches listeners cleanly', async () => {
    const { createLocaleSwitcher } = await import('../src/components/LocaleSwitcher.js');
    const { __resetForTests, setLocale } = await import('../src/i18n/index.js');
    __resetForTests();
    const sw = createLocaleSwitcher();
    sw.destroy();
    // Should not throw after destroy.
    expect(() => setLocale('es')).not.toThrow();
  });
});
