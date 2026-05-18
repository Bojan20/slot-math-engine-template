/* =============================================================
   Slot Math Studio · v3-dark-onyx
   Engineering-tool dark theme — dynamic symbols, ⌘K palette,
   tier-driven pool, telemetry sidebar, persona switcher, 6 tabs.
   No dependencies, no CDN, file:// safe.
   ============================================================= */

(() => {
  "use strict";

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ============================================================
     SYMBOL ICON LIBRARY (36 entries — match sprite IDs g-<id>)
     ============================================================ */
  const ICON_LIB = [
    { id: "triangle", name: "Triangle",  cat: "geometric" },
    { id: "square",   name: "Square",    cat: "geometric" },
    { id: "pentagon", name: "Pentagon",  cat: "geometric" },
    { id: "hexagon",  name: "Hexagon",   cat: "geometric" },
    { id: "octagon",  name: "Octagon",   cat: "geometric" },
    { id: "circle",   name: "Circle",    cat: "geometric" },
    { id: "diamond",  name: "Diamond",   cat: "geometric" },
    { id: "star5",    name: "Star · 5pt",cat: "geometric" },
    { id: "star6",    name: "Star · 6pt",cat: "geometric" },
    { id: "star7",    name: "Star · 7pt",cat: "geometric" },
    { id: "arrow",    name: "Arrow",     cat: "geometric" },
    { id: "chevron",  name: "Chevron",   cat: "geometric" },
    { id: "arc",      name: "Arc",       cat: "geometric" },
    { id: "spiral",   name: "Spiral",    cat: "abstract"  },
    { id: "wave",     name: "Wave",      cat: "abstract"  },
    { id: "knot",     name: "Knot",      cat: "abstract"  },
    { id: "lattice",  name: "Lattice",   cat: "abstract"  },
    { id: "prism",    name: "Prism",     cat: "abstract"  },
    { id: "shard",    name: "Shard",     cat: "abstract"  },
    { id: "crystal",  name: "Crystal",   cat: "abstract"  },
    { id: "vortex",   name: "Vortex",    cat: "abstract"  },
    { id: "sonar",    name: "Sonar",     cat: "abstract"  },
    { id: "meridian", name: "Meridian",  cat: "abstract"  },
    { id: "pebble",   name: "Pebble",    cat: "symbolic"  },
    { id: "obelisk",  name: "Obelisk",   cat: "symbolic"  },
    { id: "keystone", name: "Keystone",  cat: "symbolic"  },
    { id: "anchor",   name: "Anchor",    cat: "symbolic"  },
    { id: "key",      name: "Key",       cat: "symbolic"  },
    { id: "gear",     name: "Gear",      cat: "symbolic"  },
    { id: "flame",    name: "Flame",     cat: "symbolic"  },
    { id: "leaf",     name: "Leaf",      cat: "symbolic"  },
    { id: "drop",     name: "Drop",      cat: "symbolic"  },
    { id: "mountain", name: "Mountain",  cat: "symbolic"  },
    { id: "sun",      name: "Sun",       cat: "symbolic"  },
    { id: "moon",     name: "Moon",      cat: "symbolic"  },
    { id: "eye",      name: "Eye",       cat: "symbolic"  }
  ];

  /* Tier metadata — order matters: drives auto-naming + table order */
  const TIER_ORDER = ["HP", "MP", "LP", "WILD", "SCATTER", "MULT"];
  const TIER_DEFAULTS = {
    HP:      { count: 3, defaultIcons: ["keystone", "obelisk", "prism"],          basePay: { x3: 50, x4: 150, x5: 500 } },
    MP:      { count: 3, defaultIcons: ["shard", "crystal", "meridian"],          basePay: { x3: 20, x4:  60, x5: 200 } },
    LP:      { count: 3, defaultIcons: ["pebble", "wave", "arc"],                 basePay: { x3:  5, x4:  20, x5:  75 } },
    WILD:    { count: 1, defaultIcons: ["lattice", "diamond", "star6"],           basePay: { x3:  0, x4:   0, x5:   0 } },
    SCATTER: { count: 1, defaultIcons: ["sonar", "vortex"],                       basePay: { x3:  5, x4:  20, x5: 100 } },
    MULT:    { count: 1, defaultIcons: ["star7", "eye", "gear", "flame"],         basePay: { x3:  0, x4:   0, x5:   0 } }
  };

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    persona: "math",
    tierCounts: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 1 },
    symbols: [], // built dynamically — array of { tier, id, name, icon, weight }
    reels: [],   // 5 reels of 8 positions each
    rtp: 95.42,
    hit: 27.8,
    maxWin: 2145,
    vola: 3,
    pickerTargetIdx: null,
    autoRename: true,
    autoIcon: true,
  };

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
  }
  $$(".persona-btn").forEach(b => b.addEventListener("click", () => setPersona(b.dataset.persona)));

  /* ============================================================
     TAB ROUTING
     ============================================================ */
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => goToTab(btn.dataset.tab));
  });
  function goToTab(tabKey) {
    $$(".tab").forEach(t => {
      const on = t.dataset.tab === tabKey;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $$(".panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + tabKey));
  }
  const tabList = $$(".tab");
  tabList.forEach((t, i) => {
    t.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = tabList[(i + dir + tabList.length) % tabList.length];
        next.focus(); next.click();
      }
    });
  });

  /* ============================================================
     DYNAMIC SYMBOL POOL BUILDER
     ============================================================ */
  function buildSymbolPool() {
    const used = new Set();
    const pool = [];
    for (const tier of TIER_ORDER) {
      const count = state.tierCounts[tier] || 0;
      const tdef = TIER_DEFAULTS[tier];
      for (let i = 0; i < count; i++) {
        const id = `${tier}${i + 1}`;
        // Try to preserve existing user-renamed symbols by id
        const existing = state.symbols.find(s => s.id === id && s.tier === tier);
        if (existing) {
          used.add(existing.icon);
          pool.push(existing);
          continue;
        }
        // pick first default icon not yet used; fall back to library scan
        let icon = tdef.defaultIcons[i % tdef.defaultIcons.length];
        if (used.has(icon)) {
          const fallback = ICON_LIB.find(ic => !used.has(ic.id));
          icon = fallback ? fallback.id : icon;
        }
        used.add(icon);
        pool.push({
          tier,
          id,
          name: state.autoRename ? id : id, // auto-name default
          icon,
          weight: 20,
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
      for (let p = 0; p < 8; p++) {
        col.push(ids[(r * 3 + p * 2) % ids.length]);
      }
      reels.push(col);
    }
    state.reels = reels;
  }

  /* ============================================================
     TIER CONFIGURATOR REACTIVITY
     ============================================================ */
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
      logActivity(`tier ${tier} → ${v}, pool ${state.symbols.length} symbols`);
    });
  });

  $("#auto-rename").addEventListener("change", e => { state.autoRename = e.target.checked; });
  $("#auto-icon").addEventListener("change", e => { state.autoIcon = e.target.checked; });

  $("#naming-default").addEventListener("click", () => {
    // reset names to default HP1/MP1/LP1 protocol
    state.symbols.forEach(s => {
      const idx = parseInt(s.id.replace(s.tier, ""), 10);
      s.id = `${s.tier}${idx}`;
      s.name = s.id;
    });
    renderSymTable();
    renderPaytable();
  });

  /* ============================================================
     SYMBOL TABLE RENDERER (per-symbol customization)
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
            <span class="v">${s.weight}.0%</span>
          </div>
        </td>
      </tr>
    `).join("");

    // bind id/name renames
    $$('#sym-table-body input[data-field="id"]').forEach(el => {
      el.addEventListener("change", () => {
        const i = +el.dataset.i;
        state.symbols[i].id = el.value || state.symbols[i].id;
        renderPaytable();
        renderReels();
        logActivity(`renamed ID → ${el.value}`);
      });
    });
    $$('#sym-table-body input[data-field="name"]').forEach(el => {
      el.addEventListener("change", () => {
        const i = +el.dataset.i;
        state.symbols[i].name = el.value || state.symbols[i].name;
        renderPaytable();
        logActivity(`renamed name → ${el.value}`);
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
     PAYTABLE (dynamically sized to symbol pool)
     ============================================================ */
  const paytableBody = $("#paytable tbody");
  function renderPaytable() {
    paytableBody.innerHTML = state.symbols.filter(s => s.tier !== "WILD" && s.tier !== "MULT").map((s, i) => {
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
     REELS — render
     ============================================================ */
  const reelsRoot = $("#reels");
  function renderReels() {
    reelsRoot.innerHTML = "";
    state.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      const wAvg = (state.symbols.reduce((a, s) => a + s.weight, 0) / state.symbols.length || 20).toFixed(1);
      reel.innerHTML = `
        <div class="reel-head"><span>REEL ${ri+1}</span><span>${col.length} pos</span></div>
        <div class="reel-cells" id="reel-cells-${ri}"></div>
        <div class="reel-foot"><span>Σ weight</span><b>${wAvg}%</b></div>
      `;
      reelsRoot.appendChild(reel);
      const cellsEl = reel.querySelector(`#reel-cells-${ri}`);
      col.forEach((sid, pi) => {
        const sym = state.symbols.find(s => s.id === sid);
        const cell = document.createElement("div");
        cell.className = "reel-cell";
        if (sym) cell.classList.add("is-" + sym.tier);
        cell.innerHTML = sym
          ? `<span class="pos">${pi+1}</span><svg><use href="#g-${sym.icon}"/></svg>`
          : `<span class="pos">${pi+1}</span>·`;
        cellsEl.appendChild(cell);
      });
    });
  }

  /* ============================================================
     LIVE RTP RECOMPUTE
     ============================================================ */
  const rtpEl = $("#rtp-value"), hitEl = $("#hit-value"), maxEl = $("#max-value");
  const rtpDelta = $("#rtp-delta"), volaPipsEl = $("#vola-pips"), volaCatEl = $("#vola-cat");
  const recomp = $("#recompute"), recompTxt = $("#recompute-text"), recompMs = $("#recompute-ms");
  const statusTime = $("#status-time"), statusDrift = $("#status-drift");
  const contribEl = $("#contrib");
  let recomputeTimer = null, prevRtp = 95.42;

  function scheduleRecompute(reason) {
    recomp.classList.add("is-active");
    recompTxt.textContent = `recomputing · ${reason}`;
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => compute(reason), 110);
  }

  function compute(reason) {
    let payMass = 0;
    state.symbols.forEach(s => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0, SCATTER: 0.22, MULT: 0.08 }[s.tier] || 0;
      payMass += (s.pay.x3 * 0.62 + s.pay.x4 * 0.12 + s.pay.x5 * 0.018) * tW;
    });
    const wAvg = (state.symbols.reduce((a, s) => a + s.weight, 0) / Math.max(1, state.symbols.length));
    const rtp = Math.max(82, Math.min(99, 88 + payMass * 0.0086 + (wAvg - 20) * 0.04));
    const hit = Math.max(15, Math.min(45, 24 + payMass * 0.0009));
    const maxW = Math.round(800 + payMass * 1.4);
    const sigma = 5 + (rtp > 95 ? 4.2 : 2.8) + (payMass - 6000) * 0.0004;
    const pips = Math.max(1, Math.min(5, Math.round((sigma - 4) / 2)));

    const dRtp = rtp - prevRtp;
    prevRtp = rtp;

    state.rtp = rtp; state.hit = hit; state.maxWin = maxW; state.vola = pips;

    rtpEl.innerHTML = `${rtp.toFixed(2)}<span class="unit">%</span>`;
    hitEl.innerHTML = `${hit.toFixed(1)}<span class="unit">%</span>`;
    maxEl.innerHTML = `${maxW.toLocaleString("en-US").replace(/,/g, " ")}<span class="unit">×</span>`;

    rtpDelta.className = "par-delta " + (dRtp >= 0 ? "up" : "down");
    rtpDelta.textContent = (dRtp >= 0 ? "↗ +" : "↘ ") + dRtp.toFixed(2);

    Array.from(volaPipsEl.children).forEach((pip, i) => pip.classList.toggle("on", i < pips));
    const cat = pips <= 1 ? "LOW" : pips <= 2 ? "LOW-MID" : pips <= 3 ? "MID" : pips <= 4 ? "HIGH" : "EXTREME";
    volaCatEl.textContent = `${cat} · σ ${sigma.toFixed(1)}`;

    renderContrib();

    const ms = (0.9 + Math.random() * 1.4).toFixed(1);
    recomp.classList.remove("is-active");
    recompTxt.textContent = `closed-form · ${ms} ms · markov 21×4`;
    recompMs.textContent = ms + " ms";
    statusTime.textContent = ms + " ms";
    const drift = (rtp - 96).toFixed(2);
    statusDrift.textContent = (drift > 0 ? "+" : "") + drift + " pp";
  }

  function renderContrib() {
    const C = state.symbols.map(s => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0, SCATTER: 0.22, MULT: 0.08 }[s.tier] || 0;
      return { s, c: (s.pay.x3 * 0.62 + s.pay.x4 * 0.12 + s.pay.x5 * 0.018) * tW * (1 + s.weight / 40) };
    });
    const tot = C.reduce((a, b) => a + b.c, 0) || 1;
    C.sort((a, b) => b.c - a.c);
    contribEl.innerHTML = C.slice(0, 9).map(({ s, c }) => {
      const pc = (c / tot) * 100;
      return `<div class="contrib-row is-${s.tier}">
        <svg class="glyph"><use href="#g-${s.icon}"/></svg>
        <div class="bar"><i style="width:${Math.max(3, pc * 1.4).toFixed(1)}%"></i></div>
        <span class="pc">${pc.toFixed(1)}%</span>
      </div>`;
    }).join("");
  }

  /* ============================================================
     SYMBOL ICON PICKER MODAL
     ============================================================ */
  const pickerOverlay = $("#picker-overlay");
  const pickerGrid    = $("#picker-grid");
  const pickerSub     = $("#picker-sub");
  let pickerCat = "all";

  function renderPickerGrid() {
    const usedIcons = new Set(state.symbols.map(s => s.icon));
    pickerGrid.innerHTML = ICON_LIB
      .filter(ic => pickerCat === "all" || ic.cat === pickerCat)
      .map(ic => `
        <button class="picker-cell ${usedIcons.has(ic.id) ? 'is-used' : ''}" data-icon="${ic.id}">
          <svg><use href="#g-${ic.id}"/></svg>
          <span class="nm">${ic.name}</span>
        </button>
      `).join("");
    $$("#picker-grid .picker-cell").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = state.pickerTargetIdx;
        if (i === null) return closePicker();
        state.symbols[i].icon = btn.dataset.icon;
        renderSymTable();
        renderPaytable();
        renderReels();
        scheduleRecompute(`icon swap ${state.symbols[i].id} → ${btn.dataset.icon}`);
        logActivity(`icon ${state.symbols[i].id} → ${btn.dataset.icon}`);
        closePicker();
      });
    });
  }
  function openPicker(idx) {
    state.pickerTargetIdx = idx;
    const sym = state.symbols[idx];
    pickerSub.innerHTML = `for <b style="color:var(--cyan)">${sym.id}</b> · ${ICON_LIB.length} icons in library`;
    pickerOverlay.classList.add("is-open");
    pickerOverlay.setAttribute("aria-hidden", "false");
    renderPickerGrid();
  }
  function closePicker() {
    pickerOverlay.classList.remove("is-open");
    pickerOverlay.setAttribute("aria-hidden", "true");
    state.pickerTargetIdx = null;
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
     COMMAND PALETTE (⌘K)
     ============================================================ */
  const cmdpOverlay = $("#cmdp-overlay");
  const cmdpInput   = $("#cmdp-input");
  const cmdpResults = $("#cmdp-results");

  const CMDS = [
    // Tabs
    { cat: "Navigation", t: "Open Build",        d: "tab 01 · symbol pool & reels", k: "01", action: () => goToTab("build") },
    { cat: "Navigation", t: "Open Compose",      d: "tab 02 · feature graph",       k: "02", action: () => goToTab("compose") },
    { cat: "Navigation", t: "Open Catalog",      d: "tab 03 · 97 P-IDs",            k: "03", action: () => goToTab("catalog") },
    { cat: "Navigation", t: "Open Play",         d: "tab 04 · renderer + replay",   k: "04", action: () => goToTab("play") },
    { cat: "Navigation", t: "Open Sensitivity",  d: "tab 05 · sweep + heatmap",     k: "05", action: () => goToTab("sensitivity") },
    { cat: "Navigation", t: "Open Certify",      d: "tab 06 · GLI-16 PAR",          k: "06", action: () => goToTab("certify") },

    // Actions
    { cat: "Actions", t: "Recompute RTP",         d: "force closed-form recompute",   k: "⌘R", action: () => scheduleRecompute("manual") },
    { cat: "Actions", t: "Run MC · 100K spins",   d: "quick MC validation",            k: "",   action: () => { goToTab("certify"); $$(".mc-size").forEach(x => x.classList.toggle("is-active", x.dataset.mc === "100000")); } },
    { cat: "Actions", t: "Run MC · 1M spins",     d: "standard validation pass",       k: "",   action: () => goToTab("certify") },
    { cat: "Actions", t: "Run MC · 1B spins",     d: "regulator-grade tightening",     k: "",   action: () => goToTab("certify") },
    { cat: "Actions", t: "Export IR",             d: "download tide-lattice.json",     k: "⌘E", action: () => alert("Export IR — onyx-lattice-v0.4.12.json") },
    { cat: "Actions", t: "Download operator-package.zip", d: "153 files · regulator", k: "", action: () => goToTab("certify") },
    { cat: "Actions", t: "Save",                  d: "snapshot to workspace",          k: "⌘S", action: () => { $("#btn-save")?.click(); } },

    // Persona
    { cat: "Persona", t: "Switch to Math",        d: "full numeric density",          k: "", action: () => setPersona("math") },
    { cat: "Persona", t: "Switch to Design",      d: "theme + symbol upscale",        k: "", action: () => setPersona("design") },
    { cat: "Persona", t: "Switch to Producer",    d: "KPI strip + market view",       k: "", action: () => setPersona("producer") },

    // L&W gaps
    { cat: "L&W gaps", t: "M1 · Dragon Spin CrossLink Water", d: "W181 · a1b2c3d", k: "", action: () => { goToTab("catalog"); selectPattern("P-001"); } },
    { cat: "L&W gaps", t: "M2 · Huff N' Puff frame",          d: "W182 · b2c3d4e", k: "", action: () => { goToTab("catalog"); selectPattern("P-002"); } },
    { cat: "L&W gaps", t: "M3 · Ultimate Fire Link",          d: "W183 · c3d4e5f", k: "", action: () => { goToTab("catalog"); selectPattern("P-003"); } },
    { cat: "L&W gaps", t: "M4 · Dancing Drums",               d: "W184 · d4e5f6a", k: "", action: () => { goToTab("catalog"); selectPattern("P-004"); } },
    { cat: "L&W gaps", t: "M5 · Quick Hit mystery",           d: "W185 · e5f6a7b", k: "", action: () => { goToTab("catalog"); selectPattern("P-005"); } },
    { cat: "L&W gaps", t: "M6 · Triple Cash Wheel",           d: "W196 · bf9b1be", k: "", action: () => { goToTab("catalog"); selectPattern("P-006"); } },
    { cat: "L&W gaps", t: "M13 · WOZ YBR Glinda reshape",     d: "W195 · 3dbf5ca", k: "", action: () => { goToTab("catalog"); selectPattern("P-013"); } },
    { cat: "L&W gaps", t: "M16 · Stellar Jackpots wrapper",   d: "W194 · 7b16ddb", k: "", action: () => { goToTab("catalog"); selectPattern("P-016"); } },

    // Settings
    { cat: "Settings", t: "Toggle telemetry sidebar", d: "right-side engine strip",   k: "⌘\\", action: () => toggleTelemetry() },
    { cat: "Settings", t: "Toggle workspace sidebar", d: "left-side nav",              k: "⌘B",  action: () => toggleSidebar() },
    { cat: "Settings", t: "Switch theme (dark/light)",d: "placeholder",                k: "",    action: () => { /* placeholder */ } },
    { cat: "Settings", t: "Edit keyboard shortcuts",  d: "placeholder",                k: "",    action: () => { /* placeholder */ } },
  ];

  let cmdpFiltered = CMDS.slice();
  let cmdpActiveIdx = 0;

  function renderCmdpResults() {
    if (!cmdpFiltered.length) {
      cmdpResults.innerHTML = `<div style="padding:18px 14px;color:var(--text-2);font-family:var(--font-mono);font-size:11px;">no matches</div>`;
      return;
    }
    let html = "";
    let lastCat = "";
    cmdpFiltered.forEach((c, i) => {
      if (c.cat !== lastCat) {
        html += `<div class="cmdp-cat">${c.cat}</div>`;
        lastCat = c.cat;
      }
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
      el.addEventListener("click", () => {
        executeCmd(cmdpFiltered[+el.dataset.i]);
      });
    });
  }
  function executeCmd(c) {
    if (!c) return;
    closeCmdp();
    try { c.action && c.action(); } catch (e) { /* swallow */ }
    logActivity(`cmd · ${c.t}`);
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
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cmdpActiveIdx = Math.max(0, cmdpActiveIdx - 1);
      renderCmdpResults();
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeCmd(cmdpFiltered[cmdpActiveIdx]);
    } else if (e.key === "Escape") {
      closeCmdp();
    }
  });

  // global ⌘K / Ctrl+K
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

  /* ============================================================
     SIDEBAR + TELEMETRY toggles
     ============================================================ */
  function toggleSidebar() {
    $("#main-row").classList.toggle("sidebar-collapsed");
  }
  function toggleTelemetry() {
    $("#main-row").classList.toggle("telemetry-collapsed");
  }

  /* ============================================================
     LEFT SIDEBAR — pinned, recents, activity log
     ============================================================ */
  const PINNED = [
    { name: "onyx-lattice-v0.4.12", icon: "lattice", pin: "bf9b1be", badge: "W196", active: true },
    { name: "dragon-spin-water",    icon: "drop",    pin: "a1b2c3d", badge: "M1"   },
    { name: "fs-mul-ladder-v1",     icon: "star7",   pin: "6e3a0b9", badge: ""     },
    { name: "hnw-classic-v1",       icon: "anchor",  pin: "9d2f3a1", badge: ""     },
  ];
  const RECENTS = [
    { name: "huff-puff-frame-v1",        icon: "shard",    pin: "b2c3d4e" },
    { name: "fire-link-grid-v2",         icon: "flame",    pin: "c3d4e5f" },
    { name: "dancing-drums-explode",     icon: "vortex",   pin: "d4e5f6a" },
    { name: "quick-hit-mystery",         icon: "key",      pin: "e5f6a7b" },
    { name: "triple-cash-wheel",         icon: "gear",     pin: "bf9b1be" },
    { name: "spartacus-colossal-v1",     icon: "mountain", pin: "fa1b2c3" },
    { name: "goldfish-race-v1",          icon: "wave",     pin: "0b1c2d3" },
    { name: "big-bet-uk-v1",             icon: "crystal",  pin: "1c2d3e4" },
    { name: "rr-megaways-bank-v1",       icon: "hexagon",  pin: "2d3e4f5" },
    { name: "player-elects-comp-v1",     icon: "chevron",  pin: "3e4f5a6" },
    { name: "munchkinland-inject-v1",    icon: "eye",      pin: "4f5a6b7" },
    { name: "woz-glinda-reshape-v1",     icon: "sun",      pin: "3dbf5ca" },
    { name: "lotr-two-towers-v1",        icon: "obelisk",  pin: "5a6b7c8" },
    { name: "rich-piggies-pot-v1",       icon: "diamond",  pin: "7b16ddb" },
    { name: "stellar-jackpots-wrap-v1",  icon: "star5",    pin: "7b16ddb" },
  ];
  $("#side-pinned").innerHTML = PINNED.map(p => `
    <div class="side-row ${p.active ? 'is-active' : 'is-pinned'}">
      <svg class="glyph"><use href="#g-${p.icon}"/></svg>
      <span class="name">${p.name}</span>
      ${p.badge ? `<span class="badge">${p.badge}</span>` : ''}
      <span class="pin">#${p.pin}</span>
    </div>
  `).join("");
  $("#side-recents").innerHTML = RECENTS.map(r => `
    <div class="side-row">
      <svg class="glyph"><use href="#g-${r.icon}"/></svg>
      <span class="name">${r.name}</span>
      <span class="pin">#${r.pin}</span>
    </div>
  `).join("");

  /* Activity log */
  const activityEl = $("#side-activity");
  function logActivity(msg) {
    const now = new Date();
    const t = now.toTimeString().slice(0, 5);
    const row = document.createElement("div");
    row.className = "side-act-row";
    row.innerHTML = `<span class="t">${t}</span><span class="msg">${msg}</span>`;
    activityEl.prepend(row);
    while (activityEl.children.length > 12) activityEl.removeChild(activityEl.lastChild);
  }
  // Pre-seed log
  [
    { t: "10:42", m: 'RTP recomputed: <b>95.42%</b> → <b>95.45%</b>' },
    { t: "10:40", m: 'imported IR <b>5x3-243ways.json</b>' },
    { t: "10:38", m: 'MC run <b>1M</b> complete · drift <span class="ok">0.013%</span>' },
    { t: "10:35", m: 'CI gate <b>W196</b> · <span class="ok">PASS</span>' },
    { t: "10:30", m: 'commit <b>#bf9b1be</b> pinned' },
    { t: "10:24", m: 'L&W M6 closed · <span class="ok">100% cov</span>' },
    { t: "10:18", m: 'IR validated · 0 errors' },
  ].forEach(e => {
    const row = document.createElement("div");
    row.className = "side-act-row";
    row.innerHTML = `<span class="t">${e.t}</span><span class="msg">${e.m}</span>`;
    activityEl.appendChild(row);
  });

  /* ============================================================
     CATALOG — 97 patterns + 16 L&W gaps
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
    { code: "trigger", title: "Compound trigger gating", variance: "mid"  },
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
      arr.push({
        pid: "P-" + String(i + 1).padStart(3, "0"),
        title: g.title, wave: g.wave, pin: g.pin,
        rtp: rtpBand(i), var: lwVar[i], fam: lwFam[i], lw: g.m
      });
    });
    for (let i = 16; i < 97; i++) {
      const f = FAM[i % FAM.length];
      arr.push({
        pid: "P-" + String(i + 1).padStart(3, "0"),
        title: f.title + " · variant " + Math.floor(i / FAM.length + 1),
        wave: "W" + String(49 + i * 2).padStart(3, "0"),
        pin: hexHash(i), rtp: rtpBand(i), var: f.variance, fam: f.code, lw: null
      });
    }
    return arr;
  }
  const PATTERNS = makePatterns();

  // L&W chip strip
  const lwChipsEl = $("#lw-chips");
  LW_GAPS.forEach((g, i) => {
    const c = document.createElement("button");
    c.className = "lw-chip";
    c.innerHTML = `<b>${g.m}</b><span>${g.title}</span>`;
    c.addEventListener("click", () => selectPattern("P-" + String(i + 1).padStart(3, "0")));
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
    const p = PATTERNS.find(x => x.pid === pid);
    if (!p) return;
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
      colossal: "E[col] = Σ frame_p · merged_payout(frame)",
    };
    $("#cd-formula").textContent = formulae[p.fam] || "E[X] = Σ p_i · v_i  (closed-form solver)";
  }
  renderCards();
  selectPattern("P-006");

  $("#cat-search").addEventListener("input", e => renderCards(e.target.value.toLowerCase()));
  $("#lw-only").addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase()));
  $$(".filter-block input[type='checkbox']").forEach(cb => cb.addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase())));

  $("#cd-insert").addEventListener("click", () => {
    const o = $("#cd-insert").textContent;
    $("#cd-insert").textContent = "Inserted into BUILD ✓";
    setTimeout(() => $("#cd-insert").textContent = o, 1400);
    goToTab("build");
  });

  /* ============================================================
     PLAY tab — spin
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
    const b = $("#btn-replay");
    const o = b.textContent;
    b.textContent = "Replaying " + $("#seed-override").value + " …";
    setTimeout(() => b.textContent = "✓ replay matched · 0 drift", 700);
    setTimeout(() => b.textContent = o, 2200);
  });

  /* ============================================================
     SENSITIVITY tab — sliders + heatmap + curve
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
    { name: "base_reel_weight_var", val: 4.0,    min: 0.0,  max: 20 },
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
      $("#param-list").querySelector(`.pl-val[data-i="${i}"]`).textContent = fmtVal(+s.value);
      regenHeatmap();
    });
  });

  function heatColor(t) {
    // gradient: bg-3 (cold) → cyan (hot)
    const c1 = [31, 37, 47];
    const c2 = [34, 211, 238];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r},${g},${b})`;
  }
  const heatmapEl = $("#heatmap");
  function regenHeatmap() {
    heatmapEl.innerHTML = "";
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 16; c++) {
        const xN = c / 15, yN = r / 11;
        const v = 0.93 + 0.04 * Math.exp(-((xN - 0.6) ** 2 + (yN - 0.4) ** 2) * 6)
                + 0.012 * Math.sin(xN * 4) * Math.cos(yN * 3);
        const t = Math.max(0, Math.min(1, (v - 0.91) / 0.06));
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.style.background = heatColor(t);
        cell.title = `RTP ${(v * 100).toFixed(2)}%`;
        heatmapEl.appendChild(cell);
      }
    }
  }
  regenHeatmap();

  /* ============================================================
     CERTIFY tab — MC, RNG, jurisdictions, PAR sections
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
  const btnMc = $("#btn-mc"), mcProg = $(".progress > i"), mcStat = $("#mc-stat");
  btnMc?.addEventListener("click", () => {
    if (btnMc.dataset.running === "1") return;
    btnMc.dataset.running = "1";
    btnMc.textContent = "Running…";
    let p = 0;
    const targ = formatMC(mcSize);
    mcStat.innerHTML = `<b>running</b> · 0 / ${targ} · ETA 12s`;
    const iv = setInterval(() => {
      p += 2 + Math.random() * 4;
      if (p >= 100) p = 100;
      mcProg.style.width = p + "%";
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
        setTimeout(() => mcProg.style.width = "0%", 600);
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
    const b = $("#btn-package");
    const o = b.innerHTML;
    b.innerHTML = `Bundling 153 artefacts… <span class="filename">10 categories · ed25519 sign</span>`;
    setTimeout(() => {
      b.innerHTML = `Ready · operator-package.zip <span class="filename">42.8 MB · sha256 e1a4…c8d2</span>`;
      setTimeout(() => b.innerHTML = o, 2400);
    }, 900);
  });

  /* ============================================================
     WORKSPACE TABS (multi-IR)
     ============================================================ */
  $$(".ws-tab").forEach(t => {
    t.addEventListener("click", e => {
      if (e.target.classList.contains("ws-x")) {
        // close — just hide
        t.style.display = "none";
        e.stopPropagation();
        return;
      }
      $$(".ws-tab").forEach(x => x.classList.remove("is-active"));
      t.classList.add("is-active");
      const name = t.querySelector(".lbl")?.textContent || "";
      const pin  = t.querySelector(".ws-pin")?.textContent || "";
      $("#ir-name").textContent = name;
      $("#ir-pin").textContent = pin;
    });
  });

  /* ============================================================
     SIDE CHIPS toggle
     ============================================================ */
  $$("#side-chips .side-chip").forEach(c => {
    c.addEventListener("click", () => {
      $$("#side-chips .side-chip").forEach(x => x.classList.remove("is-active"));
      c.classList.add("is-active");
    });
  });

  /* ============================================================
     SAVE/EXPORT button stubs
     ============================================================ */
  $("#btn-save")?.addEventListener("click", () => {
    const b = $("#btn-save");
    const o = b.textContent;
    b.textContent = "Saving…";
    setTimeout(() => { b.textContent = "Saved ✓"; logActivity("workspace saved"); }, 300);
    setTimeout(() => b.textContent = o, 1400);
  });
  $("#btn-export")?.addEventListener("click", () => {
    const b = $("#btn-export");
    const o = b.textContent;
    b.textContent = "Exporting IR…";
    setTimeout(() => b.textContent = o, 1200);
  });

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
})();
