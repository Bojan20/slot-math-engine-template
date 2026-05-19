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
import { createRuleEditorBridge, type RuleEditorBridge, type IRRule } from './rule-editor.js';
import { createMathNotebookBridge, type NotebookBridge, MathNotebook } from './math-notebook.js';
import { createSensitivityBridge, type SensitivityBridge } from './sensitivity.js';
import { installCertify, type CertifyBridge } from './certify.js';
import { installPolish, pushToast, showSpinner, renderEmptyState, type PolishApi } from './polish.js';
import { installPwa, type PwaBridge } from './pwa.js';
import {
  loadLibrary as loadIRLibrary,
  loadIR as loadIRLibraryItem,
  previewIR as previewIRLibraryItem,
  filterItems as filterIRLibrary,
  getAllItems as getAllIRLibraryItems,
  listTopologies as listIRLibraryTopologies,
  type LibraryFilter as IRLibraryFilter,
  type LibraryIndex as IRLibraryIndex,
  type LibraryItem as IRLibraryItem,
  type LibraryPreview as IRLibraryPreview,
} from './ir-library.js';
import {
  listThemes,
  getTheme,
  applyTheme,
  defaultAnimation,
  clampAnimation,
  validateIcon,
  validateAudio,
  IconLibrary,
  makeIconId,
  exportIconPack,
  importIconPack,
  createAudioEngine,
  readFileAsDataUrl,
  readFileAsText,
  type ThemeDef,
  type AnimationState,
  type CustomIcon,
  type AudioEngine,
} from './art-pipeline.js';
import {
  estimateFullRtp,
  type PaytableEntry,
  type ReelWeights,
} from '@engine/utils/rtpEstimator.js';
import {
  runAutoMcOrchestrated,
  cacheClear as autoMcCacheClear,
  type AutoMcOptions,
} from './auto-mc/orchestrator.js';
import type { SlotGameIR as IRForAutoMc } from '@engine/ir/types.js';

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
    __studio_rule_editor__?: RuleEditorBridge & {
      getRules(): IRRule[];
      addRule(name: string, expression: string): IRRule;
      removeRule(id: string): boolean;
      updateRule(id: string, patch: Partial<IRRule>): boolean;
      duplicateRule(id: string): IRRule | null;
      reorderRules(ids: string[]): void;
      snapshot(): { schemaVersion: 1; rules: IRRule[] };
      restore(snap: { schemaVersion: 1; rules: IRRule[] }): void;
    };
    __studio_math_notebook__?: NotebookBridge & { instance: MathNotebook };
    __studio_formula_library__?: { formulas: Array<{ id: string; name: string; category: string; expression: string; notes: string }> };
    __studio_sensitivity__?: SensitivityBridge;
    __studio_certify__?: CertifyBridge;
    __studio_polish__?: PolishApi;
    __studio_pwa__?: PwaBridge;
    __studio_art__?: ArtBridge;
    __studio_ir_library__?: IRLibraryBridge;
  }
}

// ── IR Library bridge (CORTI 200.1) ─────────────────────────────────
// Exposes the industry-template starter-IR catalog (generic patterns +
// classics) to the legacy `app.js` wizard so designers can load a
// curated IR into a fresh workspace with one click.
export interface IRLibraryBridge {
  load(): Promise<IRLibraryIndex>;
  getAllItems(): IRLibraryItem[];
  filter(filter: IRLibraryFilter): IRLibraryItem[];
  topologies(items: IRLibraryItem[]): string[];
  preview(itemId: string): Promise<IRLibraryPreview>;
  loadIR(itemId: string): Promise<import('@engine/ir/types.js').SlotGameIR>;
}

// ── Art Pipeline bridge ─────────────────────────────────────────────
export interface ArtBridge {
  themes: ThemeDef[];
  applyTheme(themeId: string): { ok: boolean; changed: number };
  setAnimation(patch: Partial<AnimationState>): AnimationState;
  getAnimation(): AnimationState;
  uploadIcon(file: File): Promise<{ ok: boolean; icon?: CustomIcon; error?: string }>;
  attachIconToSymbol(symIndex: number, iconId: string): boolean;
  attachIconDataToSymbol(symIndex: number, dataUrl: string): boolean;
  listIcons(): CustomIcon[];
  renameIcon(id: string, name: string): boolean;
  deleteIcon(id: string): boolean;
  exportPack(): Promise<Blob>;
  importPack(blob: Blob): Promise<number>;
  audio: AudioEngine;
  uploadAudio(id: string, file: File): Promise<{ ok: boolean; error?: string }>;
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
  // ── Auto-MC (Phase 2) ──
  // Kicks off a Monte-Carlo sim against the supplied IR.  Returns a handle
  // so callers (app.js, Sensitivity tab) can subscribe to progress and
  // cancel via `cancel()`.  Caching, WebWorker fallback, timeout handling
  // are all internal — callers just get the final validated_metrics block.
  runAutoMc(
    ir: unknown,
    opts?: AutoMcCallerOptions,
  ): AutoMcCallerHandle;
  /** Clears cached MC results (for QA / forced re-run). */
  clearAutoMcCache(): Promise<void>;
}

export interface AutoMcCallerOptions {
  spins?: number;
  seed?: number;
  timeoutMs?: number;
  noCache?: boolean;
  onProgress?: (p: {
    spinsDone: number;
    totalSpins: number;
    runningRtp: number;
    elapsedMs: number;
  }) => void;
}
export interface AutoMcCallerHandle {
  /** Resolves with the `validated_metrics` block + run status, or null if cancelled. */
  result: Promise<null | {
    status: 'complete' | 'cancelled' | 'timeout' | 'partial';
    validatedMetrics: import('./auto-mc/types.js').AutoMcResultMessage['validatedMetrics'];
    durationMs: number;
    spinsPerSec: number;
  }>;
  cancel(): void;
  runId: string;
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

/** Soft hook — returns null if app.js hasn't installed yet (no exception). */
function hookSoft() {
  return window.__studio_ui_hook__ ?? null;
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

  // When the variant was imported from a canonical IR with a validated
  // rtp_allocation (closed-form or 4B-spin Monte-Carlo total), use those
  // numbers — the engine's `estimateFullRtp` only models base-game line
  // wins and would surface a wildly wrong figure for feature-heavy games
  // (Free Spins + Hold & Win + Lightning sit outside the base estimator).
  const alloc = (v as { rtpAllocation?: { total_mc_5b?: number; total_cf?: number } }).rtpAllocation;
  const vm = (v as { validatedMetrics?: { volatility_index?: number } }).validatedMetrics;
  if (alloc && (typeof alloc.total_mc_5b === 'number' || typeof alloc.total_cf === 'number')) {
    const totalRtp = typeof alloc.total_mc_5b === 'number' ? alloc.total_mc_5b : (alloc.total_cf as number);
    v.rtp = +(totalRtp * 100).toFixed(4);
    if (vm && typeof vm.volatility_index === 'number') {
      v.sigma = +vm.volatility_index.toFixed(2);
    }
    const live: LiveRTP = {
      rtp: totalRtp,
      baseGameRtp: typeof alloc.total_cf === 'number' ? alloc.total_cf : totalRtp,
      featureRtp: 0,
      volatility: { index: vm?.volatility_index ?? 0, class: 'High' },
      computedAtMs: 0,
      fromEngine: true,
    };
    hook().onRTPUpdate?.(live);
    return live;
  }

  // Native (non-imported) variants — run the in-browser estimator.
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
    // The debounced callback may fire during app.js's boot sequence (before
    // the UI hook is installed) or right after a workspace switch where the
    // variant pool is still empty.  In either case, fail silently instead of
    // throwing — boot() will issue its own computeRTP() once the hook is up.
    if (!hookSoft()) return;
    try {
      computeRTP();
    } catch (err) {
      console.warn('[studio] scheduleRTPRecompute → computeRTP failed:', err);
    }
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

// ── Auto-MC bridge wrapper ──────────────────────────────────────────
function runAutoMcBridge(
  ir: unknown,
  callerOpts?: AutoMcCallerOptions,
) {
  const irTyped = ir as IRForAutoMc;
  const opts: AutoMcOptions = {
    spins: callerOpts?.spins ?? 1_000_000,
    seed: callerOpts?.seed,
    timeoutMs: callerOpts?.timeoutMs ?? 60_000,
    noCache: callerOpts?.noCache,
    onProgress: callerOpts?.onProgress
      ? (p) => callerOpts.onProgress!({
          spinsDone: p.spinsDone,
          totalSpins: p.totalSpins,
          runningRtp: p.runningRtp,
          elapsedMs: p.elapsedMs,
        })
      : undefined,
  };
  const h = runAutoMcOrchestrated(irTyped, opts);
  return {
    runId: h.runId,
    cancel: h.cancel,
    result: h.result.then((r) => (r == null ? null : {
      status: r.status,
      validatedMetrics: r.validatedMetrics,
      durationMs: r.durationMs,
      spinsPerSec: r.spinsPerSec,
    })),
  };
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
  runAutoMc: runAutoMcBridge,
  clearAutoMcCache: autoMcCacheClear,
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

  // W200.3 — bonus-feature demo trigger buttons.
  const demoFsBtn = document.getElementById('btn-demo-fs');
  if (demoFsBtn) {
    demoFsBtn.addEventListener('click', () => {
      void installPlayBridge().demoFreeSpins();
    });
  }
  const demoHwBtn = document.getElementById('btn-demo-hw');
  if (demoHwBtn) {
    demoHwBtn.addEventListener('click', () => {
      void installPlayBridge().demoHoldAndWin();
    });
  }
  const demoCascadeBtn = document.getElementById('btn-demo-cascade');
  if (demoCascadeBtn) {
    demoCascadeBtn.addEventListener('click', () => {
      void installPlayBridge().demoCascade();
    });
  }
}

// ── CORTI 200.2 · Art pipeline bridge install ───────────────────────
//
// The bridge is workspace-scoped but operates against whichever variant
// is currently active on each call. Animation/theme state are stored
// directly on the variant; the custom icon library is in-memory per
// workspace + persisted via the existing localStorage Persistence
// (variant.customIcons array).
function installArtBridge(): ArtBridge {
  const lib = new IconLibrary();
  const audio = createAudioEngine();
  // Best-effort preload defaults (browser only; quietly no-ops elsewhere).
  void audio.preloadDefaults();

  // Restore variant-level customIcons from any persisted state.
  try {
    const ws = window.__studio_ui_hook__?.getWorkspaces() ?? {};
    for (const w of Object.values(ws)) {
      for (const v of Object.values(w.variants ?? {})) {
        const ci = (v as unknown as { customIcons?: CustomIcon[] }).customIcons;
        if (Array.isArray(ci)) lib.importAll(ci);
      }
    }
  } catch { /* ignore */ }

  function v(): StudioVariant & {
    theme?: string;
    animation?: AnimationState;
    customIcons?: CustomIcon[];
  } {
    return hook().getActiveVariant() as StudioVariant & {
      theme?: string;
      animation?: AnimationState;
      customIcons?: CustomIcon[];
    };
  }

  return {
    themes: listThemes(),
    applyTheme(themeId: string) {
      const variant = v();
      const def = getTheme(themeId);
      if (!def) return { ok: false, changed: 0 };
      const host = document.documentElement;
      const changed = applyTheme(themeId, {
        cssVarHost: host,
        symbols: variant.symbols as Array<{ id: string; icon: string; customIconData?: string }>,
      });
      variant.theme = themeId;
      hook().logActivity(`theme → ${def.name} (${changed} symbols re-skinned)`);
      return { ok: true, changed };
    },
    setAnimation(patch: Partial<AnimationState>): AnimationState {
      const variant = v();
      const current = variant.animation ?? defaultAnimation();
      const merged = clampAnimation({
        ...current,
        ...patch,
        idle: { ...current.idle, ...(patch.idle ?? {}) },
        spin: { ...current.spin, ...(patch.spin ?? {}) },
        win: { ...current.win, ...(patch.win ?? {}) },
        fsIntro: { ...current.fsIntro, ...(patch.fsIntro ?? {}) },
        hwReveal: { ...current.hwReveal, ...(patch.hwReveal ?? {}) },
      });
      variant.animation = merged;
      return merged;
    },
    getAnimation(): AnimationState {
      const variant = v();
      if (!variant.animation) variant.animation = defaultAnimation();
      return variant.animation;
    },
    async uploadIcon(file: File) {
      const isSvg = file.name.toLowerCase().endsWith('.svg');
      let text: string | undefined;
      try {
        if (isSvg) text = await readFileAsText(file);
      } catch {
        return { ok: false, error: 'read failed' };
      }
      const val = validateIcon(file.name, file.size, text);
      if (!val.ok) return { ok: false, error: val.error };
      let dataUrl: string;
      try {
        if (isSvg && text) {
          // Use base64 so we can round-trip through ZIP cleanly.
          dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        } else {
          dataUrl = await readFileAsDataUrl(file);
        }
      } catch {
        return { ok: false, error: 'read failed' };
      }
      const icon: CustomIcon = {
        id: makeIconId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        family: val.family!,
        dataUrl,
        byteSize: file.size,
        createdAt: Date.now(),
      };
      lib.add(icon);
      // Persist to active variant for round-trip.
      const variant = v();
      if (!variant.customIcons) variant.customIcons = [];
      variant.customIcons.push(icon);
      hook().logActivity(`icon uploaded · ${icon.name}`);
      return { ok: true, icon };
    },
    attachIconToSymbol(symIndex: number, iconId: string): boolean {
      const variant = v();
      const sym = variant.symbols[symIndex] as
        | (StudioVariant['symbols'][number] & { customIconData?: string; customIconId?: string })
        | undefined;
      const ic = lib.get(iconId);
      if (!sym || !ic) return false;
      sym.customIconData = ic.dataUrl;
      sym.customIconId = ic.id;
      return true;
    },
    attachIconDataToSymbol(symIndex: number, dataUrl: string): boolean {
      const variant = v();
      const sym = variant.symbols[symIndex] as
        | (StudioVariant['symbols'][number] & { customIconData?: string })
        | undefined;
      if (!sym) return false;
      sym.customIconData = dataUrl;
      return true;
    },
    listIcons() { return lib.list(); },
    renameIcon(id: string, name: string) { return lib.rename(id, name); },
    deleteIcon(id: string) {
      const ok = lib.remove(id);
      if (ok) {
        const variant = v();
        if (Array.isArray(variant.customIcons)) {
          variant.customIcons = variant.customIcons.filter((i) => i.id !== id);
        }
      }
      return ok;
    },
    async exportPack() {
      return exportIconPack(lib.list());
    },
    async importPack(blob: Blob) {
      const items = await importIconPack(blob);
      lib.importAll(items);
      const variant = v();
      if (!variant.customIcons) variant.customIcons = [];
      variant.customIcons.push(...items);
      return items.length;
    },
    audio,
    async uploadAudio(id: string, file: File) {
      const val = validateAudio(file.name, file.size);
      if (!val.ok) return { ok: false, error: val.error };
      try {
        const ab = await file.arrayBuffer();
        await audio.loadCustom(id, ab);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
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

  // Wire the COMPOSE tab → IR rule editor (CORTI 200.1-DUBINA).
  try {
    window.__studio_rule_editor__ = installRuleEditorBridge();
    window.__studio_math_notebook__ = installMathNotebookBridge();
    void loadFormulaLibrary();
    hook().logActivity('CORTI 200.1-DUBINA · rule editor + math notebook ready');
  } catch (err) {
    console.warn('[CORTI 200.1-DUBINA] rule editor install failed:', err);
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

  // ── CORTI W207-MOBILE · PWA + service worker + install prompt ─────
  try {
    window.__studio_pwa__ = installPwa();
    hook().logActivity('W207-MOBILE · PWA bootstrap installed (SW + install + share + reducedData)');
  } catch (err) {
    console.warn('[W207-MOBILE] PWA install failed:', err);
  }

  // ── CORTI 200.2 · Symbol/Art pipeline ─────────────────────────────
  try {
    window.__studio_art__ = installArtBridge();
    hook().logActivity('CORTI 200.2 · art pipeline ready (themes/anim/audio/icons)');
  } catch (err) {
    console.warn('[CORTI 200.2] art pipeline install failed:', err);
  }

  // ── CORTI 200.1 · IR library (industry templates + studio pilots) ──
  try {
    window.__studio_ir_library__ = installIRLibraryBridge();
    hook().logActivity('CORTI 200.1 · IR library bridge ready (26 starter IRs)');
  } catch (err) {
    console.warn('[CORTI 200.1] IR library install failed:', err);
  }

  // ── CORTI 200.4-BACKEND · Server detection + bridge ───────────────
  // Probe http://localhost:4000/api/health — if up, expose
  // window.__studio_backend__ with fetch helpers + a `connected: true`
  // flag. Otherwise mark as offline; UI falls back to local stubs.
  void installBackendBridge();

  // Kick off async catalog data load (97 industry P-ID patterns).
  void loadCatalogData();
}

// ── CORTI 200.4-BACKEND · backend bridge install ────────────────────
export interface BackendBridge {
  connected: boolean;
  baseUrl: string;
  health(): Promise<unknown>;
  createSession(input: { playerId: string; jurisdiction?: string }): Promise<unknown>;
  getSession(sessionId: string): Promise<unknown>;
  walletBalance(playerId: string): Promise<unknown>;
  walletDeposit(playerId: string, amountMinor: number, ref?: string): Promise<unknown>;
  appendAudit(sessionId: string, type: string, payload: unknown): Promise<unknown>;
  listLobbyGames(jurisdiction?: string): Promise<unknown>;
  submitCert(ir: unknown, jurisdiction: string): Promise<unknown>;
  getCertStatus(submissionId: string): Promise<unknown>;
}

declare global {
  interface Window {
    __studio_backend__?: BackendBridge;
  }
}

async function installBackendBridge(): Promise<void> {
  const baseUrl = (() => {
    // Allow override via meta tag <meta name="studio-backend-url" content="...">
    if (typeof document !== 'undefined') {
      const tag = document.querySelector('meta[name="studio-backend-url"]') as HTMLMetaElement | null;
      if (tag?.content) return tag.content.replace(/\/$/, '');
    }
    return 'http://localhost:4000';
  })();

  const bridge: BackendBridge = {
    connected: false,
    baseUrl,
    async health() {
      const res = await fetch(`${baseUrl}/api/health`);
      return res.json();
    },
    async createSession(input) {
      const res = await fetch(`${baseUrl}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return res.json();
    },
    async getSession(sessionId) {
      const res = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}`);
      return res.json();
    },
    async walletBalance(playerId) {
      const res = await fetch(`${baseUrl}/api/wallet/${encodeURIComponent(playerId)}/balance`);
      return res.json();
    },
    async walletDeposit(playerId, amountMinor, ref) {
      const res = await fetch(`${baseUrl}/api/wallet/${encodeURIComponent(playerId)}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountMinor, ref }),
      });
      return res.json();
    },
    async appendAudit(sessionId, type, payload) {
      const res = await fetch(`${baseUrl}/api/audit/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, type, payload }),
      });
      return res.json();
    },
    async listLobbyGames(jurisdiction) {
      const qs = jurisdiction ? `?jurisdiction=${encodeURIComponent(jurisdiction)}` : '';
      const res = await fetch(`${baseUrl}/api/lobby/games${qs}`);
      return res.json();
    },
    async submitCert(ir, jurisdiction) {
      const res = await fetch(`${baseUrl}/api/cert/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ir, jurisdiction }),
      });
      return res.json();
    },
    async getCertStatus(submissionId) {
      const res = await fetch(`${baseUrl}/api/cert/${encodeURIComponent(submissionId)}`);
      return res.json();
    },
  };
  window.__studio_backend__ = bridge;
  // Probe with a 1.5s timeout so a missing server doesn't block boot.
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 1500);
    const res = await fetch(`${baseUrl}/api/health`, { signal: ctl.signal });
    window.clearTimeout(timer);
    if (res.ok) {
      bridge.connected = true;
      hook().logActivity(`CORTI 200.4 · backend connected @ ${baseUrl}`);
      try {
        pushToast({ kind: 'ok', msg: 'Backend connected', ttl: 3000 });
      } catch { /* polish bridge optional */ }
    } else {
      hook().logActivity(`CORTI 200.4 · backend offline (status ${res.status}) — using local stubs`);
    }
  } catch (err) {
    hook().logActivity('CORTI 200.4 · backend offline — using local stubs');
    void err;
  }
}

// ── Rule Editor bridge install (CORTI 200.1-DUBINA) ─────────────────
function installRuleEditorBridge(): NonNullable<Window['__studio_rule_editor__']> {
  const core = createRuleEditorBridge();
  // Per-variant rule storage — we keep an in-memory map keyed by variant id
  // so each variant has its own rule list. Variant-level persistence is
  // handled by the existing studio Persistence layer (variant.rules array).
  function rulesFor(): IRRule[] {
    const v = getCurrentVariant() as unknown as { rules?: IRRule[] };
    if (!Array.isArray(v.rules)) v.rules = [];
    return v.rules;
  }
  let ruleSeed = 1;
  function nextId(): string { return `r-${ruleSeed++}`; }

  return {
    ...core,
    getRules: () => rulesFor().slice(),
    addRule(name, expression) {
      const r: IRRule = {
        id: nextId(),
        name,
        expression,
        enabled: true,
        priority: rulesFor().length,
      };
      rulesFor().push(r);
      return r;
    },
    removeRule(id) {
      const arr = rulesFor();
      const before = arr.length;
      const next = arr.filter((r) => r.id !== id);
      if (next.length === before) return false;
      const v = getCurrentVariant() as unknown as { rules: IRRule[] };
      v.rules = next;
      return true;
    },
    updateRule(id, patch) {
      const r = rulesFor().find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, patch);
      return true;
    },
    duplicateRule(id) {
      const r = rulesFor().find((x) => x.id === id);
      if (!r) return null;
      const cp: IRRule = {
        ...r,
        id: nextId(),
        name: `${r.name} (copy)`,
        priority: rulesFor().length,
      };
      rulesFor().push(cp);
      return cp;
    },
    reorderRules(ids) {
      const arr = rulesFor();
      const map = new Map(arr.map((r) => [r.id, r]));
      const reordered = ids.map((id) => map.get(id)).filter(Boolean) as IRRule[];
      // Append any rules not in the explicit list (defensive).
      for (const r of arr) if (!ids.includes(r.id)) reordered.push(r);
      reordered.forEach((r, i) => (r.priority = i));
      const v = getCurrentVariant() as unknown as { rules: IRRule[] };
      v.rules = reordered;
    },
    snapshot() {
      return { schemaVersion: 1 as const, rules: rulesFor().map((r) => ({ ...r })) };
    },
    restore(snap) {
      if (!snap || snap.schemaVersion !== 1) return;
      const v = getCurrentVariant() as unknown as { rules: IRRule[] };
      v.rules = snap.rules.map((r) => ({ ...r }));
    },
  };
}

// ── Math Notebook bridge install (CORTI 200.1-DUBINA) ───────────────
function installMathNotebookBridge(): NotebookBridge & { instance: MathNotebook } {
  const core = createMathNotebookBridge();
  const instance = core.create();
  // Seed one cell so the panel doesn't start empty.
  instance.addCell('1 + 1');
  return { ...core, instance };
}

// ── Formula library async loader ─────────────────────────────────────
async function loadFormulaLibrary(): Promise<void> {
  try {
    const url = new URL('../data/formula-library.json', import.meta.url).href;
    const r = await fetch(url);
    const json = (await r.json()) as { formulas: Array<{ id: string; name: string; category: string; expression: string; notes: string }> };
    window.__studio_formula_library__ = { formulas: json.formulas };
    hook().logActivity(`formula library loaded · ${json.formulas.length} entries`);
  } catch (err) {
    console.warn('[studio] formula library load failed:', err);
  }
}

// ── IR Library bridge install (CORTI 200.1) ─────────────────────────
function installIRLibraryBridge(): IRLibraryBridge {
  return {
    load: () => loadIRLibrary(),
    getAllItems: () => getAllIRLibraryItems(),
    filter: (f) => filterIRLibrary(getAllIRLibraryItems(), f),
    topologies: (items) => listIRLibraryTopologies(items),
    preview: (id) => previewIRLibraryItem(id),
    loadIR: (id) => loadIRLibraryItem(id),
  };
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
        sub: 'Try clearing the filters, broadening the wave range, or adjusting jurisdiction chips.',
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

// ── Catalog data loader (industry-pattern catalog only; vendor coverage removed) ──
async function loadCatalogData(): Promise<void> {
  try {
    const cat = await fetch(new URL('../data/catalog-97.json', import.meta.url).href).then((r) => r.json());
    const patterns = Array.isArray(cat?.patterns) ? cat.patterns : [];
    // lwGaps shape preserved as empty array so existing consumers don't crash;
    // vendor-specific coverage tracking was removed during the originality sweep.
    const lwGaps: unknown[] = [];
    window.__studio_catalog__ = { patterns, lwGaps };
    if (typeof window.__studio_catalog_install__ === 'function') {
      window.__studio_catalog_install__({ patterns, lwGaps });
    }
    hook().logActivity(`catalog loaded · ${patterns.length} industry patterns`);
  } catch (err) {
    console.warn('[studio] catalog load failed:', err);
  }
}

boot();

// Re-export bridge type for tests
export type { StudioBridge };
export { bridge };
