/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: sticky_wild
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sticky wild visualization. When a wild lands and (per IR) is flagged
 * as sticky, a glowing lock badge appears on its cell and persists
 * across the next N respins (default 1). Decorative — the runtime
 * decides which symbols are actually held.
 *
 * IR contract (optional):
 *   IR.features.sticky_wild = { lockSpins?: number, scope?: 'base'|'fs'|'both' }
 *
 * Events:
 *   spin:render-done  → mark wilds as sticky and tag cells
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-stickyw {
      position: absolute; inset: 4px; pointer-events: none; z-index: 9;
      border: 2px solid rgba(253,224,71,0.95);
      border-radius: 8px;
      box-shadow: 0 0 18px rgba(253,224,71,0.65), inset 0 0 12px rgba(253,224,71,0.35);
      animation: ft-stickyw-pulse 1400ms ease-in-out infinite;
    }
    .ft-stickyw::after {
      content: '🔒';
      position: absolute; top: 2px; right: 4px;
      font-size: 14px;
      filter: drop-shadow(0 0 4px rgba(253,224,71,0.95));
    }
    @keyframes ft-stickyw-pulse {
      0%,100% { box-shadow: 0 0 12px rgba(253,224,71,0.55), inset 0 0 8px rgba(253,224,71,0.3); }
      50%     { box-shadow: 0 0 24px rgba(253,224,71,0.95), inset 0 0 16px rgba(253,224,71,0.55); }
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const bus = meta.bus;
    const lockSpins = Math.max(1, Number(irFeature.lockSpins) || 2);
    const sticky = []; // [{reel, row, remaining}]

    function applyOverlays() {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return;
      // Remove old
      frame.querySelectorAll('.ft-stickyw').forEach(function (el) { el.parentNode.removeChild(el); });
      // Add for current sticky list
      for (const s of sticky) {
        const cell = frame.querySelector('.cell[data-reel="' + s.reel + '"][data-row="' + s.row + '"]');
        if (!cell) continue;
        if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
        const ov = document.createElement('div');
        ov.className = 'ft-stickyw';
        cell.appendChild(ov);
      }
    }

    const unsubDone = bus.on('spin:render-done', function (p) {
      // Decrement existing sticky timers
      for (let i = sticky.length - 1; i >= 0; i--) {
        sticky[i].remaining -= 1;
        if (sticky[i].remaining <= 0) sticky.splice(i, 1);
      }
      // Add new wilds
      const wildCells = (p && p.wildCells) || [];
      for (const w of wildCells) {
        if (!sticky.find(function (s) { return s.reel === w.reel && s.row === w.row; })) {
          sticky.push({ reel: w.reel, row: w.row, remaining: lockSpins });
        }
      }
      applyOverlays();
    });

    return {
      refresh: function () {},
      unmount: function () {
        unsubDone && unsubDone();
        const frame = document.querySelector('.reelFrame');
        if (frame) frame.querySelectorAll('.ft-stickyw').forEach(function (el) { el.parentNode.removeChild(el); });
      },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'sticky-wild', kind: 'sticky_wild', styles: STYLES, mount: manifest });
  }
})();
