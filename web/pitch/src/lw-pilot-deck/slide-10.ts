/**
 * Slide 10 — Commercial Terms.
 *
 * Three options (Acquire / License / Partnership). Honest ranges.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 10,
  section: 'COMMERCIAL TERMS',
  title: 'Three paths. Honest ranges. No surprises.',
  subtitle: 'These are starting positions — final terms are subject to math-team diligence, IP review (already prepared), and L&W board approval.',
  bodyHtml: `
    <div class="lw-terms-grid">
      <div class="lw-terms-card">
        <div class="lw-terms-head">A · Acquire</div>
        <div class="lw-terms-price">$200M – $500M</div>
        <ul>
          <li>Full IP transfer (engine + IR spec + 16 mechanic kernels)</li>
          <li>Founding team 24-month retention</li>
          <li>L&amp;W operates platform exclusively</li>
          <li>Marketplace revenue 100% to L&amp;W</li>
          <li>Range: 200M for engine + math; 500M with full ecosystem + 24m team</li>
        </ul>
      </div>
      <div class="lw-terms-card">
        <div class="lw-terms-head">B · License</div>
        <div class="lw-terms-price">$8M / yr + 3% rev share</div>
        <ul>
          <li>L&amp;W operates platform under license</li>
          <li>Engine team continues development</li>
          <li>L&amp;W veto on roadmap items</li>
          <li>Marketplace revenue 70/30 (L&amp;W gets 70)</li>
          <li>5-year minimum, renewable</li>
        </ul>
      </div>
      <div class="lw-terms-card">
        <div class="lw-terms-head">C · Partnership</div>
        <div class="lw-terms-price">JV equity 30–49%</div>
        <ul>
          <li>JV co-developed, co-branded</li>
          <li>L&amp;W contributes brands + studios + ops</li>
          <li>Engine team contributes platform + roadmap</li>
          <li>Marketplace revenue split per equity ratio</li>
          <li>5-year exit option to L&amp;W at agreed multiple</li>
        </ul>
      </div>
    </div>
    <div class="lw-callout">
      <strong>Recommended starting position:</strong> Option B (license)
      converting to Option A (acquire) at the 18-month checkpoint if
      portfolio coverage and marketplace ARR hit milestones. This
      de-risks both sides.
    </div>
    <div class="lw-footnote">
      Anchoring data points: Wave 209 set the $25K Quick Hit Dragons
      template price; the Faza 200.7/200.8 acquisition narrative in
      <code>SLOT_ENGINE_MASTER_TODO.md</code> lines 487+ documents the
      $200M–$500M range origin.
    </div>
  `,
};
