/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: multiplier  —  Generic Multiplier Strip
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Renders a horizontally-scrolling strip of multiplier values + a MISS
 * marker at the top of the runner.  Reads `IR.features.multiplier`:
 *
 *   distribution: [{ value: 2, weight: 5 }, { value: 5, weight: 1 }, ...]
 *   trigger:      { probability: 0.12 }              // optional
 *   scope:        'base_game_only' | 'free_spins'    // optional
 *
 * Events:
 *   spin:start          → start scroll animation
 *   spin:lightning      → land state; show landed value with glow
 *   spin:render-done    → return to idle
 *
 * No game-specific theming — all colors come from --mtl-accent / --gold.
 * A skin layer can override these via CSS without touching the component.
 *
 * Math:  the multiplier outcome is computed by oracle.js / runtime.js —
 * this component just VISUALIZES the result it receives via the bus.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const STYLES = `
    .ft-mult {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 6px;
      background: var(--hud-bg, rgba(15,23,42,0.78));
      border: 1px solid var(--hud-bd, rgba(148,163,184,0.18));
      border-radius: 8px;
      max-width: 320px;
    }
    .ft-mult__window {
      width: 100%; height: 36px;
      overflow: hidden; position: relative;
      border-radius: 6px;
      background: rgba(0,0,0,0.4);
    }
    .ft-mult__strip {
      display: flex; gap: 0; height: 100%;
      will-change: transform;
    }
    .ft-mult__item {
      flex: 0 0 64px; height: 100%;
      display: flex; align-items: center; justify-content: center;
      font: 600 14px ui-monospace, Menlo, monospace;
      color: var(--mtl-accent, var(--gold, #fde68a));
      border-right: 1px solid rgba(148,163,184,0.12);
    }
    .ft-mult__item--miss { color: var(--rose, #fda4af); }
    .ft-mult__item--hi   { color: #fef3c7; text-shadow: 0 0 8px var(--mtl-accent, var(--gold, #fde68a)); }
    .ft-mult__pointer {
      position: absolute; top: 0; bottom: 0;
      width: 2px;
      background: var(--mtl-accent, var(--gold, #fde68a));
      box-shadow: 0 0 6px var(--mtl-accent, var(--gold, #fde68a));
      pointer-events: none;
    }
    .ft-mult__pointer--l { left: 50%; transform: translateX(-26px); }
    .ft-mult__pointer--r { left: 50%; transform: translateX(24px); }
    .ft-mult__label {
      font-size: 9px; letter-spacing: 0.1em; color: var(--txt-3, #64748b); text-transform: uppercase;
    }
    .ft-mult[data-state="spin"] .ft-mult__strip {
      animation: ft-mult-scroll 1.2s linear infinite;
    }
    .ft-mult[data-state="land"] {
      border-color: var(--mtl-accent, var(--gold-deep, #f59e0b));
      box-shadow: 0 0 20px rgba(245,158,11,0.35);
    }
    @keyframes ft-mult-scroll { from { transform: translateX(0); } to { transform: translateX(-320px); } }

    /* ────── BOLT BURST ─────────────────────────────────────────────
       Full-frame overlay that fires on every winning spin where the
       multiplier rolled > 1×.  Shows the multiplier value (e.g. "5×")
       in a giant glowing badge anchored to the reels, with a SVG bolt
       backdrop.  Lasts ~1.2s total. */
    .ft-mult-burst {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 12;
      opacity: 0;
    }
    .ft-mult-burst.is-active { animation: ft-burst-show 1300ms cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes ft-burst-show {
      0%   { opacity: 0; transform: scale(0.6); }
      18%  { opacity: 1; transform: scale(1.08); }
      28%  { transform: scale(1.0); }
      78%  { opacity: 1; transform: scale(1.0); }
      100% { opacity: 0; transform: scale(0.9); }
    }
    .ft-mult-burst__badge {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 200px;
      height: 200px;
    }
    .ft-mult-burst__bolt {
      position: absolute;
      inset: 0;
      filter: drop-shadow(0 0 24px var(--cyan, #22d3ee))
              drop-shadow(0 0 48px rgba(34, 211, 238, 0.55));
    }
    .ft-mult-burst__value {
      position: relative;
      font: 800 76px/1 ui-monospace, Menlo, monospace;
      color: #fff;
      text-shadow:
        0 0 12px rgba(34, 211, 238, 0.95),
        0 0 32px rgba(34, 211, 238, 0.7),
        0 4px 14px rgba(0, 0, 0, 0.65);
      letter-spacing: -0.04em;
    }
    /* Higher tier multipliers (≥5) flip palette to rose for emphasis */
    .ft-mult-burst.is-hi .ft-mult-burst__bolt {
      filter: drop-shadow(0 0 24px var(--rose, #f43f5e))
              drop-shadow(0 0 48px rgba(244, 63, 94, 0.6));
    }
    .ft-mult-burst.is-hi .ft-mult-burst__value {
      text-shadow:
        0 0 12px rgba(244, 63, 94, 0.95),
        0 0 32px rgba(244, 63, 94, 0.7),
        0 4px 14px rgba(0, 0, 0, 0.65);
    }
  `;

  function buildStrip(distribution) {
    // Use values from IR.features.multiplier.distribution; fall back to a
    // generic 2/3/5/10 strip if missing (keeps runner usable for IRs that
    // declare the feature without populating the distribution).
    let values = (distribution || []).map(function (d) { return Number(d.value) || 1; });
    if (values.length === 0) values = [2, 3, 5, 10];
    // Duplicate the set so the seamless scroll has enough length.
    return values.concat([0]).concat(values).concat([0]); // 0 = MISS
  }

  function manifest(meta) {
    const irFeature = meta.irFeature;
    const host = meta.host;
    const bus = meta.bus;

    const root = document.createElement('div');
    root.className = 'ft-mult';
    root.setAttribute('data-state', 'idle');
    root.setAttribute('aria-label', 'Multiplier strip');

    const win = document.createElement('div');
    win.className = 'ft-mult__window';
    const strip = document.createElement('div');
    strip.className = 'ft-mult__strip';

    const items = buildStrip(irFeature.distribution);
    for (let i = 0; i < items.length; i++) {
      const v = items[i];
      const item = document.createElement('div');
      item.className = 'ft-mult__item' + (v === 0 ? ' ft-mult__item--miss' : (v >= 10 ? ' ft-mult__item--hi' : ''));
      item.setAttribute('data-mult', String(v));
      item.textContent = v === 0 ? '✕' : (v + '×');
      strip.appendChild(item);
    }
    win.appendChild(strip);

    const pl = document.createElement('div'); pl.className = 'ft-mult__pointer ft-mult__pointer--l';
    const pr = document.createElement('div'); pr.className = 'ft-mult__pointer ft-mult__pointer--r';
    win.appendChild(pl); win.appendChild(pr);
    root.appendChild(win);

    const label = document.createElement('div');
    label.className = 'ft-mult__label';
    label.textContent = 'MULTIPLIER';
    root.appendChild(label);

    host.appendChild(root);

    // ── Bolt burst overlay — full-frame multiplier reveal ───────────
    // Anchors to .reelFrame so the burst sits centered over the reels.
    // We build it once at mount and toggle a class on each lightning event.
    const burst = document.createElement('div');
    burst.className = 'ft-mult-burst';
    burst.setAttribute('aria-hidden', 'true');
    burst.innerHTML = [
      '<div class="ft-mult-burst__badge">',
      '  <svg class="ft-mult-burst__bolt" viewBox="0 0 100 200" aria-hidden="true">',
      '    <path d="M58 0 L18 110 L46 110 L36 200 L82 80 L52 80 Z" ',
      '          fill="rgba(34,211,238,0.18)" stroke="currentColor" stroke-width="2" />',
      '  </svg>',
      '  <div class="ft-mult-burst__value" data-burst-value>0×</div>',
      '</div>',
    ].join('');
    const frame = document.querySelector('.reelFrame');
    if (frame) {
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
      frame.appendChild(burst);
    } else {
      // Fallback: place it inside the host slot
      host.appendChild(burst);
    }
    const burstValue = burst.querySelector('[data-burst-value]');
    let burstTimer = null;

    const unsubSpin = bus.on('spin:start', function () {
      root.setAttribute('data-state', 'spin');
    });
    const unsubLight = bus.on('spin:lightning', function (p) {
      root.setAttribute('data-state', 'land');
      const value = (p && p.value) || 1;
      // Pulse the matching item briefly for visual feedback
      const match = strip.querySelector('.ft-mult__item[data-mult="' + value + '"]');
      if (match) {
        match.style.transition = 'transform 220ms ease, background 220ms ease';
        match.style.transform = 'scale(1.18)';
        match.style.background = 'rgba(245,158,11,0.22)';
        setTimeout(function () {
          match.style.transform = '';
          match.style.background = '';
        }, 380);
      }
      // Trigger giant bolt-burst overlay over the reels with the rolled
      // multiplier value.  The animation is ~1.3s; we cap concurrent
      // bursts by clearing any pending timer.
      if (value > 1 && burst) {
        if (burstValue) burstValue.textContent = value + '×';
        burst.classList.remove('is-active', 'is-hi');
        if (value >= 5) burst.classList.add('is-hi');
        // Force reflow so the animation restarts cleanly when bursts
        // fire back-to-back.
        void burst.offsetWidth;
        burst.classList.add('is-active');
        if (burstTimer) clearTimeout(burstTimer);
        burstTimer = setTimeout(function () {
          burst.classList.remove('is-active', 'is-hi');
        }, 1350);
      }
    });
    const unsubDone = bus.on('spin:render-done', function () {
      setTimeout(function () {
        if (root.getAttribute('data-state') !== 'idle') root.setAttribute('data-state', 'idle');
      }, 220);
    });

    return {
      refresh: function () { /* no-op for now */ },
      unmount: function () {
        unsubSpin && unsubSpin();
        unsubLight && unsubLight();
        unsubDone && unsubDone();
        if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
        if (root.parentNode)  root.parentNode.removeChild(root);
        if (burst.parentNode) burst.parentNode.removeChild(burst);
      },
    };
  }

  // Self-register two aliases so the registry can map either "multiplier"
  // kind to this single file.
  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({
      _fileKey: 'multiplier',
      kind: 'multiplier',
      styles: STYLES,
      mount: manifest,
    });
  }
})();
