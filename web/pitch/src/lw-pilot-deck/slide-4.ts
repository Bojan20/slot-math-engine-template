/**
 * Slide 4 — 77 Closed-Form Solvers.
 *
 * Where the engine stands vs the rest of the industry. Solver count is
 * the cleanest "moat" number — nobody else publishes one.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 4,
  section: '77 CLOSED-FORM SOLVERS',
  title: '77 closed-form math kernels — ~2.5x the published surface of any peer.',
  subtitle:
    'Closed-form means: ground-truth RTP from a formula, not a Monte Carlo estimate. Regulators pin to it. MC validates it.',
  bodyHtml: `
    <div class="lw-bar-compare">
      <div class="lw-bar-row"><span class="lw-bar-label">Slot Math Engine Platform</span>
        <span class="lw-bar lw-bar-us" style="width: 77%;">77</span></div>
      <div class="lw-bar-row"><span class="lw-bar-label">Aristocrat (Lightning / Dragon Link)</span>
        <span class="lw-bar lw-bar-them" style="width: 32%;">~32 est.</span></div>
      <div class="lw-bar-row"><span class="lw-bar-label">IGT (Dynamic Reels / DJ Wild)</span>
        <span class="lw-bar lw-bar-them" style="width: 28%;">~28 est.</span></div>
      <div class="lw-bar-row"><span class="lw-bar-label">Pragmatic Play (Megaways / BetterPlay)</span>
        <span class="lw-bar lw-bar-them" style="width: 22%;">~22 est.</span></div>
      <div class="lw-bar-row"><span class="lw-bar-label">Hacksaw Gaming math engine</span>
        <span class="lw-bar lw-bar-them" style="width: 14%;">~14 est.</span></div>
    </div>
    <div class="lw-callout">
      Peer estimates are based on published GLI/eCOGRA cert dossiers,
      patent filings, and developer interview transcripts — they don't
      publish solver counts, so this is an inferred ceiling. The engine
      publishes every solver name in <code>docs/INDUSTRY_PATTERN_CATALOG.md</code>
      and runs a CI portfolio gate that fails if any solver regresses.
    </div>
    <h3 class="lw-h3">Categories covered (the math taxonomy)</h3>
    <ul class="lw-two-col-list">
      <li>Hold-and-Win value-based + filled-count + tiered</li>
      <li>Cascade / tumble / avalanche with Wald compound-sum</li>
      <li>Multi-tier jackpot (mystery progressive, must-hit-by, WAP)</li>
      <li>Free spins compound variance (Wald + retrigger)</li>
      <li>Symbol upgrade chain Markov + multi-level wild tier</li>
      <li>Megaways variable-height ways (BTG patent expired 2023)</li>
      <li>Bonus buy + ante bet trade-off + crossover analyzer</li>
      <li>Responsible-gambling triad (W154 / W157 / W161)</li>
      <li>Martingale / Paroli sequential bet progression</li>
      <li>Compensated math (UK B3/B3A AWP cycle convergence)</li>
      <li>Exact enumeration ground-truth RTP (W63 / W68)</li>
      <li>Hit-frequency distribution decomposition (W159)</li>
    </ul>
  `,
};
