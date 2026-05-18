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
  parseGDD,
  generateFromGDD,
};

window.__studio__ = bridge;

// ── PLAY tab bridge install (W198) ──────────────────────────────────
let playBridge: PlayTabBridge | null = null;
function installPlayBridge(): PlayTabBridge {
  if (playBridge) return playBridge;
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
  // Kick off async catalog data load (97 P-IDs + 16 L&W M-gaps).
  void loadCatalogData();
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
