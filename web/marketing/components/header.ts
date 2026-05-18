/**
 * W214 Faza 800.1 Agent C — site header / nav.
 *
 * Shared across all marketing pages. Renders the brand mark, primary
 * navigation, and the top-right "Talk to sales" CTA. The active link
 * is auto-highlighted via the `current` param.
 */

export type NavKey = 'home' | 'how' | 'pricing' | 'coverage' | 'demo' | 'docs' | 'contact';

export interface NavLink {
  key: NavKey;
  href: string;
  label: string;
}

export const NAV_LINKS: ReadonlyArray<NavLink> = Object.freeze([
  { key: 'how', href: './pages/how-it-works.html', label: 'How it works' },
  { key: 'pricing', href: './pages/pricing.html', label: 'Pricing' },
  { key: 'coverage', href: './pages/coverage.html', label: 'Coverage' },
  { key: 'demo', href: './pages/demo.html', label: 'Demo' },
  { key: 'docs', href: './pages/docs.html', label: 'Docs' },
]);

function rewrite(href: string, depth: number): string {
  if (depth === 0) return href;
  // From pages/* → strip "./pages/" and prefix "./"
  return href.replace(/^\.\/pages\//, './');
}

export function renderHeaderHtml(opts: { current: NavKey; depth?: 0 | 1 }): string {
  const depth = opts.depth ?? 0;
  const homeHref = depth === 0 ? './index.html' : '../index.html';
  const contactHref = depth === 0 ? './pages/contact.html' : './contact.html';
  const links = NAV_LINKS.map((l) => {
    const isActive = l.key === opts.current;
    const href = depth === 0 ? l.href : rewrite(l.href, depth);
    return `<a href="${href}" class="${isActive ? 'active' : ''}">${l.label}</a>`;
  }).join('');
  return `
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="${homeHref}">
          <span class="logo" aria-hidden="true"></span>
          <span>slot-math-engine</span>
        </a>
        <nav class="nav" aria-label="Primary">
          ${links}
        </nav>
        <a class="btn btn-primary" href="${contactHref}">Talk to sales</a>
      </div>
    </header>`;
}
