/**
 * W214 Faza 800.1 Agent C — six-card feature grid.
 *
 * Each card is a single capability the engine ships out of the box.
 * The list mirrors the W211 deck's "platform pillars" slide so the
 * marketing story stays consistent across artifacts.
 */

export interface Feature {
  icon: string; // glyph or 1-2 char marker
  title: string;
  body: string;
}

export const DEFAULT_FEATURES: ReadonlyArray<Feature> = Object.freeze([
  {
    icon: 'Σ',
    title: 'Closed-form math',
    body:
      'Every solver ships a closed-form RTP/variance ground-truth, ' +
      'reconciled against ≥1M Monte Carlo spins. No more 6-week MC sweeps.',
  },
  {
    icon: 'M',
    title: 'Marketplace SDK',
    body:
      'Drop-in template SDK so partner studios can ship into your ' +
      'storefront. 30% rev-share defaults, fully audited.',
  },
  {
    icon: 'W',
    title: 'Wallet integrations',
    body:
      'Pre-plumbed adapters for the 9 most-asked wallet APIs. ' +
      'Per-tenant config, byte-identical reconciliation, P95 ≤ 30 ms.',
  },
  {
    icon: 'L',
    title: 'Lab cert pipeline',
    body:
      'BMM, GLI, eCOGRA, NMi — all plugged. Auto-generate the dossier ' +
      'each lab expects from one IR file. Ed25519-signed manifests.',
  },
  {
    icon: '↗',
    title: 'Canary deployment',
    body:
      '5%/25%/100% canary ramps with automated RTP drift guard. Promotion ' +
      'and rollback both reversible in < 60 seconds.',
  },
  {
    icon: '✓',
    title: 'Compliance gates',
    body:
      '15 live jurisdictions. Per-jurisdiction enforcement of stake ' +
      'caps, RG flags, audit retention, replay determinism.',
  },
]);

export function renderFeatureGridHtml(
  features: ReadonlyArray<Feature> = DEFAULT_FEATURES
): string {
  const cards = features
    .map(
      (f) => `
        <article class="feature-card">
          <div class="icon" aria-hidden="true">${escape(f.icon)}</div>
          <h3>${escape(f.title)}</h3>
          <p>${escape(f.body)}</p>
        </article>`
    )
    .join('');
  return `<div class="feature-grid" data-component="feature-grid">${cards}</div>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
