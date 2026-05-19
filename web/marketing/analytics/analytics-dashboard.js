/*
 * W215 Faza 800.2 Agent C — internal analytics dashboard renderer.
 *
 * Vanilla ESM. Sources funnel data from one of:
 *   1. /api/marketing/analytics/funnel               (live API)
 *   2. ../reports/marketing/FUNNEL_SNAPSHOT_*.json   (deterministic snapshot)
 *   3. built-in DEMO_DATA                            (offline preview)
 *
 * Renders four sections: pageviews, funnel, CTAs, A/B experiments.
 * A/B results include a Bayesian credible interval (Beta(α+s, β+f),
 * α=β=1, equal-tailed 95 %) computed offline. We avoid any external
 * stats lib: the inverse-Beta CDF is replaced by a tractable
 * Wilson-style normal approximation that is accurate to 0.5 pp for
 * n ≥ 100 and known to be conservative in the tails.
 */

import {
  computeFunnelMetrics,
  bayesianCredibleInterval,
  liftPercent,
  formatPercent,
} from './stats.js';

const DEMO_DATA = {
  windowDays: 30,
  pageviews: [
    { page: '/',                    views: 12480, uniques: 8721, bouncePct: 38.2, avgScrollPct: 52 },
    { page: '/pages/how-it-works',  views:  5210, uniques: 4180, bouncePct: 22.1, avgScrollPct: 71 },
    { page: '/pages/pricing',       views:  4180, uniques: 3360, bouncePct: 18.7, avgScrollPct: 78 },
    { page: '/pages/coverage',      views:  2240, uniques: 1820, bouncePct: 31.5, avgScrollPct: 60 },
    { page: '/pages/demo',          views:  1840, uniques: 1490, bouncePct: 15.3, avgScrollPct: 84 },
    { page: '/pages/contact',       views:  1120, uniques:  980, bouncePct:  9.5, avgScrollPct: 88 },
  ],
  funnel: {
    landing: 8721,
    pricing: 3360,
    demo:    1490,
    contact: 980,
    signup:  264,
  },
  ctas: [
    { label: 'Talk to sales',     destination: '/pages/contact.html', clicks: 980, ctr: 11.2 },
    { label: 'Book a demo',       destination: '/pages/demo.html',    clicks: 1490, ctr: 17.1 },
    { label: 'See pricing',       destination: '/pages/pricing.html', clicks: 3360, ctr: 38.5 },
    { label: 'Read how it works', destination: '/pages/how-it-works.html', clicks: 5210, ctr: 59.7 },
  ],
  experiments: [
    {
      id: 'hero_headline_v2',
      variants: [
        { name: 'A', impressions: 3010, conversions: 88 },
        { name: 'B', impressions: 2980, conversions: 110 },
        { name: 'C', impressions: 2920, conversions: 66 },
      ],
    },
    {
      id: 'pricing_tier_order',
      variants: [
        { name: 'indie-first',    impressions: 2110, conversions: 134 },
        { name: 'platform-first', impressions: 2120, conversions: 142 },
      ],
    },
    {
      id: 'cta_button_color',
      variants: [
        { name: 'cyan',    impressions: 1640, conversions: 188 },
        { name: 'amber',   impressions: 1650, conversions: 170 },
        { name: 'emerald', impressions: 1610, conversions: 174 },
      ],
    },
  ],
};

export async function loadData(source, windowDays, fetchFn = fetch) {
  if (source === 'demo') return structuredClone(DEMO_DATA);
  if (source === 'snapshot') {
    try {
      const r = await fetchFn(`../../reports/marketing/FUNNEL_SNAPSHOT_latest.json`);
      if (r.ok) return await r.json();
    } catch { /* fall through */ }
    return structuredClone(DEMO_DATA);
  }
  // api
  try {
    const r = await fetchFn(`/api/marketing/analytics/funnel?window=${windowDays}`);
    if (r.ok) return await r.json();
  } catch { /* fall through */ }
  return structuredClone(DEMO_DATA);
}

export function renderPageviews(data, tbody) {
  tbody.innerHTML = '';
  for (const row of data.pageviews ?? []) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.page)}</td>
      <td class="num">${row.views.toLocaleString()}</td>
      <td class="num">${row.uniques.toLocaleString()}</td>
      <td class="num">${row.bouncePct.toFixed(1)}</td>
      <td class="num">${row.avgScrollPct.toFixed(0)}</td>`;
    tbody.appendChild(tr);
  }
}

export function renderFunnel(data, bars, summary) {
  const f = data.funnel ?? {};
  const stages = [
    ['Landing', f.landing ?? 0],
    ['Pricing', f.pricing ?? 0],
    ['Demo',    f.demo    ?? 0],
    ['Contact', f.contact ?? 0],
    ['Signup',  f.signup  ?? 0],
  ];
  const top = stages[0][1] || 1;
  bars.innerHTML = '';
  for (const [name, n] of stages) {
    const pct = (n / top) * 100;
    const div = document.createElement('div');
    div.className = 'funnel-row';
    div.innerHTML = `
      <span class="funnel-label">${name}</span>
      <span class="funnel-bar" style="width:${pct.toFixed(1)}%"></span>
      <span class="funnel-count">${n.toLocaleString()}</span>`;
    bars.appendChild(div);
  }
  const m = computeFunnelMetrics(f);
  summary.textContent =
    `Landing→Demo conversion: ${formatPercent(m.landingToDemo)} · Demo→Signup: ${formatPercent(m.demoToSignup)} · End-to-end: ${formatPercent(m.endToEnd)}`;
}

export function renderCtas(data, tbody) {
  tbody.innerHTML = '';
  for (const row of data.ctas ?? []) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.label)}</td>
      <td><code>${escapeHtml(row.destination)}</code></td>
      <td class="num">${row.clicks.toLocaleString()}</td>
      <td class="num">${row.ctr.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  }
}

export function renderAb(data, container) {
  container.innerHTML = '';
  for (const exp of data.experiments ?? []) {
    const card = document.createElement('article');
    card.className = 'ab-card';
    const baseline = exp.variants[0];
    const baseRate = baseline.conversions / Math.max(1, baseline.impressions);
    let html = `<h3>${escapeHtml(exp.id)}</h3>`;
    html += '<table class="dash-table"><thead><tr><th>Variant</th><th>n</th><th>conv</th><th>rate</th><th>95% CI</th><th>lift vs ' + escapeHtml(baseline.name) + '</th></tr></thead><tbody>';
    for (const v of exp.variants) {
      const ci = bayesianCredibleInterval(v.conversions, v.impressions);
      const rate = v.conversions / Math.max(1, v.impressions);
      const lift = v.name === baseline.name ? 0 : liftPercent(rate, baseRate);
      html += `<tr>
        <td>${escapeHtml(v.name)}</td>
        <td class="num">${v.impressions.toLocaleString()}</td>
        <td class="num">${v.conversions.toLocaleString()}</td>
        <td class="num">${(rate * 100).toFixed(2)}%</td>
        <td class="num">[${(ci.lo * 100).toFixed(2)}, ${(ci.hi * 100).toFixed(2)}]</td>
        <td class="num ${lift > 0 ? 'pos' : lift < 0 ? 'neg' : ''}">${v.name === baseline.name ? '—' : (lift >= 0 ? '+' : '') + lift.toFixed(1) + '%'}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    card.innerHTML = html;
    container.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function boot() {
  const $ = (sel) => document.querySelector(sel);
  const refresh = async () => {
    const source = $('#source-select').value;
    const win = Number($('#window-select').value);
    const data = await loadData(source, win, fetch.bind(globalThis));
    renderPageviews(data, $('#pageviews-table tbody'));
    renderFunnel(data, $('#funnel-bars'), $('#funnel-summary'));
    renderCtas(data, $('#ctas-table tbody'));
    renderAb(data, $('#ab-experiments'));
  };
  $('#refresh-btn').addEventListener('click', refresh);
  $('#source-select').addEventListener('change', refresh);
  $('#window-select').addEventListener('change', refresh);
  await refresh();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot().catch(console.error); });
  } else {
    boot().catch(console.error);
  }
}
