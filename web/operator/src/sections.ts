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
// W204-PROTOCOLS — adds an optional Live Mode that streams spin events
// from the GaaS WebSocket and shows a rolling RTP for the top 3 live
// games. The "🟢 LIVE" indicator lights up while the socket is open.
//
// W207-ANALYTICS — adds:
//   - real-time line chart of last 100 RTP values per game,
//   - anomaly markers when local 3-sigma trigger fires,
//   - alert toast queue + per-game anomaly history table,
//   - "Investigate" drill-down panel.
interface LiveAggregate {
  spins: number;
  bet: number;
  win: number;
  recentRtp: number[]; // rolling per-spin RTP samples
  // W207 — Welford running stats for local 3-sigma anomaly detection.
  mean: number;
  m2: number;
  anomalies: { ts: number; observed: number; expected: number; severity: string }[];
}
interface AnomalyAlert {
  gameId: string;
  observed: number;
  expected: number;
  delta: number;
  severity: 'info' | 'warning' | 'critical';
  ts: number;
}
let liveSocket: WebSocket | null = null;
const liveAgg = new Map<string, LiveAggregate>();
const anomalyHistory: AnomalyAlert[] = [];
let liveIndicatorEl: HTMLElement | null = null;
let liveStripEl: HTMLElement | null = null;
let liveChartHostEl: HTMLElement | null = null;
let anomalyTableEl: HTMLElement | null = null;
let drillDownEl: HTMLElement | null = null;
let activeDrillDown: string | null = null;
let toastQueueEl: HTMLElement | null = null;

function pushToast(msg: string, kind: 'ok' | 'warn' | 'err'): void {
  if (!toastQueueEl) return;
  const t = el('div', { className: `analytics-toast ${kind}` }, [msg]);
  toastQueueEl.appendChild(t);
  setTimeout(() => { try { toastQueueEl?.removeChild(t); } catch { /* ignore */ } }, 4500);
}

function disconnectLive(): void {
  try { liveSocket?.close(); } catch { /* ignore */ }
  liveSocket = null;
  liveAgg.clear();
  anomalyHistory.length = 0;
  if (liveIndicatorEl) {
    liveIndicatorEl.textContent = 'OFFLINE';
    liveIndicatorEl.className = 'live-indicator is-off';
  }
}

function connectLive(targetGameIds: string[], expectedByGame: Map<string, number>): void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
  if (liveSocket) return;
  const apiBase = (window as { __OPERATOR_API__?: string }).__OPERATOR_API__ ?? 'ws://localhost:4000';
  const url = apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/api/gaas/live?role=operator';
  let ws: WebSocket;
  try { ws = new WebSocket(url); } catch { return; }
  liveSocket = ws;
  ws.onopen = () => {
    if (liveIndicatorEl) {
      liveIndicatorEl.textContent = '\u{1F7E2} LIVE';
      liveIndicatorEl.className = 'live-indicator is-on';
    }
    ws.send(JSON.stringify({ type: 'subscribe', sessionIds: targetGameIds }));
    // W207-ANALYTICS — opt into the analytics broadcast channel as well.
    ws.send(JSON.stringify({ type: 'subscribe-analytics', role: 'operator' }));
  };
  ws.onmessage = (ev) => {
    let msg: { type?: string; gameId?: string; balance?: number; win?: number; bet?: number; category?: string; payload?: { gameId?: string; bet?: number; value?: number } };
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); }
    catch { return; }
    if (!msg) return;
    if (msg.type === 'spin' && msg.gameId) {
      const id = msg.gameId;
      const bet = typeof msg.bet === 'number' ? msg.bet : 1;
      const win = typeof msg.win === 'number' ? msg.win : 0;
      ingestSample(id, bet, win, expectedByGame.get(id) ?? 0.96);
    } else if (msg.type === 'analytics' && msg.payload?.gameId && (msg.category === 'win' || msg.category === 'loss')) {
      const id = msg.payload.gameId;
      const bet = Number(msg.payload.bet ?? 1);
      const win = Number(msg.payload.value ?? 0);
      ingestSample(id, bet, win, expectedByGame.get(id) ?? 0.96);
    }
  };
  ws.onclose = () => { disconnectLive(); };
  ws.onerror = () => { /* error pre-open already triggers close */ };
}

function ingestSample(id: string, bet: number, win: number, expected: number): void {
  const agg = liveAgg.get(id) ?? {
    spins: 0, bet: 0, win: 0, recentRtp: [],
    mean: 0, m2: 0, anomalies: [],
  };
  const rtpSample = bet > 0 ? win / bet : 0;
  agg.spins += 1;
  agg.bet += bet;
  agg.win += win;
  agg.recentRtp.push(rtpSample);
  if (agg.recentRtp.length > 100) agg.recentRtp.shift();
  // Welford
  const delta = rtpSample - agg.mean;
  agg.mean += delta / agg.spins;
  const delta2 = rtpSample - agg.mean;
  agg.m2 += delta * delta2;
  liveAgg.set(id, agg);
  // 3-sigma anomaly detector — needs enough samples + non-zero variance.
  if (agg.spins >= 50) {
    const variance = agg.m2 / (agg.spins - 1);
    const std = Math.sqrt(variance);
    if (std > 0) {
      const z = (agg.mean - expected) / (std / Math.sqrt(agg.spins));
      const delta = agg.mean - expected;
      if (Math.abs(z) > 3.0) {
        const severity: AnomalyAlert['severity'] =
          Math.abs(delta) > 0.05 ? 'critical' : Math.abs(delta) > 0.02 ? 'warning' : 'info';
        const alert: AnomalyAlert = {
          gameId: id, observed: agg.mean, expected, delta,
          severity, ts: Date.now(),
        };
        agg.anomalies.push({ ts: alert.ts, observed: alert.observed, expected, severity });
        anomalyHistory.push(alert);
        if (anomalyHistory.length > 500) anomalyHistory.shift();
        pushToast(
          `Drift on ${id}: observed ${(alert.observed * 100).toFixed(2)}% vs ${(expected * 100).toFixed(2)}% (Δ${(delta * 100).toFixed(2)}pp)`,
          severity === 'critical' ? 'err' : severity === 'warning' ? 'warn' : 'ok'
        );
      }
    }
  }
  renderLiveStrip();
  renderLiveChart();
  renderAnomalyTable();
  if (activeDrillDown === id) renderDrillDown(id);
}

function renderLiveStrip(): void {
  if (!liveStripEl) return;
  const rows = Array.from(liveAgg.entries()).map(([gid, a]) => {
    const liveRtp = a.bet > 0 ? a.win / a.bet : 0;
    return `<div class="live-row"><b class="mono">${gid}</b><span class="mono">${a.spins} spins</span><span class="mono">RTP ${(liveRtp * 100).toFixed(2)}%</span></div>`;
  });
  liveStripEl.innerHTML = rows.length
    ? rows.join('')
    : '<div class="muted">Waiting for spin events…</div>';
}

function renderLiveChart(): void {
  if (!liveChartHostEl) return;
  clear(liveChartHostEl);
  for (const [gid, agg] of liveAgg.entries()) {
    if (agg.recentRtp.length < 2) continue;
    const card = el('div', { className: `live-chart-card` });
    card.appendChild(el('h4', {}, [`${gid} (${agg.spins} spins · μ ${(agg.mean * 100).toFixed(2)}%)`]));
    card.appendChild(makeLineChart(agg.recentRtp, agg.mean, agg.anomalies.length));
    liveChartHostEl.appendChild(card);
  }
}

function makeLineChart(values: number[], baseline: number, anomalyCount: number): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  const W = 480, H = 100, P = 6;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const min = Math.min(baseline - 0.1, ...values);
  const max = Math.max(baseline + 0.1, ...values);
  const span = max - min || 1e-6;
  const xs = values.map((_, i) => P + (i * (W - 2 * P)) / Math.max(1, values.length - 1));
  const ys = values.map((v) => P + ((max - v) / span) * (H - 2 * P));
  // baseline
  const base = document.createElementNS(svgNS, 'line');
  const by = P + ((max - baseline) / span) * (H - 2 * P);
  base.setAttribute('x1', String(P)); base.setAttribute('x2', String(W - P));
  base.setAttribute('y1', String(by)); base.setAttribute('y2', String(by));
  base.setAttribute('stroke', '#3B4452'); base.setAttribute('stroke-dasharray', '4 4');
  svg.appendChild(base);
  // path
  const path = document.createElementNS(svgNS, 'path');
  let d = '';
  for (let i = 0; i < xs.length; i++) d += (i === 0 ? 'M' : 'L') + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1) + ' ';
  path.setAttribute('d', d.trim());
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', anomalyCount > 0 ? '#EF4444' : '#10B981');
  path.setAttribute('stroke-width', '1.6');
  svg.appendChild(path);
  // Anomaly markers — last point pulse if anomaly count > 0.
  if (anomalyCount > 0 && xs.length > 0) {
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(xs[xs.length - 1]));
    c.setAttribute('cy', String(ys[ys.length - 1]));
    c.setAttribute('r', '4');
    c.setAttribute('fill', '#EF4444');
    svg.appendChild(c);
  }
  return svg;
}

function renderAnomalyTable(): void {
  if (!anomalyTableEl) return;
  clear(anomalyTableEl);
  if (anomalyHistory.length === 0) {
    anomalyTableEl.appendChild(el('div', { className: 'muted' }, ['No anomalies detected.']));
    return;
  }
  const tbl = el('table', { className: 'tbl' });
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['Time', 'Game', 'Observed', 'Expected', 'Δ', 'Severity', '']) {
    tr.appendChild(el('th', {}, [h]));
  }
  thead.appendChild(tr); tbl.appendChild(thead);
  const tbody = el('tbody');
  const rows = anomalyHistory.slice(-25).reverse();
  for (const a of rows) {
    const row = el('tr');
    row.appendChild(el('td', { className: 'mono' }, [new Date(a.ts).toISOString().slice(11, 19)]));
    row.appendChild(el('td', { className: 'mono' }, [a.gameId]));
    row.appendChild(el('td', { className: 'mono' }, [`${(a.observed * 100).toFixed(2)}%`]));
    row.appendChild(el('td', { className: 'mono' }, [`${(a.expected * 100).toFixed(2)}%`]));
    row.appendChild(el('td', { className: 'mono' }, [`${(a.delta * 100).toFixed(2)}pp`]));
    row.appendChild(el('td', {}, [el('span', { className: `status-pill ${a.severity === 'critical' ? 'archived' : a.severity === 'warning' ? 'paused' : 'live'}` }, [a.severity])]));
    const btn = el('button', { className: 'btn' }, ['Investigate']) as HTMLButtonElement;
    btn.addEventListener('click', () => { activeDrillDown = a.gameId; renderDrillDown(a.gameId); });
    row.appendChild(el('td', {}, [btn]));
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  anomalyTableEl.appendChild(tbl);
}

function renderDrillDown(gameId: string): void {
  if (!drillDownEl) return;
  clear(drillDownEl);
  const agg = liveAgg.get(gameId);
  if (!agg) {
    drillDownEl.appendChild(el('div', { className: 'muted' }, ['No live data for this game.']));
    return;
  }
  const panel = el('div', { className: 'detail-panel' });
  panel.appendChild(el('h2', {}, [`Investigate: ${gameId}`]));
  const grid = el('div', { className: 'detail-grid' });
  for (const [lbl, val] of [
    ['Spins', String(agg.spins)],
    ['Cumulative bet', agg.bet.toFixed(2)],
    ['Cumulative win', agg.win.toFixed(2)],
    ['Running mean RTP', `${(agg.mean * 100).toFixed(3)}%`],
    ['Sample variance', (agg.spins > 1 ? agg.m2 / (agg.spins - 1) : 0).toFixed(6)],
    ['Anomalies (live)', String(agg.anomalies.length)],
  ] as const) {
    const cell = el('div', { className: 'cell' });
    cell.appendChild(el('div', { className: 'lbl' }, [lbl]));
    cell.appendChild(el('div', { className: 'val mono' }, [val]));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
  drillDownEl.appendChild(panel);
}

export function renderRtp(host: HTMLElement, state: AppState): void {
  clear(host);

  // ── Section head with Live Mode toggle ────────────────────────
  const head = el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['RTP Monitoring']),
      el('div', { className: 'crumb' }, ['Hourly RTP for the last 24h · anomaly threshold ±2.0pp']),
    ]),
  ]);
  const liveBox = el('div', { className: 'actions' });
  const indicator = el('span', { className: `live-indicator ${liveSocket ? 'is-on' : 'is-off'}` }, [
    liveSocket ? '\u{1F7E2} LIVE' : 'OFFLINE',
  ]);
  liveIndicatorEl = indicator;
  const toggle = el('button', { className: `btn ${liveSocket ? 'warn' : 'primary'}` }, [
    liveSocket ? 'Disconnect Live' : 'Enable Live Mode',
  ]) as HTMLButtonElement;
  toggle.addEventListener('click', () => {
    if (liveSocket) {
      disconnectLive();
    } else {
      const topGames = state.games.filter((g) => g.status === 'live').slice(0, 3);
      const expected = new Map(topGames.map((g) => [g.gameId, g.rtp] as const));
      connectLive(topGames.map((g) => g.gameId), expected);
    }
    // Force a re-render of the toggle button + indicator label without
    // a full app rerender — operator dashboard owns the strip's state.
    toggle.textContent = liveSocket ? 'Disconnect Live' : 'Enable Live Mode';
    toggle.className = `btn ${liveSocket ? 'warn' : 'primary'}`;
  });
  liveBox.appendChild(indicator);
  liveBox.appendChild(toggle);
  head.appendChild(liveBox);
  host.appendChild(head);

  // W207-ANALYTICS — toast queue.
  const toasts = el('div', { className: 'analytics-toast-queue' });
  toastQueueEl = toasts;
  host.appendChild(toasts);

  // Strip placeholder — populated by message handler.
  const strip = el('div', { className: 'live-strip' });
  liveStripEl = strip;
  renderLiveStrip();
  host.appendChild(strip);

  // W207-ANALYTICS — live chart panel.
  const chartHost = el('div', { className: 'live-chart-grid' });
  liveChartHostEl = chartHost;
  renderLiveChart();
  host.appendChild(chartHost);

  // W207-ANALYTICS — anomaly history table.
  const anomHead = el('h2', { style: 'margin-top:16px;' }, ['Anomaly history']);
  const anomTable = el('div', { className: 'anomaly-table' });
  anomalyTableEl = anomTable;
  renderAnomalyTable();
  host.appendChild(anomHead);
  host.appendChild(anomTable);

  // W207-ANALYTICS — drill-down panel.
  const drill = el('div', { className: 'drill-down' });
  drillDownEl = drill;
  if (activeDrillDown) renderDrillDown(activeDrillDown);
  host.appendChild(drill);

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

// ───── Section 6: My Account (CORTI W206-ONBOARDING) ─────
//
// Customer-facing self-service widget: trial countdown, usage stats vs
// limits, upgrade CTA, recent activity. Pulls live data from the
// backend if /api/license/:tenantId/usage responds; otherwise renders
// mock data so the dashboard works offline.
export function renderMyAccount(
  host: HTMLElement,
  state: AppState,
  toast: (m: string, k?: 'ok' | 'warn' | 'err') => void
): void {
  clear(host);

  host.appendChild(
    el('div', { className: 'section-head' }, [
      el('div', {}, [
        el('h1', {}, ['My Account']),
        el('div', { className: 'crumb' }, ['Trial · usage · upgrade · activity']),
      ]),
    ])
  );

  // Default mock state — replaced by live data when fetch resolves.
  const usageBlock = el('div', { className: 'juri-grid' });
  host.appendChild(usageBlock);

  type Usage = {
    tenantId: string;
    tier: 'trial' | 'pro' | 'enterprise';
    status: string;
    usage: {
      gamesCreated: number;
      mcRunsToday: number;
      certSubmissionsThisMonth: number;
    };
    limits: { maxGames: number; mcRunsPerDay: number; certSubmissionsPerMonth: number };
    remaining: { games: number; mcRunsToday: number; certSubsThisMonth: number };
  };

  const renderUsageCards = (u: Usage, daysLeft: number | null): void => {
    clear(usageBlock);
    const cap = (n: number): string => (n === -1 ? '∞' : String(n));
    for (const cell of [
      { label: 'Tier', value: u.tier.toUpperCase() },
      { label: 'Status', value: u.status },
      { label: 'Trial days left', value: daysLeft === null ? '—' : String(Math.max(0, daysLeft)) },
      { label: 'Games', value: `${u.usage.gamesCreated} / ${cap(u.limits.maxGames)}` },
      { label: 'MC runs today', value: `${u.usage.mcRunsToday} / ${cap(u.limits.mcRunsPerDay)}` },
      { label: 'Cert subs (mo)', value: `${u.usage.certSubmissionsThisMonth} / ${cap(u.limits.certSubmissionsPerMonth)}` },
    ]) {
      const card = el('div', { className: 'juri-card' });
      card.appendChild(el('h3', {}, [cell.label]));
      card.appendChild(el('div', { className: 'stats' }, [el('strong', {}, [cell.value])]));
      usageBlock.appendChild(card);
    }
  };

  // Optimistic mock so the panel renders something even when backend is down.
  renderUsageCards(
    {
      tenantId: 'default',
      tier: 'trial',
      status: 'active',
      usage: { gamesCreated: 1, mcRunsToday: 3, certSubmissionsThisMonth: 0 },
      limits: { maxGames: 3, mcRunsPerDay: 50, certSubmissionsPerMonth: 5 },
      remaining: { games: 2, mcRunsToday: 47, certSubsThisMonth: 5 },
    },
    27
  );

  // Best-effort live fetch — `default` is the seeded tenant.
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const base = (window as { __OPERATOR_API__?: string }).__OPERATOR_API__ ?? 'http://localhost:4000';
    const tenantId = (window as { __OPERATOR_TENANT__?: string }).__OPERATOR_TENANT__ ?? 'default';
    fetch(`${base}/api/license/${tenantId}/usage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Usage | null) => {
        if (!j) return;
        // ask /expiry for trial countdown
        fetch(`${base}/api/license/${tenantId}/expiry`)
          .then((r) => (r.ok ? r.json() : null))
          .then((e: { daysUntilExpiry?: number } | null) => {
            renderUsageCards(j, e?.daysUntilExpiry ?? null);
          })
          .catch(() => renderUsageCards(j, null));
      })
      .catch(() => {
        /* keep mock */
      });
  }

  // Upgrade CTA strip
  const cta = el('div', { className: 'detail-panel', style: 'margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;' });
  cta.appendChild(
    el('div', {}, [
      el('h2', {}, ['Need higher limits?']),
      el('div', { className: 'muted' }, ['Pro: $5K/mo · 25 games · 1000 MC/day · 24h email SLA · GaaS WebSocket included.']),
    ])
  );
  const upgradeBtn = el('button', { className: 'btn primary' }, ['Upgrade to Pro']);
  upgradeBtn.addEventListener('click', () => {
    // Hit license upgrade endpoint best-effort; fall back to toast only.
    if (typeof fetch !== 'undefined') {
      const base = (window as { __OPERATOR_API__?: string }).__OPERATOR_API__ ?? 'http://localhost:4000';
      const tenantId = (window as { __OPERATOR_TENANT__?: string }).__OPERATOR_TENANT__ ?? 'default';
      fetch(`${base}/api/license/${tenantId}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'pro' }),
      })
        .then((r) => (r.ok ? toast('Upgraded to Pro. Limits applied.', 'ok') : toast('Upgrade pending — talk to sales.', 'warn')))
        .catch(() => toast('Backend unreachable — upgrade queued offline.', 'warn'));
    } else {
      toast('Upgrade requested.', 'ok');
    }
  });
  cta.appendChild(upgradeBtn);
  host.appendChild(cta);

  // Recent activity
  const activity = el('div', { className: 'detail-panel', style: 'margin-top:18px;' });
  activity.appendChild(el('h2', {}, ['Recent activity']));
  const recent = state.games.slice(0, 5);
  const tbl = el('table', { className: 'tbl' });
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['Game', 'Status', 'Last updated']) tr.appendChild(el('th', {}, [h]));
  thead.appendChild(tr);
  tbl.appendChild(thead);
  const tbody = el('tbody');
  for (const g of recent) {
    const row = el('tr');
    row.appendChild(el('td', {}, [g.name]));
    row.appendChild(el('td', {}, [el('span', { className: `status-pill ${g.status}` }, [g.status])]));
    row.appendChild(el('td', { className: 'mono' }, [g.lastUpdated.slice(0, 10)]));
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  activity.appendChild(tbl);
  host.appendChild(activity);
}
