/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: cascade  —  Tumble / Avalanche / Drop Refill
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Generic cascade-on-win visualization. Listens for spin:eval, and when
 * the result has wins, plays a multi-step fade-out + drop animation by
 * pulsing winning cells then sliding them out. Pure visual layer — the
 * actual cascade math is handled by oracle.js / runtime.js if the IR
 * declares evaluation.kind = 'cascade'. This component just decorates.
 *
 * IR contract (optional):
 *   IR.features.cascade = { max_chain?: number, vfx_ms?: number }
 *
 * Events:
 *   spin:eval         → if there are wins, plays cascade FX
 *   spin:render-done  → cleanup overlay
 *
 * Phase 52 baseline: profesionalna animacija + chain badge counter.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-cascade-overlay {
      position: absolute; inset: 0;
      pointer-events: none; z-index: 11;
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 12px;
    }
    .ft-cascade-badge {
      background: linear-gradient(180deg, rgba(15,23,42,0.92), rgba(7,12,24,0.92));
      border: 1px solid var(--cyan, #22d3ee);
      color: #fff;
      font: 700 13px ui-monospace, Menlo, monospace;
      letter-spacing: 0.08em;
      padding: 6px 14px;
      border-radius: 999px;
      box-shadow: 0 0 22px rgba(34,211,238,0.45);
      opacity: 0; transform: translateY(-8px);
      transition: opacity 200ms ease, transform 200ms ease;
    }
    .ft-cascade-overlay.is-active .ft-cascade-badge { opacity: 1; transform: translateY(0); }
    .ft-cascade-cell-pulse {
      animation: ft-cascade-pulse 480ms ease-out forwards;
    }
    @keyframes ft-cascade-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(34,211,238,0.0); transform: scale(1.0); }
      40%  { box-shadow: 0 0 28px 4px rgba(34,211,238,0.85); transform: scale(1.06); }
      100% { box-shadow: 0 0 0 0 rgba(34,211,238,0.0); transform: scale(1.0); opacity: 0.25; }
    }
  `;

  function manifest(meta) {
    const host = meta.host;
    const bus = meta.bus;

    const overlay = document.createElement('div');
    overlay.className = 'ft-cascade-overlay';
    overlay.innerHTML = '<div class="ft-cascade-badge">CASCADE × <span data-chain>1</span></div>';
    const frame = document.querySelector('.reelFrame') || host;
    if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
    frame.appendChild(overlay);
    const chainEl = overlay.querySelector('[data-chain]');

    let chain = 0;

    const unsubEval = bus.on('spin:eval', function (p) {
      const wins = (p && p.wins) || (p && p.totalWin > 0 ? 1 : 0);
      if (!wins) return;
      chain += 1;
      if (chainEl) chainEl.textContent = String(chain);
      overlay.classList.add('is-active');
      // Pulse all winning cells if the runtime annotated them.
      const grid = document.querySelector('.reelFrame');
      if (grid) {
        const cells = grid.querySelectorAll('.cell.is-win, .symbol.is-win');
        cells.forEach(function (c) {
          c.classList.remove('ft-cascade-cell-pulse');
          void c.offsetWidth;
          c.classList.add('ft-cascade-cell-pulse');
        });
      }
    });
    const unsubDone = bus.on('spin:render-done', function () {
      setTimeout(function () {
        overlay.classList.remove('is-active');
        chain = 0;
      }, 700);
    });

    return {
      refresh: function () {},
      unmount: function () {
        unsubEval && unsubEval();
        unsubDone && unsubDone();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'cascade', kind: 'cascade', styles: STYLES, mount: manifest });
    window.MTLFeatures.register({ _fileKey: 'cascade', kind: 'tumble', styles: STYLES, mount: manifest });
  }
})();
