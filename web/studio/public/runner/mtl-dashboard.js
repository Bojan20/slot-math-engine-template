/*
 * ════════════════════════════════════════════════════════════════════════════
 *   MTL DASHBOARD  —  Live integrity HUD for Play Template
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Floating overlay (top-right corner of the Play Template) that shows the
 * organism's vitals at a glance.  Updated by runtime.js after each spin and
 * during boot.  Click to expand / collapse details.
 *
 *   ┌─────────────────────────────────────────┐
 *   │ 🪞 MTL · sealed                          │
 *   │ ─────────────────────────────────────── │
 *   │ Seal     0x7f3a…b821    ✓ verified      │
 *   │ DNA      0xa44e…12f7                    │
 *   │ Spins    1,234                          │
 *   │ Locksteps 1,234 / 1,234  100.0% match   │
 *   │ Witnesses oracle.js · runtime.js        │
 *   │ Last spin seed=42718  hash=0x4c2a…91e7  │
 *   └─────────────────────────────────────────┘
 *
 * The dashboard fails LOUD: if Lockstep ever sees a mismatch, the badge
 * goes red, an inline diff snippet is shown, and the SPIN button is
 * locked (handled by runtime.js).  Boki can copy the seed + diff path
 * directly from the HUD for bug reports.
 *
 * Public API (called by runtime.js):
 *   MTLDashboard.mount(target?)             // attach to DOM (default body)
 *   MTLDashboard.setSeal({ value, dna, sealed_at, seed_count, witnesses })
 *   MTLDashboard.setUnsealed(reason)
 *   MTLDashboard.recordSpin({ seed, oracleHash, runnerHash, match })
 *   MTLDashboard.recordHalt({ seed, diff, oracleResult, runnerResult })
 *   MTLDashboard.collapse() / expand()
 *   MTLDashboard.getStats() → { spins, matches, mismatches }
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  //  Styles (inlined; matches the theme-onyx palette of the runner)
  // ──────────────────────────────────────────────────────────────────────────

  const CSS = [
    // z-index 30 — sits above the reels grid (z 2-10) and below the
    // paytable drawer (50), feature overlay (10+) and any modal that may
    // appear in the runner.  HUD is informational; clicks inside it stay,
    // clicks outside pass through to the underlying UI.
    '.mtl-hud{position:fixed;top:12px;right:12px;z-index:30;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbd5e1;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid rgba(148,163,184,0.18);border-radius:10px;padding:0;min-width:260px;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4);user-select:none;cursor:default;transition:max-height .25s ease,opacity .2s ease}',
    '.mtl-hud[data-collapsed="true"]{padding:6px 10px;min-width:auto}',
    '.mtl-hud[data-collapsed="true"] .mtl-body{display:none}',
    '.mtl-hud[data-state="sealed"]{border-color:rgba(245,158,11,0.55);box-shadow:0 8px 32px rgba(245,158,11,0.18)}',
    '.mtl-hud[data-state="unsealed"]{border-color:rgba(148,163,184,0.18)}',
    '.mtl-hud[data-state="halted"]{border-color:rgba(244,63,94,0.85);box-shadow:0 8px 32px rgba(244,63,94,0.35);animation:mtl-pulse 1.6s ease-in-out infinite}',
    '@keyframes mtl-pulse{0%,100%{box-shadow:0 8px 32px rgba(244,63,94,0.35)}50%{box-shadow:0 8px 48px rgba(244,63,94,0.6)}}',
    '.mtl-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;cursor:pointer;border-bottom:1px solid rgba(148,163,184,0.12)}',
    '.mtl-hud[data-collapsed="true"] .mtl-head{border-bottom:none;padding:0}',
    '.mtl-title{font-weight:600;letter-spacing:.02em}',
    '.mtl-title b{color:#fde68a}',
    '.mtl-hud[data-state="unsealed"] .mtl-title b{color:#94a3b8}',
    '.mtl-hud[data-state="halted"] .mtl-title b{color:#fda4af}',
    '.mtl-pill{display:inline-block;padding:2px 7px;border-radius:999px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:700}',
    '.mtl-pill[data-pill="sealed"]{background:rgba(245,158,11,0.18);color:#fde68a;border:1px solid rgba(245,158,11,0.45)}',
    '.mtl-pill[data-pill="unsealed"]{background:rgba(100,116,139,0.18);color:#94a3b8;border:1px solid rgba(100,116,139,0.45)}',
    '.mtl-pill[data-pill="halted"]{background:rgba(244,63,94,0.22);color:#fda4af;border:1px solid rgba(244,63,94,0.6)}',
    '.mtl-body{padding:8px 10px 10px}',
    '.mtl-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;line-height:1.55}',
    '.mtl-row .lbl{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.05em}',
    '.mtl-row .val{color:#e2e8f0;text-align:right}',
    '.mtl-row .val.ok{color:#86efac}',
    '.mtl-row .val.warn{color:#fcd34d}',
    '.mtl-row .val.bad{color:#fda4af}',
    '.mtl-row .mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
    '.mtl-divider{height:1px;background:rgba(148,163,184,0.12);margin:6px -10px}',
    '.mtl-halt-block{margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.4);color:#fecaca;font-size:10px;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
    '.mtl-actions{display:flex;gap:6px;margin-top:8px}',
    '.mtl-btn{flex:1;padding:5px 8px;font:inherit;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#cbd5e1;background:rgba(30,41,59,0.65);border:1px solid rgba(148,163,184,0.25);border-radius:5px;cursor:pointer}',
    '.mtl-btn:hover{background:rgba(51,65,85,0.85);color:#f1f5f9}',
    '.mtl-hud .hashfrag{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-0.02em}',
  ].join('');

  function injectStyles() {
    if (document.getElementById('mtl-hud-css')) return;
    const s = document.createElement('style');
    s.id = 'mtl-hud-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  State
  // ──────────────────────────────────────────────────────────────────────────

  const state = {
    el: null,
    state: 'unsealed',     // 'unsealed' | 'sealed' | 'halted'
    seal: null,            // { value, dna, sealed_at, seed_count, witnesses }
    unsealedReason: null,
    spins: 0,
    matches: 0,
    mismatches: 0,
    lastSpin: null,        // { seed, oracleHash, runnerHash, match }
    haltInfo: null,        // { seed, diff, oracleResult, runnerResult }
    collapsed: false,
    // Watchtower state (populated by runtime via setWatchtowerReport)
    wt: null,              // { status, breaches, metrics, spinsObserved }
    replayHandler: null,   // callback wired by runtime
  };

  function shortHash(h) {
    if (!h || typeof h !== 'string') return '—';
    if (h.length <= 12) return h;
    return h.slice(0, 6) + '…' + h.slice(-4);
  }
  function pct(n, d) {
    if (!d) return '—';
    return ((n / d) * 100).toFixed(2) + '%';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  DOM
  // ──────────────────────────────────────────────────────────────────────────

  function build() {
    const el = document.createElement('div');
    el.className = 'mtl-hud';
    el.setAttribute('data-state', state.state);
    el.setAttribute('data-collapsed', String(state.collapsed));
    el.innerHTML = [
      '<div class="mtl-head">',
      '  <span class="mtl-title">🪞 <b>MTL</b></span>',
      '  <span class="mtl-pill" data-pill="unsealed">unsealed</span>',
      '</div>',
      '<div class="mtl-body">',
      '  <div class="mtl-row"><span class="lbl">Seal</span><span class="val mono hashfrag" data-f="seal">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">DNA</span><span class="val mono hashfrag" data-f="dna">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Sealed</span><span class="val mono" data-f="sealedAt">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Witnesses</span><span class="val mono" data-f="witnesses">—</span></div>',
      '  <div class="mtl-divider"></div>',
      '  <div class="mtl-row"><span class="lbl">Spins</span><span class="val mono" data-f="spins">0</span></div>',
      '  <div class="mtl-row"><span class="lbl">Locksteps</span><span class="val mono" data-f="locksteps">0 / 0</span></div>',
      '  <div class="mtl-row"><span class="lbl">Match rate</span><span class="val mono ok" data-f="matchRate">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Last seed</span><span class="val mono hashfrag" data-f="lastSeed">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Last hash</span><span class="val mono hashfrag" data-f="lastHash">—</span></div>',
      '  <div class="mtl-divider"></div>',
      '  <div class="mtl-row"><span class="lbl">Watchtower</span><span class="val mono" data-f="wtStatus">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Rolling RTP</span><span class="val mono" data-f="wtRtp">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Hit rate</span><span class="val mono" data-f="wtHit">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">FS hit</span><span class="val mono" data-f="wtFs">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">H&amp;W hit</span><span class="val mono" data-f="wtHnw">—</span></div>',
      '  <div class="mtl-row"><span class="lbl">Lightning</span><span class="val mono" data-f="wtLight">—</span></div>',
      '  <div data-f="breachBlock" hidden></div>',
      '  <div data-f="haltBlock" hidden></div>',
      '  <div class="mtl-actions">',
      '    <button class="mtl-btn" data-act="copy" type="button">Copy seal</button>',
      '    <button class="mtl-btn" data-act="replay" type="button">Replay last 10</button>',
      '    <button class="mtl-btn" data-act="report" type="button" disabled>Copy report</button>',
      '  </div>',
      '</div>',
    ].join('\n');

    // Toggle collapse on head click
    el.querySelector('.mtl-head').addEventListener('click', function () {
      state.collapsed = !state.collapsed;
      el.setAttribute('data-collapsed', String(state.collapsed));
    });
    // Actions
    el.addEventListener('click', function (e) {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (act === 'copy' && state.seal) {
        try { navigator.clipboard.writeText(state.seal.value); } catch (_) {}
      } else if (act === 'report' && state.haltInfo) {
        const txt = JSON.stringify({ seal: state.seal, halt: state.haltInfo, lastSpin: state.lastSpin, watchtower: state.wt }, null, 2);
        try { navigator.clipboard.writeText(txt); } catch (_) {}
      } else if (act === 'replay' && typeof state.replayHandler === 'function') {
        state.replayHandler();
      }
    });
    return el;
  }

  function render() {
    if (!state.el) return;
    state.el.setAttribute('data-state', state.state);
    state.el.setAttribute('data-collapsed', String(state.collapsed));
    const pill = state.el.querySelector('.mtl-pill');
    pill.setAttribute('data-pill', state.state);
    pill.textContent = state.state;

    function set(name, text, cls) {
      const node = state.el.querySelector('[data-f="' + name + '"]');
      if (!node) return;
      node.textContent = text;
      if (cls != null) {
        node.classList.remove('ok', 'warn', 'bad');
        if (cls) node.classList.add(cls);
      }
    }

    set('seal', state.seal ? shortHash(state.seal.value) : '—');
    set('dna', state.seal ? shortHash(state.seal.dna) : '—');
    set('sealedAt', state.seal ? fmtTime(state.seal.sealed_at) : '—');
    set('witnesses', state.seal ? (state.seal.witnesses === 2 ? 'oracle · runtime' : state.seal.witnesses === 1 ? 'oracle (single)' : String(state.seal.witnesses)) : '—');
    set('spins', String(state.spins));
    set('locksteps', state.matches + ' / ' + state.spins);
    const matchClass = state.mismatches === 0 ? 'ok' : 'bad';
    set('matchRate', pct(state.matches, state.spins), matchClass);
    set('lastSeed', state.lastSpin ? String(state.lastSpin.seed) : '—');
    set('lastHash', state.lastSpin ? shortHash(state.lastSpin.oracleHash) : '—');

    // Watchtower rows
    const wt = state.wt;
    if (wt && wt.metrics && wt.metrics.n > 0) {
      const m = wt.metrics;
      const sCls = wt.status === 'critical' ? 'bad' : wt.status === 'warn' ? 'warn' : (wt.status === 'warmup' ? '' : 'ok');
      set('wtStatus', wt.status.toUpperCase() + ' · ' + m.n + ' spins', sCls);
      set('wtRtp', m.rtp.toFixed(3) + '%', null);
      set('wtHit', m.hitPct.toFixed(2) + '%', null);
      set('wtFs', m.fsOneIn ? ('1-in-' + Math.round(m.fsOneIn)) : '—', null);
      set('wtHnw', m.hnwOneIn ? ('1-in-' + Math.round(m.hnwOneIn)) : '—', null);
      set('wtLight', m.lightPct.toFixed(2) + '%', null);
    } else {
      set('wtStatus', '—', null);
      set('wtRtp', '—', null);
      set('wtHit', '—', null);
      set('wtFs', '—', null);
      set('wtHnw', '—', null);
      set('wtLight', '—', null);
    }

    // Breach block (warn/critical from watchtower)
    const breachBlock = state.el.querySelector('[data-f="breachBlock"]');
    if (wt && wt.breaches && wt.breaches.length) {
      const html = wt.breaches.map(function (b) {
        if (b.metric === 'fs' || b.metric === 'hnw') {
          return b.metric.toUpperCase() + ' freq 1-in-' + Math.round(b.observed) + ' (target 1-in-' + Math.round(b.target) + ') [' + b.status + ']';
        }
        const dp = b.deltaPp != null ? (b.deltaPp >= 0 ? '+' : '') + b.deltaPp.toFixed(2) + 'pp' : '';
        return b.metric.toUpperCase() + ' ' + b.observed.toFixed(2) + '% (target ' + b.target.toFixed(2) + '%) ' + dp + ' [' + b.status + ']';
      }).join('\n');
      const color = wt.status === 'critical' ? '244,63,94' : '252,211,77';
      breachBlock.outerHTML = '<div data-f="breachBlock" class="mtl-halt-block" style="background:rgba(' + color + ',0.10);border-color:rgba(' + color + ',0.45);color:' + (wt.status === 'critical' ? '#fecaca' : '#fde68a') + '"><b>Watchtower</b>\n' + html + '</div>';
    } else {
      const cur = state.el.querySelector('[data-f="breachBlock"]');
      if (cur) cur.outerHTML = '<div data-f="breachBlock" hidden></div>';
    }

    const haltBlock = state.el.querySelector('[data-f="haltBlock"]');
    const reportBtn = state.el.querySelector('[data-act="report"]');
    if (state.haltInfo) {
      haltBlock.hidden = false;
      const diffLine = state.haltInfo.diff
        ? state.haltInfo.diff.path + ' → oracle:' + JSON.stringify(state.haltInfo.diff.a) + ' vs runner:' + JSON.stringify(state.haltInfo.diff.b)
        : 'no field-level diff';
      haltBlock.outerHTML =
        '<div data-f="haltBlock" class="mtl-halt-block">' +
        '<b>HALT @ spin ' + (state.spins) + '</b>\n' +
        'seed: ' + state.haltInfo.seed + '\n' +
        'diff: ' + diffLine +
        '</div>';
      if (reportBtn) reportBtn.removeAttribute('disabled');
    } else {
      const cur = state.el.querySelector('[data-f="haltBlock"]');
      if (cur) { cur.outerHTML = '<div data-f="haltBlock" hidden></div>'; }
      if (reportBtn) reportBtn.setAttribute('disabled', '');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────────────────────

  function mount(target) {
    if (state.el) return state.el;
    injectStyles();
    state.el = build();
    (target || document.body).appendChild(state.el);
    render();
    return state.el;
  }

  function setSeal(seal) {
    state.seal = seal;
    state.state = 'sealed';
    state.unsealedReason = null;
    render();
  }
  function setUnsealed(reason) {
    state.seal = null;
    state.state = 'unsealed';
    state.unsealedReason = reason || null;
    render();
  }
  function recordSpin(info) {
    state.spins += 1;
    if (info && info.match) state.matches += 1;
    else state.mismatches += 1;
    state.lastSpin = info || null;
    render();
  }
  function recordHalt(info) {
    state.state = 'halted';
    state.haltInfo = info || null;
    state.collapsed = false;
    render();
  }
  function expand() { state.collapsed = false; render(); }
  function collapse() { state.collapsed = true; render(); }
  function getStats() {
    return { spins: state.spins, matches: state.matches, mismatches: state.mismatches };
  }
  function setWatchtowerReport(report) {
    state.wt = report || null;
    render();
  }
  function getWatchtowerReport() {
    return state.wt;
  }
  function setReplayHandler(fn) {
    state.replayHandler = typeof fn === 'function' ? fn : null;
  }

  root.MTLDashboard = {
    mount: mount,
    setSeal: setSeal,
    setUnsealed: setUnsealed,
    recordSpin: recordSpin,
    recordHalt: recordHalt,
    expand: expand,
    collapse: collapse,
    getStats: getStats,
    setWatchtowerReport: setWatchtowerReport,
    getWatchtowerReport: getWatchtowerReport,
    setReplayHandler: setReplayHandler,
  };
})(typeof window !== 'undefined' ? window : globalThis);
