// W200 — Polish pass: loading/error/empty states, tooltips, mobile guard.
//
// Non-invasive overlay that augments `app.js` without modifying its
// logic. Hooks into the existing toast container, observes tab
// transitions and panel mounts, and installs guard banners + spinners.
//
// All DOM nodes here are tagged with a `data-w200-polish` attribute so
// the rest of the studio (and the e2e tests) can locate them
// deterministically.

export interface PolishApi {
  /** Show a transient loading overlay inside a panel/host element. */
  showSpinner(host: HTMLElement, label?: string): () => void;
  /** Push a toast (proxies to app.js toast(), gracefully falls back). */
  toast(opts: { kind?: 'cyan' | 'ok' | 'warn' | 'err'; msg: string; ttl?: number }): void;
  /** Show/hide the mobile/tablet guard banner. */
  setMobileGuard(visible: boolean): void;
  /** Apply persisted tooltips to all known primary actions / kbd hints. */
  applyTooltips(): void;
  /** Render an empty-state placeholder into a host element. */
  renderEmptyState(host: HTMLElement, opts: { title: string; sub?: string; icon?: string }): void;
}

const POLISH_ATTR = 'data-w200-polish';

// Toast bridge — tries the legacy `app.js` toast(), falls back to a
// console-styled message when the function is not available yet.
function legacyToast(): undefined | ((opts: { kind?: string; msg: string; ttl?: number }) => void) {
  const w = window as unknown as { toast?: (opts: { kind?: string; msg: string; ttl?: number }) => void };
  if (typeof w.toast === 'function') return w.toast;
  // Fall back to checking app.js's toast via #toasts container.
  return undefined;
}

function manualToast(kind: string, msg: string, ttl = 4500): void {
  const c = document.getElementById('toasts');
  if (!c) {
    // Last resort — visible console marker.
    // eslint-disable-next-line no-console
    console.info(`[studio·toast·${kind}]`, msg);
    return;
  }
  const el = document.createElement('div');
  el.className = `toast is-${kind}`;
  el.setAttribute(POLISH_ATTR, 'toast');
  el.innerHTML = `<span>${msg}</span>`;
  c.appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = '0';
    window.setTimeout(() => el.remove(), 240);
  }, ttl);
}

export function pushToast(opts: { kind?: 'cyan' | 'ok' | 'warn' | 'err'; msg: string; ttl?: number }): void {
  const t = legacyToast();
  const kind = opts.kind ?? 'cyan';
  if (t) {
    t({ kind, msg: opts.msg, ttl: opts.ttl });
    return;
  }
  manualToast(kind, opts.msg, opts.ttl);
}

// ── Spinner overlay ─────────────────────────────────────────────────
const SPINNER_CSS_ID = 'w200-polish-spinner-css';

function ensureSpinnerCss(): void {
  if (document.getElementById(SPINNER_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = SPINNER_CSS_ID;
  style.textContent = `
.w200-spinner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(8,10,15,0.78);
  z-index: 90;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #A9B0BC;
  gap: 10px;
}
.w200-spinner-ring {
  width: 28px;
  height: 28px;
  border: 2px solid #1A1F28;
  border-top-color: #22D3EE;
  border-radius: 50%;
  animation: w200-spin 0.8s linear infinite;
}
@keyframes w200-spin { to { transform: rotate(360deg); } }
.w200-spinner-label { letter-spacing: 0.05em; text-transform: uppercase; color: #5C6470; }
.w200-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  font-family: ui-monospace, monospace;
  color: #5C6470;
  font-size: 12px;
  gap: 8px;
}
.w200-empty-state .ico {
  font-size: 28px;
  opacity: 0.4;
}
.w200-empty-state .title {
  font-size: 13px;
  color: #A9B0BC;
}
.w200-empty-state .sub { font-size: 11px; }
.w200-mobile-guard {
  position: fixed;
  inset: 0;
  background: #0B0E14;
  color: #A9B0BC;
  z-index: 9999;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  gap: 12px;
}
.w200-mobile-guard.is-visible { display: flex; }
.w200-mobile-guard h1 {
  font-size: 16px;
  margin: 0;
  color: #22D3EE;
}
.w200-mobile-guard p { max-width: 360px; line-height: 1.5; margin: 0; }
@media (min-width: 1024px) { .w200-mobile-guard { display: none !important; } }
`;
  document.head.appendChild(style);
}

export function showSpinner(host: HTMLElement, label = 'Loading…'): () => void {
  ensureSpinnerCss();
  // Make sure host can host an absolutely-positioned overlay.
  const computed = window.getComputedStyle(host);
  if (computed.position === 'static') {
    host.style.position = 'relative';
  }
  const overlay = document.createElement('div');
  overlay.className = 'w200-spinner-overlay';
  overlay.setAttribute(POLISH_ATTR, 'spinner');
  overlay.innerHTML = `
    <div class="w200-spinner-ring" role="status" aria-live="polite"></div>
    <div class="w200-spinner-label">${label}</div>
  `;
  host.appendChild(overlay);
  return () => {
    overlay.remove();
  };
}

// ── Empty state ─────────────────────────────────────────────────────
export function renderEmptyState(
  host: HTMLElement,
  opts: { title: string; sub?: string; icon?: string }
): void {
  ensureSpinnerCss();
  const el = document.createElement('div');
  el.className = 'w200-empty-state';
  el.setAttribute(POLISH_ATTR, 'empty');
  el.innerHTML = `
    <div class="ico" aria-hidden="true">${opts.icon ?? '◇'}</div>
    <div class="title">${opts.title}</div>
    ${opts.sub ? `<div class="sub">${opts.sub}</div>` : ''}
  `;
  host.appendChild(el);
}

// ── Mobile guard ────────────────────────────────────────────────────
const GUARD_ID = 'w200-mobile-guard';

function ensureMobileGuard(): HTMLElement {
  ensureSpinnerCss();
  let g = document.getElementById(GUARD_ID);
  if (g) return g;
  g = document.createElement('div');
  g.id = GUARD_ID;
  g.className = 'w200-mobile-guard';
  g.setAttribute('role', 'alertdialog');
  g.setAttribute('aria-label', 'Viewport too small');
  g.innerHTML = `
    <h1>Studio is desktop-only</h1>
    <p>Best viewed at <b>1280×800+</b> on desktop. Mobile and tablet support is on the W210+ roadmap.</p>
    <p><button class="btn-ghost" id="w200-mobile-guard-dismiss" style="padding:6px 14px;color:#22D3EE;background:transparent;border:1px solid #22D3EE;border-radius:3px;cursor:pointer;">Continue anyway</button></p>
  `;
  document.body.appendChild(g);
  const dismiss = document.getElementById('w200-mobile-guard-dismiss');
  if (dismiss) {
    dismiss.addEventListener('click', () => {
      g!.classList.remove('is-visible');
    });
  }
  return g;
}

export function setMobileGuard(visible: boolean): void {
  const g = ensureMobileGuard();
  if (visible) g.classList.add('is-visible');
  else g.classList.remove('is-visible');
}

function updateMobileGuard(): void {
  setMobileGuard(window.innerWidth < 1024);
}

// ── Tooltips ────────────────────────────────────────────────────────
// Map of CSS selector → tooltip text. Applied idempotently.
const TOOLTIPS: Array<{ sel: string; title: string }> = [
  { sel: '#btn-cmdp', title: 'Open command palette (⌘K)' },
  { sel: '#btn-help', title: 'Keyboard shortcuts (?)' },
  { sel: '#btn-compare', title: 'Switch to side-by-side A/B variant compare' },
  { sel: '#btn-quickstart', title: 'Quick-start template picker' },
  { sel: '#btn-validate', title: 'Validate IR (Zod schema + cross-check)' },
  { sel: '#btn-autobalance', title: 'Auto-balance reel weights to target RTP (B)' },
  { sel: '#btn-compute', title: 'Compute RTP using closed-form estimator' },
  { sel: '#btn-spin', title: 'Spin the reels (Space)' },
  { sel: '#btn-auto10', title: 'Autoplay 10 spins (UK-guarded)' },
  { sel: '#btn-replay', title: 'Replay last spin with same seed' },
  { sel: '#btn-seed', title: 'Override or randomise PRNG seed' },
  { sel: '#btn-run-mc', title: 'Run Monte-Carlo simulation (R)' },
  { sel: '#btn-gen-par', title: 'Generate 12-section PAR sheet (ed25519-signed)' },
  { sel: '#btn-run-audit', title: 'Run compliance audit · 15 jurisdictions' },
  { sel: '#btn-export-zip', title: 'Download 153-file operator package ZIP' },
  { sel: '#sensitivity-run', title: 'Run parameter sweep (1000 points by default)' },
  { sel: '#sensitivity-export-csv', title: 'Export current sweep curve as CSV' },
  { sel: '#sensitivity-save-b', title: 'Save Config B as a new variant' },
  { sel: '#compose-validate', title: 'Validate the composed feature graph against engine rules' },
  { sel: '#compose-export', title: 'Export the feature graph as JSON' },
  { sel: '#compose-clear', title: 'Clear the canvas (Ctrl-Z to undo)' },
  { sel: '#ws-newgame-btn', title: 'Create a new game (Empty / Quick-start / GDD import)' },
  { sel: '#persona-cta', title: 'Persona-aware primary action' },
];

export function applyTooltips(): void {
  for (const t of TOOLTIPS) {
    const el = document.querySelector(t.sel);
    if (el && !el.getAttribute('title')) {
      el.setAttribute('title', t.title);
    }
  }
}

// ── Public install ──────────────────────────────────────────────────
export function installPolish(): PolishApi {
  ensureSpinnerCss();
  ensureMobileGuard();
  applyTooltips();
  updateMobileGuard();
  window.addEventListener('resize', updateMobileGuard);

  // Re-apply tooltips a few times — `app.js` renders some buttons lazily
  // (variant tabs, persona CTAs). Three retries at 250/750/2000ms keeps
  // the cost trivial while catching all standard mount paths.
  for (const delay of [250, 750, 2000]) {
    window.setTimeout(applyTooltips, delay);
  }

  return {
    showSpinner,
    toast: pushToast,
    setMobileGuard,
    applyTooltips,
    renderEmptyState,
  };
}

// Default export for convenience.
export default installPolish;
