/* =============================================================
   Slot Math Studio — CORTI mockup
   app.js  · vanilla JS · no external deps
   ============================================================= */

(() => {
  "use strict";

  // ----- Data model ---------------------------------------------------------
  const SYMBOLS = [
    { id: "s01", name: "Pebble",   tier: "low",     base3:  5, base4: 15, base5:  50 },
    { id: "s02", name: "Tide",     tier: "low",     base3:  5, base4: 20, base5:  60 },
    { id: "s03", name: "Arc",      tier: "low",     base3:  8, base4: 25, base5:  75 },
    { id: "s04", name: "Knot",     tier: "low",     base3: 10, base4: 30, base5:  90 },
    { id: "s05", name: "Prism",    tier: "mid",     base3: 15, base4: 50, base5: 150 },
    { id: "s06", name: "Shard",    tier: "mid",     base3: 20, base4: 60, base5: 200 },
    { id: "s07", name: "Meridian", tier: "mid",     base3: 25, base4: 75, base5: 250 },
    { id: "s08", name: "Keystone", tier: "high",    base3: 40, base4: 120, base5: 500 },
    { id: "s09", name: "Obelisk",  tier: "high",    base3: 60, base4: 200, base5: 750 },
    { id: "s10", name: "Lattice",  tier: "wild",    base3:  0, base4:   0, base5:   0 },
    { id: "s11", name: "Sonar",    tier: "scatter", base3:  5, base4: 20, base5: 100 },
  ];

  // Default reels (5 cols × N positions). Each entry is a symbol id.
  const DEFAULT_REELS = [
    ["s01","s05","s02","s08","s03","s06","s10","s04","s07","s09","s11","s02"],
    ["s02","s06","s01","s08","s05","s03","s07","s10","s01","s09","s04","s11"],
    ["s03","s07","s05","s10","s02","s08","s01","s06","s09","s04","s11","s05"],
    ["s04","s05","s09","s07","s01","s10","s06","s02","s08","s03","s11","s07"],
    ["s05","s08","s02","s06","s10","s09","s03","s01","s07","s04","s11","s06"],
  ];
  const DEFAULT_WEIGHTS = [22, 20, 18, 20, 20]; // % per reel

  // working copy
  const state = {
    reels: DEFAULT_REELS.map(r => r.slice()),
    weights: DEFAULT_WEIGHTS.slice(),
    pays: SYMBOLS.reduce((acc, s) => {
      acc[s.id] = { x3: s.base3, x4: s.base4, x5: s.base5 };
      return acc;
    }, {}),
    rtp: 95.42,
    hit: 27.8,
    maxWin: 2145,
    vola: 3, // pips on/off (0..5)
    selectedSym: null,
  };

  // ----- Helpers ------------------------------------------------------------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function symDef(id) { return SYMBOLS.find(s => s.id === id); }
  function fmtPct(x, dp=2) { return x.toFixed(dp) + "%"; }

  // ----- Tab switching ------------------------------------------------------
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".tab").forEach(t => t.classList.toggle("active", t === btn));
      $$(".panel").forEach(p => {
        p.classList.toggle("active", p.id === `panel-${tab}`);
      });
    });
  });

  // ----- Reel rendering -----------------------------------------------------
  const reelsRoot = $("#reels");

  function renderReels() {
    reelsRoot.innerHTML = "";
    state.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      reel.dataset.reel = ri;

      // head
      const head = document.createElement("div");
      head.className = "reel-head";
      head.innerHTML = `<span class="idx">REEL ${ri+1}</span><span>${col.length} pos</span>`;
      reel.appendChild(head);

      // cells
      const cells = document.createElement("div");
      cells.className = "reel-cells";
      col.forEach((sid, pi) => {
        const c = document.createElement("div");
        c.className = "reel-cell";
        c.dataset.reel = ri;
        c.dataset.pos = pi;
        if (!sid) {
          c.classList.add("empty");
        } else {
          const sd = symDef(sid);
          if (sd && sd.tier === "wild") c.classList.add("is-wild");
          if (sd && sd.tier === "scatter") c.classList.add("is-scatter");
          c.innerHTML = `
            <svg><use href="#g-${sid}"/></svg>
            <span class="x" data-action="remove">×</span>
          `;
        }
        cells.appendChild(c);
      });
      reel.appendChild(cells);

      // foot — weight slider
      const foot = document.createElement("div");
      foot.className = "reel-foot";
      foot.innerHTML = `
        <label>Reel weight</label>
        <div class="weight-row">
          <input type="range" min="5" max="40" value="${state.weights[ri]}" data-reel="${ri}" />
          <span class="pct">${state.weights[ri].toFixed(1)} %</span>
        </div>
      `;
      reel.appendChild(foot);

      reelsRoot.appendChild(reel);
    });

    bindReelCellEvents();
    bindWeightSliders();
  }

  function bindReelCellEvents() {
    $$(".reel-cell").forEach(cell => {
      cell.addEventListener("dragover", e => {
        e.preventDefault();
        cell.classList.add("dragover");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
      cell.addEventListener("drop", e => {
        e.preventDefault();
        cell.classList.remove("dragover");
        const sid = e.dataTransfer.getData("text/sym");
        if (!sid) return;
        placeSymbol(+cell.dataset.reel, +cell.dataset.pos, sid);
      });
      cell.addEventListener("click", e => {
        if (e.target.dataset.action === "remove") {
          placeSymbol(+cell.dataset.reel, +cell.dataset.pos, null);
          e.stopPropagation();
          return;
        }
        if (state.selectedSym && cell.classList.contains("empty")) {
          placeSymbol(+cell.dataset.reel, +cell.dataset.pos, state.selectedSym);
        }
      });
    });
  }

  function bindWeightSliders() {
    $$('.reel-foot input[type="range"]').forEach(s => {
      s.addEventListener("input", () => {
        const ri = +s.dataset.reel;
        state.weights[ri] = +s.value;
        s.nextElementSibling.textContent = (+s.value).toFixed(1) + " %";
        scheduleRecompute("weight Δ reel " + (ri+1));
      });
    });
  }

  function placeSymbol(ri, pi, sid) {
    state.reels[ri][pi] = sid;
    renderReels();
    scheduleRecompute(sid ? `place ${sid} → R${ri+1}·${pi+1}` : `clear R${ri+1}·${pi+1}`);
  }

  // ----- Palette: drag + click-to-select -----------------------------------
  $$("#palette .sym").forEach(el => {
    el.addEventListener("dragstart", e => {
      el.classList.add("drag-source");
      e.dataTransfer.setData("text/sym", el.dataset.sym);
      e.dataTransfer.effectAllowed = "copy";
    });
    el.addEventListener("dragend", () => el.classList.remove("drag-source"));
    el.addEventListener("click", () => {
      state.selectedSym = state.selectedSym === el.dataset.sym ? null : el.dataset.sym;
      $$("#palette .sym").forEach(s => s.style.outline = "");
      if (state.selectedSym) {
        el.style.outline = `1px solid var(--accent)`;
      }
    });
  });

  // ----- Paytable -----------------------------------------------------------
  const paytableBody = $("#paytable tbody");

  function renderPaytable() {
    paytableBody.innerHTML = "";
    SYMBOLS.forEach(s => {
      const tr = document.createElement("tr");
      const p = state.pays[s.id];
      const hr = approxHitRate(s.id);
      const isWild = s.tier === "wild";
      const isSct  = s.tier === "scatter";

      tr.innerHTML = `
        <td>
          <div class="sym-cell">
            <svg style="${isWild ? 'color:var(--accent)' : isSct ? 'color:var(--warn)' : ''}">
              <use href="#g-${s.id}"/>
            </svg>
            <span class="nm">${s.name}${isWild ? " · WILD" : isSct ? " · SCATTER" : ""}</span>
          </div>
        </td>
        <td><input class="pay" data-sym="${s.id}" data-of="x3" value="${p.x3}" ${isWild ? 'disabled' : ''}/></td>
        <td><input class="pay" data-sym="${s.id}" data-of="x4" value="${p.x4}" ${isWild ? 'disabled' : ''}/></td>
        <td><input class="pay" data-sym="${s.id}" data-of="x5" value="${p.x5}" ${isWild ? 'disabled' : ''}/></td>
        <td style="color:var(--muted)">${hr}</td>
      `;
      paytableBody.appendChild(tr);
    });

    $$("input.pay").forEach(inp => {
      inp.addEventListener("input", () => {
        const v = parseInt(inp.value, 10);
        if (!isFinite(v)) return;
        state.pays[inp.dataset.sym][inp.dataset.of] = v;
        scheduleRecompute(`pay Δ ${inp.dataset.sym}·${inp.dataset.of}`);
      });
    });
  }

  function approxHitRate(sid) {
    // Cheap deterministic estimate per symbol — for display only.
    const sd = symDef(sid);
    if (!sd) return "—";
    const base = { low: 8.5, mid: 4.2, high: 1.8, wild: 0.9, scatter: 0.6 }[sd.tier];
    const n = state.reels.reduce((acc, col) => acc + col.filter(x => x === sid).length, 0);
    return (base * (1 + n/40)).toFixed(2) + " %";
  }

  // ----- Live PAR recompute -------------------------------------------------
  const rtpEl  = $("#rtp-value");
  const hitEl  = $("#hit-value");
  const maxEl  = $("#max-value");
  const recomp = $("#recompute");
  const recompTxt = $("#recompute-text");
  const statusTime = $("#status-time");
  const statusDrift = $("#status-drift");
  const volaPipsEl = $("#vola-pips");
  const volaCatEl  = $("#vola-cat");
  const contribEl  = $("#contrib");
  let recomputeTimer = null;

  function scheduleRecompute(reason) {
    recomp.classList.add("active");
    recompTxt.textContent = `recomputing · ${reason}`;
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => {
      computeAndRender(reason);
    }, 100);
  }

  function computeAndRender(reason) {
    // Cheap deterministic RTP estimate from current pays + weights.
    let payMass = 0;
    SYMBOLS.forEach(s => {
      const p = state.pays[s.id];
      const tierW = { low: 1.0, mid: 0.55, high: 0.18, wild: 0, scatter: 0.22 }[s.tier];
      payMass += (p.x3 * 0.62 + p.x4 * 0.12 + p.x5 * 0.018) * tierW;
    });
    const weightAvg = state.weights.reduce((a,b)=>a+b,0) / 5;
    const rtp = Math.max(82, Math.min(99, 88 + payMass * 0.0086 + (weightAvg - 20) * 0.04));
    const hit = Math.max(15, Math.min(45, 24 + payMass * 0.0009));
    const maxW = Math.round(800 + payMass * 1.4);
    const sigma = 5 + (rtp > 95 ? 4.2 : 2.8) + (payMass - 6000) * 0.0004;
    const volaPips = Math.max(1, Math.min(5, Math.round((sigma - 4) / 2)));

    state.rtp = rtp;
    state.hit = hit;
    state.maxWin = maxW;
    state.vola = volaPips;

    // Animate values
    pulseValue(rtpEl, rtp.toFixed(2), "%");
    pulseValue(hitEl, hit.toFixed(1), "%");
    pulseValue(maxEl, maxW.toLocaleString("en-US").replace(/,/g, " "), "×");

    // Volatility pips
    Array.from(volaPipsEl.children).forEach((pip, i) => {
      pip.classList.toggle("on", i < volaPips);
    });
    const volaCat = volaPips <= 1 ? "LOW" : volaPips <= 2 ? "LOW-MID" : volaPips <= 3 ? "MID" : volaPips <= 4 ? "HIGH" : "EXTREME";
    volaCatEl.textContent = `${volaCat} · σ ${sigma.toFixed(1)}`;

    renderContrib();

    const ms = (0.9 + Math.random() * 1.4).toFixed(1);
    recomp.classList.remove("active");
    recompTxt.textContent = `closed-form · ${ms} ms`;
    statusTime.textContent = ms + " ms";
    const drift = (rtp - 96).toFixed(2);
    statusDrift.textContent = (drift > 0 ? "+" : "") + drift + " pp";
  }

  function pulseValue(el, num, unit) {
    el.classList.add("pulse");
    el.innerHTML = `${num}<span class="unit">${unit}</span>`;
    setTimeout(() => el.classList.remove("pulse"), 380);
  }

  function renderContrib() {
    const contributions = SYMBOLS.map(s => {
      const p = state.pays[s.id];
      const tierW = { low: 1.0, mid: 0.55, high: 0.18, wild: 0, scatter: 0.22 }[s.tier];
      const count = state.reels.reduce((acc, col) => acc + col.filter(x => x === s.id).length, 0);
      const c = (p.x3 * 0.62 + p.x4 * 0.12 + p.x5 * 0.018) * tierW * (1 + count/40);
      return { s, c };
    });
    const total = contributions.reduce((a,b)=>a+b.c,0) || 1;
    contributions.sort((a,b) => b.c - a.c);

    contribEl.innerHTML = contributions.slice(0, 9).map(({s, c}) => {
      const pc = (c / total) * 100;
      const cls = s.tier === "wild" ? "is-wild" : s.tier === "scatter" ? "is-scatter" : "";
      return `
        <div class="contrib-row ${cls}">
          <svg class="glyph" viewBox="0 0 64 64" width="14" height="14"><use href="#g-${s.id}"/></svg>
          <div class="contrib-bar"><i style="width:${Math.max(2, pc * 1.6).toFixed(1)}%"></i></div>
          <span class="pc">${pc.toFixed(1)} %</span>
        </div>
      `;
    }).join("");
  }

  // ----- PLAY tab: spin button + history simulation -------------------------
  const btnSpin = $("#btn-spin");
  const historyEl = $("#history");
  let spinCounter = 42;

  btnSpin.addEventListener("click", () => {
    btnSpin.style.transform = "scale(0.96)";
    setTimeout(() => btnSpin.style.transform = "", 150);

    // Animate reel cells flicker
    $$("#machine .cell").forEach(c => {
      c.style.opacity = "0.4";
      setTimeout(() => c.style.opacity = "1", 250 + Math.random() * 300);
    });

    // Push a new fake history row
    spinCounter++;
    const win = Math.random() < 0.32;
    const amt = win ? (Math.random() * 18 + 0.5).toFixed(2) : "0.00";
    const desc = win
      ? ["3× PRISM · line 2", "4× SHARD · line 9", "5× KEYSTONE · line 7", "Scatter trigger · 8 spins", "3× MERIDIAN · line 5"][Math.floor(Math.random()*5)]
      : "no win";
    const row = document.createElement("div");
    row.className = "hist-row";
    row.innerHTML = `
      <span class="n">#${String(spinCounter).padStart(3,"0")}</span>
      <span class="res ${win ? 'win' : 'loss'}">${desc}</span>
      <span class="amt ${win ? '' : 'zero'}">${win ? '+' + amt : '0.00'}</span>
    `;
    historyEl.prepend(row);
    while (historyEl.children.length > 14) historyEl.removeChild(historyEl.lastChild);
  });

  // ----- CERTIFY tab: MC simulation + downloads -----------------------------
  const btnMc = $("#btn-mc");
  const mcProg = $("#mc-progress > i");
  const mcStat = $("#mc-stat");

  btnMc.addEventListener("click", () => {
    if (btnMc.dataset.running === "1") return;
    btnMc.dataset.running = "1";
    btnMc.textContent = "Running…";
    let p = 0;
    mcStat.innerHTML = `<b>running</b> · 0 / 100 000 spins · ETA 12s`;
    const iv = setInterval(() => {
      p += 2 + Math.random() * 4;
      if (p >= 100) p = 100;
      mcProg.style.width = p + "%";
      const spins = Math.round(p * 1000);
      const eta = Math.max(0, Math.round((100 - p) * 0.12));
      mcStat.innerHTML = `<b>running</b> · ${spins.toLocaleString("en-US")} / 100 000 · ETA ${eta}s`;
      if (p >= 100) {
        clearInterval(iv);
        const finalRtp = (state.rtp + (Math.random() - 0.5) * 0.04).toFixed(3);
        mcStat.innerHTML = `<b style="color:var(--accent)">complete</b> · RTP ${finalRtp}% · 95% CI ±0.06%`;
        btnMc.textContent = "Run MC · 100 000";
        btnMc.dataset.running = "0";
        setTimeout(() => mcProg.style.width = "0%", 600);
      }
    }, 120);
  });

  // Jurisdiction chips
  $$("#juris .juris-chip").forEach(chip => {
    chip.addEventListener("click", () => chip.classList.toggle("on"));
  });

  // Download package — placeholder
  $("#btn-package").addEventListener("click", () => {
    const btn = $("#btn-package");
    const original = btn.innerHTML;
    btn.innerHTML = `Preparing… <span class="filename">bundling 12 artefacts</span>`;
    setTimeout(() => {
      btn.innerHTML = original.replace("Download package", "Ready · click again");
      setTimeout(() => btn.innerHTML = original, 1800);
    }, 900);
  });

  // ----- Init ---------------------------------------------------------------
  renderReels();
  renderPaytable();
  computeAndRender("init");

})();
