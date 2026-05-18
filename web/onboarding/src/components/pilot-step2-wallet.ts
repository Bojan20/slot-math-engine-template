// W210 Faza 600.0 — pilot step 2: wallet integration.
import type { WalletStepData } from '../pilot-flow.js';

const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: 'generic-pam', label: 'Generic PAM / REST' },
  { id: 'microgaming-style', label: 'Microgaming-style (MGS)' },
  { id: 'netent-aggregator', label: 'NetEnt-Aggregator / MGS Quickfire' },
  { id: 'playtech-style', label: 'Playtech IMS' },
];

export interface WalletRender {
  data: WalletStepData;
  errors: string[];
}

export function renderWalletStep({ data, errors }: WalletRender): string {
  const opts = PROVIDER_OPTIONS.map(
    (p) =>
      `<option value="${p.id}"${
        p.id === data.provider ? ' selected' : ''
      }>${p.label}</option>`
  ).join('');
  const errHtml = errors.length
    ? `<ul class="ob-errors">${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul>`
    : '';
  const lat = data.connectionLatencyMs
    ? `<span class="ok-pill">connection OK · ${data.connectionLatencyMs}ms</span>`
    : '';
  return `<section class="pilot-step pilot-step-wallet">
  <h2 data-i18n-key="onboarding.pilot.step2.title">2 · Wallet integration</h2>
  <label>Provider<select id="pilot-w-provider"><option value="">— pick —</option>${opts}</select></label>
  <label>Base URL<input id="pilot-w-baseurl" type="url" value="${escape(data.baseUrl)}" placeholder="https://wallet.example.com/v1" /></label>
  <label>API secret<input id="pilot-w-secret" type="password" value="${escape(data.apiSecret)}" /></label>
  <label>Operator ID<input id="pilot-w-opid" value="${escape(data.operatorId)}" /></label>
  <button id="pilot-w-test">Test connection</button>
  ${lat}
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
