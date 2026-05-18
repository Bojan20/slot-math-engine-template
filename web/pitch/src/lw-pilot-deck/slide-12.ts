/**
 * Slide 12 — Next Steps.
 *
 * Single contact, single tarball, single hour. Closing slide.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 12,
  section: 'NEXT STEPS',
  title: 'One contact. One tarball. One hour.',
  subtitle: 'Everything else is detail.',
  bodyHtml: `
    <div class="lw-close-grid">
      <div class="lw-close-card">
        <div class="lw-close-num">1</div>
        <div class="lw-close-head">NDA + pitch-bundle.tar.gz</div>
        <p>
          One-line email to project lead returns signed NDA + a single
          tarball containing the engine binary, 5 reference IRs, the
          replay harness, this deck, and the technical deep-dive
          document.
        </p>
      </div>
      <div class="lw-close-card">
        <div class="lw-close-num">2</div>
        <div class="lw-close-head">60-minute technical session</div>
        <p>
          L&amp;W's CTO + math lead, our engine architect, our compliance
          lead. Agenda: live demo, RTP reproduction of one Bally title,
          dossier generation walk-through, Q&amp;A. Zero slides — just
          the engine.
        </p>
      </div>
      <div class="lw-close-card">
        <div class="lw-close-num">3</div>
        <div class="lw-close-head">30-day pilot decision</div>
        <p>
          L&amp;W picks the title, the jurisdiction, the lab. We provision
          the tenant. Day 30 review meeting puts the three commercial
          paths on the table. Decision optional but defaulted to "yes."
        </p>
      </div>
    </div>
    <div class="lw-final-cta">
      <div class="lw-cta-line">Single contact:</div>
      <div class="lw-cta-email">pilot@slotmathengine.example</div>
      <div class="lw-cta-sub">
        Confidential · Subject line: "L&amp;W Pilot · [Your Name]"
      </div>
    </div>
    <div class="lw-footnote">
      This deck, the technical deep-dive, the ROI calculator, the
      competitive comparison, the three demo storyboards, and the
      pilot pitch guide are all in the same tarball. Everything you
      need to evaluate is in your hands today.
    </div>
  `,
};
