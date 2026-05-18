// Studio entry point. Wires the REAL engine (rtpEstimator + Zod-backed
// validator from `src/`) onto the v5 UI shell. Strategy: keep the proven
// UI logic in `app.js` (DOM rendering, wizards, toasts, kbd shortcuts);
// expose a small `window.__studio__` API the UI can call to delegate
// math + IR work to the engine, and to drive persistence.

import { buildIRFromVariant, computeLiveRTP, validateIRBlob, roundTripIR } from './engine.js';
import type { LiveRTP, ValidationReport } from './engine.js';
import { Persistence } from './persistence.js';
import type { StudioVariant, StudioPersistedState, StudioWorkspace } from './types.js';

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
};

window.__studio__ = bridge;

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
  hook().logActivity('engine wired · real RTP estimator online');
}

boot();

// Re-export bridge type for tests
export type { StudioBridge };
export { bridge };
