/**
 * W214 Faza 800.1 Agent C — landing hero block.
 *
 * Above-the-fold band: headline, subtitle, dual CTA. The headline
 * is intentionally claim-first (engineering wins → cycle-time win):
 *
 *   "Math Engine That Ships Slot Games in Days, Not Months."
 *
 * Sub-copy expands on the closed-form + cert-paper-trail message
 * without slipping into marketing fluff — the same numbers the
 * one-pager carries (W213).
 */

export interface HeroProps {
  headline?: string;
  subtitle?: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

export const DEFAULT_HERO: Required<HeroProps> = {
  headline: 'Math Engine That Ships Slot Games in Days, Not Months.',
  subtitle:
    '77 closed-form solvers. 16 of 16 L&W mechanics covered. 4 cert labs ' +
    'plugged in. Reproducible byte-identical math across TS + Rust. ' +
    'Your math team builds — we deliver the cert paper trail.',
  primaryCta: { label: 'See pricing', href: './pages/pricing.html' },
  secondaryCta: { label: 'Download pitch tarball', href: './pages/contact.html' },
};

export function renderHeroHtml(props: HeroProps = {}): string {
  const p = { ...DEFAULT_HERO, ...props };
  return `
    <section class="hero" data-component="hero">
      <div class="wrap">
        <h1>${escape(p.headline)}</h1>
        <p class="subtitle">${escape(p.subtitle)}</p>
        <div class="hero-ctas">
          <a class="btn btn-primary" href="${p.primaryCta.href}">${escape(p.primaryCta.label)} →</a>
          <a class="btn btn-secondary" href="${p.secondaryCta.href}">${escape(p.secondaryCta.label)}</a>
        </div>
      </div>
    </section>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
