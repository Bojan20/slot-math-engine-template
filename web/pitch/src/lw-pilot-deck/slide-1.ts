/**
 * Slide 1 — Title slide.
 *
 * Cover slide for the L&W C-level deck. Establishes the platform name,
 * the pilot framing, and the one-line tagline.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 1,
  section: 'TITLE',
  title: 'Slot Math Engine Platform — L&W Acceleration Pilot',
  subtitle:
    'A single substrate that hosts your full math portfolio, ships cert-ready dossiers in minutes, and turns every L&W studio into a marketplace.',
  bodyHtml: `
    <div class="lw-hero-block">
      <p class="lw-lede">
        Built between Wave 33 and Wave 210 — 178 waves, 7,000+ tests,
        77 closed-form solvers, 100% L&amp;W mechanic coverage,
        16 mechanic-gap closures (M1–M16), 15 jurisdictions live,
        and a marketplace SDK with revenue share built in.
      </p>
      <div class="lw-hero-stats">
        <div class="lw-stat">
          <div class="lw-stat-value">77</div>
          <div class="lw-stat-label">closed-form solvers</div>
        </div>
        <div class="lw-stat">
          <div class="lw-stat-value">100%</div>
          <div class="lw-stat-label">L&amp;W mechanic coverage</div>
        </div>
        <div class="lw-stat">
          <div class="lw-stat-value">15</div>
          <div class="lw-stat-label">jurisdictions live</div>
        </div>
        <div class="lw-stat">
          <div class="lw-stat-value">100</div>
          <div class="lw-stat-label">CI cert gates (Wave 190 century)</div>
        </div>
      </div>
      <div class="lw-callout">
        <strong>The thesis:</strong> the math is the IR. The engine is the
        IR interpreter, certified once, hosting an unbounded library of
        L&amp;W titles. You stop paying for one math engine per game —
        you start paying for one platform that hosts all of them.
      </div>
      <div class="lw-meta-strip">
        <span>Prepared for: L&amp;W C-Suite + Math Team</span>
        <span>·</span>
        <span>Confidential</span>
        <span>·</span>
        <span>Pilot window: 30 days</span>
      </div>
    </div>
  `,
};
