// Section renderers — one function per nav tab. Each takes the main
// element + shared state and returns nothing; mutating state happens
// through the supplied `setState` callback so we can re-render on
// navigation/filter changes.

import type { OperatorGame, ABTest, Submission, Jurisdiction, GameStatus } from '@shared/types.js';
import { filterGames, filterSubmissions, sortBy } from '@shared/filters.js';
import { el, clear, formatPct, formatUsd, formatDate } from '@shared/dom.js';
import { computeCompliance, isAnomaly, makeRtpSeries, promoteWinner } from './data.js';
import type { AppState } from './main.js';

const ALL_JURIS: Jurisdiction[] = ['UKGC','MGA','NV','NJ','PA','MI','ON','BC','AAMS','DGA','SGA','KSA','GBGA','SK','AGCO'];

export function renderGameLibrary(host: HTMLElement, state: AppState, rerender: () => void, toast: (msg: string, kind?: 'ok' | 'warn' | 'err') => void): void {
  clear(host);

  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Game Library']),
      el('div', { className: 'crumb' }, [`${state.games.length} games · 26 IR Library · 38 workspace`]),
    ]),
    el('div', { className: 'actions' }, [
      el('button', { className: 'btn' }, ['Import GDD']),
      el('button', { className: 'btn primary' }, ['+ New Game']),
    ]),
  ]));

  // ── filter row ──
  const filterRow = el('div', { className: 'filter-row' });
  const searchInput = el('input', { placeholder: 'name / id / pid' }) as HTMLInputElement;
  searchInput.value = state.gameFilter.search ?? '';
  searchInput.addEventListener('input', () => { state.gameFilter.search = searchInput.value; rerender(); });
  filterRow.appendChild(el('label', {}, ['Search', searchInput]));

  const statusSel = el('select') as HTMLSelectElement;
  for (const s of ['any', 'live', 'paused', 'draft', 'archived'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.gameFilter.status === s) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', () => { state.gameFilter.status = statusSel.value as GameStatus | 'any'; rerender(); });
  filterRow.appendChild(el('label', {}, ['Status', statusSel]));

  const juriSel = el('select') as HTMLSelectElement;
  juriSel.appendChild(el('option', { value: 'any' }, ['any']));
  for (const j of ALL_JURIS) {
    const o = el('option', { value: j }, [j]) as HTMLOptionElement;
    if (state.gameFilter.jurisdiction === j) o.selected = true;
    juriSel.appendChild(o);
  }
  juriSel.addEventListener('change', () => { state.gameFilter.jurisdiction = juriSel.value as Jurisdiction | 'any'; rerender(); });
  filterRow.appendChild(el('label', {}, ['Jurisdiction', juriSel]));

  const rtpMin = el('input', { type: 'number', step: '0.01', placeholder: 'min', value: state.gameFilter.rtpMin ?? '' }) as HTMLInputElement;
  rtpMin.addEventListener('input', () => { state.gameFilter.rtpMin = rtpMin.value ? Number(rtpMin.value) : undefined; rerender(); });
  filterRow.appendChild(el('label', {}, ['RTP ≥', rtpMin]));

  const rtpMax = el('input', { type: 'number', step: '0.01', placeholder: 'max', value: state.gameFilter.rtpMax ?? '' }) as HTMLInputElement;
  rtpMax.addEventListener('input', () => { state.gameFilter.rtpMax = rtpMax.value ? Number(rtpMax.value) : undefined; rerender(); });
  filterRow.appendChild(el('label', {}, ['RTP ≤', rtpMax]));

  host.appendChild(filterRow);

  // ── grid ──
  const filtered = filterGames(state.games, state.gameFilter);
  const grid = el('div', { className: 'game-grid' });
  for (const g of filtered) grid.appendChild(makeGameCard(g, state.selectedGameId === g.gameId, () => { state.selectedGameId = g.gameId; rerender(); }));
  host.appendChild(grid);

  if (filtered.length === 0) {
    host.appendChild(el('p', { className: 'muted', style: 'text-align:center;padding:32px' }, ['No games match the current filter.']));
  }

  // ── detail panel ──
  const sel = state.games.find((g) => g.gameId === state.selectedGameId);
  if (sel) host.appendChild(makeGameDetail(sel, state, toast, rerender));
}

function makeGameCard(g: OperatorGame, isSelected: boolean, onClick: () => void): HTMLElement {
  const card = el('div', { className: `game-card ${isSelected ? 'is-selected' : ''}` });
  card.appendChild(el('h3', {}, [g.name]));
  card.appendChild(el('div', { className: 'id' }, [`${g.gameId} · ${g.pid} · v${g.version}`]));

  const metrics = el('div', { className: 'metrics' });
  metrics.appendChild(metric('RTP', formatPct(g.rtp)));
  metrics.appendChild(metric('Daily $', formatUsd(g.dailyRevenueUsd)));
  metrics.appendChild(metric('Hit', formatPct(g.hitFrequency, 1)));
  metrics.appendChild(metric('Vola', g.vola));
  card.appendChild(metrics);

  const row = el('div', { className: 'status-row' });
  row.appendChild(el('span', { className: `status-pill ${g.status}` }, [g.status]));
  const chips = el('div', { className: 'juri-chips' });
  for (const j of g.jurisdictions.slice(0, 5)) chips.appendChild(el('span', { className: 'juri-chip' }, [j]));
  if (g.jurisdictions.length > 5) chips.appendChild(el('span', { className: 'juri-chip' }, [`+${g.jurisdictions.length - 5}`]));
  row.appendChild(chips);
  card.appendChild(row);

  card.addEventListener('click', onClick);
  return card;
}

function metric(lbl: string, val: string): HTMLElement {
  return el('div', { className: 'metric' }, [el('span', { className: 'muted' }, [lbl]), el('strong', {}, [val])]);
}

function makeGameDetail(g: OperatorGame, state: AppState, toast: (m: string, k?: 'ok' | 'warn' | 'err') => void, rerender: () => void): HTMLElement {
  const panel = el('div', { className: 'detail-panel' });
  panel.appendChild(el('h2', {}, [g.name]));
  panel.appendChild(el('div', { className: 'muted' }, [`${g.supplier} · ${g.family} · ${g.pid}`]));

  const grid = el('div', { className: 'detail-grid' });
  for (const [lbl, val] of [
    ['RTP target', formatPct(g.rtp, 2)],
    ['Daily revenue', formatUsd(g.dailyRevenueUsd)],
    ['Hit frequency', formatPct(g.hitFrequency, 2)],
    ['Volatility', g.vola],
    ['Status', g.status],
    ['Version', g.version],
    ['Last updated', formatDate(g.lastUpdated)],
    ['Jurisdictions', g.jurisdictions.length === 0 ? '—' : g.jurisdictions.join(', ')],
  ] as const) {
    const cell = el('div', { className: 'cell' });
    cell.appendChild(el('div', { className: 'lbl' }, [lbl]));
    cell.appendChild(el('div', { className: 'val' }, [val]));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);

  const actions = el('div', { className: 'actions' });
  if (g.status === 'live') {
    const pauseBtn = el('button', { className: 'btn warn' }, ['Pause']);
    pauseBtn.addEventListener('click', () => { g.status = 'paused'; toast(`${g.name} paused`, 'warn'); rerender(); });
    actions.appendChild(pauseBtn);
  } else if (g.status === 'paused' || g.status === 'draft') {
    const deployBtn = el('button', { className: 'btn primary' }, ['Deploy']);
    deployBtn.addEventListener('click', () => { g.status = 'live'; toast(`${g.name} deployed`, 'ok'); rerender(); });
    actions.appendChild(deployBtn);
  }
  const certBtn = el('button', { className: 'btn' }, ['Submit for cert']);
  certBtn.addEventListener('click', () => toast(`Cert submission queued for ${g.name}`, 'ok'));
  actions.appendChild(certBtn);

  const archiveBtn = el('button', { className: 'btn err' }, ['Archive']);
  archiveBtn.addEventListener('click', () => { g.status = 'archived'; toast(`${g.name} archived`, 'err'); rerender(); });
  actions.appendChild(archiveBtn);
  panel.appendChild(actions);
  return panel;
}

// ───── Section 2: RTP Monitoring ─────
export function renderRtp(host: HTMLElement, state: AppState): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['RTP Monitoring']),
      el('div', { className: 'crumb' }, ['Hourly RTP for the last 24h · anomaly threshold ±2.0pp']),
    ]),
  ]));

  const liveGames = state.games.filter((g) => g.status === 'live');
  const cards = el('div', { className: 'rtp-charts' });
  for (const g of liveGames.slice(0, 24)) {
    const series = makeRtpSeries(g, 24);
    const anom = isAnomaly(series, g.rtp, 0.02);
    const card = el('div', { className: `rtp-card ${anom ? 'is-anomaly' : ''}` });
    card.appendChild(el('h3', {}, [g.name]));
    card.appendChild(el('div', { className: 'sub' }, [
      `target ${formatPct(g.rtp)} · current ${formatPct(series[series.length - 1].rtp)}${anom ? ' · ANOMALY' : ''}`,
    ]));
    card.appendChild(makeSparkline(series.map((s) => s.rtp), g.rtp));
    cards.appendChild(card);
  }
  host.appendChild(cards);
}

function makeSparkline(values: number[], baseline: number): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const W = 320, H = 80, P = 4;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const min = Math.min(baseline - 0.025, ...values);
  const max = Math.max(baseline + 0.025, ...values);
  const span = max - min || 1e-6;
  const xs = values.map((_, i) => P + (i * (W - 2 * P)) / (values.length - 1));
  const ys = values.map((v) => P + ((max - v) / span) * (H - 2 * P));
  // baseline
  const base = document.createElementNS(svgNS, 'line');
  const by = P + ((max - baseline) / span) * (H - 2 * P);
  base.setAttribute('x1', String(P)); base.setAttribute('x2', String(W - P));
  base.setAttribute('y1', String(by)); base.setAttribute('y2', String(by));
  base.setAttribute('stroke', '#3B4452'); base.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(base);
  // path
  const path = document.createElementNS(svgNS, 'path');
  let d = '';
  for (let i = 0; i < xs.length; i++) d += (i === 0 ? 'M' : 'L') + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1) + ' ';
  path.setAttribute('d', d.trim());
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#10B981');
  path.setAttribute('stroke-width', '1.5');
  svg.appendChild(path);
  return svg;
}

// ───── Section 3: A/B Testing ─────
export function renderAB(host: HTMLElement, state: AppState, rerender: () => void, toast: (m: string, k?: 'ok' | 'warn' | 'err') => void): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['A/B Testing Console']),
      el('div', { className: 'crumb' }, [`${state.abTests.filter(t => t.status === 'running').length} running · promote gate ≥1.0pp RTP`]),
    ]),
    el('div', { className: 'actions' }, [el('button', { className: 'btn primary' }, ['+ New A/B Test'])]),
  ]));

  const grid = el('div', { className: 'ab-grid' });
  for (const t of state.abTests) {
    const card = el('div', { className: 'ab-card' });
    const game = state.games.find((g) => g.gameId === t.gameId);
    card.appendChild(el('h3', {}, [game?.name ?? t.gameId]));
    card.appendChild(el('div', { className: 'muted' }, [`${t.testId} · ${t.jurisdiction} · started ${formatDate(t.startedAt)} · ${t.status}`]));

    const winner = promoteWinner(t, 1);
    const versus = el('div', { className: 'versus' });
    const sideA = el('div', { className: `side ${winner === 'A' ? 'is-winner' : ''}` });
    sideA.appendChild(el('h4', {}, ['Variant A']));
    sideA.appendChild(el('strong', {}, [formatPct(t.variantA.rtp)]));
    sideA.appendChild(el('div', { className: 'muted' }, [`${t.variantA.spinsToDate.toLocaleString()} spins · win ${formatPct(t.variantA.winRate, 1)}`]));
    versus.appendChild(sideA);
    const sideB = el('div', { className: `side ${winner === 'B' ? 'is-winner' : ''}` });
    sideB.appendChild(el('h4', {}, ['Variant B']));
    sideB.appendChild(el('strong', {}, [formatPct(t.variantB.rtp)]));
    sideB.appendChild(el('div', { className: 'muted' }, [`${t.variantB.spinsToDate.toLocaleString()} spins · win ${formatPct(t.variantB.winRate, 1)}`]));
    versus.appendChild(sideB);
    card.appendChild(versus);

    const deltaPp = (t.variantB.rtp - t.variantA.rtp) * 100;
    card.appendChild(el('div', { className: 'delta' }, [
      el('span', { className: 'arrow' }, [`Δ ${deltaPp.toFixed(2)}pp`]),
      ' · ',
      `traffic B = ${formatPct(t.trafficSplitB, 0)}`,
    ]));

    const promoteBtn = el('button', { className: 'btn primary promote' }, [winner ? `Promote Variant ${winner}` : 'No winner yet']) as HTMLButtonElement;
    if (!winner || t.status !== 'running') promoteBtn.disabled = true;
    promoteBtn.addEventListener('click', () => {
      t.status = 'completed';
      t.trafficSplitB = winner === 'B' ? 1 : 0;
      toast(`Promoted Variant ${winner} for ${game?.name ?? t.gameId}`, 'ok');
      rerender();
    });
    card.appendChild(promoteBtn);

    grid.appendChild(card);
  }
  host.appendChild(grid);
}

// ───── Section 4: Submission Tracker ─────
export function renderSubmissions(host: HTMLElement, state: AppState, rerender: () => void, toast: (m: string, k?: 'ok' | 'warn' | 'err') => void): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Submission Tracker']),
      el('div', { className: 'crumb' }, [`${state.submissions.length} submissions tracked`]),
    ]),
    el('div', { className: 'actions' }, [
      el('button', { className: 'btn primary' }, ['+ Submit New']),
    ]),
  ]));

  const filterRow = el('div', { className: 'filter-row' });
  const search = el('input', { placeholder: 'game / operator / id' }) as HTMLInputElement;
  search.value = state.subsFilter.search ?? '';
  search.addEventListener('input', () => { state.subsFilter.search = search.value; rerender(); });
  filterRow.appendChild(el('label', {}, ['Search', search]));

  const statusSel = el('select') as HTMLSelectElement;
  for (const s of ['any', 'pending', 'in_review', 'approved', 'rejected', 'needs_revision'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.subsFilter.status === s) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', () => { state.subsFilter.status = statusSel.value as any; rerender(); });
  filterRow.appendChild(el('label', {}, ['Status', statusSel]));

  const juriSel = el('select') as HTMLSelectElement;
  juriSel.appendChild(el('option', { value: 'any' }, ['any']));
  for (const j of ALL_JURIS) {
    const o = el('option', { value: j }, [j]) as HTMLOptionElement;
    if (state.subsFilter.jurisdiction === j) o.selected = true;
    juriSel.appendChild(o);
  }
  juriSel.addEventListener('change', () => { state.subsFilter.jurisdiction = juriSel.value as any; rerender(); });
  filterRow.appendChild(el('label', {}, ['Jurisdiction', juriSel]));
  host.appendChild(filterRow);

  const tbl = el('table', { className: 'tbl' });
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['Submission', 'Game', 'Operator', 'Juris.', 'RTP', 'Status', 'Priority', 'Submitted', '']) tr.appendChild(el('th', {}, [h]));
  thead.appendChild(tr); tbl.appendChild(thead);
  const tbody = el('tbody');
  const filtered = sortBy(filterSubmissions(state.submissions, state.subsFilter), (s) => s.submittedAt, 'desc');
  for (const s of filtered) {
    const row = el('tr');
    row.appendChild(el('td', { className: 'mono' }, [s.submissionId]));
    row.appendChild(el('td', {}, [s.gameName]));
    row.appendChild(el('td', {}, [s.operator]));
    row.appendChild(el('td', { className: 'mono' }, [s.jurisdiction]));
    row.appendChild(el('td', { className: 'mono' }, [formatPct(s.rtp)]));
    row.appendChild(el('td', {}, [el('span', { className: `status-pill ${s.status === 'approved' ? 'live' : s.status === 'rejected' ? 'archived' : 'paused'}` }, [s.status])]));
    row.appendChild(el('td', {}, [s.priority]));
    row.appendChild(el('td', { className: 'mono' }, [formatDate(s.submittedAt)]));
    const actBtn = el('button', { className: 'btn' }, ['View PAR']);
    actBtn.addEventListener('click', (e) => { e.stopPropagation(); toast(`Opening PAR sheet ${s.parSheetUrl}`, 'ok'); });
    row.appendChild(el('td', {}, [actBtn]));
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  host.appendChild(tbl);
}

// ───── Section 5: Compliance Overview ─────
export function renderCompliance(host: HTMLElement, state: AppState, rerender: () => void): void {
  clear(host);
  const cells = computeCompliance(state.games, state.submissions);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Compliance Overview']),
      el('div', { className: 'crumb' }, [`${cells.length} jurisdictions monitored · ${cells.reduce((a, c) => a + c.liveCount, 0)} live deployments`]),
    ]),
  ]));

  const grid = el('div', { className: 'juri-grid' });
  for (const c of cells) {
    const card = el('div', { className: 'juri-card' });
    card.appendChild(el('h3', {}, [c.jurisdiction]));
    const stats = el('div', { className: 'stats' });
    stats.appendChild(el('div', {}, [el('strong', {}, [String(c.liveCount)]), 'Live']));
    stats.appendChild(el('div', {}, [el('strong', {}, [String(c.pendingCount)]), 'Pending']));
    stats.appendChild(el('div', {}, [el('strong', { style: c.violationCount > 0 ? 'color:var(--err)' : '' }, [String(c.violationCount)]), 'Violations']));
    card.appendChild(stats);
    card.addEventListener('click', () => {
      state.selectedJurisdiction = c.jurisdiction;
      state.gameFilter.jurisdiction = c.jurisdiction;
      state.currentSection = 'library';
      rerender();
    });
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
