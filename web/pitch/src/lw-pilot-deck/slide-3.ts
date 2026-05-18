/**
 * Slide 3 — 16/16 L&W Coverage.
 *
 * Table of M-gaps M1..M16 closed against L&W mechanics with wave + commit
 * pinned. This is the credibility slide — every row is cite-able and
 * pinned in `docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md`.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 3,
  section: '16/16 L&W COVERAGE',
  title: 'Every L&W gap closed — M1 through M16, pinned to commit.',
  subtitle:
    'Independent KIMI deep research cross-referenced the engine catalog against L&W studio rosters (Bally, WMS, Shuffle Master, Barcrest, Lightning Box). Every novel mechanic has a closed-form solver.',
  bodyHtml: `
    <div class="lw-table-wrap">
      <table class="lw-coverage-table">
        <thead>
          <tr>
            <th>M-Gap</th>
            <th>L&amp;W Mechanic</th>
            <th>Studio / Title</th>
            <th>Wave</th>
            <th>Solver</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>M1</td><td>Per-reel cash bag + row multiplier</td><td>SG Digital · Dragon Spin CrossLink</td><td>W185</td><td>cashBagRowMult</td></tr>
          <tr><td>M2</td><td>Frame upgrade Markov (Huff family)</td><td>L&amp;W · Huff N' Puff series</td><td>W183</td><td>frameUpgradeMarkov</td></tr>
          <tr><td>M3</td><td>Dynamic grid row expansion during H&amp;S</td><td>Bally · Ultimate Fire Link</td><td>W182</td><td>dynamicRowExpand</td></tr>
          <tr><td>M4</td><td>Deterministic-grid explosion add-multipliers</td><td>Bally · Dancing Drums Explosion</td><td>W187</td><td>explosionGridMult</td></tr>
          <tr><td>M5</td><td>Reel-bound mystery progressive (Quick Hit)</td><td>Bally · Quick Hit family</td><td>W181</td><td>quickHitReelBound</td></tr>
          <tr><td>M6</td><td>Stacked multi-wheel composition</td><td>Bally · Triple Cash Wheel</td><td>W196</td><td>stackedWheelComp</td></tr>
          <tr><td>M7</td><td>Colossal reels wild-transfer coupling</td><td>WMS · Spartacus Gladiator of Rome</td><td>W184</td><td>colossalWildTransfer</td></tr>
          <tr><td>M8</td><td>Trail-board sequential step progression</td><td>WMS · Lord of the Rings Trail</td><td>W186</td><td>trailBoardProgression</td></tr>
          <tr><td>M9</td><td>Megaways variable-height (BTG patent expired)</td><td>L&amp;W · 88 Fortunes Megaways</td><td>W188</td><td>variableReelHeight</td></tr>
          <tr><td>M10</td><td>Bachelier first-passage bankroll bust</td><td>responsible gambling triad UK/AU/EU</td><td>W157</td><td>sessionBankrollDrawdown</td></tr>
          <tr><td>M11</td><td>Symbol-multiplier on reel stop</td><td>Sweet Bonanza tumble · Bigger Bass</td><td>W188</td><td>symbolMultReelStop</td></tr>
          <tr><td>M12</td><td>Random feature injection during FS</td><td>L&amp;W · Wizard of Oz Munchkinland</td><td>W189</td><td>randomFeatureInjection</td></tr>
          <tr><td>M13</td><td>Cascade meter charge-up trigger</td><td>Reactoonz Quantum Leap · Stack 'Em</td><td>W146</td><td>cascadeMeterCharge</td></tr>
          <tr><td>M14</td><td>Nested mini-slot inside bonus</td><td>LOTR Two Towers · Star Trek</td><td>W190</td><td>nestedMiniSlot</td></tr>
          <tr><td>M15</td><td>Voltage / XP meter K-tier reward</td><td>Hacksaw Stack 'Em · Push Wild Swarm</td><td>W150</td><td>voltageXpKTier</td></tr>
          <tr><td>M16</td><td>Bonus trigger award tier stratification</td><td>Sweet Bonanza 3/4/5 · Hacksaw RIP City</td><td>W152</td><td>bonusTriggerStrat</td></tr>
        </tbody>
      </table>
    </div>
    <div class="lw-footnote">
      Each row is verifiable: <code>docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md</code>
      + commit hash pinned in the master TODO. Acceptance proof: 6/6 industry
      configs × 20–200K MC samples per solver, deterministic byte-for-byte.
    </div>
  `,
};
