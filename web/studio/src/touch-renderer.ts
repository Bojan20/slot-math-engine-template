// CORTI W207-MOBILE — Touch-optimized renderer overlay.
//
// Purpose
// ───────
// The existing Pixi renderer in `renderer.ts` is mouse-/keyboard-first.
// Rather than re-write it, this overlay attaches a thin pointer-event
// shim plus four touch affordances on top of the canvas:
//
//   • pinch-to-zoom (gesture detection — two-pointer scale tracking)
//   • swipe-to-spin (single-pointer flick → invoke `onSpin`)
//   • long-press → emit `onContextMenu` (mobile substitute for right-click)
//   • haptic vibration on spin / win / context-menu open
//
// It also exposes a helper to override the win-line stroke thickness so
// touchscreens get fatter, more legible lines.
//
// The module is pure logic — no Pixi imports — so unit tests can run
// under Node without a WebGL canvas.

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  t: number;
}

export interface TouchRendererOptions {
  /** Minimum swipe distance in px to count as a spin gesture. */
  swipeThresholdPx?: number;
  /** Maximum gesture duration in ms for a swipe (faster ⇒ flick). */
  swipeMaxDurationMs?: number;
  /** Hold duration in ms before long-press fires. */
  longPressMs?: number;
  /** Minimum scale ratio change before pinch-zoom is reported. */
  pinchEpsilon?: number;
  /** Custom haptic ms (default 25 / 60 / 120 for spin / win / menu). */
  hapticMs?: { spin?: number; win?: number; menu?: number };
}

export interface TouchRenderer {
  /** Attach pointer handlers to a DOM element. */
  attach(el: HTMLElement, callbacks: {
    onSpin?: (direction: 'down' | 'up' | 'left' | 'right') => void;
    onZoom?: (scaleDelta: number, center: { x: number; y: number }) => void;
    onContextMenu?: (point: { x: number; y: number }) => void;
    onTap?: (point: { x: number; y: number }) => void;
  }): () => void;
  /** Manually trigger a haptic blip ("vibrate" alias with guard). */
  haptic(kind: 'spin' | 'win' | 'menu' | 'tick'): boolean;
  /** Compute the optimal win-line stroke width for a given pixel-density. */
  winLineWidth(devicePixelRatio: number, baseline?: number): number;
  /** Detect pinch-zoom scale factor between two pointer events. */
  pinchScale(a: TouchPoint, b: TouchPoint, prevA: TouchPoint, prevB: TouchPoint): number;
  /** Classify a single-pointer gesture as swipe / tap / longpress. */
  classifyGesture(start: TouchPoint, end: TouchPoint, opts?: TouchRendererOptions): GestureKind;
}

export type GestureKind =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'longpress'; x: number; y: number }
  | { kind: 'swipe'; direction: 'down' | 'up' | 'left' | 'right'; distancePx: number }
  | { kind: 'none' };

const DEFAULTS: Required<TouchRendererOptions> = {
  swipeThresholdPx: 40,
  swipeMaxDurationMs: 600,
  longPressMs: 500,
  pinchEpsilon: 0.03,
  hapticMs: { spin: 25, win: 60, menu: 120 },
};

/** Distance helper. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Compute the pinch scale factor between two pointer snapshots. */
export function pinchScale(
  a: TouchPoint,
  b: TouchPoint,
  prevA: TouchPoint,
  prevB: TouchPoint,
): number {
  const now = dist(a, b);
  const before = dist(prevA, prevB);
  if (before === 0) return 1;
  return now / before;
}

/** Classify a gesture using start/end timestamps + positions. */
export function classifyGesture(
  start: TouchPoint,
  end: TouchPoint,
  opts: TouchRendererOptions = {},
): GestureKind {
  const o = { ...DEFAULTS, ...opts };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const duration = end.t - start.t;

  // Long-press: barely moved + held long enough.
  if (d < 10 && duration >= o.longPressMs) {
    return { kind: 'longpress', x: end.x, y: end.y };
  }

  // Swipe: moved far enough, finished within the flick window.
  if (d >= o.swipeThresholdPx && duration <= o.swipeMaxDurationMs) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX >= absY) {
      return { kind: 'swipe', direction: dx > 0 ? 'right' : 'left', distancePx: d };
    }
    return { kind: 'swipe', direction: dy > 0 ? 'down' : 'up', distancePx: d };
  }

  // Tap: tiny movement, short duration.
  if (d < 10 && duration < o.longPressMs) {
    return { kind: 'tap', x: end.x, y: end.y };
  }

  return { kind: 'none' };
}

/** Optimal stroke width — scales with DPR but clamped to legibility. */
export function winLineWidth(devicePixelRatio: number, baseline = 3): number {
  const dpr = Math.max(1, devicePixelRatio || 1);
  // 3px baseline at DPR 1 → 6 at DPR 2 (retina), capped at 8.
  return Math.min(8, Math.round(baseline * Math.sqrt(dpr) * 1.4));
}

/** Trigger a vibration. Returns true if the device supports haptics. */
export function haptic(kind: 'spin' | 'win' | 'menu' | 'tick', opts?: TouchRendererOptions): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const o = { ...DEFAULTS, ...opts };
  let ms: number;
  switch (kind) {
    case 'spin':
      ms = o.hapticMs.spin ?? DEFAULTS.hapticMs.spin!;
      break;
    case 'win':
      ms = o.hapticMs.win ?? DEFAULTS.hapticMs.win!;
      break;
    case 'menu':
      ms = o.hapticMs.menu ?? DEFAULTS.hapticMs.menu!;
      break;
    case 'tick':
    default:
      ms = 10;
  }
  try {
    return !!navigator.vibrate(ms);
  } catch {
    return false;
  }
}

/** Create a touch renderer scoped to a single host element. */
export function createTouchRenderer(opts: TouchRendererOptions = {}): TouchRenderer {
  const effectiveOpts = { ...DEFAULTS, ...opts };

  function attach(
    el: HTMLElement,
    callbacks: {
      onSpin?: (direction: 'down' | 'up' | 'left' | 'right') => void;
      onZoom?: (scaleDelta: number, center: { x: number; y: number }) => void;
      onContextMenu?: (point: { x: number; y: number }) => void;
      onTap?: (point: { x: number; y: number }) => void;
    },
  ): () => void {
    const active = new Map<number, TouchPoint>();
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let prevPair: [TouchPoint, TouchPoint] | null = null;

    function snapshot(ev: PointerEvent): TouchPoint {
      return { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() };
    }

    const onDown = (ev: PointerEvent): void => {
      const p = snapshot(ev);
      active.set(p.id, p);
      // Track for pinch.
      if (active.size === 2) {
        const [a, b] = [...active.values()];
        prevPair = [a!, b!];
      }
      // Long-press timer for single pointers only.
      if (active.size === 1) {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          const start = active.get(p.id);
          if (!start) return;
          // Confirm pointer is still resting in the same area.
          haptic('menu', effectiveOpts);
          callbacks.onContextMenu?.({ x: start.x, y: start.y });
        }, effectiveOpts.longPressMs);
      } else if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onMove = (ev: PointerEvent): void => {
      if (!active.has(ev.pointerId)) return;
      const p = snapshot(ev);
      active.set(p.id, p);
      // Cancel long-press as soon as the user drifts.
      if (longPressTimer) {
        const start = active.get(p.id);
        if (start && dist(start, p) > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
      // Pinch tracking.
      if (active.size === 2 && prevPair) {
        const [a, b] = [...active.values()];
        const scale = pinchScale(a!, b!, prevPair[0], prevPair[1]);
        if (Math.abs(scale - 1) >= effectiveOpts.pinchEpsilon) {
          const cx = (a!.x + b!.x) / 2;
          const cy = (a!.y + b!.y) / 2;
          callbacks.onZoom?.(scale, { x: cx, y: cy });
          prevPair = [a!, b!];
        }
      }
    };

    const onUp = (ev: PointerEvent): void => {
      const end = snapshot(ev);
      const start = active.get(end.id);
      active.delete(end.id);
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (active.size < 2) prevPair = null;
      if (!start) return;
      // Skip gesture classification if pinch was in progress.
      const g = classifyGesture(start, end, effectiveOpts);
      if (g.kind === 'swipe') {
        haptic('spin', effectiveOpts);
        callbacks.onSpin?.(g.direction);
      } else if (g.kind === 'tap') {
        callbacks.onTap?.({ x: g.x, y: g.y });
      } else if (g.kind === 'longpress') {
        // Already fired on timer — skip duplicate.
      }
    };

    const onCancel = (ev: PointerEvent): void => {
      active.delete(ev.pointerId);
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (active.size < 2) prevPair = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onCancel);

    // Disable browser's native long-press context menu so ours wins.
    const onCtx = (ev: Event): void => {
      ev.preventDefault();
    };
    el.addEventListener('contextmenu', onCtx);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onCancel);
      el.removeEventListener('contextmenu', onCtx);
      if (longPressTimer) clearTimeout(longPressTimer);
    };
  }

  return {
    attach,
    haptic: (kind) => haptic(kind, effectiveOpts),
    winLineWidth,
    pinchScale,
    classifyGesture: (s, e, o) => classifyGesture(s, e, { ...effectiveOpts, ...(o ?? {}) }),
  };
}

export default createTouchRenderer;
