/**
 * W211 Agent C — Demo Theater player renderer.
 *
 * Pure string-based renderers for the player UI panels. The DOM shell
 * in player.ts wires these renderers to live <div> nodes. Keeping the
 * renderers pure makes them unit-testable without jsdom.
 */

import type { PlayerState, TimelineEvent, Persona } from './types.js';
import { filterForPersona, keyMetrics } from './state.js';

const PERSONAS: Persona[] = ['all', 'cto', 'cmo', 'cfo'];

export function renderProgressBar(state: PlayerState): string {
  const days = state.timeline?.days ?? 30;
  const pct = days === 0 ? 0 : Math.min(100, (state.playheadDay / days) * 100);
  return `<div class="tp-progress" data-pct="${pct.toFixed(1)}">
    <div class="tp-progress-fill" style="width:${pct.toFixed(1)}%"></div>
    <div class="tp-progress-label">Day ${Math.floor(state.playheadDay)} / ${days}</div>
  </div>`;
}

export function renderPersonaSwitcher(state: PlayerState): string {
  return PERSONAS.map(
    (p) =>
      `<button type="button" class="tp-persona-btn ${state.persona === p ? 'is-active' : ''}" data-persona="${p}">${p.toUpperCase()}</button>`
  ).join('');
}

export function renderControls(state: PlayerState): string {
  return `<div class="tp-controls">
    <button type="button" class="tp-btn" data-action="rewind">⏮ Day</button>
    <button type="button" class="tp-btn tp-play" data-action="play">${state.paused ? '▶ Play' : '⏸ Pause'}</button>
    <button type="button" class="tp-btn" data-action="skip">Day ⏭</button>
    <span class="tp-speed">Speed:</span>
    ${[0.5, 1, 2, 5]
      .map(
        (s) =>
          `<button type="button" class="tp-speed-btn ${state.speed === s ? 'is-active' : ''}" data-speed="${s}">${s}×</button>`
      )
      .join('')}
  </div>`;
}

export function renderKeyMetrics(state: PlayerState): string {
  const k = keyMetrics(state);
  return `<div class="tp-metrics">
    <div><b>Day ${k.currentDay}</b><span>playhead</span></div>
    <div><b>${k.daysRemaining}</b><span>days remaining</span></div>
    <div><b>s${k.canaryStage}</b><span>canary stage</span></div>
    <div><b>${k.canaryPercent}%</b><span>rollout</span></div>
    <div><b>${k.estRtp.toFixed(3)}</b><span>est rtp</span></div>
  </div>`;
}

/**
 * Render the 3-column live event feed: spins / canary / alerts.
 */
export function renderFeed(state: PlayerState): string {
  if (!state.timeline) return `<div class="tp-feed-empty">No timeline loaded.</div>`;
  const playhead = state.playheadDay;
  const recent = state.timeline.events.filter(
    (e) => e.day <= playhead && e.day > playhead - 3
  );
  const filtered = filterForPersona(recent, state.persona).slice(-30);

  const spins = filtered.filter((e) => e.type === 'spin').slice(-8);
  const canary = filtered.filter((e) => ['canary', 'lab'].includes(e.type)).slice(-8);
  const alerts = filtered.filter((e) => e.type === 'anomaly').slice(-4);

  return `<div class="tp-feed">
    <div class="tp-feed-col"><h4>Spins</h4>${spins.map(renderSpinLine).join('') || '<i>none yet</i>'}</div>
    <div class="tp-feed-col"><h4>Canary / Lab</h4>${canary.map(renderCanaryLine).join('') || '<i>none yet</i>'}</div>
    <div class="tp-feed-col"><h4>Alerts</h4>${alerts.map(renderAlertLine).join('') || '<i>none</i>'}</div>
  </div>`;
}

function renderSpinLine(e: TimelineEvent): string {
  const p = e.payload as Record<string, unknown>;
  return `<div class="tp-row">D${e.day} · ${String(p.gameId)} · €${String(p.bet)} → ${String(p.rtp_running)}</div>`;
}

function renderCanaryLine(e: TimelineEvent): string {
  const p = e.payload as Record<string, unknown>;
  if (e.type === 'canary') {
    return `<div class="tp-row">D${e.day} · s${String(p.stage)} @ ${String(p.rollout_percent)}% · ${String(p.gates_passed)}/4 gates</div>`;
  }
  return `<div class="tp-row">D${e.day} · lab → ${String(p.stage)}</div>`;
}

function renderAlertLine(e: TimelineEvent): string {
  const p = e.payload as Record<string, unknown>;
  return `<div class="tp-row tp-alert">D${e.day} · ${String(p.type)} · ${String(p.severity)}</div>`;
}

export function renderNarrativeBox(state: PlayerState): string {
  if (!state.timeline) return '';
  const line = state.timeline.consoleLines.find((l) =>
    l.startsWith(`Day ${Math.floor(state.playheadDay)},`)
  );
  return `<div class="tp-narrative">${line ?? `Day ${Math.floor(state.playheadDay)} unfolds…`}</div>`;
}

/** Top-level full layout for the player. Used by player.ts on boot. */
export function renderPlayer(state: PlayerState): string {
  return `<div class="theater-player">
    <header class="tp-header">${renderProgressBar(state)}</header>
    <aside class="tp-personas">${renderPersonaSwitcher(state)}</aside>
    <main class="tp-feed-wrap">${renderFeed(state)}</main>
    <aside class="tp-side">${renderKeyMetrics(state)}</aside>
    <footer class="tp-footer">
      ${renderNarrativeBox(state)}
      ${renderControls(state)}
    </footer>
  </div>`;
}
