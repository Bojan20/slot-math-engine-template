// W210 Faza 600.0 — pilot step 4: compliance attestation.
import type { ComplianceStepData } from '../pilot-flow.js';

export interface ComplianceRender {
  data: ComplianceStepData;
  jurisdictions: string[];
  errors: string[];
}

export function renderComplianceStep({
  data,
  jurisdictions,
  errors,
}: ComplianceRender): string {
  const rows = jurisdictions
    .map(
      (j) =>
        `<label class="pilot-compl-row"><input type="checkbox" data-jur="${escape(
          j
        )}"${data.attestations[j] ? ' checked' : ''} /> Attest RTS/PPD for ${escape(j)}</label>`
    )
    .join('');
  const errHtml = errors.length
    ? `<ul class="ob-errors">${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul>`
    : '';
  return `<section class="pilot-step pilot-step-compliance">
  <h2 data-i18n-key="onboarding.pilot.step4.title">4 · Compliance attestation</h2>
  ${rows}
  <label>Signed by<input id="pilot-c-name" value="${escape(data.signedByName)}" /></label>
  ${errHtml}
</section>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
