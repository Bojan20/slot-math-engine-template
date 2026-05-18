/**
 * Slide 11 — Risk Mitigations.
 *
 * Honest risk register. Mitigation per row.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 11,
  section: 'RISK MITIGATIONS',
  title: 'What could go wrong — and what we do about it.',
  subtitle: 'Risk is not absence of failure. Risk is failure unhandled.',
  bodyHtml: `
    <div class="lw-table-wrap">
      <table class="lw-risk-table">
        <thead>
          <tr><th>Risk</th><th>Likelihood</th><th>Mitigation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Regulator rejects new cert paper trail format</td>
            <td>Low</td>
            <td>Cert dossier is GLI-19 / BMM / eCOGRA / NMi compliant by spec; pre-submission walkthroughs with 2 labs already completed.</td>
          </tr>
          <tr>
            <td>RNG hardening fails an audit (TestU01 / NIST)</td>
            <td>Very low</td>
            <td>5 PRNG backends + HSM bridge, SP 800-90B entropy assessment per source, 4-OS parity gate runs nightly, FIPS 140-3 IG D.K health tests.</td>
          </tr>
          <tr>
            <td>L&amp;W math team finds RTP discrepancy in port</td>
            <td>Medium (expected)</td>
            <td>Exact-enumeration ground truth (W63/W68) settles every discrepancy by formula, not statistics. Diff is reviewed line-by-line in joint session.</td>
          </tr>
          <tr>
            <td>Multi-tenant data leak</td>
            <td>Very low</td>
            <td>3-ring defense (network / async-context / HSM partition). Pen-test plan + threat model documented. SOC2 Type 1 prep complete.</td>
          </tr>
          <tr>
            <td>Engine performance regresses post-acquisition</td>
            <td>Low</td>
            <td>Mutation-score CI gate ≥ 90% promotion target. Performance budget guards in CI. Load tests reproducible from <code>scripts/load-test-*.mjs</code>.</td>
          </tr>
          <tr>
            <td>Founding team leaves</td>
            <td>Medium</td>
            <td>24-month retention in Option A. ~50K LOC + 7,000+ tests + onboarding docs ensure platform survives team transitions. Two-brain rule: TS + Rust always parity.</td>
          </tr>
          <tr>
            <td>Aristocrat / IGT counter-bid</td>
            <td>Possible</td>
            <td>Exclusivity window during pilot. NDA + IP review (<code>docs/IP_REVIEW.md</code>) ensures no overlap with peer claims.</td>
          </tr>
          <tr>
            <td>Marketplace doesn't reach Year-2 ARR target</td>
            <td>Medium</td>
            <td>Pricing flexibility (template floor $5K, ceiling $50K). 70/30 split adjustable. L&amp;W can rebrand marketplace to internal-only studio tool with no engineering changes.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="lw-callout">
      Every row in this table is something the platform has already
      thought through and built against. The risk register doesn't get
      shorter after acquisition — it gets shared.
    </div>
  `,
};
