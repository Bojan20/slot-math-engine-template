// W210 Faza 600.0 — pilot step 5: deploy preview.
import type { PilotFlowState, PilotSubmission } from '../pilot-flow.js';
import { buildSubmission } from '../pilot-flow.js';

export interface PreviewRender {
  state: PilotFlowState;
  errors: string[];
}

export function renderPreviewStep({ state, errors }: PreviewRender): string {
  const sub: PilotSubmission = buildSubmission(state);
  // Strip the apiSecret before rendering so a screenshot never leaks it.
  const safeSub = {
    ...sub,
    wallet: { ...sub.wallet, config: { ...sub.wallet.config, apiSecret: '***REDACTED***' } },
  };
  const errHtml = errors.length
    ? `<ul class="ob-errors">${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul>`
    : '';
  return `<section class="pilot-step pilot-step-preview">
  <h2 data-i18n-key="onboarding.pilot.step5.title">5 · Deploy preview</h2>
  <pre class="pilot-deploy-json">${escape(JSON.stringify(safeSub, null, 2))}</pre>
  <label><input id="pilot-p-approve" type="checkbox"${
    state.preview.approved ? ' checked' : ''
  } /> I approve this deployment</label>
  <label>Notes<textarea id="pilot-p-notes" rows="3">${escape(state.preview.notes)}</textarea></label>
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
