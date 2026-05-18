// W198 — PLAY tab controller.
//
// Wires the Pixi renderer + deterministic playSpin engine + DOM controls
// inside the existing PLAY tab. Exposes `window.__studio_play__` so the
// legacy `app.js` can delegate the SPIN / Replay / Autoplay / Seed
// buttons here. Lives behind a tab-switch trigger so the Pixi canvas
// only mounts when the user actually opens the Play tab.

import type { SlotGameIR } from '@engine/ir/types.js';
import {
  createSlotRenderer,
  type SlotRenderer,
  type SpinResult,
} from './renderer.js';
import { playSpin, merkleCommit, isAutoplayAllowed } from './playEngine.js';

export interface PlayHistoryEntry {
  timestamp: number;
  seed: number;
  totalWin: number;
  balance: number;
  commit: string;
}

export interface PlayTabBridge {
  /** Initialise the tab — mount Pixi canvas and bind buttons. Idempotent. */
  ensureMounted(): Promise<void>;
  /** Run one spin; debounced to 100ms. */
  spin(opts?: { seed?: number }): Promise<SpinResult | null>;
  /** Run N sequential spins (UK-guarded). */
  autoplay(count: number): Promise<void>;
  /** Replay the most recent spin (same seed → same result). */
  replayLast(): Promise<SpinResult | null>;
  /** Read history (most recent first). */
  history(): PlayHistoryEntry[];
  /** Current running balance (sum of wins). */
  balance(): number;
  /** Tear down + remount when IR changes. */
  setIR(ir: SlotGameIR): void;
  /** Test access. */
  _renderer(): SlotRenderer | null;
}

interface PlayState {
  renderer: SlotRenderer | null;
  ir: SlotGameIR | null;
  history: PlayHistoryEntry[];
  balance: number;
  lastSeed: number | null;
  lastResult: SpinResult | null;
  spinDebounceUntil: number;
  mounting: boolean;
  mounted: boolean;
}

const DEBOUNCE_MS = 100;
const MAX_HISTORY = 50;

function createInitialState(): PlayState {
  return {
    renderer: null,
    ir: null,
    history: [],
    balance: 0,
    lastSeed: null,
    lastResult: null,
    spinDebounceUntil: 0,
    mounting: false,
    mounted: false,
  };
}

function getOrCreateCanvasContainer(): HTMLElement | null {
  const playPanel = document.getElementById('panel-play');
  if (!playPanel) return null;
  let host = document.getElementById('pixi-canvas');
  if (host) return host;
  // Inject minimal container into the PLAY tab. We insert it after the
  // existing context bar so it sits above the legacy `play-grid` mock.
  host = document.createElement('div');
  host.id = 'pixi-canvas';
  host.style.cssText =
    'display:flex;justify-content:center;align-items:center;margin:12px 0;min-height:320px;background:#0B0E14;border:1px solid #252B36;border-radius:4px;';
  const playArea = document.getElementById('single-play') ?? playPanel;
  playArea.insertBefore(host, playArea.firstChild);
  return host;
}

function getOrCreateInfoPanel(): HTMLElement | null {
  let panel = document.getElementById('play-info-panel-w198');
  if (panel) return panel;
  const playArea = document.getElementById('single-play');
  if (!playArea) return null;
  panel = document.createElement('div');
  panel.id = 'play-info-panel-w198';
  panel.style.cssText =
    'margin-top:12px;padding:12px;background:#0F1218;border:1px solid #252B36;border-radius:4px;font-family:ui-monospace,monospace;font-size:11px;color:#A9B0BC;';
  panel.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
      <div><span style="color:#5C6470;">SEED</span>
        <code id="w198-last-seed" style="color:#22D3EE;cursor:pointer;" title="Click to copy">—</code></div>
      <div><span style="color:#5C6470;">WIN</span>
        <code id="w198-last-win" style="color:#22D3EE;">0×</code></div>
      <div><span style="color:#5C6470;">MERKLE</span>
        <code id="w198-merkle" style="color:#22D3EE;">—</code></div>
      <div><span style="color:#5C6470;">BAL</span>
        <code id="w198-balance" style="color:#22D3EE;">0×</code></div>
      <button id="w198-replay-btn" style="margin-left:auto;padding:4px 10px;background:#1A1F29;border:1px solid #252B36;color:#A9B0BC;font-size:11px;cursor:pointer;">Replay</button>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
      <label style="color:#5C6470;">SEED ↻</label>
      <input id="w198-seed-input" type="text" placeholder="auto (Date.now)" style="background:#0B0E14;border:1px solid #252B36;color:#A9B0BC;font-family:inherit;font-size:11px;padding:3px 6px;width:160px;" />
      <div id="w198-uk-warning" style="display:none;color:#F59E0B;margin-left:auto;">UK · RTS 14D — Autoplay banned</div>
    </div>
    <div style="margin-top:8px;max-height:120px;overflow-y:auto;">
      <table id="w198-history" style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead><tr style="color:#5C6470;text-align:left;">
          <th style="padding:2px 6px;">#</th><th style="padding:2px 6px;">TIME</th>
          <th style="padding:2px 6px;">SEED</th><th style="padding:2px 6px;">WIN</th>
          <th style="padding:2px 6px;">BAL</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  playArea.appendChild(panel);
  return panel;
}

function updateInfoUI(state: PlayState): void {
  const seedEl = document.getElementById('w198-last-seed');
  const winEl = document.getElementById('w198-last-win');
  const merkleEl = document.getElementById('w198-merkle');
  const balEl = document.getElementById('w198-balance');
  const histBody = document.querySelector<HTMLElement>('#w198-history tbody');
  const ukWarning = document.getElementById('w198-uk-warning');

  if (seedEl) seedEl.textContent = state.lastSeed != null ? `0x${state.lastSeed.toString(16)}` : '—';
  if (winEl)
    winEl.textContent = state.lastResult ? `${state.lastResult.totalWin.toFixed(2)}×` : '0×';
  if (merkleEl && state.lastResult && state.ir && state.lastSeed != null) {
    merkleEl.textContent = merkleCommit(state.ir, state.lastSeed, state.lastResult);
  }
  if (balEl) balEl.textContent = `${state.balance.toFixed(2)}×`;
  if (histBody) {
    histBody.innerHTML = state.history
      .slice(0, MAX_HISTORY)
      .map((h, i) => {
        const t = new Date(h.timestamp).toLocaleTimeString();
        return `<tr><td style="padding:1px 6px;">${i + 1}</td>
          <td style="padding:1px 6px;color:#5C6470;">${t}</td>
          <td style="padding:1px 6px;">0x${h.seed.toString(16)}</td>
          <td style="padding:1px 6px;color:${h.totalWin > 0 ? '#22D3EE' : '#5C6470'};">${h.totalWin.toFixed(2)}×</td>
          <td style="padding:1px 6px;">${h.balance.toFixed(2)}×</td></tr>`;
      })
      .join('');
  }
  if (ukWarning && state.ir) {
    const allowed = isAutoplayAllowed(state.ir);
    ukWarning.style.display = allowed ? 'none' : 'block';
    const auto = document.getElementById('btn-auto10') as HTMLButtonElement | null;
    if (auto) {
      auto.disabled = !allowed;
      auto.title = allowed ? '' : 'RTS 14D — Autoplay banned u UK';
    }
  }
}

/** Bind the replay + seed-input controls inside the W198 info panel. */
function bindInfoPanelEvents(bridge: PlayTabBridge, state: PlayState): void {
  const replay = document.getElementById('w198-replay-btn');
  if (replay && !replay.dataset.bound) {
    replay.dataset.bound = '1';
    replay.addEventListener('click', () => {
      void bridge.replayLast();
    });
  }
  const seedEl = document.getElementById('w198-last-seed');
  if (seedEl && !seedEl.dataset.bound) {
    seedEl.dataset.bound = '1';
    seedEl.addEventListener('click', () => {
      if (state.lastSeed != null) {
        navigator.clipboard?.writeText(`0x${state.lastSeed.toString(16)}`).catch(() => void 0);
      }
    });
  }
}

export function createPlayTab(getIR: () => SlotGameIR): PlayTabBridge {
  const state = createInitialState();

  function readSeedFromInput(): number | null {
    const el = document.getElementById('w198-seed-input') as HTMLInputElement | null;
    if (!el || !el.value.trim()) return null;
    const v = el.value.trim();
    if (v.startsWith('0x') || v.startsWith('0X')) {
      const n = parseInt(v.slice(2), 16);
      return Number.isFinite(n) ? n : null;
    }
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  async function ensureMounted(): Promise<void> {
    if (state.mounted || state.mounting) return;
    state.mounting = true;
    try {
      const host = getOrCreateCanvasContainer();
      if (!host) return;
      getOrCreateInfoPanel();
      const ir = getIR();
      state.ir = ir;
      const renderer = createSlotRenderer();
      await renderer.mount(host, ir);
      state.renderer = renderer;
      state.mounted = true;
      bindInfoPanelEvents(bridge, state);
      updateInfoUI(state);
    } finally {
      state.mounting = false;
    }
  }

  async function spinOnce(seed?: number): Promise<SpinResult | null> {
    const now = performance.now();
    if (now < state.spinDebounceUntil) return null;
    state.spinDebounceUntil = now + DEBOUNCE_MS;

    if (!state.mounted) await ensureMounted();
    const ir = getIR();
    state.ir = ir;
    const effectiveSeed = seed ?? readSeedFromInput() ?? Date.now();
    const result = playSpin(ir, effectiveSeed);
    state.lastSeed = effectiveSeed;
    state.lastResult = result;
    state.balance += result.totalWin;
    state.history.unshift({
      timestamp: Date.now(),
      seed: effectiveSeed,
      totalWin: result.totalWin,
      balance: state.balance,
      commit: merkleCommit(ir, effectiveSeed, result),
    });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    updateInfoUI(state);
    if (state.renderer) await state.renderer.spin({ seed: effectiveSeed, result });
    return result;
  }

  async function autoplay(count: number): Promise<void> {
    if (!state.ir) state.ir = getIR();
    if (!isAutoplayAllowed(state.ir)) {
      console.warn('[W198] Autoplay blocked — UK RTS 14D');
      return;
    }
    const base = Date.now();
    for (let i = 0; i < count; i++) {
      await spinOnce(base + i);
    }
  }

  async function replayLast(): Promise<SpinResult | null> {
    if (state.lastSeed == null) return null;
    return spinOnce(state.lastSeed);
  }

  const bridge: PlayTabBridge = {
    ensureMounted,
    spin: (opts) => spinOnce(opts?.seed),
    autoplay,
    replayLast,
    history: () => state.history.slice(),
    balance: () => state.balance,
    setIR(ir) {
      state.ir = ir;
      state.renderer?.setIR(ir);
      updateInfoUI(state);
    },
    _renderer: () => state.renderer,
  };

  return bridge;
}

// ── Window contract ────────────────────────────────────────────────

declare global {
  interface Window {
    __studio_play__?: PlayTabBridge;
  }
}
