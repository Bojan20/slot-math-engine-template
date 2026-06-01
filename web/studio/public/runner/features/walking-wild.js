/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: walking_wild
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Walking wild "moves one reel left/right each spin". Renders a moving
 * neon ghost outline that drifts across the grid for visual indication.
 * Pure decorative — actual reel mutation is handled by the runtime when
 * an IR declares walking-wild in feature math.
 *
 * IR contract (optional):
 *   IR.features.walking_wild = { direction?: 'left'|'right', steps?: number }
 *
 * Events:
 *   spin:render-done  → step ghost one column in `direction`
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-walk-ghost {
      position: absolute; top: 0; bottom: 0;
      width: 80px;
      pointer-events: none; z-index: 9;
      background: linear-gradient(180deg, rgba(132,204,22,0.0), rgba(132,204,22,0.45), rgba(132,204,22,0.0));
      box-shadow: 0 0 22px rgba(132,204,22,0.7), inset 0 0 16px rgba(132,204,22,0.5);
      border-left: 1px solid rgba(132,204,22,0.7);
      border-right: 1px solid rgba(132,204,22,0.7);
      transition: left 380ms cubic-bezier(.16,1,.3,1);
    }
    .ft-walk-ghost__lbl {
      position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
      font: 800 12px ui-monospace, Menlo, monospace; color: #fff;
      letter-spacing: 0.12em; text-shadow: 0 0 6px rgba(132,204,22,0.9);
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const bus = meta.bus;

    const dir = irFeature.direction === 'right' ? 1 : -1;
    let col = -1; // -1 = not yet placed
    let ghost = null;

    function ensureGhost() {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return null;
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
      if (ghost) return ghost;
      ghost = document.createElement('div');
      ghost.className = 'ft-walk-ghost';
      ghost.innerHTML = '<div class="ft-walk-ghost__lbl">WILD</div>';
      ghost.style.opacity = '0';
      frame.appendChild(ghost);
      return ghost;
    }

    function positionAt(reelIdx) {
      const frame = document.querySelector('.reelFrame');
      if (!frame || !ghost) return;
      const fr = frame.getBoundingClientRect();
      const cell = frame.querySelector('.cell[data-reel="' + reelIdx + '"][data-row="0"], .reel:nth-child(' + (reelIdx + 1) + ')');
      if (!cell) return;
      const cr = cell.getBoundingClientRect();
      ghost.style.left = (cr.left - fr.left) + 'px';
      ghost.style.width = cr.width + 'px';
      ghost.style.opacity = '1';
    }

    const unsubDone = bus.on('spin:render-done', function () {
      ensureGhost();
      if (!ghost) return;
      const reelCount = Number(document.documentElement.style.getPropertyValue('--reels') || 5) || 5;
      if (col === -1) col = (dir === 1) ? 0 : (reelCount - 1);
      else col = col + dir;
      if (col < 0 || col >= reelCount) {
        ghost.style.opacity = '0';
        col = -1;
        return;
      }
      positionAt(col);
    });

    return {
      refresh: function () {},
      unmount: function () { unsubDone && unsubDone(); if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'walking-wild', kind: 'walking_wild', styles: STYLES, mount: manifest });
  }
})();
