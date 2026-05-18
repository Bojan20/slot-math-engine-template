/**
 * Slide 7 — Multi-tenant + Compliance.
 *
 * 15 jurisdictions × 11 rules = 165 verdicts. The compliance story is
 * a single page, not a 6-month manual review.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 7,
  section: 'MULTI-TENANT & COMPLIANCE',
  title: '15 jurisdictions × 11 rules = 165 verdicts, all on one page.',
  subtitle:
    'Each ring of defense is independently testable. Each verdict cites the source clause. Compliance review collapses from weeks to hours.',
  bodyHtml: `
    <div class="lw-juris-grid">
      <div class="lw-juris-card">UKGC RTS-12 / RTS-14</div>
      <div class="lw-juris-card">MGA PPD §11 / §15 / §16 / §17</div>
      <div class="lw-juris-card">AGCO Ontario</div>
      <div class="lw-juris-card">AU NCPF Schedule 3 / 4</div>
      <div class="lw-juris-card">EU GA 2024</div>
      <div class="lw-juris-card">NIGC 25 CFR 542.7</div>
      <div class="lw-juris-card">ADM (Italy)</div>
      <div class="lw-juris-card">DGOJ (Spain)</div>
      <div class="lw-juris-card">Romania ONJN</div>
      <div class="lw-juris-card">Sweden SGA</div>
      <div class="lw-juris-card">Denmark Spillemyndigheden</div>
      <div class="lw-juris-card">NJ DGE / PA PGCB</div>
      <div class="lw-juris-card">MI MGCB / WV LCB</div>
      <div class="lw-juris-card">Ontario AGCO / Quebec RACJ</div>
      <div class="lw-juris-card">Curaçao + Anjouan offshore</div>
    </div>
    <h3 class="lw-h3">3-ring tenant isolation</h3>
    <ol class="lw-numbered-list">
      <li><strong>Outer ring:</strong> per-tenant namespace + JWT scope claim — no cross-tenant route possible at the HTTP layer.</li>
      <li><strong>Middle ring:</strong> <code>AsyncLocalStorage</code> tenant context carries across every async hop; SQL interceptor injects <code>tenant_id</code> WHERE clause on every query.</li>
      <li><strong>Inner ring:</strong> per-tenant HSM key partition + per-tenant Merkle root in PAR commitment — even a leaked tenant secret can't sign for another tenant.</li>
    </ol>
    <div class="lw-callout">
      Cert verdict for any (game, jurisdiction) pair takes <strong>&lt; 50 ms</strong>
      and ships with a citation trail to the regulator clause. Compliance
      teams sign the page, not investigate it.
    </div>
  `,
};
