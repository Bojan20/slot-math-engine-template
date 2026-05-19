/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: power_meter / accumulator  —  Generic Power Meter widget
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Renders a horizontal track + fill bar that accumulates over time.  The
 * filling source depends on `IR.features.{power_meter|accumulator}.source`:
 *
 *   source: 'base_win_x'      Fill = clamp(0..100, win/bet * 100 * gain)
 *   source: 'spin_count'      Fill increments by 100/N per spin
 *   source: 'manual'          Fill set by IR (no auto-fill)
 *
 * Tier labels are configurable via IR.features.*.tiers, e.g.
 *   tiers: [{ at: 0, label: 'IDLE' }, { at: 50, label: 'CHARGING' }, { at: 100, label: 'FULL' }]
 *
 * Default tiers IDLE / CHARGING / FULL are used if IR doesn't specify.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const STYLES = `
    .ft-pm {
      display: flex; flex-direction: column; gap: 4px;
      padding: 6px 10px;
      background: var(--hud-bg, rgba(15,23,42,0.78));
      border: 1px solid var(--hud-bd, rgba(148,163,184,0.18));
      border-radius: 8px;
      min-width: 180px;
    }
    .ft-pm__frame { display: flex; align-items: center; gap: 8px; position: relative; }
    .ft-pm__track {
      flex: 1; height: 8px;
      background: rgba(148,163,184,0.15);
      border-radius: 999px;
      overflow: hidden;
      position: relative;
    }
    .ft-pm__fill {
      height: 100%; width: 0%;
      background: linear-gradient(90deg, var(--mtl-accent, var(--gold, #fde68a)), #fef3c7);
      transition: width 240ms cubic-bezier(.4,.0,.2,1);
      box-shadow: 0 0 10px rgba(245,158,11,0.18);
    }
    .ft-pm__icon { font-size: 14px; color: var(--mtl-accent, var(--gold, #fde68a)); }
    .ft-pm__markers { position: absolute; inset: 0 32px 0 0; pointer-events: none; }
    .ft-pm__marker { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.18); }
    .ft-pm__label { font: 9px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.12em; color: var(--txt-3, #64748b); text-transform: uppercase; }
    .ft-pm[data-state="full"] .ft-pm__label { color: var(--mtl-accent, var(--gold, #fde68a)); }
    .ft-pm[data-state="full"] .ft-pm__icon { animation: ft-pm-pulse 1.2s ease-in-out infinite; }
    @keyframes ft-pm-pulse { 0%,100%{transform:scale(1);}50%{transform:scale(1.18);} }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature;
    const host = meta.host;
    const bus = meta.bus;

    const tiers = irFeature.tiers || [
      { at: 0,   label: 'IDLE' },
      { at: 50,  label: 'CHARGING' },
      { at: 100, label: 'FULL' },
    ];
    const source = irFeature.source || 'base_win_x';
    const gain = Number(irFeature.gain) || 8;
    const decayPerLoss = Number(irFeature.decay_per_loss) || 0;
    const spinCountFill = irFeature.fill_spins ? (100 / irFeature.fill_spins) : 0;

    const root = document.createElement('div');
    root.className = 'ft-pm';
    root.setAttribute('data-state', 'idle');
    root.setAttribute('aria-label', irFeature.name || 'Power Meter');
    root.innerHTML = [
      '<div class="ft-pm__frame">',
      '  <div class="ft-pm__track"><div class="ft-pm__fill" data-f="fill"></div></div>',
      '  <span class="ft-pm__icon" aria-hidden="true">◆</span>',
      '  <div class="ft-pm__markers">',
      '    <span class="ft-pm__marker" style="left:25%"></span>',
      '    <span class="ft-pm__marker" style="left:50%"></span>',
      '    <span class="ft-pm__marker" style="left:75%"></span>',
      '  </div>',
      '</div>',
      '<div class="ft-pm__label" data-f="label">POWER · IDLE</div>',
    ].join('\n');
    host.appendChild(root);

    const fillEl = root.querySelector('[data-f="fill"]');
    const labelEl = root.querySelector('[data-f="label"]');

    let charge = 0;
    function setCharge(c) {
      charge = Math.max(0, Math.min(100, c));
      fillEl.style.width = charge + '%';
      // Pick highest tier with at ≤ charge
      let pick = tiers[0];
      for (const t of tiers) { if (charge >= (t.at || 0)) pick = t; }
      labelEl.textContent = ((irFeature.name || 'POWER') + ' · ' + (pick.label || '')).toUpperCase();
      root.setAttribute('data-state', charge >= 100 ? 'full' : (charge > 25 ? 'charging' : 'idle'));
    }

    const unsubEval = bus.on('spin:eval', function (p) {
      const r = p && p.result;
      const totalWin = (p && p.totalWin) || 0;
      if (source === 'base_win_x') {
        if (totalWin > 0) setCharge(charge + (totalWin * gain));
        else if (decayPerLoss > 0) setCharge(charge - decayPerLoss);
      } else if (source === 'spin_count') {
        setCharge(charge + spinCountFill);
      }
    });

    return {
      refresh: function () { setCharge(charge); },
      unmount: function () {
        unsubEval && unsubEval();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      _setCharge: setCharge,  // test hook
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'power-meter', kind: 'power_meter', styles: STYLES, mount: manifest });
    window.MTLFeatures.register({ _fileKey: 'power-meter', kind: 'accumulator', styles: '', mount: manifest });
  }
})();
