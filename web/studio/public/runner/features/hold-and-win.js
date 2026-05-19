/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: hold_and_win  —  locked-orb board + jackpot tier badges
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mounts NO HUD chrome of its own — the H&W board is the grid itself,
 * with cells flipping into locked-orb appearance via CSS classes
 * `is-hnw-locked` / `is-hnw-jp`.  This module owns:
 *
 *   • Per-cell tier badge (MINI / MINOR / MAJOR / GRAND or jp.name)
 *   • Pop-in animation on freshly-locked orbs (.is-orb-land)
 *   • Optional FULL GRID overlay flash on completion
 *
 * Reads from `IR.features.hold_and_win`:
 *   trigger.min                     — minimum bonus orbs to enter feature
 *   respins_initial                 — respins granted on enter
 *   respin_reset_on_new             — bool: any new orb refills respin counter
 *   orb_land_chance_base / _fill_bonus  — per-respin landing probability math
 *   cash_value_distribution[]       — { value, weight } for cash orbs
 *   jackpot_tiers[]                 — { multiplier, weight, name? } per tier
 *   full_grid_bonus_x               — extra bet-multiplier if every cell fills
 *
 * Bus events consumed:
 *   hnw:enter       { initialOrbs, respins, totalCells }
 *   hnw:respin      { filled, totalCells, respinsLeft, cumulativeWin }
 *   hnw:orb-landed  { cell, value, jpName? }
 *   hnw:full-grid   { bonus }
 *   hnw:exit        { totalWin, filled, totalCells }
 *
 * Bus events emitted:  (none — purely visual)
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const STYLES = `
    /* Locked-orb cell — uses base palette so it looks coherent with the
       rest of the runner.  Overridable per-skin. */
    .cell.is-hnw-locked {
      background: linear-gradient(135deg, #4c1d95, #c026d3);
      border: 2px solid var(--cyan, #22d3ee);
      box-shadow: 0 0 0 2px var(--cyan, #22d3ee),
                  0 0 24px rgba(34,211,238,0.32);
    }
    .cell.is-hnw-locked .cell-id { color: #fff; font-size: 14px; }

    /* Jackpot cell — heavier glow + white frame */
    .cell.is-hnw-jp {
      background: linear-gradient(135deg, #6d28d9, #c4b5fd);
      border: 2px solid #fff;
      box-shadow: 0 0 0 2px #fff,
                  0 0 32px rgba(196,181,253,0.65);
      animation: ft-hnw-jp-flash 540ms ease-in-out infinite alternate;
    }
    .cell.is-hnw-jp .cell-id {
      color: #fff;
      font-size: 12px;
      font-weight: 800;
    }
    @keyframes ft-hnw-jp-flash {
      from { filter: brightness(1.0); }
      to   { filter: brightness(1.4); }
    }

    /* Tier badge top-right corner of each locked cell */
    .cell.is-hnw-locked .hnw-cell-tier,
    .cell.is-hnw-jp     .hnw-cell-tier {
      position: absolute;
      top: 4px;
      right: 6px;
      font-size: 8px;
      letter-spacing: 0.10em;
      font-family: ui-monospace, Menlo, monospace;
      text-transform: uppercase;
      color: rgba(255,255,255,0.78);
    }
    .cell.is-hnw-jp .hnw-cell-tier {
      font-size: 9px;
      font-weight: 800;
      color: #fff;
      text-shadow: 0 0 6px rgba(0,0,0,0.6);
    }

    /* Pop-in on fresh-landed orbs */
    .cell.is-orb-land {
      animation: ft-hnw-orb-land 480ms cubic-bezier(.34, 1.56, .4, 1) forwards;
    }
    @keyframes ft-hnw-orb-land {
      0%   { transform: scale(0.4); opacity: 0; }
      60%  { transform: scale(1.18); opacity: 1; }
      100% { transform: scale(1.0);  opacity: 1; }
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature;
    const bus = meta.bus;

    // Track which cells we have already shown — so the .is-orb-land
    // pop animation fires ONLY on the cells that just became locked
    // in the latest render cycle, not on already-locked ones.
    const seen = new Set();

    // Pull the runtime's IR-derived `state.hnwLockedCells` map at every
    // hnw:respin / hnw:enter / hnw:orb-landed so we render the current board.
    function renderBoard(lockedMap) {
      const grid = document.getElementById('reels-grid');
      if (!grid) return;
      const cells = grid.querySelectorAll('.cell[data-r]');
      cells.forEach(function (cell) {
        const r = cell.getAttribute('data-r');
        const y = cell.getAttribute('data-y');
        const key = r + ':' + y;
        const locked = lockedMap && lockedMap.get ? lockedMap.get(key) : null;
        if (locked) {
          const isNew = !seen.has(key);
          seen.add(key);
          const base = locked.isJp ? 'is-hnw-jp' : 'is-hnw-locked';
          cell.className = 'cell ' + base + (isNew ? ' is-orb-land' : '');
          const label = locked.isJp
            ? (locked.jpName || 'JP')
            : 'CASH';
          const value = locked.value;
          cell.innerHTML =
            '<span class="hnw-cell-tier">' + label + '</span>' +
            '<span class="cell-id">' + value + '×</span>';
        }
        // Cells NOT in lockedMap retain whatever the base renderer painted
        // (spin glyphs or empty placeholder).  We deliberately do NOT
        // overwrite them here so the H&W board can coexist with reel
        // animations between respins.
      });
    }

    const offs = [];
    offs.push(bus.on('hnw:enter', function (p) {
      seen.clear();
      // The runtime sets state.hnwLockedCells as a Map; resolve via window.__SLOT__
      const slot = window.__SLOT__ || {};
      const lockedMap = (slot.state && slot.state.hnwLockedCells) || null;
      if (lockedMap) renderBoard(lockedMap);
    }));
    offs.push(bus.on('hnw:respin', function () {
      const slot = window.__SLOT__ || {};
      const lockedMap = (slot.state && slot.state.hnwLockedCells) || null;
      if (lockedMap) renderBoard(lockedMap);
    }));
    offs.push(bus.on('hnw:orb-landed', function () {
      const slot = window.__SLOT__ || {};
      const lockedMap = (slot.state && slot.state.hnwLockedCells) || null;
      if (lockedMap) renderBoard(lockedMap);
    }));
    offs.push(bus.on('hnw:exit', function () {
      seen.clear();
    }));

    return {
      refresh: function () {
        const slot = window.__SLOT__ || {};
        const lockedMap = (slot.state && slot.state.hnwLockedCells) || null;
        if (lockedMap) renderBoard(lockedMap);
      },
      unmount: function () {
        for (let i = 0; i < offs.length; i++) try { offs[i](); } catch (_) {}
      },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({
      _fileKey: 'hold-and-win',
      kind: 'hold_and_win',
      styles: STYLES,
      mount: manifest,
    });
    // Alias used by some suppliers
    window.MTLFeatures.register({
      _fileKey: 'hold-and-win',
      kind: 'link_and_win',
      styles: '',
      mount: manifest,
    });
  }
})();
