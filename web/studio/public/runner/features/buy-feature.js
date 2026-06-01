/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE: buy_feature / bonus_buy
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Generic BUY FEATURE button — renders below the reels. On click it asks
 * the runtime to trigger the configured feature directly (skipping base
 * spins). If runtime doesn't expose a hook, falls back to dispatching a
 * synthetic 'spin:start' with feature trigger flag.
 *
 * IR contract (optional):
 *   IR.features.buy_feature = {
 *     features: [{ id: 'free_spins', label: 'FS', multiplier: 100 }, ...],
 *     defaultId?: string
 *   }
 *
 * Phase 52 baseline.
 * ════════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  const STYLES = `
    .ft-buy {
      display: flex; gap: 8px; align-items: center; padding: 6px 10px;
      background: rgba(15,23,42,0.78);
      border: 1px solid rgba(244,63,94,0.55);
      border-radius: 10px;
      box-shadow: 0 0 16px rgba(244,63,94,0.25);
    }
    .ft-buy__lbl {
      font: 700 10px ui-monospace, Menlo, monospace;
      letter-spacing: 0.14em;
      color: #fda4af; text-transform: uppercase;
    }
    .ft-buy__btn {
      background: linear-gradient(180deg, #f43f5e, #be123c);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.18);
      padding: 6px 14px;
      border-radius: 8px;
      font: 700 13px ui-monospace, Menlo, monospace;
      letter-spacing: 0.06em;
      cursor: pointer;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      box-shadow: 0 4px 10px rgba(244,63,94,0.4);
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .ft-buy__btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(244,63,94,0.55); }
    .ft-buy__btn:active { transform: translateY(0); }
    .ft-buy__cost { font-size: 11px; color: #f8fafc; opacity: 0.85; }
  `;

  function manifest(meta) {
    const irFeature = meta.irFeature || {};
    const host = meta.host;
    const bus = meta.bus;
    const features = Array.isArray(irFeature.features) && irFeature.features.length > 0
      ? irFeature.features
      : [{ id: 'free_spins', label: 'FS', multiplier: 100 }];

    const root = document.createElement('div');
    root.className = 'ft-buy';
    root.innerHTML = '<div class="ft-buy__lbl">BUY</div>';

    for (const ft of features) {
      const btn = document.createElement('button');
      btn.className = 'ft-buy__btn';
      const cost = Number(ft.multiplier) || 100;
      btn.innerHTML = '<span>' + (ft.label || ft.id.toUpperCase()) + '</span><br><span class="ft-buy__cost">' + cost + '× bet</span>';
      btn.addEventListener('click', function () {
        bus.emit('buy:request', { id: ft.id, cost: cost });
        // Also try direct runtime hook if exposed
        if (window.__SLOT__ && typeof window.__SLOT__.triggerFeature === 'function') {
          window.__SLOT__.triggerFeature(ft.id, { fromBuy: true, costMultiplier: cost });
        }
      });
      root.appendChild(btn);
    }

    host.appendChild(root);

    return {
      refresh: function () {},
      unmount: function () { if (root.parentNode) root.parentNode.removeChild(root); },
    };
  }

  if (typeof window !== 'undefined' && window.MTLFeatures && window.MTLFeatures.register) {
    window.MTLFeatures.register({ _fileKey: 'buy-feature', kind: 'buy_feature', styles: STYLES, mount: manifest });
    window.MTLFeatures.register({ _fileKey: 'buy-feature', kind: 'bonus_buy', styles: STYLES, mount: manifest });
  }
})();
