// Tiny DOM helpers — keeps app code declarative without a full framework.
// We deliberately avoid React / Vue: studio is hand-rolled too, and a
// dependency-free mini-app boots faster in regulator review labs that
// may run on locked-down government workstations.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = String(v);
    else if (k === 'dataset') continue;
    else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function formatPct(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatUsd(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
