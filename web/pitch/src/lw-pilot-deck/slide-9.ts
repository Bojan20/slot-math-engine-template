/**
 * Slide 9 — Pilot Path: Day 0 → Day 30.
 *
 * Timeline-grade. Single page. No ambiguity.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 9,
  section: 'PILOT PATH',
  title: 'Day 0 to Day 30 — seed, integrate, dossier, production-ready.',
  subtitle: 'Single contact, single tarball, single hour to first signed spin.',
  bodyHtml: `
    <div class="lw-timeline">
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D0</div>
        <div class="lw-timeline-body">
          <strong>Seed handoff (Hour 0).</strong> NDA executed.
          <code>pitch-bundle.tar.gz</code> delivered to L&amp;W CTO.
          L&amp;W math team receives engine + 5 reference IRs +
          replay harness.
        </div>
      </div>
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D3</div>
        <div class="lw-timeline-body">
          <strong>First signed spin.</strong> L&amp;W team imports one
          existing title's PAR (e.g. Dragon Train Chi Lin), engine
          reproduces RTP within 0.05pp, signs first dossier in dev HSM.
        </div>
      </div>
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D7</div>
        <div class="lw-timeline-body">
          <strong>Pilot tenant provisioned.</strong> Dedicated L&amp;W
          tenant on platform — 1 jurisdiction (UKGC), 1 brand (Bally), 3
          titles. Engineering integration call cadence: 2/week.
        </div>
      </div>
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D14</div>
        <div class="lw-timeline-body">
          <strong>Internal lab dry-run.</strong> L&amp;W math team
          regenerates dossier for 3 titles, compares against L&amp;W
          internal cert pipeline. Discrepancies (if any) are math-team
          line-by-line review.
        </div>
      </div>
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D21</div>
        <div class="lw-timeline-body">
          <strong>External lab submission.</strong> First dossier
          submitted to GLI/BMM/eCOGRA (L&amp;W's choice). Engine team
          stands ready for cert-cycle review questions.
        </div>
      </div>
      <div class="lw-timeline-step">
        <div class="lw-timeline-dot">D30</div>
        <div class="lw-timeline-body">
          <strong>Decision point.</strong> Pilot review meeting. Three
          paths on the table (see Commercial Terms slide).
          Production-ready: 5 jurisdictions wired, 10 titles ported,
          marketplace stub deployed.
        </div>
      </div>
    </div>
    <div class="lw-callout">
      The pilot is structured so L&amp;W's math team retains full
      veto authority at every gate. The engine is not a black box —
      it's an IR interpreter L&amp;W can read end-to-end from day one.
    </div>
  `,
};
