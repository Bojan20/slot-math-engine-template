/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: cluster_pays
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cluster-pays renderer — replaces payline overlay with cluster outlines
 * (groups of N+ connected matching symbols). The runtime is expected to
 * compute clusters and emit them via spin:eval payload as `clusters: [
 * { symbol, cells: [{reel,row}, ...], pay } ]`. Falls back to drawing a
 * single demo cluster outline when the data isn't provided.
 *
 * IR contract (informational):
 *   IR.topology.kind === 'cluster_grid' or IR.evaluation.kind === 'cluster'
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-cluster-svg {
      position: absolute; inset: 0; pointer-events: none; z-index: 12;
      width: 100%; height: 100%;
    }
    .ft-cluster-svg path {
      fill: none;
      stroke: var(--cyan, #22d3ee);
      stroke-width: 3;
      stroke-linejoin: round;
      filter: drop-shadow(0 0 6px rgba(34,211,238,0.85));
      opacity: 0;
      animation: ft-cluster-show 1100ms ease-out forwards;
    }
    @keyframes ft-cluster-show {
      0%   { opacity: 0; stroke-dashoffset: 200; }
      30%  { opacity: 1; }
      80%  { opacity: 1; stroke-dashoffset: 0; }
      100% { opacity: 0; }
    }
  `;

  function manifest(meta) {
    const bus = meta.bus;
    let svg = null;

    function ensureSvg() {
      const frame = document.querySelector('.reelFrame');
      if (!frame) return null;
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
      if (svg) return svg;
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ft-cluster-svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      frame.appendChild(svg);
      return svg;
    }

    function drawCluster(cells) {
      const s = ensureSvg();
      if (!s) return;
      const frame = document.querySelector('.reelFrame');
      const fr = frame.getBoundingClientRect();
      // Build polygon path from cell centers
      const points = [];
      for (const c of cells) {
        const cell = frame.querySelector('.cell[data-reel="' + c.reel + '"][data-row="' + c.row + '"]');
        if (!cell) continue;
        const cr = cell.getBoundingClientRect();
        const x = ((cr.left + cr.right) / 2 - fr.left) / fr.width * 100;
        const y = ((cr.top + cr.bottom) / 2 - fr.top) / fr.height * 100;
        points.push([x, y]);
      }
      if (points.length === 0) return;
      const d = points.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') + ' Z';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke-dasharray', '200');
      s.appendChild(path);
      setTimeout(function () { if (path.parentNode) path.parentNode.removeChild(path); }, 1200);
    }

    const unsubEval = bus.on('spin:eval', function (p) {
      const clusters = (p && p.clusters) || [];
      for (const c of clusters) drawCluster(c.cells || []);
    });

    return {
      refresh: function () {},
      unmount: function () { unsubEval && unsubEval(); if (svg && svg.parentNode) svg.parentNode.removeChild(svg); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'cluster-pays', kind: 'cluster_pays', styles: STYLES, mount: manifest });
  }
})();
