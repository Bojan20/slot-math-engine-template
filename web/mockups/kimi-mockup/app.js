/* Atrium — Slot Math Studio · vanilla JS controller */
(() => {
  'use strict';

  /* ---------------------- tab routing ---------------------- */
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(t => {
    t.addEventListener('click', () => activate(t.dataset.tab));
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const order = ['build', 'play', 'certify'];
        const idx = order.indexOf(t.dataset.tab);
        const next = order[(idx + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
        activate(next);
        document.getElementById('tab-' + next).focus();
      }
    });
  });
  function activate(name) {
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
    });
    panels.forEach(p => {
      const on = p.id === 'panel-' + name;
      p.classList.toggle('is-active', on);
      if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    });
  }

  /* ---------------------- reels (build) ---------------------- */
  const reelsRoot = document.getElementById('reels');
  const SYMS = ['obsidian','auralith','cinder','verdant','tide','quill','prism','cog','wild','scatter','multiplier'];
  function pickWeighted() {
    // weighted toward T2/T3 for realistic strip
    const r = Math.random();
    if (r < 0.04) return 'obsidian';
    if (r < 0.10) return 'auralith';
    if (r < 0.22) return 'cinder';
    if (r < 0.34) return 'verdant';
    if (r < 0.46) return 'tide';
    if (r < 0.60) return 'quill';
    if (r < 0.74) return 'prism';
    if (r < 0.88) return 'cog';
    if (r < 0.94) return 'wild';
    if (r < 0.98) return 'scatter';
    return 'multiplier';
  }
  function buildReels() {
    reelsRoot.innerHTML = '';
    for (let r = 0; r < 5; r++) {
      const reel = document.createElement('div');
      reel.className = 'reel';
      reel.innerHTML = `<div class="reel__head"><span>reel</span><em>${String(r+1).padStart(2,'0')}</em></div>`;
      for (let row = 0; row < 3; row++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const sym = pickWeighted();
        cell.dataset.sym = sym;
        cell.innerHTML = `<img src="symbols/${sym}.svg" alt="${sym}"/>`;
        // drop target
        cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('is-drop'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('is-drop'));
        cell.addEventListener('drop', e => {
          e.preventDefault();
          const sym = e.dataTransfer.getData('text/sym');
          if (sym) {
            cell.dataset.sym = sym;
            cell.querySelector('img').src = `symbols/${sym}.svg`;
            cell.querySelector('img').alt = sym;
            nudgeRTP((Math.random()*0.4-0.2));
          }
          cell.classList.remove('is-drop');
        });
        reel.appendChild(cell);
      }
      reelsRoot.appendChild(reel);
    }
  }

  /* palette drag */
  document.querySelectorAll('.glyph').forEach(g => {
    g.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/sym', g.dataset.sym);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  /* ---------------------- RTP live wire ---------------------- */
  const rtpEl = document.getElementById('rtp');
  const rtpStatus = document.getElementById('rtp-status');
  const rtpDelta = document.getElementById('rtp-delta');
  const TARGET = 96.0;
  let rtp = 96.42;
  function setRTP(v) {
    rtp = Math.max(82, Math.min(99.5, v));
    rtpEl.textContent = rtp.toFixed(2);
    rtpStatus.innerHTML = rtp.toFixed(2) + '%';
    const d = rtp - TARGET;
    rtpDelta.textContent = `target ${TARGET.toFixed(2)} · Δ ${d>=0?'+':''}${d.toFixed(2)}`;
    rtpDelta.classList.toggle('neg', d < 0);
  }
  function nudgeRTP(amount) { setRTP(rtp + amount); }

  /* paytable clicks (Δ up, shift+click Δ down) + arrow keys */
  document.querySelectorAll('.paytable button').forEach(b => {
    b.addEventListener('click', e => {
      const cur = parseInt(b.textContent, 10);
      const delta = e.shiftKey ? -5 : 5;
      b.textContent = Math.max(1, cur + delta);
      b.classList.add('is-bumped');
      setTimeout(() => b.classList.remove('is-bumped'), 320);
      // higher payout → higher RTP, but very small per cell
      nudgeRTP(delta * 0.012);
    });
    b.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = parseInt(b.textContent, 10);
        const delta = e.key === 'ArrowUp' ? 5 : -5;
        b.textContent = Math.max(1, cur + delta);
        nudgeRTP(delta * 0.012);
      }
    });
  });

  /* topology select also nudges */
  document.getElementById('topology').addEventListener('change', () => {
    nudgeRTP(Math.random() * 0.5 - 0.25);
  });
  document.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(x => { x.classList.remove('is-on'); x.setAttribute('aria-pressed','false'); });
      c.classList.add('is-on'); c.setAttribute('aria-pressed','true');
      nudgeRTP(Math.random() * 0.6 - 0.3);
    });
  });

  /* ---------------------- play tab — hex stage ---------------------- */
  const hexStage = document.getElementById('hex-stage');
  const HEX_W = 80, HEX_H = 92, HEX_GAP_X = 70, HEX_GAP_Y = 70;
  const HEX_COLS = 5, HEX_ROWS = 3;

  function buildHexes() {
    hexStage.innerHTML = '';
    const stageW = HEX_COLS * HEX_GAP_X + 40;
    const stageH = HEX_ROWS * HEX_GAP_Y + 40;
    for (let c = 0; c < HEX_COLS; c++) {
      for (let r = 0; r < HEX_ROWS; r++) {
        const hex = document.createElement('div');
        hex.className = 'hex';
        const x = c * HEX_GAP_X + 20;
        const y = r * HEX_GAP_Y + (c % 2 === 1 ? HEX_GAP_Y/2 : 0) + 10;
        // center inside stage
        const cx = `calc(50% + ${x - stageW/2}px)`;
        const cy = `calc(50% + ${y - stageH/2}px)`;
        hex.style.left = cx; hex.style.top = cy;
        const sym = pickWeighted();
        hex.dataset.sym = sym;
        hex.innerHTML = `<img src="symbols/${sym}.svg" alt="${sym}"/>`;
        hexStage.appendChild(hex);
      }
    }
  }

  /* spin */
  let balance = 1000;
  let lastWin = 0;
  let bet = 1.0;
  const betEl = document.getElementById('bet');
  const balEl = document.getElementById('balance');
  const winEl = document.getElementById('lastwin');
  const histEl = document.getElementById('history');
  const histCountEl = document.getElementById('hist-count');
  let spinCount = 0;

  document.getElementById('bet-up').addEventListener('click', () => { bet = Math.min(100, +(bet + 0.5).toFixed(2)); betEl.textContent = bet.toFixed(2); });
  document.getElementById('bet-dn').addEventListener('click', () => { bet = Math.max(0.1, +(bet - 0.5).toFixed(2)); betEl.textContent = bet.toFixed(2); });

  function doSpin() {
    if (balance < bet) return;
    balance -= bet;
    const hexes = hexStage.querySelectorAll('.hex');
    hexes.forEach(h => h.classList.add('is-spinning'));
    setTimeout(() => {
      hexes.forEach(h => {
        const sym = pickWeighted();
        h.dataset.sym = sym;
        h.querySelector('img').src = `symbols/${sym}.svg`;
        h.querySelector('img').alt = sym;
        h.classList.remove('is-spinning');
      });
      // fake win logic ~28% of the time
      const win = Math.random() < 0.286;
      let amount = 0;
      if (win) {
        const big = Math.random() < 0.04;
        amount = big ? +(bet * (10 + Math.random()*40)).toFixed(2) : +(bet * (0.5 + Math.random()*4)).toFixed(2);
        balance += amount;
        // highlight some hexes
        const winners = Array.from(hexes).filter(() => Math.random() < 0.18);
        winners.forEach(h => h.classList.add('is-hit'));
        setTimeout(() => winners.forEach(h => h.classList.remove('is-hit')), 900);
      }
      lastWin = amount;
      balEl.textContent = balance.toFixed(2);
      winEl.textContent = amount.toFixed(2);
      pushHistory(amount);
    }, 480);
  }
  function pushHistory(amount) {
    spinCount++;
    const li = document.createElement('li');
    if (amount > 0) li.classList.add('is-win');
    if (amount > bet * 8) li.classList.add('is-big');
    li.innerHTML = `<span>#${String(spinCount).padStart(3,'0')}</span><span>${bet.toFixed(2)} bet</span><b>${amount > 0 ? '+'+amount.toFixed(2) : '—'}</b>`;
    histEl.prepend(li);
    histCountEl.textContent = `${spinCount} spin${spinCount===1?'':'s'}`;
    while (histEl.children.length > 40) histEl.lastChild.remove();
  }

  document.getElementById('spin').addEventListener('click', doSpin);
  document.getElementById('auto').addEventListener('click', () => {
    let i = 0;
    const tick = () => { if (i++ < 10) { doSpin(); setTimeout(tick, 700); } };
    tick();
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && document.getElementById('panel-play').classList.contains('is-active')) {
      e.preventDefault();
      doSpin();
    }
  });

  /* ---------------------- certify ---------------------- */
  document.getElementById('run-mc').addEventListener('click', () => {
    const prog = document.getElementById('mc-progress');
    const bar = document.getElementById('mc-bar');
    const status = document.getElementById('mc-status');
    prog.hidden = false;
    let p = 0;
    status.textContent = 'preparing workers · xoshiro256++ seeded';
    const step = () => {
      p += Math.random() * 8 + 2;
      if (p > 100) p = 100;
      bar.style.width = p.toFixed(1) + '%';
      if (p < 30)      status.textContent = `warm-up · ${p.toFixed(0)}%`;
      else if (p < 80) status.textContent = `running · ${(p*500).toFixed(0)} spins/s · ${p.toFixed(0)}%`;
      else if (p < 100)status.textContent = `cooling · drift KS · ${p.toFixed(0)}%`;
      else             status.textContent = `done · 50 000 spins · KS p=0.42 · MC vs closed-form ✓`;
      if (p < 100) setTimeout(step, 180);
    };
    step();
  });

  document.getElementById('dl').addEventListener('click', () => {
    const btn = document.getElementById('dl');
    const lbl = btn.querySelector('.cta__label');
    const orig = lbl.textContent;
    lbl.textContent = 'Bundling…';
    setTimeout(() => {
      lbl.textContent = 'operator-package.zip ready ✓';
      setTimeout(() => lbl.textContent = orig, 2400);
    }, 900);
  });

  /* ---------------------- boot ---------------------- */
  buildReels();
  buildHexes();
  setRTP(96.42);
})();
