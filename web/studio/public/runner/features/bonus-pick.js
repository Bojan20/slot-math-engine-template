/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: bonus_pick / wheel_bonus
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Generic pick-N-of-M or wheel-of-fortune bonus. When a 'bonus:start'
 * event fires (or when 3+ bonus symbols land per default), shows a
 * full-stage overlay with a grid of cards. Player picks one or more;
 * each pick reveals a prize from IR.features.bonus_pick.prizes.
 *
 * IR contract (optional):
 *   IR.features.bonus_pick = {
 *     picksAllowed?: number,
 *     prizes: [{ value: number, weight: number, isTerminator?: boolean }, ...]
 *   }
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-pick-overlay {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at center, rgba(2,6,23,0.85), rgba(0,0,0,0.95));
      z-index: 50;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 24px;
      opacity: 0; pointer-events: none;
      transition: opacity 320ms ease;
    }
    .ft-pick-overlay.is-active { opacity: 1; pointer-events: auto; }
    .ft-pick-overlay__title {
      font: 800 22px ui-monospace, Menlo, monospace;
      color: var(--gold, #fde68a);
      letter-spacing: 0.12em;
      text-shadow: 0 0 18px rgba(253,224,71,0.85);
    }
    .ft-pick-grid {
      display: grid; grid-template-columns: repeat(4, 86px); gap: 14px;
    }
    .ft-pick-card {
      width: 86px; height: 110px;
      background: linear-gradient(180deg, #1e293b, #0f172a);
      border: 1px solid rgba(148,163,184,0.4);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font: 700 24px ui-monospace, Menlo, monospace;
      color: var(--gold, #fde68a);
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.35);
      transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    }
    .ft-pick-card:hover { transform: translateY(-3px); border-color: var(--gold, #fde68a); box-shadow: 0 10px 22px rgba(253,224,71,0.4); }
    .ft-pick-card.is-revealed { cursor: default; transform: none; background: linear-gradient(180deg, #fde68a, #ca8a04); color: #1a1a3e; }
    .ft-pick-card.is-revealed.is-terminator { background: linear-gradient(180deg, #f43f5e, #be123c); color: #fff; }
    .ft-pick-total { font: 700 16px ui-monospace, Menlo, monospace; color: #f8fafc; letter-spacing: 0.08em; }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const host = meta.host;
    const bus = meta.bus;
    const picksAllowed = Math.max(1, Number(irFeature.picksAllowed) || 3);
    const prizes = (Array.isArray(irFeature.prizes) && irFeature.prizes.length > 0)
      ? irFeature.prizes
      : [{ value: 5, weight: 4 }, { value: 10, weight: 3 }, { value: 25, weight: 2 }, { value: 100, weight: 1, isTerminator: true }];

    function weightedPick() {
      const total = prizes.reduce(function (a, b) { return a + (Number(b.weight) || 1); }, 0);
      let r = Math.random() * total;
      for (const p of prizes) {
        r -= (Number(p.weight) || 1);
        if (r <= 0) return p;
      }
      return prizes[prizes.length - 1];
    }

    function open() {
      const frame = document.querySelector('.reelFrame') || host;
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
      const overlay = document.createElement('div');
      overlay.className = 'ft-pick-overlay';
      overlay.innerHTML = '<div class="ft-pick-overlay__title">PICK YOUR PRIZE</div>';
      const grid = document.createElement('div');
      grid.className = 'ft-pick-grid';
      const totalEl = document.createElement('div');
      totalEl.className = 'ft-pick-total';
      totalEl.textContent = 'Picks left: ' + picksAllowed + ' · Total 0';
      let picksUsed = 0;
      let total = 0;
      for (let i = 0; i < 12; i++) {
        const card = document.createElement('div');
        card.className = 'ft-pick-card';
        card.textContent = '?';
        card.addEventListener('click', function () {
          if (card.classList.contains('is-revealed') || picksUsed >= picksAllowed) return;
          const prize = weightedPick();
          card.classList.add('is-revealed');
          if (prize.isTerminator) card.classList.add('is-terminator');
          card.textContent = prize.isTerminator ? 'END' : (prize.value + '×');
          if (!prize.isTerminator) total += Number(prize.value) || 0;
          picksUsed += 1;
          totalEl.textContent = 'Picks left: ' + Math.max(0, picksAllowed - picksUsed) + ' · Total ' + total + '×';
          if (prize.isTerminator || picksUsed >= picksAllowed) {
            setTimeout(close, 1300);
            bus.emit('bonus:complete', { prizeTotal: total });
          }
        });
        grid.appendChild(card);
      }
      overlay.appendChild(grid);
      overlay.appendChild(totalEl);
      frame.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('is-active'); });
      function close() {
        overlay.classList.remove('is-active');
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 380);
      }
    }

    const unsubBonus = bus.on('bonus:start', open);
    const unsubFs = bus.on('fs:enter', function (p) {
      // Some IRs use bonus_pick as the FS entry mini-game; ignore if scope says base only
      if (irFeature.scope && irFeature.scope !== 'fs_entry') return;
      open();
    });

    return {
      refresh: function () {},
      unmount: function () { unsubBonus && unsubBonus(); unsubFs && unsubFs(); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'bonus-pick', kind: 'bonus_pick', styles: STYLES, mount: manifest });
    window.MTLFeatures.register({ _fileKey: 'bonus-pick', kind: 'wheel_bonus', styles: STYLES, mount: manifest });
  }
})();
