/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: expanding_wild
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Full-reel wild expansion overlay. When a wild lands on a configured
 * reel (or any reel by default), the entire reel is painted with a
 * glowing WILD column for ~1.2s.
 *
 * IR contract (optional):
 *   IR.features.expanding_wild = { reels?: number[] }   // default: any reel
 *
 * Events:
 *   spin:render-done  → scan grid for wilds, expand matching reels
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-expw-col {
      position: absolute; top: 0; bottom: 0;
      pointer-events: none; z-index: 8;
      background: linear-gradient(180deg, rgba(244,63,94,0.0) 0%, rgba(244,63,94,0.55) 50%, rgba(244,63,94,0.0) 100%);
      box-shadow: 0 0 22px rgba(244,63,94,0.75), inset 0 0 18px rgba(244,63,94,0.6);
      border-left: 1px solid rgba(244,63,94,0.85);
      border-right: 1px solid rgba(244,63,94,0.85);
      opacity: 0;
      animation: ft-expw-flash 1400ms ease-out forwards;
    }
    .ft-expw-col__label {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font: 900 28px ui-monospace, Menlo, monospace; color: #fff;
      text-shadow: 0 0 14px rgba(244,63,94,0.95), 0 2px 6px rgba(0,0,0,0.7);
      letter-spacing: 0.04em;
    }
    @keyframes ft-expw-flash {
      0%   { opacity: 0; }
      20%  { opacity: 1; }
      75%  { opacity: 1; }
      100% { opacity: 0; }
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const bus = meta.bus;

    const enabledReels = Array.isArray(irFeature.reels) && irFeature.reels.length > 0
      ? irFeature.reels
      : null; // null = any reel

    const overlays = [];

    function cleanup() {
      while (overlays.length) {
        const el = overlays.pop();
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    }

    function expandReel(reelIdx) {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return;
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
      // Approximate reel column placement: use first cell of the reel
      const firstCell = frame.querySelector('.cell[data-reel="' + reelIdx + '"][data-row="0"], .reel:nth-child(' + (reelIdx + 1) + ')');
      if (!firstCell) return;
      const fr = frame.getBoundingClientRect();
      const cr = firstCell.getBoundingClientRect();
      const col = document.createElement('div');
      col.className = 'ft-expw-col';
      col.style.left = (cr.left - fr.left) + 'px';
      col.style.width = cr.width + 'px';
      col.innerHTML = '<div class="ft-expw-col__label">WILD</div>';
      frame.appendChild(col);
      overlays.push(col);
      setTimeout(function () {
        if (col.parentNode) col.parentNode.removeChild(col);
      }, 1450);
    }

    const unsubDone = bus.on('spin:render-done', function (p) {
      const wildReels = (p && p.wildReels) || [];
      if (wildReels.length === 0) return;
      cleanup();
      for (const r of wildReels) {
        if (enabledReels && enabledReels.indexOf(r) === -1) continue;
        expandReel(r);
      }
    });

    return {
      refresh: function () {},
      unmount: function () { unsubDone && unsubDone(); cleanup(); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'expanding-wild', kind: 'expanding_wild', styles: STYLES, mount: manifest });
  }
})();
