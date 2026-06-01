/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: mystery_symbol
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Generic mystery-symbol reveal. Cells flagged as mystery (via runtime
 * payload or per-spin probability) display a "?" tile, then transition
 * to their actual symbol after a brief reveal animation. Pure visual.
 *
 * IR contract (optional):
 *   IR.features.mystery_symbol = { revealMs?: number, fillSymbol?: string }
 *
 * Events:
 *   spin:render-done  → identify mystery cells, paint "?" overlay,
 *                       reveal after revealMs (default 700ms)
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-myst {
      position: absolute; inset: 2px; pointer-events: none; z-index: 10;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at center, rgba(167,139,250,0.85), rgba(76,29,149,0.92));
      color: #fff;
      font: 900 32px ui-monospace, Menlo, monospace;
      border-radius: 8px;
      box-shadow: 0 0 18px rgba(167,139,250,0.7), inset 0 0 14px rgba(167,139,250,0.55);
      animation: ft-myst-spin 700ms ease-in forwards;
    }
    .ft-myst::after { content: '?'; text-shadow: 0 0 12px rgba(255,255,255,0.85); }
    @keyframes ft-myst-spin {
      0%   { transform: rotateY(0deg); opacity: 1; }
      90%  { transform: rotateY(540deg); opacity: 1; }
      100% { transform: rotateY(720deg); opacity: 0; }
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const bus = meta.bus;
    const revealMs = Math.max(200, Number(irFeature.revealMs) || 700);

    function placeMystery(reel, row) {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return;
      const cell = frame.querySelector('.cell[data-reel="' + reel + '"][data-row="' + row + '"]');
      if (!cell) return;
      if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
      const ov = document.createElement('div');
      ov.className = 'ft-myst';
      cell.appendChild(ov);
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, revealMs + 50);
    }

    const unsubDone = bus.on('spin:render-done', function (p) {
      const mysteryCells = (p && p.mysteryCells) || [];
      // Fallback: pick 1-2 random cells per spin to keep VFX alive when
      // the runtime doesn't annotate explicit mystery cells.
      if (mysteryCells.length === 0 && Math.random() < 0.35) {
        const reels = Number(document.documentElement.style.getPropertyValue('--reels') || 5) || 5;
        const rows = Number(document.documentElement.style.getPropertyValue('--rows') || 3) || 3;
        const r = Math.floor(Math.random() * reels);
        const y = Math.floor(Math.random() * rows);
        placeMystery(r, y);
        return;
      }
      for (const m of mysteryCells) placeMystery(m.reel, m.row);
    });

    return {
      refresh: function () {},
      unmount: function () { unsubDone && unsubDone(); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'mystery-symbol', kind: 'mystery_symbol', styles: STYLES, mount: manifest });
  }
})();
