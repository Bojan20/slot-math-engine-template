/* =============================================================
   Slot Math Studio · v4-final
   Onyx + cyan engineering dark. Dynamic symbols, ⌘K palette,
   workspaces, persona switcher, IR library, telemetry rail
   (gauge / radar / strip-chart), Bloomberg ticker, 6 tabs.
   No deps. file:// safe.
   ============================================================= */

(() => {
  "use strict";

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ============================================================
     ICON LIBRARY — 40 glyphs (sprite IDs g-<name>)
     ============================================================ */
  const ICON_LIB = [
    // Geometric (10)
    { id: "triangle", name: "Triangle", cat: "geometric" },
    { id: "square",   name: "Square",   cat: "geometric" },
    { id: "pentagon", name: "Pentagon", cat: "geometric" },
    { id: "hexagon",  name: "Hexagon",  cat: "geometric" },
    { id: "octagon",  name: "Octagon",  cat: "geometric" },
    { id: "circle",   name: "Circle",   cat: "geometric" },
    { id: "diamond",  name: "Diamond",  cat: "geometric" },
    { id: "star5",    name: "Star 5pt", cat: "geometric" },
    { id: "star6",    name: "Star 6pt", cat: "geometric" },
    { id: "chevron",  name: "Chevron",  cat: "geometric" },
    // Abstract (10)
    { id: "spiral",   name: "Spiral",   cat: "abstract" },
    { id: "wave",     name: "Wave",     cat: "abstract" },
    { id: "knot",     name: "Knot",     cat: "abstract" },
    { id: "lattice",  name: "Lattice",  cat: "abstract" },
    { id: "prism",    name: "Prism",    cat: "abstract" },
    { id: "shard",    name: "Shard",    cat: "abstract" },
    { id: "crystal",  name: "Crystal",  cat: "abstract" },
    { id: "vortex",   name: "Vortex",   cat: "abstract" },
    { id: "sigil",    name: "Sigil",    cat: "abstract" },
    { id: "orbit",    name: "Orbit",    cat: "abstract" },
    // Symbolic (12)
    { id: "pebble",   name: "Pebble",   cat: "symbolic" },
    { id: "obelisk",  name: "Obelisk",  cat: "symbolic" },
    { id: "keystone", name: "Keystone", cat: "symbolic" },
    { id: "anchor",   name: "Anchor",   cat: "symbolic" },
    { id: "key",      name: "Key",      cat: "symbolic" },
    { id: "gear",     name: "Gear",     cat: "symbolic" },
    { id: "flame",    name: "Flame",    cat: "symbolic" },
    { id: "leaf",     name: "Leaf",     cat: "symbolic" },
    { id: "mountain", name: "Mountain", cat: "symbolic" },
    { id: "sun",      name: "Sun",      cat: "symbolic" },
    { id: "moon",     name: "Moon",     cat: "symbolic" },
    { id: "eye",      name: "Eye",      cat: "symbolic" },
    // Special (8)
    { id: "wild",     name: "Wild",     cat: "special" },
    { id: "scatter",  name: "Scatter",  cat: "special" },
    { id: "bonus",    name: "Bonus",    cat: "special" },
    { id: "mult",     name: "Mult",     cat: "special" },
    { id: "drop",     name: "Drop",     cat: "special" },
    { id: "arrow",    name: "Arrow",    cat: "special" },
    { id: "arc",      name: "Arc",      cat: "special" },
    { id: "sonar",    name: "Sonar",    cat: "special" }
  ];

  const TIER_ORDER = ["HP", "MP", "LP", "WILD", "SCATTER", "MULT"];
  const TIER_DEFAULTS = {
    HP:      { count: 3, defaultIcons: ["keystone", "obelisk", "prism", "shard", "crystal", "sigil", "orbit", "diamond"], defaultNames: ["Sapphire","Ruby","Emerald","Topaz","Onyx","Pearl","Garnet","Opal"], basePay: { x3: 50, x4: 150, x5: 500 } },
    MP:      { count: 3, defaultIcons: ["hexagon", "star5", "octagon", "gear", "sun", "moon", "key", "eye"],              defaultNames: ["Crown","Compass","Coin","Cog","Orbit","Cipher","Vortex","Lyre"], basePay: { x3: 20, x4: 60, x5: 200 } },
    LP:      { count: 3, defaultIcons: ["pebble", "wave", "arc", "chevron", "leaf", "drop", "circle", "knot"],            defaultNames: ["Sphere","Block","Spire","Arc","Bolt","Wave","Drop","Knot"], basePay: { x3: 5, x4: 20, x5: 75 } },
    WILD:    { count: 1, defaultIcons: ["wild", "lattice", "star6"],          defaultNames: ["WILD1","WILD2","WILD3"], basePay: { x3: 0, x4: 0, x5: 0 } },
    SCATTER: { count: 1, defaultIcons: ["scatter", "sonar"],                  defaultNames: ["SCATTER1","SCATTER2"],   basePay: { x3: 5, x4: 20, x5: 100 } },
    MULT:    { count: 1, defaultIcons: ["mult", "bonus", "flame", "vortex"],  defaultNames: ["MULT1","BONUS1","MULT2","BONUS2"], basePay: { x3: 0, x4: 0, x5: 0 } }
  };

  /* ============================================================
     WORKSPACE STATE — per-workspace pool/symbols snapshot
     ============================================================ */
  const newWorkspaceState = (irName) => ({
    irName,
    persona: "math",
    tierCounts: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 1 },
    symbols: [],
    reels: [],
    rtp: 95.42,
    hit: 27.83,
    sigma: 8.41,
    maxWin: 2145,
    vola: 3,
    autoRename: true,
    autoIcon: true,
  });
  const workspaces = {
    wsA: newWorkspaceState("onyx-lattice-v0.4.12"),
    wsB: newWorkspaceState("pearl-dive-v0.2.05"),
    wsC: newWorkspaceState("solar-path-v0.1.18"),
  };
  let activeWs = "wsA";
  let state = workspaces[activeWs];

  let pickerTargetIdx = null;

  /* ============================================================
     PERSONA SWITCHER
     ============================================================ */
  function setPersona(p) {
    state.persona = p;
    document.body.classList.remove("persona-math", "persona-design", "persona-producer");
    document.body.classList.add("persona-" + p);
    $$(".persona-btn").forEach(b => {
      const on = b.dataset.persona === p;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    logActivity(`persona → <b>${p}</b>`);
  }
  $$(".persona-btn").forEach(b => b.addEventListener("click", () => setPersona(b.dataset.persona)));

  /* ============================================================
     TAB ROUTING
     ============================================================ */
  function goToTab(key) {
    $$(".tab").forEach(t => {
      const on = t.dataset.tab === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $$(".panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + key));
  }
  $$(".tab").forEach(btn => btn.addEventListener("click", () => goToTab(btn.dataset.tab)));
  const tabs = $$(".tab");
  tabs.forEach((t, i) => {
    t.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const nx = tabs[(i + dir + tabs.length) % tabs.length];
        nx.focus(); nx.click();
      }
    });
  });

  /* ============================================================
     DYNAMIC SYMBOL POOL
     ============================================================ */
  function buildSymbolPool() {
    const used = new Set();
    const pool = [];
    for (const tier of TIER_ORDER) {
      const count = state.tierCounts[tier] || 0;
      const tdef = TIER_DEFAULTS[tier];
      for (let i = 0; i < count; i++) {
        const id = `${tier}${i + 1}`;
        // preserve existing user-renamed symbol if id+tier match
        const existing = state.symbols.find(s => s.id === id && s.tier === tier);
        if (existing) {
          used.add(existing.icon);
          pool.push(existing);
          continue;
        }
        // first unused default icon
        let icon = tdef.defaultIcons[i % tdef.defaultIcons.length];
        if (used.has(icon) && state.autoIcon) {
          const fallback = ICON_LIB.find(ic => !used.has(ic.id));
          icon = fallback ? fallback.id : icon;
        }
        used.add(icon);
        pool.push({
          tier, id, name: id, icon, weight: 20,
          pay: { ...tdef.basePay }
        });
      }
    }
    state.symbols = pool;
    return pool;
  }
  function autoBuildReels() {
    if (!state.symbols.length) buildSymbolPool();
    const ids = state.symbols.map(s => s.id);
    const reels = [];
    for (let r = 0; r < 5; r++) {
      const col = [];
      for (let p = 0; p < 8; p++) col.push(ids[(r * 3 + p * 2) % ids.length]);
      reels.push(col);
    }
    state.reels = reels;
  }
  function rebuildTierTotal() {
    const total = TIER_ORDER.reduce((a, t) => a + (state.tierCounts[t] || 0), 0);
    $("#tier-total").textContent = total;
    $("#tier-total-2").textContent = total + " symbols";
  }

  $$("#tier-cfg input[type='range']").forEach(s => {
    s.addEventListener("input", () => {
      const tier = s.dataset.tier;
      const v = parseInt(s.value, 10);
      state.tierCounts[tier] = v;
      $(`[data-tier-v="${tier}"]`).textContent = v;
      rebuildTierTotal();
      buildSymbolPool();
      renderSymTable();
      renderPaytable();
      autoBuildReels();
      renderReels();
      scheduleRecompute(`tier Δ ${tier} → ${v}`);
      logActivity(`pool.${tier} → <b>${v}</b> · ${state.symbols.length} symbols`);
    });
  });
  $("#auto-rename").addEventListener("change", e => { state.autoRename = e.target.checked; });
  $("#auto-icon").addEventListener("change", e => { state.autoIcon = e.target.checked; });
  $("#naming-default").addEventListener("click", () => {
    state.symbols.forEach(s => { s.name = s.id; });
    renderSymTable(); renderPaytable();
    logActivity("naming reset · default HP1/MP1/LP1");
  });

  /* ============================================================
     SYMBOL TABLE
     ============================================================ */
  const symTableBody = $("#sym-table-body");
  function renderSymTable() {
    symTableBody.innerHTML = state.symbols.map((s, i) => `
      <tr data-i="${i}">
        <td><span class="tier-pill t-${s.tier}">${s.tier}</span></td>
        <td><input class="sym-id" value="${s.id}" data-i="${i}" data-field="id"/></td>
        <td><input class="sym-name" value="${s.name}" data-i="${i}" data-field="name"/></td>
        <td>
          <button class="sym-icon-btn" data-i="${i}" title="Click to swap icon">
            <svg><use href="#g-${s.icon}"/></svg>
          </button>
        </td>
        <td>
          <div class="weight-cell">
            <input type="range" min="5" max="50" value="${s.weight}" data-i="${i}" data-field="weight"/>
            <span class="v">${s.weight.toFixed(1)}%</span>
          </div>
        </td>
      </tr>
    `).join("");

    $$('#sym-table-body input[data-field="id"]').forEach(el => {
      el.addEventListener("change", () => {
        const i = +el.dataset.i;
        state.symbols[i].id = el.value || state.symbols[i].id;
        renderPaytable(); renderReels();
        logActivity(`renamed ID → <b>${el.value}</b>`);
      });
    });
    $$('#sym-table-body input[data-field="name"]').forEach(el => {
      el.addEventListener("change", () => {
        const i = +el.dataset.i;
        state.symbols[i].name = el.value || state.symbols[i].name;
        renderPaytable();
        logActivity(`symbol ${state.symbols[i].id} → <b>${el.value}</b>`);
      });
    });
    $$('#sym-table-body input[data-field="weight"]').forEach(el => {
      el.addEventListener("input", () => {
        const i = +el.dataset.i;
        state.symbols[i].weight = +el.value;
        el.nextElementSibling.textContent = (+el.value).toFixed(1) + "%";
        scheduleRecompute(`weight ${state.symbols[i].id} → ${el.value}`);
      });
    });
    $$('#sym-table-body .sym-icon-btn').forEach(btn => {
      btn.addEventListener("click", () => openPicker(+btn.dataset.i));
    });
  }

  /* ============================================================
     PAYTABLE
     ============================================================ */
  const paytableBody = $("#paytable tbody");
  function renderPaytable() {
    paytableBody.innerHTML = state.symbols.filter(s => s.tier !== "WILD" && s.tier !== "MULT").map(s => {
      const orig = state.symbols.indexOf(s);
      const p = s.pay;
      const isSct = s.tier === "SCATTER";
      const hr = approxHitRate(s);
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <svg style="width:18px;height:18px;color:var(--text-1);"><use href="#g-${s.icon}"/></svg>
              <span class="tier-pill t-${s.tier}">${s.tier}</span>
              <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-0);">${s.name}</span>
              ${isSct ? '<span class="mono" style="font-size:9px;color:var(--rose);">SCATTER</span>' : ''}
            </div>
          </td>
          <td><input class="sym-id" data-i="${orig}" data-pay="x3" value="${p.x3}"/></td>
          <td><input class="sym-id" data-i="${orig}" data-pay="x4" value="${p.x4}"/></td>
          <td><input class="sym-id" data-i="${orig}" data-pay="x5" value="${p.x5}"/></td>
          <td style="color:var(--text-2);font-family:var(--font-mono);font-size:10px;">${hr}</td>
        </tr>
      `;
    }).join("");
    $$('#paytable input[data-pay]').forEach(el => {
      el.addEventListener("input", () => {
        const v = parseInt(el.value, 10); if (!isFinite(v)) return;
        state.symbols[+el.dataset.i].pay[el.dataset.pay] = v;
        scheduleRecompute(`pay Δ ${state.symbols[+el.dataset.i].id} ${el.dataset.pay}`);
      });
    });
  }
  function approxHitRate(sym) {
    const base = { HP: 1.8, MP: 4.2, LP: 8.5, SCATTER: 0.6 }[sym.tier] || 1.0;
    return (base + sym.weight * 0.02).toFixed(2) + "%";
  }

  /* ============================================================
     REELS RENDER (with pmf micro-label per cell)
     ============================================================ */
  const reelsRoot = $("#reels");
  function renderReels() {
    reelsRoot.innerHTML = "";
    const totalW = state.symbols.reduce((a, s) => a + s.weight, 0) || 1;
    state.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      const reelSum = col.reduce((a, sid) => {
        const sym = state.symbols.find(x => x.id === sid);
        return a + (sym ? sym.weight : 0);
      }, 0);
      reel.innerHTML = `
        <div class="reel-head"><span>REEL ${ri+1}</span><span>${col.length} pos</span></div>
        <div class="reel-cells" id="reel-cells-${ri}"></div>
        <div class="reel-foot"><span>Σ weight</span><b>${reelSum.toFixed(1)}</b></div>
      `;
      reelsRoot.appendChild(reel);
      const cellsEl = reel.querySelector(`#reel-cells-${ri}`);
      col.forEach((sid, pi) => {
        const sym = state.symbols.find(s => s.id === sid);
        const cell = document.createElement("div");
        cell.className = "reel-cell";
        if (sym) cell.classList.add("is-" + sym.tier);
        const pmf = sym ? ((sym.weight / totalW) * 100).toFixed(1) : "—";
        cell.innerHTML = sym
          ? `<span class="pos">${pi+1}</span><svg><use href="#g-${sym.icon}"/></svg><span class="pmf">${pmf}%</span>`
          : `<span class="pos">${pi+1}</span>·`;
        cellsEl.appendChild(cell);
      });
    });
  }

  /* ============================================================
     LIVE RECOMPUTE — RTP, σ, hit, maxWin
     ============================================================ */
  let recomputeTimer = null, prevRtp = 95.42;
  function scheduleRecompute(reason) {
    $("#notif-recompute").textContent = "recomputing…";
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => compute(reason), 110);
  }
  function compute(reason) {
    let payMass = 0;
    state.symbols.forEach(s => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0, SCATTER: 0.22, MULT: 0.08 }[s.tier] || 0;
      payMass += (s.pay.x3 * 0.62 + s.pay.x4 * 0.12 + s.pay.x5 * 0.018) * tW;
    });
    const wAvg = state.symbols.reduce((a, s) => a + s.weight, 0) / Math.max(1, state.symbols.length);
    const rtp  = Math.max(82, Math.min(99, 88 + payMass * 0.0086 + (wAvg - 20) * 0.04));
    const hit  = Math.max(15, Math.min(45, 24 + payMass * 0.0009));
    const maxW = Math.round(800 + payMass * 1.4);
    const sigma = 5 + (rtp > 95 ? 4.2 : 2.8) + (payMass - 6000) * 0.0004;
    const pips = Math.max(1, Math.min(5, Math.round((sigma - 4) / 2)));
    const dRtp = rtp - prevRtp; prevRtp = rtp;

    state.rtp = rtp; state.hit = hit; state.maxWin = maxW; state.vola = pips; state.sigma = sigma;

    // global status row
    $("#gs-rtp").textContent = rtp.toFixed(2) + "%";
    $("#gs-rtp-delta").className = "par-delta " + (dRtp >= 0 ? "up" : "down");
    $("#gs-rtp-delta").textContent = (dRtp >= 0 ? "↗ +" : "↘ ") + dRtp.toFixed(2);
    $("#gs-sigma").textContent = sigma.toFixed(2);
    $("#gs-hit").textContent   = hit.toFixed(2) + "%";
    $("#gs-max").textContent   = maxW.toLocaleString("en-US").replace(/,/g, " ") + "×";
    $("#gs-vola").textContent  = pips <= 1 ? "LOW" : pips <= 2 ? "LOW-MID" : pips <= 3 ? "MID" : pips <= 4 ? "HIGH" : "EXTREME";

    // metrics rail
    $("#mr-rtp").innerHTML = rtp.toFixed(2) + '<span class="unit">%</span>';
    $("#mr-vola").textContent = $("#gs-vola").textContent + " · σ " + sigma.toFixed(1);
    $("#mr-hit").textContent  = hit.toFixed(2) + "%";

    // gauge — sweep arc from 88% to 99%
    const pct = Math.max(0, Math.min(1, (rtp - 88) / (99 - 88)));
    updateGauge(pct, rtp);

    // radar
    updateRadar(sigma, rtp, hit, payMass);

    // strip-chart (hit-freq last 64 spins, mock with rtp anchored)
    updateSpark();

    // contribution
    renderContrib();

    const ms = (0.9 + Math.random() * 1.4).toFixed(1);
    $("#gs-time").textContent = ms + " ms";
    $("#status-time").textContent = ms + " ms";
    $("#health-recompute").textContent = ms + " ms";
    $("#notif-recompute").innerHTML = '<b>' + ms + ' ms</b>';

    const drift = (rtp - 96).toFixed(2);
    $("#gs-drift").textContent = (drift > 0 ? "+" : "") + drift + " pp";
    $("#status-drift").textContent = (drift > 0 ? "+" : "") + drift + " pp";
  }

  /* ============================================================
     GAUGE — sweep semi-circle arc with RTP
     ============================================================ */
  function updateGauge(pct, rtp) {
    const arc = $("#gauge-arc");
    if (!arc) return;
    // Sweep along path 18,90 → 182,90 (radius 80)
    const startX = 18, startY = 90;
    const angleDeg = 180 - pct * 180;
    const rad = angleDeg * Math.PI / 180;
    const cx = 100, cy = 90, r = 80;
    const endX = cx + r * Math.cos(rad);
    const endY = cy - r * Math.sin(rad);
    const largeArc = pct > 0.5 ? 1 : 0;
    arc.setAttribute("d", `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`);
    arc.setAttribute("stroke-dasharray", "none");
    $("#gauge-text").textContent = rtp.toFixed(2) + "%";
  }

  /* ============================================================
     RADAR — 5-axis polygon (σ, P99, skew, hit, kurt)
     ============================================================ */
  function updateRadar(sigma, rtp, hit, payMass) {
    const cx = 50, cy = 50;
    const axes = [
      { ang: -90, val: Math.min(1, sigma / 14) },        // σ (top)
      { ang: -18, val: Math.min(1, (payMass / 14000)) }, // P99 (top-right)
      { ang:  54, val: Math.min(1, 0.4 + (rtp - 90) * 0.06) }, // skew (bot-right)
      { ang: 126, val: Math.min(1, hit / 40) },          // hit (bot-left)
      { ang: 198, val: Math.min(1, sigma / 12 + 0.1) },  // kurt (top-left)
    ];
    const R = 42;
    const pts = axes.map(a => {
      const rad = a.ang * Math.PI / 180;
      const x = cx + R * a.val * Math.cos(rad);
      const y = cy + R * a.val * Math.sin(rad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    $("#radar-poly").setAttribute("points", pts);
  }

  /* ============================================================
     STRIP-CHART (hit freq · last 64 spins, mock w/ noise)
     ============================================================ */
  const spinHistory = [];
  for (let i = 0; i < 64; i++) spinHistory.push(0.28 + (Math.random() - 0.5) * 0.18);
  function updateSpark() {
    // create wave around current hit rate
    spinHistory.shift();
    spinHistory.push(Math.max(0.1, Math.min(0.45, state.hit / 100 + (Math.random() - 0.5) * 0.04)));
    const W = 200, H = 60;
    const pts = spinHistory.map((v, i) => {
      const x = (i / (spinHistory.length - 1)) * W;
      const y = H - (v / 0.5) * H;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const linePath = "M" + pts.join(" L ");
    const fillPath = linePath + ` L ${W} ${H} L 0 ${H} Z`;
    $("#spark-line").setAttribute("d", linePath);
    $("#spark-fill").setAttribute("d", fillPath);
  }

  /* ============================================================
     CONTRIBUTION (top 7 by RTP share)
     ============================================================ */
  function renderContrib() {
    const C = state.symbols.map(s => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0, SCATTER: 0.22, MULT: 0.08 }[s.tier] || 0;
      return { s, c: (s.pay.x3 * 0.62 + s.pay.x4 * 0.12 + s.pay.x5 * 0.018) * tW * (1 + s.weight / 40) };
    });
    const tot = C.reduce((a, b) => a + b.c, 0) || 1;
    C.sort((a, b) => b.c - a.c);
    $("#mr-contrib").innerHTML = C.slice(0, 7).map(({ s, c }) => {
      const pc = (c / tot) * 100;
      return `<div class="contrib-row is-${s.tier}">
        <svg class="glyph"><use href="#g-${s.icon}"/></svg>
        <span class="lbl">${s.id}</span>
        <div class="bar"><i style="width:${Math.max(3, pc * 1.4).toFixed(1)}%"></i></div>
        <span class="pc">${pc.toFixed(1)}%</span>
      </div>`;
    }).join("");
  }

  /* ============================================================
     ICON PICKER MODAL
     ============================================================ */
  const pickerOverlay = $("#picker-overlay");
  const pickerGrid    = $("#picker-grid");
  const pickerSub     = $("#picker-sub");
  let pickerCat = "all";

  function renderPickerGrid() {
    const used = new Set(state.symbols.map(s => s.icon));
    pickerGrid.innerHTML = ICON_LIB
      .filter(ic => pickerCat === "all" || ic.cat === pickerCat)
      .map(ic => `
        <button class="picker-cell ${used.has(ic.id) ? 'is-used' : ''}" data-icon="${ic.id}">
          <svg><use href="#g-${ic.id}"/></svg>
          <span class="nm">${ic.name}</span>
        </button>
      `).join("");
    $$("#picker-grid .picker-cell").forEach(btn => {
      btn.addEventListener("click", () => {
        if (pickerTargetIdx === null) return closePicker();
        const i = pickerTargetIdx;
        state.symbols[i].icon = btn.dataset.icon;
        renderSymTable(); renderPaytable(); renderReels();
        scheduleRecompute(`icon ${state.symbols[i].id} → ${btn.dataset.icon}`);
        logActivity(`icon ${state.symbols[i].id} → <b>${btn.dataset.icon}</b>`);
        closePicker();
      });
    });
  }
  function openPicker(idx) {
    pickerTargetIdx = idx;
    const sym = state.symbols[idx];
    pickerSub.innerHTML = `for <b class="cyan">${sym.id}</b> · 40 icons in library`;
    pickerOverlay.classList.add("is-open");
    pickerOverlay.setAttribute("aria-hidden", "false");
    renderPickerGrid();
    setTimeout(() => $$("#picker-grid .picker-cell")[0]?.focus(), 30);
  }
  function closePicker() {
    pickerOverlay.classList.remove("is-open");
    pickerOverlay.setAttribute("aria-hidden", "true");
    pickerTargetIdx = null;
  }
  $("#picker-close").addEventListener("click", closePicker);
  pickerOverlay.addEventListener("click", e => { if (e.target === pickerOverlay) closePicker(); });
  $$("#picker-cats .picker-cat").forEach(b => {
    b.addEventListener("click", () => {
      $$("#picker-cats .picker-cat").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      pickerCat = b.dataset.cat;
      renderPickerGrid();
    });
  });

  /* ============================================================
     COMMAND PALETTE (⌘K) · 35 commands
     ============================================================ */
  const cmdpOverlay = $("#cmdp-overlay");
  const cmdpInput   = $("#cmdp-input");
  const cmdpResults = $("#cmdp-results");

  const CMDS = [
    // nav (6)
    { cat: "Navigation", t: "Open Build",       d: "tab 01 · symbol pool & reels", k: "01", action: () => goToTab("build") },
    { cat: "Navigation", t: "Open Compose",     d: "tab 02 · feature graph",       k: "02", action: () => goToTab("compose") },
    { cat: "Navigation", t: "Open Catalog",     d: "tab 03 · 97 P-IDs",            k: "03", action: () => goToTab("catalog") },
    { cat: "Navigation", t: "Open Play",        d: "tab 04 · renderer + replay",   k: "04", action: () => goToTab("play") },
    { cat: "Navigation", t: "Open Sensitivity", d: "tab 05 · sweep + heatmap",     k: "05", action: () => goToTab("sensitivity") },
    { cat: "Navigation", t: "Open Certify",     d: "tab 06 · GLI-16 PAR",          k: "06", action: () => goToTab("certify") },

    // actions (8)
    { cat: "Actions", t: "Recompute RTP",       d: "force closed-form recompute", k: "⌘R", action: () => scheduleRecompute("manual") },
    { cat: "Actions", t: "Run MC · 100K spins", d: "quick validation",            k: "",   action: () => { goToTab("certify"); setMc(100000); } },
    { cat: "Actions", t: "Run MC · 1M spins",   d: "standard validation",         k: "",   action: () => { goToTab("certify"); setMc(1000000); } },
    { cat: "Actions", t: "Run MC · 10M spins",  d: "deep validation",             k: "",   action: () => { goToTab("certify"); setMc(10000000); } },
    { cat: "Actions", t: "Run MC · 1B spins",   d: "regulator-grade",             k: "",   action: () => { goToTab("certify"); setMc(1000000000); } },
    { cat: "Actions", t: "Export IR",           d: "download onyx-lattice.json",  k: "⌘E", action: () => stubButton($("#btn-export")) },
    { cat: "Actions", t: "Download operator-package.zip", d: "153 files · regulator", k: "", action: () => goToTab("certify") },
    { cat: "Actions", t: "Save workspace",      d: "snapshot to disk",            k: "⌘S", action: () => stubButton($("#btn-save")) },

    // persona (3)
    { cat: "Persona", t: "Switch to Math",     d: "full numeric density",     k: "", action: () => setPersona("math") },
    { cat: "Persona", t: "Switch to Design",   d: "theme + symbol upscale",   k: "", action: () => setPersona("design") },
    { cat: "Persona", t: "Switch to Producer", d: "KPI strip + market view",  k: "", action: () => setPersona("producer") },

    // ws (4)
    { cat: "Workspaces", t: "Switch · Lava Falls",  d: "wsA · onyx-lattice", k: "", action: () => switchWs("wsA") },
    { cat: "Workspaces", t: "Switch · Pearl Dive",  d: "wsB · pearl-dive",   k: "", action: () => switchWs("wsB") },
    { cat: "Workspaces", t: "Switch · Solar Path",  d: "wsC · solar-path",   k: "", action: () => switchWs("wsC") },
    { cat: "Workspaces", t: "New workspace",        d: "fresh state",        k: "", action: () => { workspaces["wsD"] = newWorkspaceState("new-ir-v0.1"); switchWs("wsD"); } },

    // L&W gaps (16)
    ...Array.from({length: 16}, (_, i) => {
      const m = "M" + (i+1);
      const titles = [
        "Dragon Spin CrossLink Water","Huff N' Puff frame","Ultimate Fire Link","Dancing Drums",
        "Quick Hit mystery","Triple Cash Wheel","Spartacus Colossal","Goldfish Race",
        "Big Bet UK","RR Megaways Bonus Bank","Player-elects Composition","Munchkinland inject",
        "WOZ YBR Glinda","LOTR Two Towers","Rich Piggies pots","Stellar Jackpots"
      ];
      return { cat: "L&W gaps", t: `${m} · ${titles[i]}`, d: `W${181 + i} · catalog detail`, k: "",
               action: () => { goToTab("catalog"); selectPattern("P-" + String(i+1).padStart(3, "0")); } };
    }),

    // sym (4)
    { cat: "Symbols", t: "Add HP slot",      d: "increase HP count",      k: "", action: () => bumpTier("HP", 1) },
    { cat: "Symbols", t: "Remove HP slot",   d: "decrease HP count",      k: "", action: () => bumpTier("HP", -1) },
    { cat: "Symbols", t: "Add WILD",         d: "+1 wild substitution",   k: "", action: () => bumpTier("WILD", 1) },
    { cat: "Symbols", t: "Reset pool",       d: "default 3·3·3·1·1·1",    k: "", action: () => resetPool() },

    // ir (5)
    { cat: "IR Library", t: "Load · 5x3-20lines.ir",      d: "classic rect 20L",    k: "", action: () => loadIR("5x3-20lines") },
    { cat: "IR Library", t: "Load · cluster-7x7-base.ir", d: "cluster pays",         k: "", action: () => loadIR("cluster-7x7") },
    { cat: "IR Library", t: "Load · hnw-markov-21x4.ir",  d: "hold & win Markov",    k: "", action: () => loadIR("hnw-markov-21x4") },
    { cat: "IR Library", t: "Load · fs-cascade-v3.ir",    d: "free spins cascade",   k: "", action: () => loadIR("fs-cascade-v3") },
    { cat: "IR Library", t: "Load · megaways-117649.ir",  d: "variable rows",        k: "", action: () => loadIR("megaways-117649") },

    // export (2)
    { cat: "Export", t: "Download operator-package.zip", d: "regulator bundle", k: "", action: () => stubButton($("#btn-package")) },
    { cat: "Export", t: "Save IR snapshot",              d: "commit local",     k: "⌘S", action: () => stubButton($("#btn-save")) },

    // util (3)
    { cat: "Utility", t: "Reset metrics",      d: "clear deltas",  k: "", action: () => scheduleRecompute("reset") },
    { cat: "Utility", t: "Toggle telemetry",   d: "right rail",    k: "⌘\\", action: () => $("#metrics-rail").classList.toggle("is-collapsed") },
    { cat: "Utility", t: "Close palette",      d: "esc",           k: "ESC", action: () => closeCmdp() },
  ];

  let cmdpFiltered = CMDS.slice();
  let cmdpActiveIdx = 0;

  function renderCmdpResults() {
    if (!cmdpFiltered.length) {
      cmdpResults.innerHTML = `<div style="padding:18px 14px;color:var(--text-2);font-family:var(--font-mono);font-size:11px;">no matches</div>`;
      return;
    }
    let html = "", lastCat = "";
    cmdpFiltered.forEach((c, i) => {
      if (c.cat !== lastCat) { html += `<div class="cmdp-cat">${c.cat}</div>`; lastCat = c.cat; }
      html += `<div class="cmdp-item ${i === cmdpActiveIdx ? 'is-active' : ''}" data-i="${i}">
        <span class="gl">›</span>
        <span class="t">${c.t}</span>
        <span class="desc">${c.d || ''}</span>
        <span class="kb">${c.k || ''}</span>
      </div>`;
    });
    cmdpResults.innerHTML = html;
    $$("#cmdp-results .cmdp-item").forEach(el => {
      el.addEventListener("mouseenter", () => {
        cmdpActiveIdx = +el.dataset.i;
        $$("#cmdp-results .cmdp-item").forEach(x => x.classList.toggle("is-active", +x.dataset.i === cmdpActiveIdx));
      });
      el.addEventListener("click", () => executeCmd(cmdpFiltered[+el.dataset.i]));
    });
  }
  function executeCmd(c) {
    if (!c) return;
    closeCmdp();
    try { c.action && c.action(); } catch (e) { /* swallow */ }
    logActivity(`cmd · <b>${c.t}</b>`);
  }
  function openCmdp() {
    cmdpOverlay.classList.add("is-open");
    cmdpOverlay.setAttribute("aria-hidden", "false");
    cmdpInput.value = "";
    cmdpFiltered = CMDS.slice();
    cmdpActiveIdx = 0;
    renderCmdpResults();
    setTimeout(() => cmdpInput.focus(), 30);
  }
  function closeCmdp() {
    cmdpOverlay.classList.remove("is-open");
    cmdpOverlay.setAttribute("aria-hidden", "true");
  }
  $("#btn-cmdp").addEventListener("click", openCmdp);
  cmdpOverlay.addEventListener("click", e => { if (e.target === cmdpOverlay) closeCmdp(); });
  cmdpInput.addEventListener("input", () => {
    const q = cmdpInput.value.toLowerCase().trim();
    cmdpFiltered = q
      ? CMDS.filter(c => (c.t + " " + c.d + " " + c.cat).toLowerCase().includes(q))
      : CMDS.slice();
    cmdpActiveIdx = 0;
    renderCmdpResults();
  });
  cmdpInput.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cmdpActiveIdx = Math.min(cmdpFiltered.length - 1, cmdpActiveIdx + 1);
      renderCmdpResults();
      // scroll active into view
      const el = $$("#cmdp-results .cmdp-item")[cmdpActiveIdx];
      el && el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cmdpActiveIdx = Math.max(0, cmdpActiveIdx - 1);
      renderCmdpResults();
      const el = $$("#cmdp-results .cmdp-item")[cmdpActiveIdx];
      el && el.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeCmd(cmdpFiltered[cmdpActiveIdx]);
    } else if (e.key === "Escape") {
      closeCmdp();
    }
  });
  window.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      cmdpOverlay.classList.contains("is-open") ? closeCmdp() : openCmdp();
    }
    if (e.key === "Escape") {
      if (cmdpOverlay.classList.contains("is-open")) closeCmdp();
      if (pickerOverlay.classList.contains("is-open")) closePicker();
      const j = $("#juris-overlay"); if (j && j.classList.contains("is-open")) j.classList.remove("is-open");
    }
  });

  /* helpers for palette */
  function bumpTier(tier, delta) {
    const slider = $(`#tier-cfg input[data-tier="${tier}"]`);
    if (!slider) return;
    const min = +slider.min, max = +slider.max;
    const nx = Math.max(min, Math.min(max, +slider.value + delta));
    slider.value = nx;
    slider.dispatchEvent(new Event("input"));
  }
  function resetPool() {
    state.tierCounts = { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 1 };
    state.symbols = [];
    $$("#tier-cfg input[type='range']").forEach(s => {
      s.value = state.tierCounts[s.dataset.tier];
      $(`[data-tier-v="${s.dataset.tier}"]`).textContent = s.value;
    });
    rebuildTierTotal();
    buildSymbolPool(); renderSymTable(); renderPaytable();
    autoBuildReels(); renderReels();
    scheduleRecompute("pool reset");
  }
  function loadIR(name) {
    $("#ctx-ir").textContent = name + ".ir";
    logActivity(`ir.load <b>${name}</b>`);
    scheduleRecompute("ir loaded");
  }
  function setMc(n) {
    $$(".mc-size").forEach(x => x.classList.toggle("is-active", +x.dataset.mc === n));
    $("#btn-mc").textContent = "Run · " + formatMC(n) + " spins";
  }

  /* ============================================================
     WORKSPACE SWITCHER (top pills + lib rail mirror)
     ============================================================ */
  function switchWs(id) {
    if (!workspaces[id]) workspaces[id] = newWorkspaceState(id + "-v0.1");
    activeWs = id;
    state = workspaces[id];
    $$(".ws-pill").forEach(p => p.classList.toggle("is-active", p.dataset.ws === id));
    // sync sliders
    $$("#tier-cfg input[type='range']").forEach(s => {
      s.value = state.tierCounts[s.dataset.tier];
      $(`[data-tier-v="${s.dataset.tier}"]`).textContent = s.value;
    });
    rebuildTierTotal();
    if (!state.symbols.length) buildSymbolPool();
    if (!state.reels.length) autoBuildReels();
    renderSymTable(); renderPaytable(); renderReels();
    $("#ctx-ir").textContent = state.irName;
    setPersona(state.persona);
    compute("workspace switch");
    logActivity(`workspace.switch <b>${id}</b>`);
  }
  $$(".ws-pill").forEach(p => p.addEventListener("click", () => switchWs(p.dataset.ws)));
  $("#ws-pill-add").addEventListener("click", () => {
    const ks = Object.keys(workspaces);
    const id = "ws" + String.fromCharCode(65 + ks.length);
    workspaces[id] = newWorkspaceState("new-ir-" + id.toLowerCase() + "-v0.1");
    // create pill UI
    const btn = document.createElement("button");
    btn.className = "ws-pill";
    btn.dataset.ws = id;
    btn.innerHTML = `<span class="dot"></span>WS ${id.slice(-1)}`;
    btn.addEventListener("click", () => switchWs(id));
    $("#ws-pill-add").before(btn);
    switchWs(id);
  });

  /* ============================================================
     IR LIBRARY TREE (left rail) — from data/ir-library.json mirror
     ============================================================ */
  const IR_TREE = [
    {
      label: "Workspaces", children: [
        { label: "Lava Falls",  type: "workspace", id: "wsA", active: true },
        { label: "Pearl Dive",  type: "workspace", id: "wsB" },
        { label: "Solar Path",  type: "workspace", id: "wsC" },
        { label: "+ New workspace", type: "ws-new" }
      ]
    },
    {
      label: "IR Library", children: [
        { label: "5×3 classic", folder: true, children: [
          { label: "5x3-20lines.ir" }, { label: "5x3-50lines.ir" },
          { label: "5x3-243ways.ir" }, { label: "5x3-classic-hold.ir" }
        ]},
        { label: "6×4 + Megaways", folder: true, children: [
          { label: "6x4-4096ways.ir" }, { label: "megaways-117649.ir" }, { label: "megaways-bank.ir" }
        ]},
        { label: "7×7 cluster", folder: true, children: [
          { label: "cluster-7x7-base.ir" }, { label: "cluster-7x7-cascade.ir" }, { label: "cluster-variable.ir" }
        ]},
        { label: "Cascade", folder: true, children: [
          { label: "cascade-5x4.ir" }, { label: "cascade-cluster.ir" }
        ]},
        { label: "Hold & Win", folder: true, children: [
          { label: "hnw-markov-21x4.ir" }, { label: "hnw-multipot.ir" }
        ]},
        { label: "Free Spins", folder: true, children: [
          { label: "fs-cascade-v3.ir" }, { label: "fs-multiplier-seq.ir" }
        ]}
      ]
    },
    {
      label: "L&W Templates (16)", children: [
        { label: "M1 · Dragon Spin CrossLink", tag: "L&W" },
        { label: "M2 · Huff N' Puff frame",    tag: "L&W" },
        { label: "M3 · Ultimate Fire Link",    tag: "L&W" },
        { label: "M4 · Dancing Drums",         tag: "L&W" },
        { label: "M5 · Quick Hit mystery",     tag: "L&W" },
        { label: "M6 · Triple Cash Wheel",     tag: "Bally" },
        { label: "M7 · Spartacus Colossal",    tag: "WMS" },
        { label: "M8 · Goldfish Race",         tag: "WMS" },
        { label: "M9 · Big Bet UK package",    tag: "L&W" },
        { label: "M10 · RR Megaways Bonus Bank", tag: "RT" },
        { label: "M11 · Player-elects Compose", tag: "L&W" },
        { label: "M12 · Munchkinland inject",  tag: "WMS" },
        { label: "M13 · WOZ YBR Glinda",       tag: "WMS" },
        { label: "M14 · LOTR Two Towers",      tag: "L&W" },
        { label: "M15 · Rich Piggies pots",    tag: "WMS" },
        { label: "M16 · Stellar Jackpots",     tag: "LB" }
      ]
    },
    {
      label: "Recent Files", children: [
        { label: "onyx-lattice-v0.4.12", meta: "14m ago" },
        { label: "cascade-cluster.ir",   meta: "1h ago"  },
        { label: "hnw-markov-21x4.ir",   meta: "yesterday" }
      ]
    },
    {
      label: "Pinned", children: [
        { label: "★ Lava Falls (master)" },
        { label: "★ 5x3-classic-hold.ir" }
      ]
    }
  ];
  function renderLibTree() {
    const root = $("#lib-tree");
    let html = "";
    IR_TREE.forEach(sec => {
      html += `<div class="lib-section"><div class="lib-section-h"><span>${sec.label}</span><span class="meta">${sec.children.length}</span></div><div class="lib-section-body">`;
      sec.children.forEach(node => {
        if (node.folder) {
          html += `<div class="lib-folder">${node.label}<span></span></div><div class="lib-folder-body">`;
          node.children.forEach(c => {
            html += `<div class="lib-leaf" data-leaf="${c.label}">${c.label}<span class="lib-meta">${c.meta || ''}</span></div>`;
          });
          html += `</div>`;
        } else {
          const active = node.active ? "is-active" : "";
          const tag = node.tag ? `<span class="lib-tag">${node.tag}</span>` : "";
          const meta = node.meta ? `<span class="lib-meta">${node.meta}</span>` : "";
          html += `<div class="lib-leaf ${active}" data-leaf="${node.label}" data-ws="${node.id || ''}">${node.label}${tag}${meta}</div>`;
        }
      });
      html += `</div></div>`;
    });
    root.innerHTML = html;
    $$(".lib-folder").forEach(f => {
      f.addEventListener("click", () => f.classList.toggle("is-collapsed"));
    });
    $$(".lib-leaf").forEach(l => {
      l.addEventListener("click", () => {
        const wsId = l.dataset.ws;
        if (wsId) return switchWs(wsId);
        $$(".lib-leaf").forEach(x => x.classList.remove("is-active"));
        l.classList.add("is-active");
        const name = (l.textContent || "").trim().split("\n")[0];
        $("#ctx-ir").textContent = name;
        logActivity(`ir.load <b>${name}</b>`);
        scheduleRecompute("ir " + name);
      });
    });
  }
  renderLibTree();

  $("#lib-search").addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    $$(".lib-leaf").forEach(l => {
      const ok = !q || (l.textContent || "").toLowerCase().includes(q);
      l.style.display = ok ? "" : "none";
    });
  });

  /* ============================================================
     ACTIVITY LOG (left rail + bottom panel)
     ============================================================ */
  const libActivityEl = $("#lib-activity");
  const bottomLogEl = $("#bp-log");
  function logActivity(msg) {
    const now = new Date();
    const t = now.toTimeString().slice(0, 5);
    // left-rail entry
    const row = document.createElement("div");
    row.className = "lib-act-row";
    row.innerHTML = `<span class="t">${t}</span><span class="msg">${msg}</span>`;
    libActivityEl.prepend(row);
    while (libActivityEl.children.length > 12) libActivityEl.removeChild(libActivityEl.lastChild);
    // bottom panel
    const span = document.createElement("span");
    span.innerHTML = `[${t}:00] ${msg.replace(/<\/?b>/g, m => m === "<b>" ? "<b>" : "</b>")}`;
    bottomLogEl.prepend(span);
    while (bottomLogEl.children.length > 8) bottomLogEl.removeChild(bottomLogEl.lastChild);
  }
  // seed log
  [
    { t: "14:02", m: 'W196 pinned · <b>bf9b1be</b>' },
    { t: "14:01", m: 'MC <b>1M</b> · 95.413% · <span class="ok">CI ±0.018%</span>' },
    { t: "14:00", m: 'pool.HP 3→4 · paytable regen' },
    { t: "13:58", m: 'workspace.switch <b>Lava Falls</b>' },
    { t: "13:57", m: 'ir.load onyx-lattice-v0.4.12' },
    { t: "13:55", m: 'CI gate W196 · <span class="ok">PASS</span>' },
    { t: "13:50", m: 'L&W M6 closed · <span class="ok">100% cov</span>' },
    { t: "13:42", m: 'IR validated · 0 errors' },
  ].forEach(e => {
    const row = document.createElement("div");
    row.className = "lib-act-row";
    row.innerHTML = `<span class="t">${e.t}</span><span class="msg">${e.m}</span>`;
    libActivityEl.appendChild(row);
  });

  /* ============================================================
     CATALOG — 97 patterns + 16 L&W chips
     ============================================================ */
  const LW_GAPS = [
    { m: "M1",  title: "Dragon Spin CrossLink Water",     wave: "W181", pin: "a1b2c3d" },
    { m: "M2",  title: "Huff N' Puff frame upgrade",      wave: "W182", pin: "b2c3d4e" },
    { m: "M3",  title: "Ultimate Fire Link grid-expand",  wave: "W183", pin: "c3d4e5f" },
    { m: "M4",  title: "Dancing Drums Explosion",         wave: "W184", pin: "d4e5f6a" },
    { m: "M5",  title: "Quick Hit reel-bound mystery",    wave: "W185", pin: "e5f6a7b" },
    { m: "M6",  title: "Triple Cash Wheel",               wave: "W196", pin: "bf9b1be" },
    { m: "M7",  title: "Spartacus Colossal Reels",        wave: "W187", pin: "fa1b2c3" },
    { m: "M8",  title: "Goldfish Race competitive pick",  wave: "W188", pin: "0b1c2d3" },
    { m: "M9",  title: "Big Bet UK paid-package",         wave: "W189", pin: "1c2d3e4" },
    { m: "M10", title: "RR Megaways Bonus Bank",          wave: "W190", pin: "2d3e4f5" },
    { m: "M11", title: "Player-elects Composition",       wave: "W191", pin: "3e4f5a6" },
    { m: "M12", title: "Munchkinland random injection",   wave: "W192", pin: "4f5a6b7" },
    { m: "M13", title: "WOZ YBR Glinda reshape",          wave: "W195", pin: "3dbf5ca" },
    { m: "M14", title: "LOTR Two Towers nested slot",     wave: "W193", pin: "5a6b7c8" },
    { m: "M15", title: "Rich Little Piggies multi-pot",   wave: "W194", pin: "7b16ddb" },
    { m: "M16", title: "Stellar Jackpots arcade wrapper", wave: "W194", pin: "7b16ddb" }
  ];
  const FAM = [
    { code: "hnw",     title: "Hold & Win persistence",  variance: "high" },
    { code: "cascade", title: "Cascade chain",           variance: "mid"  },
    { code: "cluster", title: "Cluster pays",            variance: "mid"  },
    { code: "fs",      title: "Free spins multiplier",   variance: "high" },
    { code: "wheel",   title: "Wheel bonus prize",       variance: "mid"  },
    { code: "pick",    title: "Pick-em selector",        variance: "low"  },
    { code: "mw",      title: "Megaways variable rows",  variance: "high" },
    { code: "colossal",title: "Colossal reels merge",    variance: "high" },
    { code: "wild",    title: "Expanding wild",          variance: "mid"  },
    { code: "sticky",  title: "Sticky wild persistence", variance: "high" },
    { code: "walking", title: "Walking wild step",       variance: "mid"  },
    { code: "mystery", title: "Mystery symbol reveal",   variance: "mid"  },
    { code: "upgrade", title: "Symbol upgrade ladder",   variance: "mid"  },
    { code: "hex",     title: "Hexagonal cluster",       variance: "high" },
    { code: "both",    title: "Both-ways pay",           variance: "low"  },
    { code: "scatter", title: "Scatter-anywhere",        variance: "low"  },
    { code: "jackpot", title: "WAP multi-jackpot",       variance: "high" },
    { code: "trigger", title: "Compound trigger gating", variance: "mid"  }
  ];
  function rtpBand(i) {
    const bands = ["88.4–92.1%", "92.0–94.2%", "94.1–96.4%", "95.5–97.2%", "96.0–98.0%"];
    return bands[i % bands.length];
  }
  function hexHash(seed) {
    return ((seed * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, 7);
  }
  function makePatterns() {
    const arr = [];
    const lwVar = ["mid","high","mid","high","high","high","high","mid","high","high","mid","high","high","high","high","mid"];
    const lwFam = ["hnw","wild","cascade","fs","mystery","wheel","colossal","pick","fs","mw","cascade","mystery","cluster","fs","jackpot","jackpot"];
    LW_GAPS.forEach((g, i) => {
      arr.push({ pid: "P-" + String(i+1).padStart(3, "0"), title: g.title, wave: g.wave, pin: g.pin, rtp: rtpBand(i), var: lwVar[i], fam: lwFam[i], lw: g.m });
    });
    for (let i = 16; i < 97; i++) {
      const f = FAM[i % FAM.length];
      arr.push({ pid: "P-" + String(i+1).padStart(3, "0"), title: f.title + " · variant " + Math.floor(i / FAM.length + 1), wave: "W" + String(49 + i * 2).padStart(3, "0"), pin: hexHash(i), rtp: rtpBand(i), var: f.variance, fam: f.code, lw: null });
    }
    return arr;
  }
  const PATTERNS = makePatterns();

  const lwChipsEl = $("#lw-chips");
  LW_GAPS.forEach((g, i) => {
    const c = document.createElement("button");
    c.className = "lw-chip";
    c.innerHTML = `<b>${g.m}</b><span>${g.title}</span>`;
    c.addEventListener("click", () => selectPattern("P-" + String(i+1).padStart(3, "0")));
    lwChipsEl.appendChild(c);
  });

  const catalogCards = $("#catalog-cards");
  function renderCards(filter = "") {
    const lwOnly = $("#lw-only")?.checked;
    const matches = PATTERNS.filter(p => {
      if (filter && !p.title.toLowerCase().includes(filter) && !p.pid.toLowerCase().includes(filter)) return false;
      if (lwOnly && !p.lw) return false;
      return true;
    });
    $("#cat-shown").textContent = `${matches.length} of ${PATTERNS.length}`;
    $("#cat-shown-top").textContent = matches.length;
    catalogCards.innerHTML = matches.map(p => `
      <article class="pcard" data-pid="${p.pid}">
        ${p.lw ? `<span class="pcard-lw">${p.lw}</span>` : ""}
        <div class="pcard-id">${p.pid}</div>
        <div class="pcard-title">${p.title}</div>
        <div class="pcard-meta">
          <span class="pcard-pill rtp">${p.rtp}</span>
          <span class="pcard-pill var-${p.var}">${p.var.toUpperCase()}</span>
          <span class="pcard-pill">${p.fam}</span>
        </div>
        <span class="pcard-wave">${p.wave} · ${p.pin}</span>
      </article>
    `).join("");
    $$(".pcard").forEach(c => c.addEventListener("click", () => selectPattern(c.dataset.pid)));
  }
  function selectPattern(pid) {
    $$(".pcard").forEach(c => c.classList.toggle("is-active", c.dataset.pid === pid));
    const p = PATTERNS.find(x => x.pid === pid); if (!p) return;
    $("#cd-id").textContent = p.pid;
    $("#cd-title").textContent = p.title;
    $("#cd-wave").textContent = `${p.wave} · ${p.pin}`;
    $("#cd-rtp").textContent = `RTP ${p.rtp}`;
    $("#cd-var").textContent = `var ${p.var.toUpperCase()}`;
    const lwEl = $("#cd-lw");
    if (p.lw) { lwEl.style.display = "inline-block"; lwEl.textContent = "L&W " + p.lw; }
    else lwEl.style.display = "none";
    const formulae = {
      hnw:      "π_n · M = π_{n+1}\nE[win | bonus] = Σ π_i · v_i + Σ p_jackpot · v_jackpot",
      cascade:  "E[chain] = Σ_{k=0..K} p_hit^k · μ_k · decay^k",
      fs:       "E[FS] = Σ_{k=3..5} P(k scat) · μ_k · m̄",
      cluster:  "E[win] = Σ_size P(size) · paytable(size)",
      mw:       "E[lines] = Π_i rows_i / max_rows^5",
      wheel:    "E[wheel] = Σ p_segment · prize_segment · trigger_p",
      pick:     "E[pick] = Σ_{i=1..n} (Σ_{j=i..n} v_j) / (n-i+1)",
      jackpot:  "E[jp] = Σ p_tier · jackpot_tier · WAP_share",
      colossal: "E[col] = Σ frame_p · merged_payout(frame)"
    };
    $("#cd-formula").textContent = formulae[p.fam] || "E[X] = Σ p_i · v_i  (closed-form solver)";
    $("#crumb-active").textContent = `${p.lw || p.pid} · ${p.title.slice(0, 24)}`;
  }
  renderCards();
  selectPattern("P-006");

  $("#cat-search").addEventListener("input", e => renderCards(e.target.value.toLowerCase()));
  $("#lw-only").addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase()));
  $$(".filter-block input[type='checkbox']").forEach(cb => cb.addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase())));

  $("#cd-insert").addEventListener("click", () => {
    const b = $("#cd-insert"); const o = b.textContent;
    b.textContent = "Inserted into BUILD ✓";
    setTimeout(() => b.textContent = o, 1400);
    goToTab("build");
    logActivity("catalog.insert " + $("#cd-id").textContent);
  });

  /* ============================================================
     PLAY tab
     ============================================================ */
  const btnSpin = $("#btn-spin"), historyEl = $("#history");
  let spinCounter = 42;
  btnSpin?.addEventListener("click", () => {
    btnSpin.style.transform = "scale(0.97)";
    setTimeout(() => btnSpin.style.transform = "", 150);
    $$("#panel-play .cell").forEach(c => { c.style.opacity = "0.5"; setTimeout(() => c.style.opacity = "1", 250 + Math.random() * 280); });
    spinCounter++;
    const win = Math.random() < 0.32;
    const amt = win ? (Math.random() * 18 + 0.5).toFixed(2) : "0.00";
    const desc = win
      ? ["3× PRISM · L2", "4× SHARD · L9", "5× KEYSTONE · L7", "Scatter · 8 FS", "3× MERIDIAN · L5"][Math.floor(Math.random() * 5)]
      : "no win";
    const row = document.createElement("div");
    row.className = "hist-row";
    row.innerHTML = `<span class="n">#${String(spinCounter).padStart(3, "0")}</span><span class="res ${win ? 'win' : 'loss'}">${desc}</span><span class="amt ${win ? '' : 'zero'}">${win ? '+' + amt : '0.00'}</span>`;
    historyEl.prepend(row);
    while (historyEl.children.length > 14) historyEl.removeChild(historyEl.lastChild);
    $("#merkle-hash").textContent = `${hexHash(spinCounter * 31)}${hexHash(spinCounter * 7)} · ${hexHash(spinCounter)} · #${String(spinCounter).padStart(3, "0")}`;
  });
  $("#btn-replay")?.addEventListener("click", () => {
    const b = $("#btn-replay"); const o = b.textContent;
    b.textContent = "Replaying " + $("#seed-override").value + " …";
    setTimeout(() => b.textContent = "✓ replay matched · 0 drift", 700);
    setTimeout(() => b.textContent = o, 2200);
  });

  /* ============================================================
     SENSITIVITY — heatmap + params
     ============================================================ */
  const PARAMS = [
    { name: "scatter_trigger_p",    val: 0.038,  min: 0.01, max: 0.10 },
    { name: "fs_award",             val: 10,     min: 5,    max: 30 },
    { name: "fs_multiplier_seq",    val: 5,      min: 1,    max: 20 },
    { name: "cascade_decay",        val: 0.78,   min: 0.4,  max: 0.95 },
    { name: "cascade_max_chain",    val: 8,      min: 2,    max: 16 },
    { name: "persistence_p",        val: 0.62,   min: 0.1,  max: 0.95 },
    { name: "wild_density",         val: 0.022,  min: 0.0,  max: 0.08 },
    { name: "sticky_wild_lifetime", val: 3,      min: 1,    max: 12 },
    { name: "expanding_wild_prob",  val: 0.18,   min: 0.0,  max: 0.6 },
    { name: "walking_wild_step",    val: 1,      min: 1,    max: 4 },
    { name: "pick_count",           val: 4,      min: 2,    max: 12 },
    { name: "wheel_segments",       val: 12,     min: 6,    max: 24 },
    { name: "wheel_jackpot_p",      val: 0.0008, min: 0.0,  max: 0.005 },
    { name: "mystery_reveal_rate",  val: 0.27,   min: 0.0,  max: 1.0 },
    { name: "upgrade_step_prob",    val: 0.4,    min: 0.0,  max: 1.0 },
    { name: "megaways_max_rows",    val: 7,      min: 2,    max: 7 },
    { name: "max_bet_eur",          val: 1.0,    min: 0.10, max: 50.0 },
    { name: "base_reel_weight_var", val: 4.0,    min: 0.0,  max: 20 }
  ];
  function fmtVal(v) {
    if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(2);
    if (Number.isInteger(v) || Math.abs(v) > 10) return v.toString();
    return v.toFixed(3);
  }
  $("#param-list").innerHTML = PARAMS.map((p, i) => `
    <li>
      <div class="pl-name"><span>${p.name}</span><span class="pl-val" data-i="${i}">${fmtVal(p.val)}</span></div>
      <div class="pl-range">
        <span class="pl-min">${fmtVal(p.min)}</span>
        <input type="range" min="${p.min}" max="${p.max}" step="${(p.max - p.min) / 200}" value="${p.val}" data-i="${i}"/>
        <span class="pl-max">${fmtVal(p.max)}</span>
      </div>
    </li>
  `).join("");
  $$("#param-list input[type='range']").forEach(s => {
    s.addEventListener("input", () => {
      const i = +s.dataset.i;
      PARAMS[i].val = +s.value;
      $(`.pl-val[data-i="${i}"]`).textContent = fmtVal(+s.value);
      regenHeatmap();
    });
  });
  function heatColor(t) {
    const c1 = [31, 37, 47], c2 = [34, 211, 238];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r},${g},${b})`;
  }
  const heatmapEl = $("#heatmap");
  function regenHeatmap() {
    heatmapEl.innerHTML = "";
    for (let r = 0; r < 12; r++) for (let c = 0; c < 16; c++) {
      const xN = c / 15, yN = r / 11;
      const v = 0.93 + 0.04 * Math.exp(-((xN - 0.6) ** 2 + (yN - 0.4) ** 2) * 6) + 0.012 * Math.sin(xN * 4) * Math.cos(yN * 3);
      const t = Math.max(0, Math.min(1, (v - 0.91) / 0.06));
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.style.background = heatColor(t);
      cell.title = `RTP ${(v * 100).toFixed(2)}%`;
      heatmapEl.appendChild(cell);
    }
  }
  regenHeatmap();

  /* ============================================================
     CERTIFY — MC, RNG, PAR, jurisdictions
     ============================================================ */
  let mcSize = 1_000_000;
  $$(".mc-size").forEach(b => {
    b.addEventListener("click", () => {
      $$(".mc-size").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      mcSize = +b.dataset.mc;
      $("#btn-mc").textContent = `Run · ${formatMC(mcSize)} spins`;
    });
  });
  function formatMC(n) {
    if (n >= 1e9) return (n / 1e9) + "B";
    if (n >= 1e6) return (n / 1e6) + "M";
    if (n >= 1e3) return (n / 1e3) + "K";
    return n.toString();
  }
  $$(".rng-pill").forEach(p => {
    p.addEventListener("click", () => {
      $$(".rng-pill").forEach(x => x.classList.remove("is-active"));
      p.classList.add("is-active");
    });
  });
  const btnMc = $("#btn-mc"), mcProg = $(".cert-main .progress > i"), mcStat = $("#mc-stat");
  btnMc?.addEventListener("click", () => {
    if (btnMc.dataset.running === "1") return;
    btnMc.dataset.running = "1";
    btnMc.textContent = "Running…";
    let p = 0;
    const targ = formatMC(mcSize);
    mcStat.innerHTML = `<b>running</b> · 0 / ${targ} · ETA 12s`;
    $("#bp-mc-val").textContent = "RUNNING";
    const bpFill = $("#bp-mc > i");
    const iv = setInterval(() => {
      p += 2 + Math.random() * 4;
      if (p >= 100) p = 100;
      mcProg.style.width = p + "%";
      bpFill.style.width = p + "%";
      const spinsDone = Math.round((p / 100) * mcSize);
      const eta = Math.max(0, Math.round((100 - p) * 0.12));
      mcStat.innerHTML = `<b>running</b> · ${formatMC(spinsDone)} / ${targ} · ETA ${eta}s`;
      if (p >= 100) {
        clearInterval(iv);
        const ci = mcSize >= 1e9 ? "±0.002%" : mcSize >= 1e8 ? "±0.006%" : mcSize >= 1e7 ? "±0.018%" : mcSize >= 1e6 ? "±0.058%" : "±0.18%";
        const rtp = (state.rtp + (Math.random() - 0.5) * 0.04).toFixed(3);
        mcStat.innerHTML = `<b style="color:var(--green)">complete</b> · RTP ${rtp}% · CI ${ci}`;
        btnMc.textContent = `Run · ${targ} spins`;
        btnMc.dataset.running = "0";
        $("#bp-mc-val").textContent = "COMPLETE";
        setTimeout(() => { mcProg.style.width = "0%"; bpFill.style.width = "0%"; $("#bp-mc-val").textContent = "IDLE"; }, 1500);
        logActivity(`mc.run pcg64 ${targ} → <b>${rtp}%</b>`);
      }
    }, 120);
  });

  /* PAR sections */
  const PAR_SECTIONS = [
    { h: "Identification",       kv: [["build", "OL-0.4.12"], ["irhash", "9F2E1B…AC04"], ["engine", "sme/77"]], detail: "ANSI/ISO/IEC 17025 traceable. SBOM cyclonedx-1.5, signed ed25519, HSM-anchored." },
    { h: "RTP & moments",        kv: [["RTP closed", "95.421%"], ["RTP MC 1M", "95.408%"], ["σ", "8.41"], ["skew", "+12.7"], ["kurt", "+86.4"]], detail: "Closed-form Markov 21×4; MC drift 0.013%." },
    { h: "Hit frequency",        kv: [["overall", "27.83%"], ["base", "26.10%"], ["feature", "1.73%"]], detail: "Per-spin hit incl. scatter pays + zero-win cascades." },
    { h: "Volatility band",      kv: [["category", "MID"], ["VI gov.tw", "11.6"], ["SD/bet", "8.41×"]], detail: "Taiwan KMOEA spec." },
    { h: "Win distribution",     kv: [["P50", "0.00×"], ["P90", "2.10×"], ["P99", "38.5×"], ["P99.9", "220×"]], detail: "1M MC sample; tail validated vs closed-form CDF." },
    { h: "Jackpot exposure",     kv: [["cap", "2 145×"], ["hit prob.", "1 : 3.4M"], ["tail mass", "2.1e-7"]], detail: "Max-win cap GLI-16 §6.1." },
    { h: "Compliance",           kv: [["FastFwd", "PASS"], ["SE hooks", "PASS"], ["UK pacing", "2.5s OK"]], detail: "Per-jurisdiction adapter validates spin pacing, loss limits, FF." },
    { h: "Confidence intervals", kv: [["RTP CI95", "±0.018%"], ["σ CI95", "±0.02"]], detail: "Batch-means on 1M run, batch size 1K." },
    { h: "Quantiles",            kv: [["P10", "0.00×"], ["P95", "5.40×"], ["P99.99", "1100×"]], detail: "Tail-risk for regulator review." },
    { h: "Moments",              kv: [["E[X]", "0.954"], ["E[X²]", "71.2"], ["E[X³]", "8 412"]], detail: "First three moments analytic." },
    { h: "Bonus distances",      kv: [["avg", "48.2"], ["std", "65.7"], ["P99", "320"]], detail: "Geometric distribution of trigger distance." },
    { h: "Required spins",       kv: [["CI95 ±0.1%", "8.6M"], ["CI99 ±0.05%", "52.4M"]], detail: "Spins required for target CI band." }
  ];
  $("#par-sections").innerHTML = PAR_SECTIONS.map((s, i) => `
    <div class="par-section">
      <h4>${s.h} <span class="num">${String(i + 1).padStart(2, "0")}</span></h4>
      ${s.kv.map(([k, v]) => `<div class="par-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
      <div class="par-detail"><div class="par-kv"><span class="k" style="font-style:italic">${s.detail}</span></div></div>
    </div>
  `).join("");
  $$(".par-section").forEach(p => p.addEventListener("click", () => p.classList.toggle("is-open")));

  /* Jurisdictions */
  const JURIS = [
    { code:"ukgc", name:"UKGC", sub:"UK · RTS 7A/12/14 · SI 2025/215", state:"on", uk:true,
      rules:[["RTS 7A", "Statistical analysis of game outcomes"], ["RTS 12", "Game cycle display"], ["RTS 14", "Time/event marker"], ["SI 2025/215", "2.5s pacing min, £2 stake cap (online)"], ["LCCP 4.2", "Compulsive play indicators"], ["RNG", "ChaCha20 CSPRNG mandatory (DCMS 2024)"]] },
    { code:"mga", name:"MGA", sub:"Malta · DOI/SR 06 · PPD §11", state:"on",
      rules:[["DOI/SR 06", "RNG attestation"], ["PPD §11", "Player protection · SE hooks"], ["L/Player Funds", "Segregated player liabilities"]] },
    { code:"adm", name:"ADM", sub:"Italy · D.D. 39 / 2011", state:"",
      rules:[["D.D. 39/2011", "RTP min 90%, sample 10M"], ["Cert renewal", "Annual recertification"], ["AAMS", "Backward-compatible PAR"]] },
    { code:"ecogra", name:"eCOGRA", sub:"GAP · v6", state:"on",
      rules:[["GAP §3.2", "RNG cycle test"], ["GAP §4.1", "Return verification monthly"]] },
    { code:"dgoj", name:"DGOJ", sub:"Spain · DGOJ-RNG-2023", state:"on",
      rules:[["DGOJ-RNG-2023", "Spanish RNG attestation"], ["RD 958/2020", "Advertising restrictions"], ["RTP", "Min 88% slots"]] },
    { code:"se", name:"SE", sub:"Sweden · SIFO-23", state:"",
      rules:[["SIFO-23", "Pause-spelar feature mandatory"], ["Loss limit", "Per-session display"]] },
    { code:"pa", name:"PA", sub:"Portugal · SRIJ §V", state:"",
      rules:[["SRIJ §V", "RNG period proof"], ["Player protocol", "Mandatory deposit limit"]] },
    { code:"nl", name:"NL", sub:"Netherlands · Cruks 2021", state:"",
      rules:[["Cruks", "Central SE register"], ["KSA bonus", "No win-cond wagering"]] },
    { code:"de", name:"DE", sub:"Germany · GlüStV", state:"",
      rules:[["GlüStV §6", "€1 stake cap online"], ["GlüStV §22a", "5s spin pacing"], ["Limit-Datei", "Cross-op deposit cap €1 000/mo"]] },
    { code:"caon", name:"CA-ON", sub:"Ontario · iGOR", state:"on",
      rules:[["iGOR", "Internet gaming ops regulation"], ["AGCO-RG", "RG toolkit"]] },
    { code:"au", name:"AU", sub:"Australia · NSW GMC", state:"",
      rules:[["GMC §3.1", "Approved game prob"], ["NSW LL Act", "Loss limit enforcement"]] },
    { code:"nz", name:"NZ", sub:"NZ · DIA Class 4", state:"",
      rules:[["DIA Class 4", "Community gaming code"], ["G2G", "Game-to-Government audit hook"]] },
    { code:"jp", name:"JP", sub:"Pachislot · 80%-cycle", state:"",
      rules:[["Pachislot 80%", "1 000-spin cycle"], ["6.0號機", "Tier 6 device 2018"], ["Kakuhen", "Trigger prob bounded"]] },
    { code:"kr", name:"KR", sub:"South Korea · NGCC", state:"",
      rules:[["NGCC code", "National Gambling Control"], ["RTP cap", "Max 94% slots"]] },
    { code:"br", name:"BR", sub:"Brazil · SBT/MF Portaria 1.330", state:"",
      rules:[["Portaria 1.330", "Federal sports betting auth"], ["RNG", "Lab test by approved entity"]] }
  ];
  const jurisGrid = $("#juris-grid");
  jurisGrid.innerHTML = JURIS.map(j => `
    <div class="juris-chip ${j.state} ${j.uk ? 'uk-crit' : ''}" data-juris="${j.code}">
      <b>${j.name}</b>
      <small>${j.sub}</small>
    </div>
  `).join("");
  $$("#juris-grid .juris-chip").forEach(c => {
    c.addEventListener("click", () => {
      const j = JURIS.find(x => x.code === c.dataset.juris);
      $("#jo-title").textContent = j.name + " · " + j.sub.split(" · ")[0];
      $("#jo-sub").textContent = j.sub;
      $("#jo-body").innerHTML = j.rules.map(([code, txt]) => `<div class="rule"><span class="code">${code}</span><b>${txt}</b></div>`).join("");
      $("#juris-overlay").classList.add("is-open");
    });
  });
  $("#jo-close")?.addEventListener("click", () => $("#juris-overlay").classList.remove("is-open"));
  $("#juris-overlay")?.addEventListener("click", e => {
    if (e.target.id === "juris-overlay") $("#juris-overlay").classList.remove("is-open");
  });

  $("#btn-package")?.addEventListener("click", () => {
    const b = $("#btn-package"); const o = b.innerHTML;
    b.innerHTML = `Bundling 153 artefacts… <span class="filename">10 categories · ed25519 sign</span>`;
    setTimeout(() => {
      b.innerHTML = `Ready · operator-package.zip <span class="filename">42.8 MB · sha256 e1a4…c8d2</span>`;
      setTimeout(() => b.innerHTML = o, 2400);
    }, 900);
    logActivity("package built · 153 files");
  });
  $("#btn-signoff")?.addEventListener("click", () => {
    const b = $("#btn-signoff"); const o = b.textContent;
    b.textContent = "Signing with HSM…";
    setTimeout(() => b.textContent = "✓ Signed · ed25519 · 2026-05-18T14:02:11Z", 800);
    setTimeout(() => b.textContent = o, 2400);
    logActivity("sign-off · <b>ed25519 HSM</b>");
  });

  /* ============================================================
     WORKSPACE TABS (top bar second row)
     ============================================================ */
  $$(".ws-tab").forEach(t => {
    t.addEventListener("click", e => {
      if (e.target.classList.contains("ws-x")) {
        t.style.display = "none";
        e.stopPropagation();
        return;
      }
      $$(".ws-tab").forEach(x => x.classList.remove("is-active"));
      t.classList.add("is-active");
      const name = t.querySelector(".lbl")?.textContent || "";
      $("#ctx-ir").textContent = name;
    });
  });

  /* ============================================================
     SAVE / EXPORT stubs
     ============================================================ */
  function stubButton(b, busyText, doneText) {
    if (!b) return;
    const o = b.textContent;
    b.textContent = busyText || (o + "…");
    setTimeout(() => b.textContent = doneText || (o + " ✓"), 400);
    setTimeout(() => b.textContent = o, 1600);
  }
  $("#btn-save")?.addEventListener("click", () => { stubButton($("#btn-save"), "Saving…", "Saved ✓"); logActivity("workspace saved"); });
  $("#btn-export")?.addEventListener("click", () => { stubButton($("#btn-export"), "Exporting IR…", "Exported ✓"); logActivity("ir exported"); });

  /* ============================================================
     INIT
     ============================================================ */
  setPersona("math");
  buildSymbolPool();
  renderSymTable();
  renderPaytable();
  autoBuildReels();
  renderReels();
  rebuildTierTotal();
  compute("init");

  // light tick for spark chart, every 4s (small drift)
  setInterval(() => {
    if (!document.hidden) updateSpark();
  }, 4000);

})();
