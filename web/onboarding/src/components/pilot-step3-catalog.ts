// W210 Faza 600.0 — pilot step 3: catalog selection.
import type { CatalogStepData } from '../pilot-flow.js';

export interface CatalogItem {
  id: string;
  name: string;
  kind: 'kernel' | 'template';
}

export interface CatalogRender {
  data: CatalogStepData;
  available: CatalogItem[];
  errors: string[];
}

export function renderCatalogStep({ data, available, errors }: CatalogRender): string {
  const kernels = available.filter((a) => a.kind === 'kernel');
  const templates = available.filter((a) => a.kind === 'template');
  const renderItems = (items: CatalogItem[], picked: string[]): string =>
    items
      .map(
        (it) =>
          `<label><input type="checkbox" value="${escape(it.id)}"${
            picked.includes(it.id) ? ' checked' : ''
          } /> ${escape(it.name)}</label>`
      )
      .join('');
  const errHtml = errors.length
    ? `<ul class="ob-errors">${errors.map((e) => `<li>${escape(e)}</li>`).join('')}</ul>`
    : '';
  return `<section class="pilot-step pilot-step-catalog">
  <h2 data-i18n-key="onboarding.pilot.step3.title">3 · Catalog selection</h2>
  <h3>Kernels</h3>
  <div class="pilot-catalog-list">${renderItems(kernels, data.kernelIds)}</div>
  <h3>Templates</h3>
  <div class="pilot-catalog-list">${renderItems(templates, data.templateIds)}</div>
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
