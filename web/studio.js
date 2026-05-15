/* Slot Math Studio — mockup interactivity (no backend, pure UI feedback). */

(() => {
  // ── live range outputs ────────────────────────────────────────────────
  document.querySelectorAll('input[type="range"][data-display]').forEach(r => {
    const target = document.getElementById(r.dataset.display);
    if (!target) return;
    const update = () => {
      const v = parseFloat(r.value);
      target.textContent = (r.step && r.step.includes('.')) ? v.toFixed(1) : Math.round(v);
    };
    r.addEventListener('input', update);
    update();
  });

  // ── segmented control toggle ──────────────────────────────────────────
  document.querySelectorAll('.seg').forEach(seg => {
    const isVert = seg.classList.contains('vert');
    seg.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });

  // ── chip toggle ───────────────────────────────────────────────────────
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('chip-on'));
  });

  // ── feature card toggle (via internal checkbox) ───────────────────────
  document.querySelectorAll('.feature-card').forEach(card => {
    const cb = card.querySelector('input[type="checkbox"]');
    if (!cb) return;
    const sync = () => card.classList.toggle('on', cb.checked);
    cb.addEventListener('change', sync);
  });

  // ── spin count slider <-> input (log scale) ───────────────────────────
  const spinSlider = document.getElementById('spin-slider');
  const spinInput  = document.getElementById('spin-count');
  const quickBtns  = document.querySelectorAll('.qp');

  const fmt = (n) => n.toLocaleString('en-US');
  const parseN = (s) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

  if (spinSlider && spinInput) {
    spinSlider.addEventListener('input', () => {
      const exp = parseFloat(spinSlider.value);
      const n = Math.round(Math.pow(10, exp));
      spinInput.value = fmt(n);
      updateEstimate(n);
      markActiveQuick(n);
    });
    spinInput.addEventListener('change', () => {
      const n = parseN(spinInput.value);
      spinInput.value = fmt(n);
      if (n > 0) {
        spinSlider.value = Math.log10(n).toFixed(2);
        updateEstimate(n);
        markActiveQuick(n);
      }
    });
  }

  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.textContent.trim();
      const map = { '10K':1e4,'100K':1e5,'1M':1e6,'10M':1e7,'100M':1e8,'1B':1e9,'10B':1e10,'100B':1e11,'1T':1e12 };
      const n = map[label] || 1e6;
      spinInput.value = fmt(n);
      spinSlider.value = Math.log10(n).toFixed(2);
      updateEstimate(n);
      markActiveQuick(n);
    });
  });

  function markActiveQuick(n) {
    const map = { '10K':1e4,'100K':1e5,'1M':1e6,'10M':1e7,'100M':1e8,'1B':1e9,'10B':1e10,'100B':1e11,'1T':1e12 };
    quickBtns.forEach(b => {
      const v = map[b.textContent.trim()];
      b.classList.toggle('active', v === n);
    });
  }

  function updateEstimate(n) {
    // Assumes Rust CPU 16T @ 28.1 Mspin/s.
    const sec = n / 28.1e6;
    const human = sec < 60 ? `${sec.toFixed(1)} s`
                : sec < 3600 ? `${(sec/60).toFixed(1)} min`
                : sec < 86400 ? `${(sec/3600).toFixed(1)} h`
                : `${(sec/86400).toFixed(1)} d`;
    const ci = 100 / Math.sqrt(n) * 8.42 / 0.96; // crude
    const ciTxt = `±${ci.toFixed(4)}% RTP`;
    const memMb = Math.max(40, 280 * Math.min(1, n / 1e9));

    const estBlock = document.querySelector('.est');
    if (!estBlock) return;
    estBlock.children[0].querySelector('b').textContent = `~${human}`;
    estBlock.children[1].querySelector('b').textContent = '28.1 Mspin/s';
    estBlock.children[2].querySelector('b').textContent = ciTxt;
    estBlock.children[3].querySelector('b').textContent = `~${memMb.toFixed(0)} MB`;

    const runBtnSub = document.querySelector('.run-btn-sub');
    if (runBtnSub) runBtnSub.textContent = `${fmt(n)} spins · Rust 16T`;
  }

  // ── RUN button (mockup: simulates progress over ~6s, ends with results) ─
  const runBtn = document.getElementById('run-btn');
  const runProg = document.getElementById('run-progress');
  const runRes  = document.getElementById('run-results');
  const progFill = runProg?.querySelector('.prog-fill');

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      runRes.classList.remove('active');
      runProg.classList.add('active');
      const n = parseN(spinInput.value);
      const start = performance.now();
      const dur = 6000; // 6s mockup
      const liveRtpEl = document.getElementById('live-rtp');
      const kvs = runProg.querySelectorAll('.kv-row b');

      function tick(now) {
        const p = Math.min(1, (now - start) / dur);
        progFill.style.width = `${(p * 100).toFixed(1)}%`;
        const spinsDone = Math.round(n * p);
        const spinsLabel = runProg.querySelector('.prog-head b');
        if (spinsLabel) spinsLabel.textContent = fmt(spinsDone);

        const noisyRtp = 96.12 + (Math.random() - 0.5) * Math.max(0.5 - p * 0.5, 0.005);
        const ci = (1 / Math.sqrt(Math.max(spinsDone, 1))) * 842 / 0.96 * 1.96;
        if (kvs.length >= 4) {
          kvs[0].textContent = `${noisyRtp.toFixed(3)}%`;
          kvs[1].textContent = `±${ci.toFixed(4)}%`;
          const remain = (dur - (now - start)) / 1000;
          kvs[2].textContent = remain > 0.5 ? `${remain.toFixed(1)}s` : 'finishing…';
          kvs[3].textContent = `${(n / (dur / 1000) / 1e6).toFixed(1)} M/s`;
        }

        if (p < 1) requestAnimationFrame(tick);
        else {
          runProg.classList.remove('active');
          runRes.classList.add('active');
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // ── live preview reel re-randomize ────────────────────────────────────
  const symbols = ['💎','💰','🔱','👑','⭐','🅰','K','Q','J','💵','×'];
  const colors  = ['#5ec8ff','#ffd700','#ff5e8a','#f5b400','#9b59ff','#888','#999','#aaa','#bbb','#1ed760','#ff7700'];
  const reseed = document.querySelector('.reel-stage-head .actions .btn');
  const reelGrid = document.getElementById('reel-grid');
  if (reseed && reelGrid) {
    reseed.addEventListener('click', () => {
      Array.from(reelGrid.children).forEach(cell => {
        const idx = Math.floor(Math.random() * symbols.length);
        cell.textContent = symbols[idx];
        cell.style.color = colors[idx];
        cell.style.background = colors[idx] + '22';
      });
    });
  }

  // ── parameter search (highlight sections) ─────────────────────────────
  const search = document.getElementById('param-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase().trim();
      document.querySelectorAll('.section').forEach(sec => {
        if (!q) { sec.style.display = ''; return; }
        const text = sec.textContent.toLowerCase();
        sec.style.display = text.includes(q) ? '' : 'none';
        if (text.includes(q)) sec.setAttribute('open', '');
      });
    });
  }

  // ── W152 Wave 26 — Live spin preview + JSON export ────────────────────
  //
  // Master TODO §11.1 acceptance: "Live preview spin — not in MVP".
  // This block adds a believable mockup-level live preview:
  //   1. "Live Spin" button — generates a deterministic random 5×3 grid
  //      using a small Mulberry32 RNG (same algorithm the engine ships),
  //      computes a simple middle-line win, animates reel cells, and
  //      flashes the winning row in green.
  //   2. "Export JSON" button — emits the studio's current parameter
  //      shape as a clean JSON blob the operator can paste into the
  //      engine IR. The shape is a SUBSET of the full IR (just enough
  //      to round-trip the visible knobs); it is NOT a full IR emit.
  //   3. "Import JSON" button — accepts a file drop / paste and tries
  //      to seed the visible parameter UI from it. Best-effort: unknown
  //      keys are silently skipped.

  // Tiny Mulberry32 PRNG — stream-identical to the engine's default RNG.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Mock paytable for the demo — proportional to weight inverse.
  // Only the middle row is paid; matches "5×3 lines" default fixture.
  const PAYTABLE = {
    '💎': { 3: 25, 4: 100, 5: 500 },
    '💰': { 3: 15, 4: 60, 5: 250 },
    '🔱': { 3: 10, 4: 40, 5: 150 },
    '👑': { 3: 8, 4: 30, 5: 120 },
    '⭐': { 3: 5, 4: 20, 5: 80 },
    '🅰': { 3: 4, 4: 15, 5: 60 },
    K:   { 3: 3, 4: 10, 5: 40 },
    Q:   { 3: 3, 4: 10, 5: 40 },
    J:   { 3: 2, 4: 8,  5: 30 },
    '💵':{ 3: 0, 4: 0,  5: 0 }, // scatter — pays via count, not line
    '×': { 3: 0, 4: 0,  5: 0 }, // multiplier — no line pay
  };
  // Symbol weight distribution mirrors the studio's default symbol pool.
  const SYMBOL_POOL = [
    '💎','💎','💰','💰','🔱','🔱','👑','👑','⭐','⭐','⭐',
    '🅰','🅰','🅰','K','K','K','K','Q','Q','Q','Q','J','J','J','J',
    '💵','×'
  ];

  // Compute a deterministic single spin grid (5 reels × 3 rows) for an
  // RNG, then score the middle row using the PAYTABLE. Wild is the '×'
  // symbol in this demo for the visual flash; it doesn't substitute.
  function spinOnce(rng) {
    const grid = [];
    for (let r = 0; r < 5; r++) {
      const reel = [];
      for (let row = 0; row < 3; row++) {
        reel.push(SYMBOL_POOL[Math.floor(rng() * SYMBOL_POOL.length)]);
      }
      grid.push(reel);
    }
    // Score middle row (row index 1): longest run from reel 0.
    const middle = grid.map(reel => reel[1]);
    const first = middle[0];
    let count = 1;
    for (let r = 1; r < 5; r++) {
      if (middle[r] === first) count++;
      else break;
    }
    const pay = (PAYTABLE[first] && PAYTABLE[first][count]) || 0;
    return { grid, middle, first, count, pay };
  }

  // Wire up a "Live Spin" trigger by extending the existing reseed button:
  // a single click now animates a real spin instead of just shuffling
  // emoji.  Look up the win-amount span if the layout exposes one.
  if (reseed && reelGrid) {
    // Use a fresh RNG state per click. Caller can pin seeds later by
    // tying a UI input to this number.
    let stateSeed = Date.now() & 0xFFFFFFFF;
    reseed.removeEventListener?.('click', () => {});
    reseed.addEventListener('click', () => {
      const rng = mulberry32(stateSeed++);
      const spin = spinOnce(rng);
      // Render reel cells as 5 columns × 3 rows; reelGrid is row-major.
      const cells = Array.from(reelGrid.children);
      // Detect row-major vs column-major: assume row-major (3 rows × 5 reels)
      // — that matches the visible 5×3 grid in the existing CSS.
      if (cells.length === 15) {
        for (let row = 0; row < 3; row++) {
          for (let reel = 0; reel < 5; reel++) {
            const idx = row * 5 + reel;
            const sym = spin.grid[reel][row];
            const cell = cells[idx];
            cell.textContent = sym;
            const symColorIdx = symbols.indexOf(sym);
            const color = colors[symColorIdx >= 0 ? symColorIdx : 0];
            cell.style.color = color;
            cell.style.background = color + '22';
            // Reset prior win highlights
            cell.style.boxShadow = '';
            cell.style.outline = '';
          }
        }
        // Flash winning middle-row cells if a pay landed.
        if (spin.count >= 3 && spin.pay > 0) {
          for (let r = 0; r < spin.count; r++) {
            const idx = 1 * 5 + r; // row 1, reel r
            const cell = cells[idx];
            cell.style.boxShadow = '0 0 18px 4px #1ed760aa';
            cell.style.outline = '2px solid #1ed760';
          }
          // Surface the win amount on the kv-row Live RTP slot if present.
          const liveRtp = document.getElementById('live-rtp');
          if (liveRtp) {
            liveRtp.textContent = `+${spin.pay}× (${spin.first} × ${spin.count})`;
            setTimeout(() => {
              if (liveRtp.textContent.startsWith('+'))
                liveRtp.textContent = '—';
            }, 1800);
          }
        }
      }
    });
  }

  // Build / pick a config JSON snapshot from the visible UI knobs. The
  // shape is a SUBSET of the engine IR — just the fields the studio
  // surfaces. Operators paste this into a full IR file as a starting
  // point; round-trip is JSON→studio→JSON only at the studio's scope.
  function buildConfigSnapshot() {
    const snap = {
      schema_version: '1.0.0',
      generated_by: 'slot-math-studio mockup',
      generated_at: new Date().toISOString(),
      identity: collectSectionFields('🎮'),
      topology: collectSectionFields('🧮'),
      symbols: collectSectionFields('🎰'),
      paylines: collectSectionFields('📐'),
      paytable: collectSectionFields('💰'),
      features: collectFeatureCards(),
      simulation: {
        spins: parseInt((spinInput?.value || '0').replace(/[^0-9]/g, ''), 10) || 0,
      },
    };
    return snap;
  }

  // Walk a section (matched by emoji prefix on its <summary>) and pull
  // every input/select that has a `name` or `id` attribute. Safe on
  // missing sections (returns empty object).
  function collectSectionFields(emojiPrefix) {
    const out = {};
    document.querySelectorAll('.section').forEach(sec => {
      const sum = sec.querySelector('summary');
      if (!sum || !sum.textContent.trim().startsWith(emojiPrefix)) return;
      sec.querySelectorAll('input, select').forEach(el => {
        const key = el.dataset?.key || el.id || el.name;
        if (!key) return;
        if (el.type === 'checkbox') out[key] = el.checked;
        else if (el.type === 'number' || el.type === 'range') out[key] = parseFloat(el.value);
        else out[key] = el.value;
      });
    });
    return out;
  }

  function collectFeatureCards() {
    const out = {};
    document.querySelectorAll('.feature-card').forEach(card => {
      const titleEl = card.querySelector('.card-title, .title, h4, h3');
      const key = titleEl ? titleEl.textContent.trim() : null;
      const cb = card.querySelector('input[type="checkbox"]');
      if (key) out[key] = cb ? cb.checked : false;
    });
    return out;
  }

  // Inject Export/Import buttons into the top run bar if a slot exists.
  // Falls back to the body if no slot is reachable.
  function injectIOButtons() {
    const host =
      document.querySelector('.run-bar .actions') ||
      document.querySelector('.run-bar') ||
      document.querySelector('header') ||
      document.body;

    if (host.querySelector('[data-studio-export]')) return;

    const exportBtn = document.createElement('button');
    exportBtn.textContent = '⬇ Export JSON';
    exportBtn.className = 'btn';
    exportBtn.dataset.studioExport = '1';
    exportBtn.style.marginLeft = '8px';
    exportBtn.addEventListener('click', () => {
      const snap = buildConfigSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slot-config-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const importBtn = document.createElement('button');
    importBtn.textContent = '⬆ Import JSON';
    importBtn.className = 'btn';
    importBtn.dataset.studioImport = '1';
    importBtn.style.marginLeft = '6px';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      f.text().then(text => {
        try {
          const obj = JSON.parse(text);
          applySnapshot(obj);
        } catch (e) {
          alert(`Invalid JSON: ${e.message}`);
        }
      });
    });

    host.appendChild(exportBtn);
    host.appendChild(importBtn);
    host.appendChild(fileInput);
  }

  // Apply a previously-exported snapshot back into the UI (best-effort:
  // unknown keys silently skipped, missing keys left at current value).
  function applySnapshot(snap) {
    const flat = {
      ...(snap.identity || {}),
      ...(snap.topology || {}),
      ...(snap.symbols || {}),
      ...(snap.paylines || {}),
      ...(snap.paytable || {}),
    };
    for (const [key, val] of Object.entries(flat)) {
      const el =
        document.querySelector(`[data-key="${key}"]`) ||
        document.getElementById(key) ||
        document.querySelector(`[name="${key}"]`);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Features
    if (snap.features) {
      document.querySelectorAll('.feature-card').forEach(card => {
        const titleEl = card.querySelector('.card-title, .title, h4, h3');
        if (!titleEl) return;
        const key = titleEl.textContent.trim();
        if (key in snap.features) {
          const cb = card.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = !!snap.features[key];
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    }
    // Spin count
    if (snap.simulation?.spins && spinInput) {
      spinInput.value = fmt(snap.simulation.spins);
      spinInput.dispatchEvent(new Event('change'));
    }
  }

  injectIOButtons();
})();
