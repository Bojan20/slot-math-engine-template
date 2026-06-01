/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: ways
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ways-pays renderer. Shows a ways-count badge ("117,649 WAYS") in the
 * HUD and highlights left-to-right matching cells without drawing
 * paylines. The runtime computes wins (no payline shape) and emits
 * `spin:eval` with `waysWon: number` and optional `waysCells: [{reel,row}].
 *
 * IR contract (informational):
 *   IR.evaluation.kind === 'ways'
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-ways {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 12px;
      background: rgba(15,23,42,0.78);
      border: 1px solid rgba(34,211,238,0.55);
      border-radius: 10px;
      box-shadow: 0 0 14px rgba(34,211,238,0.25);
    }
    .ft-ways__lbl {
      font: 700 10px ui-monospace, Menlo, monospace;
      letter-spacing: 0.16em;
      color: #67e8f9;
      text-transform: uppercase;
    }
    .ft-ways__val {
      font: 800 16px ui-monospace, Menlo, monospace;
      color: var(--gold, #fde68a);
      text-shadow: 0 0 8px rgba(253,224,71,0.65);
    }
    .ft-ways-highlight {
      position: absolute; inset: 2px; pointer-events: none;
      border: 2px solid rgba(34,211,238,0.85);
      border-radius: 6px;
      box-shadow: 0 0 12px rgba(34,211,238,0.7);
      animation: ft-ways-pulse 900ms ease-out forwards;
    }
    @keyframes ft-ways-pulse {
      0%   { opacity: 0; transform: scale(1.18); }
      35%  { opacity: 1; transform: scale(1.0); }
      80%  { opacity: 1; transform: scale(1.0); }
      100% { opacity: 0; transform: scale(0.95); }
    }
  `;

  function computeWaysProduct() {
    const reels = Number(document.documentElement.style.getPropertyValue('--reels') || 5) || 5;
    const rows = Number(document.documentElement.style.getPropertyValue('--rows') || 3) || 3;
    let n = 1; for (let i = 0; i < reels; i++) n *= rows;
    return n;
  }

  function manifest(meta) {
    const host = meta.host;
    const bus = meta.bus;

    const root = document.createElement('div');
    root.className = 'ft-ways';
    root.innerHTML = '<div class="ft-ways__lbl">WAYS</div><div class="ft-ways__val" data-ways>' + computeWaysProduct().toLocaleString() + '</div>';
    host.appendChild(root);
    const valEl = root.querySelector('[data-ways]');

    function applyHighlights(cells) {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return;
      frame.querySelectorAll('.ft-ways-highlight').forEach(function (el) { el.parentNode.removeChild(el); });
      for (const c of cells) {
        const cell = frame.querySelector('.cell[data-reel="' + c.reel + '"][data-row="' + c.row + '"]');
        if (!cell) continue;
        if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
        const hl = document.createElement('div');
        hl.className = 'ft-ways-highlight';
        cell.appendChild(hl);
        setTimeout(function () { if (hl.parentNode) hl.parentNode.removeChild(hl); }, 950);
      }
    }

    const unsubEval = bus.on('spin:eval', function (p) {
      const ways = (p && typeof p.waysWon === 'number') ? p.waysWon : null;
      if (ways !== null && valEl) valEl.textContent = ways.toLocaleString();
      const cells = (p && p.waysCells) || [];
      if (cells.length) applyHighlights(cells);
    });
    const unsubDone = bus.on('spin:render-done', function () {
      if (valEl) valEl.textContent = computeWaysProduct().toLocaleString();
    });

    return {
      refresh: function () {},
      unmount: function () { unsubEval && unsubEval(); unsubDone && unsubDone(); if (root.parentNode) root.parentNode.removeChild(root); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'ways', kind: 'ways', styles: STYLES, mount: manifest });
  }
})();
