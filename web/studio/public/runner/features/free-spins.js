/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: free_spins  —  Free Spins HUD + optional multiplier ladder
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mounts a HUD strip above the reel frame that shows live FS state
 * (spins counter, current multiplier, accumulated win).  If the IR
 * declares a progressive multiplier with a `max`, ALSO mounts a
 * vertical ladder on the right side of the frame so the player sees
 * which step they are on and how far they can climb.
 *
 * Reads from `IR.features.free_spins`:
 *   trigger.thresholds      { "3": 14, "4": 16, "5": 18 }    spins per N scatters
 *   progressive_multiplier  { start, increment, max, increments_on } (optional)
 *   retrigger               { enabled, thresholds, max_total } (optional)
 *
 * Bus events consumed:
 *   fs:enter         { triggerScCount, awarded, mult, max }
 *   fs:spin          { index, total, win, mult }
 *   fs:retrigger     { added, total }
 *   fs:exit          { totalWin, totalAwarded, maxMult }
 *
 * No game-specific theming — colors driven by --mtl-accent / --gold.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const STYLES = `
    .ft-fs-hud {
      position: absolute;
      top: -28px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 6px 18px;
      background:
        linear-gradient(180deg, rgba(34,211,238,0.12), rgba(34,211,238,0.02)),
        linear-gradient(180deg, var(--bg-1, #0e131b), var(--bg-2, #161d28));
      border: 1px solid var(--cyan, #22d3ee);
      border-radius: 999px;
      box-shadow: 0 0 22px rgba(34,211,238,0.32), 0 4px 12px rgba(0,0,0,0.5);
      z-index: 4;
      animation: ft-fs-hud-in 360ms cubic-bezier(0.16, 1.2, 0.3, 1);
    }
    .ft-fs-hud[hidden] { display: none; }
    @keyframes ft-fs-hud-in {
      from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.92); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
    }
    .ft-fs-hud__block { display: flex; align-items: baseline; gap: 6px; }
    .ft-fs-hud__lbl {
      font-size: 9.5px;
      letter-spacing: 0.12em;
      color: var(--text-3, #5a626f);
      font-family: ui-monospace, Menlo, monospace;
    }
    .ft-fs-hud__block b {
      font-size: 15px;
      color: var(--cyan, #22d3ee);
      font-family: ui-monospace, Menlo, monospace;
      text-shadow: 0 0 8px rgba(34,211,238,0.32);
    }
    .ft-fs-hud__div {
      width: 1px;
      height: 18px;
      background: rgba(34,211,238,0.3);
    }

    /* Vertical multiplier ladder (right rail) */
    .ft-fs-ladder {
      position: absolute;
      top: 50%;
      right: -56px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 8px;
      background: linear-gradient(180deg, var(--bg-1, #0e131b), var(--bg-2, #161d28));
      border: 1px solid var(--cyan-deep, #0891b2);
      border-radius: 8px;
      box-shadow: 0 0 18px rgba(34,211,238,0.22);
      z-index: 4;
      animation: ft-fs-ladder-in 480ms cubic-bezier(0.16, 1.2, 0.3, 1);
    }
    .ft-fs-ladder[hidden] { display: none; }
    @keyframes ft-fs-ladder-in {
      from { opacity: 0; transform: translateY(-50%) translateX(12px); }
      to   { opacity: 1; transform: translateY(-50%) translateX(0);    }
    }
    .ft-fs-step {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 22px;
      background: var(--bg-3, #212a37);
      border: 1px solid var(--line, #313d4f);
      border-radius: 5px;
      color: var(--text-3, #5a626f);
      font-family: ui-monospace, Menlo, monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: -0.02em;
      transition: background 220ms, color 220ms, border-color 220ms,
                  box-shadow 220ms, transform 220ms;
    }
    .ft-fs-step.is-lit {
      background: linear-gradient(180deg, var(--cyan, #22d3ee), var(--cyan-deep, #0891b2));
      color: #001017;
      border-color: var(--cyan, #22d3ee);
      box-shadow: 0 0 14px rgba(34,211,238,0.32);
    }
    .ft-fs-step.is-current {
      background: linear-gradient(180deg, #fff, var(--cyan, #22d3ee));
      color: #001017;
      border-color: #fff;
      box-shadow: 0 0 22px rgba(255,255,255,0.7),
                  0 0 32px rgba(34,211,238,0.32);
      transform: scale(1.08);
      animation: ft-fs-step-pulse 720ms ease-in-out infinite alternate;
    }
    @keyframes ft-fs-step-pulse {
      from { transform: scale(1.05); }
      to   { transform: scale(1.14); }
    }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature;
    const bus = meta.bus;

    // The HUD prefers to anchor to .reelFrame so it floats above the reels;
    // when running in test / Studio contexts where the reel frame isn't
    // rendered, fall back to the slot host so the component still mounts
    // its DOM (positioning may be off but functional behavior is preserved).
    const frame = document.querySelector('.reelFrame') || meta.host;
    if (!frame) {
      console.warn('[free-spins] no anchor (no .reelFrame, no host slot) — HUD will not mount');
      return { unmount: function () {} };
    }
    if (getComputedStyle(frame).position === 'static') {
      frame.style.position = 'relative';
    }

    // Build HUD
    const hud = document.createElement('div');
    hud.className = 'ft-fs-hud';
    hud.setAttribute('hidden', '');
    hud.innerHTML = [
      '<div class="ft-fs-hud__block">',
      '  <span class="ft-fs-hud__lbl">FS</span>',
      '  <b data-fs-counter>0 / 0</b>',
      '</div>',
      '<div class="ft-fs-hud__div"></div>',
      '<div class="ft-fs-hud__block">',
      '  <span class="ft-fs-hud__lbl">MULT</span>',
      '  <b data-fs-mult>1×</b>',
      '</div>',
      '<div class="ft-fs-hud__div"></div>',
      '<div class="ft-fs-hud__block">',
      '  <span class="ft-fs-hud__lbl">WIN</span>',
      '  <b data-fs-win>0.00</b>',
      '</div>',
    ].join('\n');
    frame.appendChild(hud);

    // Build ladder if IR declares a progressive multiplier with a max ≥ 2
    let ladder = null;
    const pm = irFeature.progressive_multiplier;
    if (pm && Number(pm.max) >= 2) {
      const maxMult = Math.max(2, Math.min(20, Math.floor(pm.max)));
      ladder = document.createElement('div');
      ladder.className = 'ft-fs-ladder';
      ladder.setAttribute('hidden', '');
      let rungs = '';
      for (let m = maxMult; m >= 1; m--) {
        rungs += '<div class="ft-fs-step" data-mult="' + m + '">' + m + '×</div>';
      }
      ladder.innerHTML = rungs;
      frame.appendChild(ladder);
    }

    function fmt(n) { return (Number(n) || 0).toFixed(2); }

    function setLadder(mult) {
      if (!ladder) return;
      const steps = ladder.querySelectorAll('.ft-fs-step');
      for (let i = 0; i < steps.length; i++) {
        const m = Number(steps[i].dataset.mult);
        steps[i].classList.toggle('is-lit',     m <= mult);
        steps[i].classList.toggle('is-current', m === mult);
      }
    }

    function update({ done, total, mult, winTotal }) {
      const counter = hud.querySelector('[data-fs-counter]');
      const multEl  = hud.querySelector('[data-fs-mult]');
      const winEl   = hud.querySelector('[data-fs-win]');
      if (counter) counter.textContent = (done || 0) + ' / ' + (total || 0);
      if (multEl)  multEl.textContent  = (mult || 1) + '×';
      if (winEl)   winEl.textContent   = fmt(winTotal);
      setLadder(mult || 1);
    }

    // ── Bus wiring ────────────────────────────────────────────────────
    const offs = [];
    offs.push(bus.on('fs:enter', function (p) {
      hud.removeAttribute('hidden');
      if (ladder) ladder.removeAttribute('hidden');
      update({ done: 0, total: (p && p.awarded) || 0, mult: (p && p.mult) || 1, winTotal: 0 });
    }));
    offs.push(bus.on('fs:spin', function (p) {
      update({
        done:     (p && p.index) || 0,
        total:    (p && p.total) || 0,
        mult:     (p && p.mult) || 1,
        winTotal: (p && p.winTotal) || 0,
      });
    }));
    offs.push(bus.on('fs:retrigger', function (p) {
      // bump the total counter on retrigger; mult preserved
      const counter = hud.querySelector('[data-fs-counter]');
      if (counter && p && typeof p.total === 'number') {
        const parts = counter.textContent.split(/\s*\/\s*/);
        const done = parts[0] || '0';
        counter.textContent = done + ' / ' + p.total;
      }
    }));
    offs.push(bus.on('fs:exit', function () {
      hud.setAttribute('hidden', '');
      if (ladder) ladder.setAttribute('hidden', '');
    }));

    return {
      refresh: function () {},
      unmount: function () {
        for (let i = 0; i < offs.length; i++) try { offs[i](); } catch (_) {}
        if (hud.parentNode)    hud.parentNode.removeChild(hud);
        if (ladder && ladder.parentNode) ladder.parentNode.removeChild(ladder);
      },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({
      _fileKey: 'free-spins',
      kind: 'free_spins',
      styles: STYLES,
      mount: manifest,
    });
  }
})();
