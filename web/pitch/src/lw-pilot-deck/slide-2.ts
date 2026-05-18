/**
 * Slide 2 — The 3-Slide Reality.
 *
 * Side-by-side L&W current state vs platform state for the three numbers
 * that matter to a slot studio CFO: months per game, $/game lab cost,
 * and certification cycles per year.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 2,
  section: 'THE 3-SLIDE REALITY',
  title: 'Today: months per title, $80K+ in lab fees. Tomorrow: weeks, near-zero marginal.',
  subtitle: 'Three numbers, one platform, asymmetric outcome.',
  bodyHtml: `
    <div class="lw-comparison-grid">
      <div class="lw-compare-col current">
        <div class="lw-compare-head">L&amp;W today (per game)</div>
        <ul>
          <li><strong>6–10 weeks</strong> per jurisdiction lab cycle</li>
          <li><strong>$40–80K</strong> lab fee + $250K total dev cost</li>
          <li><strong>26 weeks</strong> design → cabinet floor</li>
          <li>Re-certify every paytable swap (regulator demand)</li>
          <li>Math engine binary tightly coupled to title</li>
          <li>Dossiers manually compiled from 4 internal teams</li>
        </ul>
      </div>
      <div class="lw-compare-col platform">
        <div class="lw-compare-head">Platform (per game)</div>
        <ul>
          <li><strong>200 ms</strong> dossier build (cert-dossier-build.mjs)</li>
          <li><strong>$0</strong> marginal lab fee (engine certified once)</li>
          <li><strong>3–6 weeks</strong> design → cabinet (IR-first workflow)</li>
          <li>Paytable swap = re-run IR through the same interpreter</li>
          <li>Single engine binary hosts unbounded IR library</li>
          <li>Dossiers regenerated from IR + commit hash by <code>npm run</code></li>
        </ul>
      </div>
    </div>
    <div class="lw-metrics-row">
      <div class="lw-metric">
        <div class="lw-metric-value">4.3x</div>
        <div class="lw-metric-label">faster time-to-market</div>
      </div>
      <div class="lw-metric">
        <div class="lw-metric-value">~75%</div>
        <div class="lw-metric-label">cost reduction per title</div>
      </div>
      <div class="lw-metric">
        <div class="lw-metric-value">5+ yr</div>
        <div class="lw-metric-label">re-certify any title on demand</div>
      </div>
    </div>
    <div class="lw-footnote">
      Sources: Wave 209 pricing baseline ($25K Quick Hit Dragons template),
      L&amp;W FY24 investor disclosures, GLI/BMM/eCOGRA published lab
      timelines.
    </div>
  `,
};
