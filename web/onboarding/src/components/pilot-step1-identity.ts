// W210 Faza 600.0 — pilot step 1: operator identity.
// Cyan+onyx palette. Logic lives in `../pilot-flow.ts`; this file
// renders raw HTML strings for the static onboarding shell.
import type { IdentityStepData } from '../pilot-flow.js';

export interface IdentityRender {
  data: IdentityStepData;
  errors: string[];
}

export function renderIdentityStep({ data, errors }: IdentityRender): string {
  const j = data.jurisdictions.join(', ');
  const r = data.regulators.join(', ');
  const errHtml = errors.length
    ? `<ul class="ob-errors">${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul>`
    : '';
  return `<section class="pilot-step pilot-step-identity">
  <h2 data-i18n-key="onboarding.pilot.step1.title">1 · Operator identity</h2>
  <label>Operator name<input id="pilot-op-name" value="${escape(data.operatorName)}" /></label>
  <label>Primary contact email<input id="pilot-op-email" value="${escape(data.primaryContactEmail)}" type="email" /></label>
  <label>Jurisdictions<input id="pilot-op-jur" value="${escape(j)}" placeholder="UKGC, MGA, SE" /></label>
  <label>Regulators<input id="pilot-op-reg" value="${escape(r)}" placeholder="GamCom, MGA, Spelinspektionen" /></label>
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
