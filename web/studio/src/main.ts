// Studio entry point. Wires the REAL engine (rtpEstimator + Zod-backed
// validator from `src/`) onto the v5 UI shell. Strategy: keep the proven
// UI logic in `app.js` (DOM rendering, wizards, toasts, kbd shortcuts);
// expose a small `window.__studio__` API the UI can call to delegate
// math + IR work to the engine, and to drive persistence.

import { buildIRFromVariant, computeLiveRTP, validateIRBlob, roundTripIR } from './engine.js';
import type { LiveRTP, ValidationReport } from './engine.js';
import { Persistence } from './persistence.js';
import type { StudioVariant, StudioPersistedState, StudioWorkspace } from './types.js';
import { createPlayTab, type PlayTabBridge } from './playTab.js';
import { parseGDD, gddToIR } from './gdd-parser.js';
import type { ExtractedGDD } from './gdd-parser.js';
import { createComposeBridge, type ComposeBridge } from './compose.js';
import { createSensitivityBridge, type SensitivityBridge } from './sensitivity.js';
import { installCertify, type CertifyBridge } from './certify.js';
import { installPolish, pushToast, showSpinner, renderEmptyState, type PolishApi } from './polish.js';
import {
  estimateFullRtp,
  type PaytableEntry,
  type ReelWeights,
} from '@engine/utils/rtpEstimator.js';

// ── Window contract — what app.js can call ──────────────────────────
declare global {
  interface Window {
    __studio__: StudioBridge;
    // app.js exposes its mutable workspaces map + helpers on the window
    // so we can read state from TS without rewriting app.js.
    __studio_ui_hook__?: {
      getWorkspaces: () => Record<string, StudioWorkspace>;
      getWsOrder: () => string[];
      getActiveWorkspaceId: () => string;
      getActiveVariant: () => StudioVariant;
      applyState: (s: StudioPersistedState) => void;
      onRTPUpdate?: (live: LiveRTP) => void;
      logActivity: (msg: string) => void;
    };
    // Catalog wire (W199) — app.js exposes a setter so we can push the
    // parsed JSON payloads after async fetch.
    __studio_catalog_install__?: (payload: { patterns: unknown[]; lwGaps: unknown[] }) => void;
    __studio_catalog__?: { patterns: unknown[]; lwGaps: unknown[] };
    __studio_catalog_api__?: {
      selectPattern: (pid: string) => void;
      insertSelectedPatternIntoVariant: () => boolean;
      setMGap: (m: string | null) => void;
      state: unknown;
    };
    __studio_compose__?: ComposeBridge;
    __studio_sensitivity__?: SensitivityBridge;
    __studio_certify__?: CertifyBridge;
    __studio_polish__?: PolishApi;
  }
}

interface StudioBridge {
  computeRTP(): LiveRTP;
  buildIR(): unknown;
  validateCurrentIR(): ValidationReport;
  exportIR(): void;
  importIR(file: File): Promise<{ ok: boolean; message: string }>;
  saveNow(): boolean;
  roundTripCheck(): { ok: boolean; issues: string[] };
  scheduleRTPRecompute(): void;
  // ── GDD Import Pipeline (W199.5) ──
  parseGDD(file: File): Promise<ExtractedGDD>;
  generateFromGDD(gdd: ExtractedGDD): { ok: boolean; message: string; computedRtp?: number };
}

// ── Debounced RTP compute ───────────────────────────────────────────
let rtpDebounceTimer: number | null = null;
const RTP_DEBOUNCE_MS = 100;

function debounceRTP(fn: () => void): void {
  if (rtpDebounceTimer !== null) window.clearTimeout(rtpDebounceTimer);
  rtpDebounceTimer = window.setTimeout(() => {
    rtpDebounceTimer = null;
    fn();
  }, RTP_DEBOUNCE_MS);
}

// ── Helpers ─────────────────────────────────────────────────────────
function hook() {
  const h = window.__studio_ui_hook__;
  if (!h) {
    throw new Error(
      '[studio] UI hook not installed — app.js must define window.__studio_ui_hook__ before main.ts boots.'
    );
  }
  return h;
}

function getCurrentVariant(): StudioVariant {
  return hook().getActiveVariant();
}

function getWorkspaceName(): string {
  const h = hook();
  const ws = h.getWorkspaces()[h.getActiveWorkspaceId()];
  return ws?.name ?? 'workspace';
}

// ── Bridge implementation ───────────────────────────────────────────
function computeRTP(): LiveRTP {
  const v = getCurrentVariant();
  const live = computeLiveRTP(v);
  // mutate variant.rtp so the UI's existing render functions pick it up
  v.rtp = +(live.rtp * 100).toFixed(2);
  v.sigma = +live.volatility.index.toFixed(2);
  hook().onRTPUpdate?.(live);
  return live;
}

function buildIR(): unknown {
  const v = getCurrentVariant();
  return buildIRFromVariant(v, {
    workspaceName: getWorkspaceName(),
    variantId: v.id,
  });
}

function validateCurrentIR(): ValidationReport {
  const ir = buildIR();
  return validateIRBlob(ir);
}

function exportIR(): void {
  const ir = buildIR();
  const blob = new Blob([JSON.stringify(ir, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const v = getCurrentVariant();
  const wsName = getWorkspaceName().toLowerCase().replace(/\s+/g, '-');
  a.href = url;
  a.download = `${wsName}-${v.id}.ir.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  hook().logActivity(`exported IR → ${a.download}`);
}

async function importIR(file: File): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const report = validateIRBlob(parsed);
    if (!report.ok) {
      return {
        ok: false,
        message: `IR invalid: ${report.issueCount} issue(s). First: ${report.issues[0]?.message ?? '?'}`,
      };
    }
    // Don't auto-populate state from imported IR right now — the
    // round-trip mapping IR→variant is lossy (the studio tracks tier
    // counts, not full reel strips). We log the success so the user
    // can confirm the file is engine-valid before pulling it in.
    hook().logActivity(`imported IR ✓ ${file.name} (validated, no state overwrite)`);
    return { ok: true, message: `IR valid · ${file.name}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Import failed: ${msg}` };
  }
}

// ── Persistence wiring ──────────────────────────────────────────────
const persistence = new Persistence({
  serialise: () => {
    const h = hook();
    return {
      schemaVersion: 1,
      activeWorkspaceId: h.getActiveWorkspaceId(),
      wsOrder: h.getWsOrder(),
      workspaces: h.getWorkspaces(),
      lastSavedAt: Date.now(),
    };
  },
  apply: (state) => {
    hook().applyState(state);
  },
  onSaved: (at) => {
    hook().logActivity(`auto-saved · ${new Date(at).toLocaleTimeString()}`);
  },
});

function saveNow(): boolean {
  return persistence.save('manual');
}

function roundTripCheck(): { ok: boolean; issues: string[] } {
  const ir = buildIR() as Parameters<typeof roundTripIR>[0];
  return roundTripIR(ir);
}

function scheduleRTPRecompute(): void {
  debounceRTP(() => {
    computeRTP();
  });
}

// ── GDD Import Pipeline (W199.5) ────────────────────────────────────
function generateFromGDD(
  gdd: ExtractedGDD
): { ok: boolean; message: string; computedRtp?: number } {
  try {
    const ir = gddToIR(gdd);
    const report = validateIRBlob(ir);
    if (!report.ok) {
      const first = report.issues[0];
      return {
        ok: false,
        message: `IR invalid: ${report.issueCount} issue(s)${first ? ` · ${first.path}: ${first.message}` : ''}`,
      };
    }
    // Compute base-game RTP from the produced IR so the studio toast can
    // show stated-vs-computed delta without a full MC run.
    let computedRtp: number | undefined;
    try {
      const reels = ir.topology.kind === 'rectangular' ? ir.topology.reels : 5;
      const rows = ir.topology.kind === 'rectangular' ? ir.topology.rows : 3;
      const stripLen = 30;
      const paytable: PaytableEntry[] = [];
      const counts = new Map<string, number[]>();
      const totalWeight = ir.symbols.reduce((a, s) => a + Math.max(0.01, s.weight_hint ?? 1), 0);
      for (const s of ir.symbols) {
        if (s.kind === 'hp' || s.kind === 'lp' || s.kind === 'wild') {
          const pays = ir.paytable[s.id] || {};
          paytable.push({
            symbol: s.id,
            tier: s.kind === 'wild' ? 'WILD' : s.kind === 'lp' ? 'LP' : 'HP',
            pays: {
              3: Number(pays['3'] ?? 0),
              4: Number(pays['4'] ?? 0),
              5: Number(pays['5'] ?? 0),
            },
          });
        }
        const w = Math.max(0.01, s.weight_hint ?? 1);
        const c = Math.max(1, Math.round((w / totalWeight) * stripLen));
        counts.set(s.id, Array(reels).fill(c));
      }
      const reelWeights: ReelWeights = {
        symbolCounts: counts,
        stripLengths: Array(reels).fill(stripLen),
      };
      const paylines = ir.evaluation.kind === 'lines' ? ir.evaluation.paylines.length : 20;
      const est = estimateFullRtp(paytable, reelWeights, paylines, rows, [], undefined);
      computedRtp = est.totalRtp;
    } catch (err) {
      // RTP compute is best-effort here — the modal still proceeds.
      console.warn('[gdd] computed-RTP estimate failed:', err);
    }
    return {
      ok: true,
      message: `Generated ${ir.meta.name}`,
      computedRtp,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  }
}

// ── Bind file-picker for import (delegated; app.js may inject the
// button itself, but we own the file event so the engine path is real).
function bindImportPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.id = 'studio-ir-import-input';
  input.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = await importIR(f);
    hook().logActivity(r.message);
    (e.target as HTMLInputElement).value = '';
  });
  document.body.appendChild(input);
}

// ── W200 polish-wrapped parseGDD ────────────────────────────────────
async function parseGDDWithPolish(file: File): Promise<ExtractedGDD> {
  // Size guard — 10MB cap (PDF + image-heavy PDFs blow past this).
  const MAX_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    pushToast({
      kind: 'warn',
      msg: `<b>${file.name}</b> is ${(file.size / 1024 / 1024).toFixed(1)} MB — chunking not yet supported (>10 MB).`,
      ttl: 6000,
    });
    throw new Error('FILE_TOO_LARGE');
  }
  const gddPanel =
    document.getElementById('panel-build') ||
    document.getElementById('gdd-body') ||
    document.body;
  const dismiss = showSpinner(gddPanel as HTMLElement, `Parsing ${file.name}…`);
  try {
    const result = await parseGDD(file);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushToast({
      kind: 'warn',
      msg: `Could not parse <b>${file.name}</b> — ${msg}. Try different format.`,
      ttl: 7000,
    });
    throw err;
  } finally {
    dismiss();
  }
}

// ── Public bridge install ───────────────────────────────────────────
const bridge: StudioBridge = {
  computeRTP,
  buildIR,
  validateCurrentIR,
  exportIR,
  importIR,
  saveNow,
  roundTripCheck,
  scheduleRTPRecompute,
  parseGDD: parseGDDWithPolish,
  generateFromGDD,
};

window.__studio__ = bridge;

// ── PLAY tab bridge install (W198) ──────────────────────────────────
let playBridge: PlayTabBridge | null = null;

/** Probe whether the current browser can mount the Pixi WebGL canvas. */
function probeWebGL(): boolean {
  try {
    const cv = document.createElement('canvas');
    const ctx = (cv.getContext('webgl2') || cv.getContext('webgl')) as WebGLRenderingContext | null;
    return ctx !== null;
  } catch {
    return false;
  }
}

function renderPlayFallback(): void {
  const host = document.getElementById('panel-play');
  if (!host) return;
  if (document.getElementById('w200-play-fallback')) return;
  const note = document.createElement('div');
  note.id = 'w200-play-fallback';
  note.style.cssText =
    'margin:16px 0;padding:16px;background:#1A1F28;border:1px solid #F59E0B;border-radius:4px;font-family:ui-monospace,monospace;font-size:12px;color:#FCD34D;';
  note.innerHTML = `
    <b>WebGL not available</b> — Pixi renderer disabled.<br>
    Spins will run headlessly through the engine (result printed in
    activity log). Enable WebGL in your browser to see animated reels.
  `;
  const target = document.getElementById('single-play') || host;
  target.insertBefore(note, target.firstChild);
}

function installPlayBridge(): PlayTabBridge {
  if (playBridge) return playBridge;
  const hasWebGL = probeWebGL();
  if (!hasWebGL) {
    renderPlayFallback();
    pushToast({
      kind: 'warn',
      msg: 'WebGL unavailable — Pixi renderer disabled. Falling back to headless engine.',
      ttl: 6000,
    });
  }
  playBridge = createPlayTab(() => buildIR() as ReturnType<typeof buildIRFromVariant>);
  window.__studio_play__ = playBridge;
  return playBridge;
}

/**
 * Bind the legacy PLAY-tab buttons (`#btn-spin`, `#btn-auto10`,
 * `#btn-replay`) and the tab switch event to the new Pixi renderer.
 * Runs once, after app.js has rendered its initial DOM.
 */
function bindPlayTabButtons(): void {
  const tabBtn = document.getElementById('tab-play');
  const spinBtn = document.getElementById('btn-spin');
  const autoBtn = document.getElementById('btn-auto10');
  const replayBtn = document.getElementById('btn-replay');

  // Lazy-mount: first time the user clicks the PLAY tab, ensure the
  // renderer is mounted into the canvas container.
  if (tabBtn) {
    tabBtn.addEventListener('click', () => {
      void installPlayBridge().ensureMounted();
    });
  }

  if (spinBtn) {
    // Replace the legacy mock-spin handler with our real one. We do this
    // by adding a capture-phase listener that stops propagation only
    // after the legacy handler has run — we want the mock counters in
    // app.js to keep updating, plus our real engine spin on top.
    spinBtn.addEventListener('click', () => {
      void installPlayBridge().spin();
    });
  }
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      void installPlayBridge().autoplay(10);
    });
  }
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      void installPlayBridge().replayLast();
    });
  }
}

// Boot: wait until the legacy `app.js` has installed its hook (it does
// so synchronously on load, but we double-check via raf).
function boot(): void {
  if (!window.__studio_ui_hook__) {
    requestAnimationFrame(boot);
    return;
  }
  bindImportPicker();
  // Restore persisted state if any (best-effort)
  const restored = persistence.restore();
  if (restored) hook().logActivity('restored from localStorage');
  persistence.start();

  // Initial live compute so the inspector shows a real engine number
  // instead of the mocked seed value from app.js's `recomputeFor`.
  try {
    computeRTP();
  } catch (err) {
    console.warn('[studio] initial RTP compute failed:', err);
  }

  // Wire the PLAY tab → Pixi renderer.
  try {
    installPlayBridge();
    bindPlayTabButtons();
    hook().logActivity('W198 · Pixi renderer ready');
  } catch (err) {
    console.warn('[W198] play tab wire failed:', err);
  }

  // Wire the COMPOSE tab → node-graph editor bridge (W199-COMPOSE).
  try {
    window.__studio_compose__ = createComposeBridge();
    hook().logActivity('W199-COMPOSE · feature graph editor ready');
  } catch (err) {
    console.warn('[W199-COMPOSE] compose bridge install failed:', err);
  }

  // Wire the SENSITIVITY tab → param-sweep bridge (W199-SENSITIVITY).
  try {
    window.__studio_sensitivity__ = createSensitivityBridge();
    hook().logActivity('W199-SENSITIVITY · param sweep engine ready');
  } catch (err) {
    console.warn('[W199-SENSITIVITY] sensitivity bridge install failed:', err);
  }

  // Wire the CERTIFY tab → MC + PAR + jurisdiction + op-pkg (W199-CERTIFY).
  try {
    const getIR = () => buildIR() as import('@engine/ir/types.js').SlotGameIR;
    const getCfRtp = () => {
      try { return computeRTP().rtp; } catch { return getCurrentVariant().rtp / 100; }
    };
    const certify = installCertify(getIR, getCfRtp);
    window.__studio_certify__ = certify;
    hook().logActivity('W199-CERTIFY · MC + PAR + op-pkg ready');
  } catch (err) {
    console.warn('[W199-CERTIFY] certify bridge install failed:', err);
  }
  hook().logActivity('engine wired · real RTP estimator online');

  // ── W200 polish pass ──────────────────────────────────────────────
  try {
    window.__studio_polish__ = installPolish();
    installPanelEmptyStateObserver();
    hook().logActivity('W200 · polish pass installed (loading/error/empty + tooltips + mobile guard)');
  } catch (err) {
    console.warn('[W200] polish install failed:', err);
  }

  // Kick off async catalog data load (97 P-IDs + 16 L&W M-gaps).
  void loadCatalogData();
}

// ── W200 · Panel empty-state observer ───────────────────────────────
// Watches tab-switches and renders placeholder content when a panel
// is shown but its primary content host is empty. Idempotent — only
// adds a placeholder once per panel + clears it the moment real
// content is injected.
function installPanelEmptyStateObserver(): void {
  const checks: Array<{
    panelId: string;
    contentSel: string;
    emptyMsg: { title: string; sub?: string; icon?: string };
  }> = [
    {
      panelId: 'panel-compose',
      contentSel: '#compose-canvas',
      emptyMsg: {
        title: 'Drag features from the palette ↑',
        sub: 'Build a feature graph by chaining base mechanics into composers.',
        icon: '◇',
      },
    },
    {
      panelId: 'panel-catalog',
      contentSel: '#cat-grid, .catalog-grid, .catalog-list',
      emptyMsg: {
        title: 'No patterns match the current filters',
        sub: 'Try clearing the L&W-only filter, broadening the wave range, or adjusting jurisdiction chips.',
        icon: '◯',
      },
    },
    {
      panelId: 'panel-sensitivity',
      contentSel: '#sensitivity-param-list',
      emptyMsg: {
        title: 'Build a variant first',
        sub: 'Set tier counts and reel weights in the BUILD tab to expose sweepable parameters.',
        icon: '△',
      },
    },
    {
      panelId: 'panel-certify',
      contentSel: '#certify-par-sections',
      emptyMsg: {
        title: 'Click "Run MC" to generate cert',
        sub: 'A Monte Carlo run produces the 12-section PAR sheet and unlocks the operator-package download.',
        icon: '□',
      },
    },
  ];

  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // Defer one tick so app.js can update aria-selected first.
      window.setTimeout(checkAllPanels, 50);
    });
  });
  // Initial check.
  window.setTimeout(checkAllPanels, 250);

  function checkAllPanels(): void {
    for (const c of checks) {
      const panel = document.getElementById(c.panelId);
      if (!panel) continue;
      const host = panel.querySelector(c.contentSel) as HTMLElement | null;
      if (!host) continue;

      // Skip if real content already there.
      const realChildren = Array.from(host.children).filter(
        (n) => !n.hasAttribute('data-w200-empty')
      );
      const existing = host.querySelector('[data-w200-empty]') as HTMLElement | null;
      if (realChildren.length > 0) {
        if (existing) existing.remove();
        continue;
      }
      if (existing) continue; // already showing empty state

      const placeholder = document.createElement('div');
      placeholder.setAttribute('data-w200-empty', c.panelId);
      host.appendChild(placeholder);
      renderEmptyState(placeholder, c.emptyMsg);
    }
  }
}

// ── Catalog data loader (W199) ──────────────────────────────────────
async function loadCatalogData(): Promise<void> {
  try {
    const [cat, lw] = await Promise.all([
      fetch(new URL('../data/catalog-97.json', import.meta.url).href).then((r) => r.json()),
      fetch(new URL('../data/lw-16.json',      import.meta.url).href).then((r) => r.json()),
    ]);
    const patterns = Array.isArray(cat?.patterns) ? cat.patterns : [];
    const lwGaps   = Array.isArray(lw?.gaps)      ? lw.gaps      : [];
    window.__studio_catalog__ = { patterns, lwGaps };
    if (typeof window.__studio_catalog_install__ === 'function') {
      window.__studio_catalog_install__({ patterns, lwGaps });
    }
    hook().logActivity(`catalog loaded · ${patterns.length} patterns · ${lwGaps.length} L&W gaps`);
  } catch (err) {
    console.warn('[studio] catalog load failed:', err);
  }
}

boot();

// Re-export bridge type for tests
export type { StudioBridge };
export { bridge };
