/**
 * Slide 6 — Marketplace Ecosystem.
 *
 * 6 templates, 8 themes, author revenue share. The "L&W as marketplace
 * operator" story.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 6,
  section: 'MARKETPLACE ECOSYSTEM',
  title: 'Templates, themes, authors — L&W as the platform, not just a publisher.',
  subtitle:
    'A configured engine becomes a substrate. Anyone with the IR file can ship the next title — internal studios, external authors, L&W partners.',
  bodyHtml: `
    <div class="lw-mp-grid">
      <div class="lw-mp-block">
        <div class="lw-mp-head">6 Templates Live</div>
        <ul>
          <li>Quick Hit Dragons (Wave 209 baseline, $25K)</li>
          <li>Huff N' Puff Storm Cellar pilot</li>
          <li>Quick Hit Platinum Phoenix</li>
          <li>Rainbow Riches Megaways Vault</li>
          <li>Spartacus Colossal Conquest</li>
          <li>Dragon Train Chi Lin pattern (template-ready)</li>
        </ul>
      </div>
      <div class="lw-mp-block">
        <div class="lw-mp-head">8 Themes Catalog</div>
        <ul>
          <li>Classic Vegas neon</li>
          <li>Asian dragon / fortune</li>
          <li>Egyptian / Cleopatra</li>
          <li>Norse / Vikings</li>
          <li>Wild West / saloon</li>
          <li>Fruits / classic 3-reel</li>
          <li>Sci-fi / cyberpunk</li>
          <li>Fantasy / dungeons</li>
        </ul>
      </div>
      <div class="lw-mp-block">
        <div class="lw-mp-head">Author Revenue Model</div>
        <ul>
          <li>70/30 revenue share (W209 baseline)</li>
          <li>5% platform commission template default</li>
          <li>License-JWT signed by HSM</li>
          <li>Cert badges per jurisdiction</li>
          <li>Author cert-on-publish required</li>
          <li>Royalties auto-routed via wallet provider</li>
        </ul>
      </div>
    </div>
    <div class="lw-callout">
      <strong>Why this matters for L&amp;W:</strong> the marketplace flips
      L&amp;W's cost structure. Instead of paying 12+ studios fully loaded,
      L&amp;W operates the platform and earns 30% on every external author
      title that ships. Forecast (conservative, see ROI slide):
      <strong>$8–15M in marketplace ARR by end of Year 2.</strong>
    </div>
    <div class="lw-footnote">
      SDK spec: <code>docs/MARKETPLACE_API.md</code> ·
      Author guide: <code>docs/MARKETPLACE_AUTHOR_GUIDE.md</code> ·
      Template list: <code>docs/MARKETPLACE_TEMPLATES.md</code>.
    </div>
  `,
};
