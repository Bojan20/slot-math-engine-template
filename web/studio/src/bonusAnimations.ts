// W200.3 — Bonus-feature animation controller.
//
// Drives Free-Spins intro/outro, Hold-and-Win reveal + per-respin orb
// landing, and Cascade dissolve+drop animation sequences over the Pixi
// canvas mounted by the PLAY-tab renderer (`renderer.ts`). The module
// is deliberately decoupled from `renderer.ts` — it does not need any
// internal renderer state. Pixi access is via the `pixi.Application`
// reference handed in at construction, plus a thin DOM overlay above
// the canvas for badge counters (FS, H&W respin, cascade chain).
//
// All animations resolve as Promises so callers can await sequences in
// order. In headless / no-Pixi mode the animator still drives the state
// machine + counters; promises resolve after a deterministic short
// timeout so tests run quickly without touching real ticker frames.
//
// State machine — see `AnimationState`. `transitionTo()` enforces the
// legal-edge set; invalid transitions throw so misuse is caught early.
//
// Public surface — `createBonusAnimator(pixiApp, opts?)`.

/* eslint-disable @typescript-eslint/no-explicit-any */

// PixiNS placeholder — runtime-typed so we don't force a pixi import on
// tests that run in node without WebGL.
type PixiNS = any;

// ── Public types ────────────────────────────────────────────────────

export type AnimationState =
  | 'idle'
  | 'spinning'
  | 'fs-intro'
  | 'fs-mode'
  | 'fs-outro'
  | 'hw-intro'
  | 'hw-orb-land'
  | 'hw-payout'
  | 'hw-outro'
  | 'cascade-dissolve'
  | 'cascade-drop'
  | 'cascade-refill';

export interface BonusAnimator {
  fsIntro(scatterCount: number, fsCount: number): Promise<void>;
  fsModeIndicator(current: number, total: number, mult: number): void;
  fsOutro(totalWin: number): Promise<void>;
  hwIntro(orbCount: number, grid: number[][]): Promise<void>;
  hwOrbLand(reel: number, row: number, value: number): Promise<void>;
  hwPayout(orbs: Array<{ r: number; c: number; value: number }>): Promise<void>;
  cascadeStep(
    chainDepth: number,
    winningCells: Array<{ r: number; c: number }>,
  ): Promise<void>;
  /** Current state machine value (read-only). */
  state(): AnimationState;
  /** Force a state transition — throws on invalid edges. */
  transitionTo(next: AnimationState): void;
  /** Manually clear the cascade chain counter (e.g. after a non-winning spin). */
  resetCascade(): void;
  /** Tear down DOM badges / timers. Idempotent. */
  destroy(): void;
}

export interface CreateBonusAnimatorOptions {
  /** Skip Pixi text/overlay graphics — used in headless / jsdom tests. */
  headless?: boolean;
  /** Override the default per-step duration (ms). Useful for test speed. */
  splashMs?: number;
  /** Override the orb-land bounce duration. */
  orbLandMs?: number;
  /** Override per-cascade-phase duration. */
  cascadePhaseMs?: number;
  /** Container element where DOM badges are mounted. Default `document.body`. */
  container?: HTMLElement | null;
  /** Cap chain depth so cascadeStep refuses out-of-bound depth. */
  maxChain?: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_SPLASH_MS = 2000;
const DEFAULT_ORB_LAND_MS = 600;
const DEFAULT_CASCADE_PHASE_MS = 600;
const DEFAULT_MAX_CHAIN = 20;
const HEADLESS_SHRINK_MS = 1; // tests do not need real 2s splashes

// ── State machine edges ─────────────────────────────────────────────
//
// Allowed transitions are explicit so unintended jumps (e.g. straight
// from `idle` to `hw-payout` without `hw-intro`) raise an error.

const LEGAL_EDGES: Record<AnimationState, ReadonlyArray<AnimationState>> = {
  idle: ['spinning', 'fs-intro', 'hw-intro', 'cascade-dissolve'],
  spinning: [
    'idle',
    'fs-intro',
    'hw-intro',
    'cascade-dissolve',
    'spinning',
  ],
  'fs-intro': ['fs-mode'],
  'fs-mode': ['fs-mode', 'fs-outro', 'cascade-dissolve', 'hw-intro'],
  'fs-outro': ['idle'],
  'hw-intro': ['hw-orb-land', 'hw-payout'],
  'hw-orb-land': ['hw-orb-land', 'hw-payout'],
  'hw-payout': ['hw-outro'],
  'hw-outro': ['idle'],
  'cascade-dissolve': ['cascade-drop'],
  'cascade-drop': ['cascade-refill'],
  'cascade-refill': [
    'idle',
    'cascade-dissolve',
    'fs-mode',
    'spinning',
  ],
};

function isLegalTransition(from: AnimationState, to: AnimationState): boolean {
  // `idle` is always reachable as an escape hatch from any state — animators
  // call this when the user aborts a sequence.
  if (to === 'idle') return true;
  const next = LEGAL_EDGES[from];
  return next.includes(to);
}

// ── Animator state ──────────────────────────────────────────────────

interface AnimatorRuntime {
  pixi: PixiNS | null;
  headless: boolean;
  splashMs: number;
  orbLandMs: number;
  cascadePhaseMs: number;
  maxChain: number;
  state: AnimationState;
  destroyed: boolean;
  cascadeDepth: number;
  fsCurrent: number;
  fsTotal: number;
  fsMult: number;
  hwRespins: number;
  hwOrbCount: number;
  hwOrbs: Map<string, number>; // key "r,c" → value
  container: HTMLElement | null;
  badgeFs: HTMLElement | null;
  badgeHw: HTMLElement | null;
  badgeCascade: HTMLElement | null;
  splashLayer: HTMLElement | null;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function makeRuntime(
  pixi: PixiNS | null,
  opts: CreateBonusAnimatorOptions,
): AnimatorRuntime {
  const headless = !!opts.headless || pixi == null;
  return {
    pixi,
    headless,
    splashMs: opts.splashMs ?? (headless ? HEADLESS_SHRINK_MS : DEFAULT_SPLASH_MS),
    orbLandMs:
      opts.orbLandMs ?? (headless ? HEADLESS_SHRINK_MS : DEFAULT_ORB_LAND_MS),
    cascadePhaseMs:
      opts.cascadePhaseMs ??
      (headless ? HEADLESS_SHRINK_MS : DEFAULT_CASCADE_PHASE_MS),
    maxChain: opts.maxChain ?? DEFAULT_MAX_CHAIN,
    state: 'idle',
    destroyed: false,
    cascadeDepth: 0,
    fsCurrent: 0,
    fsTotal: 0,
    fsMult: 1,
    hwRespins: 3,
    hwOrbCount: 0,
    hwOrbs: new Map(),
    container: opts.container ?? null,
    badgeFs: null,
    badgeHw: null,
    badgeCascade: null,
    splashLayer: null,
  };
}

// ── DOM badge installation ──────────────────────────────────────────

function ensureBadges(runtime: AnimatorRuntime): void {
  if (runtime.headless || runtime.destroyed) return;
  if (typeof document === 'undefined') return;
  const host = runtime.container ?? document.getElementById('pixi-canvas') ?? document.body;
  if (!host) return;
  if (!runtime.badgeFs) {
    const b = document.createElement('div');
    b.className = 'play-fs-counter';
    b.setAttribute('data-w200-bonus', 'fs');
    b.style.display = 'none';
    host.appendChild(b);
    runtime.badgeFs = b;
  }
  if (!runtime.badgeHw) {
    const b = document.createElement('div');
    b.className = 'play-hw-counter';
    b.setAttribute('data-w200-bonus', 'hw');
    b.style.display = 'none';
    host.appendChild(b);
    runtime.badgeHw = b;
  }
  if (!runtime.badgeCascade) {
    const b = document.createElement('div');
    b.className = 'play-cascade-depth';
    b.setAttribute('data-w200-bonus', 'cascade');
    b.style.display = 'none';
    host.appendChild(b);
    runtime.badgeCascade = b;
  }
}

function updateBadgeFs(runtime: AnimatorRuntime): void {
  if (!runtime.badgeFs) return;
  if (runtime.fsTotal <= 0) {
    runtime.badgeFs.style.display = 'none';
    return;
  }
  runtime.badgeFs.style.display = 'block';
  const multHtml =
    runtime.fsMult > 1
      ? `<span class="play-fs-mult">×${runtime.fsMult}</span>`
      : '';
  runtime.badgeFs.innerHTML = `<span class="play-fs-label">FS</span> ${runtime.fsCurrent}/${runtime.fsTotal}${multHtml}`;
}

function updateBadgeHw(runtime: AnimatorRuntime): void {
  if (!runtime.badgeHw) return;
  if (runtime.state !== 'hw-orb-land' && runtime.state !== 'hw-intro') {
    runtime.badgeHw.style.display = 'none';
    return;
  }
  runtime.badgeHw.style.display = 'block';
  runtime.badgeHw.innerHTML = `<span class="play-hw-label">H&amp;W</span> ${runtime.hwRespins} respins · ${runtime.hwOrbs.size} orbs`;
}

function updateBadgeCascade(runtime: AnimatorRuntime): void {
  if (!runtime.badgeCascade) return;
  if (runtime.cascadeDepth <= 0) {
    runtime.badgeCascade.style.display = 'none';
    return;
  }
  runtime.badgeCascade.style.display = 'block';
  runtime.badgeCascade.innerHTML = `<span class="play-cascade-label">CASCADE</span> ×${runtime.cascadeDepth}`;
}

// ── Splash overlay (DOM, sits over the canvas) ──────────────────────

function showSplash(runtime: AnimatorRuntime, text: string, sub?: string): void {
  if (runtime.headless || typeof document === 'undefined') return;
  const host = runtime.container ?? document.getElementById('pixi-canvas') ?? document.body;
  if (!host) return;
  if (!runtime.splashLayer) {
    const s = document.createElement('div');
    s.className = 'play-bonus-splash';
    s.setAttribute('data-w200-bonus', 'splash');
    host.appendChild(s);
    runtime.splashLayer = s;
  }
  runtime.splashLayer.innerHTML =
    `<div class="play-bonus-splash-text">${text}</div>` +
    (sub ? `<div class="play-bonus-splash-sub">${sub}</div>` : '');
  runtime.splashLayer.style.display = 'flex';
}

function hideSplash(runtime: AnimatorRuntime): void {
  if (runtime.splashLayer) runtime.splashLayer.style.display = 'none';
}

// ── Factory ─────────────────────────────────────────────────────────

export function createBonusAnimator(
  pixiApp: PixiNS | null,
  opts: CreateBonusAnimatorOptions = {},
): BonusAnimator {
  const runtime = makeRuntime(pixiApp, opts);
  ensureBadges(runtime);

  function transitionTo(next: AnimationState): void {
    if (runtime.destroyed) return;
    if (!isLegalTransition(runtime.state, next)) {
      throw new Error(
        `[BonusAnimator] illegal transition ${runtime.state} → ${next}`,
      );
    }
    runtime.state = next;
  }

  async function fsIntro(scatterCount: number, fsCount: number): Promise<void> {
    if (scatterCount < 3) throw new Error('[fsIntro] requires scatterCount ≥ 3');
    transitionTo('fs-intro');
    runtime.fsCurrent = 0;
    runtime.fsTotal = fsCount;
    runtime.fsMult = 1;
    showSplash(
      runtime,
      'FREE SPINS!',
      `${scatterCount} ★ = ${fsCount} FREE SPINS`,
    );
    await delay(runtime.splashMs);
    hideSplash(runtime);
    transitionTo('fs-mode');
    updateBadgeFs(runtime);
  }

  function fsModeIndicator(current: number, total: number, mult: number): void {
    runtime.fsCurrent = current;
    runtime.fsTotal = total;
    runtime.fsMult = Math.max(1, mult);
    updateBadgeFs(runtime);
  }

  async function fsOutro(totalWin: number): Promise<void> {
    transitionTo('fs-outro');
    showSplash(runtime, `TOTAL FS WIN`, `$${totalWin.toFixed(2)}`);
    await delay(runtime.splashMs);
    hideSplash(runtime);
    runtime.fsCurrent = 0;
    runtime.fsTotal = 0;
    runtime.fsMult = 1;
    updateBadgeFs(runtime);
    transitionTo('idle');
  }

  async function hwIntro(orbCount: number, _grid: number[][]): Promise<void> {
    if (orbCount < 6) throw new Error('[hwIntro] requires orbCount ≥ 6');
    transitionTo('hw-intro');
    runtime.hwOrbCount = orbCount;
    runtime.hwOrbs.clear();
    runtime.hwRespins = 3;
    showSplash(runtime, 'HOLD & WIN!', `${orbCount} orbs locked`);
    await delay(runtime.splashMs);
    hideSplash(runtime);
    updateBadgeHw(runtime);
    transitionTo('hw-orb-land');
  }

  async function hwOrbLand(
    reel: number,
    row: number,
    value: number,
  ): Promise<void> {
    if (runtime.state !== 'hw-orb-land' && runtime.state !== 'hw-intro') {
      transitionTo('hw-orb-land');
    } else if (runtime.state === 'hw-intro') {
      transitionTo('hw-orb-land');
    }
    const key = `${row},${reel}`;
    runtime.hwOrbs.set(key, value);
    runtime.hwRespins = 3; // reset on land
    updateBadgeHw(runtime);
    await delay(runtime.orbLandMs);
  }

  async function hwPayout(
    orbs: Array<{ r: number; c: number; value: number }>,
  ): Promise<void> {
    transitionTo('hw-payout');
    const total = orbs.reduce((s, o) => s + o.value, 0);
    showSplash(runtime, 'HOLD & WIN PAYOUT', `$${total.toFixed(2)}`);
    await delay(runtime.splashMs);
    hideSplash(runtime);
    transitionTo('hw-outro');
    runtime.hwOrbs.clear();
    runtime.hwOrbCount = 0;
    updateBadgeHw(runtime);
    transitionTo('idle');
  }

  async function cascadeStep(
    chainDepth: number,
    _winningCells: Array<{ r: number; c: number }>,
  ): Promise<void> {
    // Cap chain depth — out-of-bound depth is a programmer error, not a
    // runtime warning. We saturate at maxChain so the counter never lies.
    const capped = Math.min(chainDepth, runtime.maxChain);
    runtime.cascadeDepth = capped;
    updateBadgeCascade(runtime);
    transitionTo('cascade-dissolve');
    await delay(runtime.cascadePhaseMs);
    transitionTo('cascade-drop');
    await delay(runtime.cascadePhaseMs);
    transitionTo('cascade-refill');
    await delay(runtime.cascadePhaseMs);
    // Return to a non-cascade resting state so caller can chain or stop.
    if (runtime.fsTotal > 0) {
      runtime.state = 'fs-mode';
    } else {
      runtime.state = 'idle';
    }
  }

  function resetCascade(): void {
    runtime.cascadeDepth = 0;
    updateBadgeCascade(runtime);
  }

  function state(): AnimationState {
    return runtime.state;
  }

  function destroy(): void {
    if (runtime.destroyed) return;
    runtime.destroyed = true;
    if (runtime.badgeFs?.parentElement) runtime.badgeFs.remove();
    if (runtime.badgeHw?.parentElement) runtime.badgeHw.remove();
    if (runtime.badgeCascade?.parentElement) runtime.badgeCascade.remove();
    if (runtime.splashLayer?.parentElement) runtime.splashLayer.remove();
    runtime.badgeFs = null;
    runtime.badgeHw = null;
    runtime.badgeCascade = null;
    runtime.splashLayer = null;
  }

  return {
    fsIntro,
    fsModeIndicator,
    fsOutro,
    hwIntro,
    hwOrbLand,
    hwPayout,
    cascadeStep,
    state,
    transitionTo,
    resetCascade,
    destroy,
  };
}

// ── Helper: detect cascade winning cells from a result grid ────────
//
// Exposed for tests + the playTab wiring. A "winning cell" is any cell
// touched by an entry in `result.wins[*].positions`. The function does
// NOT mutate input.

export function identifyWinningCells(
  wins: Array<{ positions: Array<[number, number]> }>,
): Array<{ r: number; c: number }> {
  const set = new Set<string>();
  const out: Array<{ r: number; c: number }> = [];
  for (const w of wins) {
    for (const [reel, row] of w.positions) {
      const key = `${row},${reel}`;
      if (!set.has(key)) {
        set.add(key);
        out.push({ r: row, c: reel });
      }
    }
  }
  return out;
}

// ── Helper: cascade gravity drop preserves top symbols ──────────────
//
// Returns a new grid where symbols at `winningCells` are removed, then
// every remaining symbol falls to fill voids per-column. Top rows are
// padded with `null` so callers can supply fresh symbols. Pure / testable.

export function applyCascadeGravity(
  grid: string[][],
  winningCells: Array<{ r: number; c: number }>,
): Array<Array<string | null>> {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0]!.length : 0;
  const removed = new Set(winningCells.map((w) => `${w.r},${w.c}`));
  // Build per-column remaining stacks (bottom-first).
  const result: Array<Array<string | null>> = [];
  for (let r = 0; r < rows; r++) result.push(new Array(cols).fill(null));
  for (let c = 0; c < cols; c++) {
    const stack: string[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (!removed.has(`${r},${c}`)) {
        stack.push(grid[r]![c]!);
      }
    }
    // Place bottom-up.
    let writeRow = rows - 1;
    for (const s of stack) {
      result[writeRow]![c] = s;
      writeRow--;
    }
    // writeRow .. 0 stay null (refill slots).
  }
  return result;
}
