/* =============================================================
   Slot Math Studio · v3-dark-deep
   Midnight navy + amber-gold · Bloomberg Trading Floor energy
   Vanilla JS, no deps. Dynamic symbol tier configurator,
   workspace switcher, IR library tree, command palette,
   icon picker, Bloomberg ticker.
   ============================================================= */

(() => {
  "use strict";

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ============================================================
     ICON LIBRARY (40 glyphs across 4 categories)
     ============================================================ */
  const ICON_LIB = {
    geometric: ["triangle","square","hexagon","octagon","circle","diamond","star5","star6","chevron","arrow"],
    abstract:  ["spiral","wave","knot","lattice","prism","shard","crystal","vortex","cipher","orbit","rune","sigil"],
    symbolic:  ["flame","anchor","key","gear","leaf","drop","mountain","sun","moon","eye","feather","scales","coin","compass"],
    special:   ["wild","scatter","bonus","mult"],
  };
  const ALL_ICONS = [
    ...ICON_LIB.geometric, ...ICON_LIB.abstract,
    ...ICON_LIB.symbolic, ...ICON_LIB.special,
  ];

  // Default icon assignments per tier (cycles through the relevant categories)
  const DEFAULT_HP_ICONS = ["crystal","diamond","star6","sigil","rune","prism","shard","lattice"];
  const DEFAULT_MP_ICONS = ["hexagon","star5","octagon","compass","gear","orbit","cipher","vortex"];
  const DEFAULT_LP_ICONS = ["circle","square","triangle","chevron","arrow","wave","drop","knot"];
  const DEFAULT_HP_NAMES = ["Sapphire","Ruby","Emerald","Topaz","Onyx","Pearl","Garnet","Opal"];
  const DEFAULT_MP_NAMES = ["Crown","Compass","Coin","Cog","Orbit","Cipher","Vortex","Lyre"];
  const DEFAULT_LP_NAMES = ["Sphere","Block","Spire","Arc","Bolt","Wave","Drop","Knot"];

  /* ============================================================
     STATE — single workspace at a time, restored per ws-switch
     ============================================================ */
  const initialState = (irName) => ({
    irName: irName,
    pool:  { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 1 },
    symbols: [],      // array of { id, tier, code, name, icon, weight, x3, x4, x5 }
    reels:    null,   // 5 columns of symbol-ids (generated)
    weights:  [22,20,18,20,20],
    rtp: 95.42, hit: 27.83, sigma: 8.41, maxWin: 2145,
  });

  const workspaces = {
    wsA: initialState("lava-falls-v0.4.12"),
    wsB: initialState("pearl-dive-v0.2.05"),
    wsC: initialState("solar-path-v0.1.18"),
  };
  let currentWs = "wsA";
  let state = workspaces[currentWs];

  /* ============================================================
     SYMBOL POOL → SYMBOL ARRAY GENERATION (dynamic)
     ============================================================ */
  function regenerateSymbols(preservePrev = true) {
    const prev = state.symbols || [];
    const pmap = {};
    prev.forEach(s => { pmap[s.id] = s; });

    const out = [];

    // HP (high pay)
    for (let i = 0; i < state.pool.HP; i++) {
      const id = `HP${i+1}`;
      out.push(buildSymbol(id, "HP", i, pmap));
    }
    // MP
    for (let i = 0; i < state.pool.MP; i++) {
      const id = `MP${i+1}`;
      out.push(buildSymbol(id, "MP", i, pmap));
    }
    // LP
    for (let i = 0; i < state.pool.LP; i++) {
      const id = `LP${i+1}`;
      out.push(buildSymbol(id, "LP", i, pmap));
    }
    // WILD
    for (let i = 0; i < state.pool.WILD; i++) {
      const id = state.pool.WILD === 1 ? "WILD" : `WILD${i+1}`;
      out.push(buildSymbol(id, "WILD", i, pmap));
    }
    // SCATTER
    for (let i = 0; i < state.pool.SCATTER; i++) {
      const id = state.pool.SCATTER === 1 ? "SCATTER" : `SCATTER${i+1}`;
      out.push(buildSymbol(id, "SCATTER", i, pmap));
    }
    // MULT / Bonus
    for (let i = 0; i < state.pool.MULT; i++) {
      const id = state.pool.MULT === 1 ? "MULT" : `MULT${i+1}`;
      out.push(buildSymbol(id, "MULT", i, pmap));
    }

    state.symbols = out;
    generateReels();
  }

  function buildSymbol(id, tier, idx, prevMap) {
    if (prevMap && prevMap[id]) return prevMap[id];
    let icon, name, x3, x4, x5;
    if (tier === "HP") {
      icon = DEFAULT_HP_ICONS[idx % DEFAULT_HP_ICONS.length];
      name = DEFAULT_HP_NAMES[idx % DEFAULT_HP_NAMES.length];
      x3 = 50 - idx*10; x4 = 250 - idx*50; x5 = 750 - idx*150;
    } else if (tier === "MP") {
      icon = DEFAULT_MP_ICONS[idx % DEFAULT_MP_ICONS.length];
      name = DEFAULT_MP_NAMES[idx % DEFAULT_MP_NAMES.length];
      x3 = 25 - idx*5; x4 = 100 - idx*20; x5 = 300 - idx*60;
    } else if (tier === "LP") {
      icon = DEFAULT_LP_ICONS[idx % DEFAULT_LP_ICONS.length];
      name = DEFAULT_LP_NAMES[idx % DEFAULT_LP_NAMES.length];
      x3 = 10 - idx*2; x4 = 40 - idx*8; x5 = 120 - idx*20;
    } else if (tier === "WILD") {
      icon = "wild"; name = idx === 0 ? "Wild" : `Wild ${idx+1}`;
      x3 = 0; x4 = 0; x5 = 0;
    } else if (tier === "SCATTER") {
      icon = "scatter"; name = idx === 0 ? "Scatter" : `Scatter ${idx+1}`;
      x3 = 5; x4 = 20; x5 = 100;
    } else if (tier === "MULT") {
      icon = "mult"; name = idx === 0 ? "Multiplier" : `Mult ${idx+1}`;
      x3 = 0; x4 = 0; x5 = 0;
    }
    return {
      id, tier, code: id, name, icon,
      weight: tier === "WILD" ? 4 : tier === "SCATTER" ? 3 : tier === "MULT" ? 2 : (tier === "HP" ? 8 : tier === "MP" ? 12 : 18),
      x3: Math.max(3, x3), x4: Math.max(6, x4), x5: Math.max(10, x5),
    };
  }

  function generateReels() {
    const ids = state.symbols.map(s => s.id);
    if (ids.length === 0) { state.reels = [[],[],[],[],[]]; return; }
    const cols = [];
    for (let r = 0; r < 5; r++) {
      const col = [];
      for (let p = 0; p < 12; p++) {
        // weighted-ish pick — cycle through ids with offset
        col.push(ids[(p * (r+1) + r*3) % ids.length]);
      }
      cols.push(col);
    }
    state.reels = cols;
  }

  /* ============================================================
     RENDER: Symbol Pool Configurator (sliders)
     ============================================================ */
  function bindPool() {
    $$('input[type="range"][data-pool]').forEach(sl => {
      sl.addEventListener("input", () => {
        const key = sl.dataset.pool;
        const val = +sl.value;
        state.pool[key] = val;
        $(`[data-count="${key}"]`).textContent = val;
        $("#pool-total").textContent = totalPool();
        regenerateSymbols(true);
        renderSymTable();
        renderReels();
        scheduleRecompute(`pool.${key} → ${val}`);
      });
    });
  }
  function totalPool() {
    return state.pool.HP + state.pool.MP + state.pool.LP
         + state.pool.WILD + state.pool.SCATTER + state.pool.MULT;
  }
  function syncPoolUI() {
    Object.keys(state.pool).forEach(k => {
      const sl = $(`input[type="range"][data-pool="${k}"]`);
      if (sl) sl.value = state.pool[k];
      const cnt = $(`[data-count="${k}"]`);
      if (cnt) cnt.textContent = state.pool[k];
    });
    $("#pool-total").textContent = totalPool();
  }

  /* ============================================================
     RENDER: Symbol Table (dynamic, reactive)
     ============================================================ */
  function renderSymTable() {
    const body = $("#symtable-body");
    if (!body) return;
    body.innerHTML = state.symbols.map(s => `
      <tr data-id="${s.id}">
        <td><span class="st-tier tier-${s.tier}">${s.tier}</span></td>
        <td class="st-code">${s.code}</td>
        <td><input class="st-name" value="${escapeAttr(s.name)}" data-id="${s.id}"/></td>
        <td><span class="st-icon" data-id="${s.id}" title="Change icon"><svg style="color:${iconColor(s)}"><use href="#ic-${s.icon}"/></svg></span></td>
        <td><div class="st-weight"><input type="range" min="1" max="40" value="${s.weight}" data-id="${s.id}"/><span class="pct">${s.weight}</span></div></td>
        <td><input class="st-pay" value="${s.x3}" data-id="${s.id}" data-field="x3"${nonpayDisabled(s)}/></td>
        <td><input class="st-pay" value="${s.x4}" data-id="${s.id}" data-field="x4"${nonpayDisabled(s)}/></td>
        <td><input class="st-pay" value="${s.x5}" data-id="${s.id}" data-field="x5"${nonpayDisabled(s)}/></td>
        <td><button class="st-action" data-id="${s.id}" title="More">⋯</button></td>
      </tr>
    `).join("");

    // bind name change
    $$('.st-name', body).forEach(inp => {
      inp.addEventListener("input", () => {
        const s = state.symbols.find(x => x.id === inp.dataset.id);
        if (s) s.name = inp.value;
        renderContribution();
      });
    });
    // bind icon picker
    $$('.st-icon', body).forEach(el => {
      el.addEventListener("click", () => openPicker(el.dataset.id));
    });
    // bind weight slider
    $$('.st-weight input[type="range"]', body).forEach(sl => {
      sl.addEventListener("input", () => {
        const s = state.symbols.find(x => x.id === sl.dataset.id);
        if (s) {
          s.weight = +sl.value;
          sl.nextElementSibling.textContent = sl.value;
          scheduleRecompute(`weight Δ ${s.id}`);
        }
      });
    });
    // bind pay inputs
    $$('.st-pay', body).forEach(inp => {
      inp.addEventListener("input", () => {
        const s = state.symbols.find(x => x.id === inp.dataset.id);
        if (s) {
          const v = parseInt(inp.value, 10);
          if (isFinite(v)) s[inp.dataset.field] = v;
          scheduleRecompute(`pay Δ ${s.id}·${inp.dataset.field}`);
        }
      });
    });
  }
  function nonpayDisabled(s) {
    return (s.tier === "WILD" || s.tier === "MULT") ? " disabled" : "";
  }
  function iconColor(s) {
    if (s.tier === "HP")      return "var(--amber)";
    if (s.tier === "MP")      return "var(--copper)";
    if (s.tier === "LP")      return "var(--steel)";
    if (s.tier === "WILD")    return "var(--amber)";
    if (s.tier === "SCATTER") return "var(--copper)";
    if (s.tier === "MULT")    return "var(--moss)";
    return "var(--text-1)";
  }
  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  /* ============================================================
     RENDER: Reel Editor
     ============================================================ */
  function renderReels() {
    const root = $("#reels");
    if (!root) return;
    root.innerHTML = "";
    if (!state.reels) generateReels();
    state.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      reel.innerHTML = `
        <div class="reel-head"><span class="idx">REEL ${ri+1}</span><span>${col.length} pos</span></div>
        <div class="reel-cells">
          ${col.map((sid, pi) => {
            const s = state.symbols.find(x => x.id === sid);
            if (!s) return `<div class="reel-cell empty" data-reel="${ri}" data-pos="${pi}"></div>`;
            return `<div class="reel-cell" data-reel="${ri}" data-pos="${pi}" style="color:${iconColor(s)}">
              <svg><use href="#ic-${s.icon}"/></svg>
              <span class="pmf">${(s.weight / state.symbols.reduce((a,b)=>a+b.weight,0) * 100).toFixed(1)}%</span>
            </div>`;
          }).join("")}
        </div>
        <div class="reel-foot">
          <div class="wt-row"><input type="range" min="5" max="40" value="${state.weights[ri]}" data-reel="${ri}"/><span class="pct">${state.weights[ri].toFixed(1)}%</span></div>
        </div>
      `;
      root.appendChild(reel);
    });
    $$('.reel-foot input[type="range"]').forEach(sl => {
      sl.addEventListener("input", () => {
        const ri = +sl.dataset.reel;
        state.weights[ri] = +sl.value;
        sl.nextElementSibling.textContent = (+sl.value).toFixed(1) + "%";
        scheduleRecompute(`reel ${ri+1} weight`);
      });
    });
  }

  /* ============================================================
     RECOMPUTE (synthetic but reactive)
     ============================================================ */
  let recomputeT = null;
  function scheduleRecompute(reason) {
    clearTimeout(recomputeT);
    recomputeT = setTimeout(() => compute(reason), 120);
  }
  function compute(reason) {
    const wAvg = state.weights.reduce((a,b)=>a+b,0) / 5;
    const pm = state.symbols.reduce((acc, s) => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0, SCATTER: 0.22, MULT: 0 }[s.tier];
      return acc + (s.x3 * 0.62 + s.x4 * 0.12 + s.x5 * 0.018) * tW * (s.weight / 20);
    }, 0);
    const rtp = Math.max(82, Math.min(99, 88 + pm * 0.012 + (wAvg - 20) * 0.04));
    const hit = Math.max(14, Math.min(46, 22 + pm * 0.0011));
    const sigma = 4 + Math.min(14, pm * 0.001 + (rtp > 95 ? 4 : 2));
    const maxW = Math.round(700 + pm * 1.6);
    state.rtp = rtp; state.hit = hit; state.sigma = sigma; state.maxWin = maxW;

    // update DOM (multiple locations)
    setText("#gs-rtp",    rtp.toFixed(2) + "%");
    setText("#gs-sigma",  sigma.toFixed(2));
    setText("#gs-hit",    hit.toFixed(2) + "%");
    setText("#gs-max",    maxW.toLocaleString("en-US").replace(/,/g," ") + "×");
    const ms = (0.8 + Math.random() * 1.6).toFixed(1);
    setText("#gs-time",   ms + " ms");
    const drift = (rtp - 96).toFixed(2);
    setText("#gs-drift",  (drift > 0 ? "+" : "") + drift + " pp");

    // right rail
    const rtpEl = $("#mr-rtp");
    if (rtpEl) rtpEl.innerHTML = rtp.toFixed(2) + '<span class="unit">%</span>';
    setText("#mr-hit", hit.toFixed(2) + "%");
    // gauge arc — sweeps from 88% to 99% mapped to arc length
    const t = Math.max(0, Math.min(1, (rtp - 88) / 11));
    updateGaugeArc(t, rtp);

    renderContribution();
  }
  function setText(sel, txt) {
    const el = $(sel); if (el) el.textContent = txt;
  }
  function updateGaugeArc(t, rtp) {
    const arc = $("#gauge-arc");
    if (!arc) return;
    const startA = Math.PI; // 180deg = left
    const endA = startA - t * Math.PI; // sweep toward right
    const cx = 100, cy = 90, r = 80;
    const x = cx + r * Math.cos(endA);
    const y = cy + r * Math.sin(endA);
    const large = t > 0.5 ? 1 : 0;
    arc.setAttribute("d", `M 18 90 A 80 80 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}`);
    // text label inside gauge
    const txt = arc.parentElement && arc.parentElement.querySelector("text");
    if (txt) txt.textContent = rtp.toFixed(2) + "%";
  }

  function renderContribution() {
    const root = $("#mr-contrib");
    if (!root) return;
    const total = state.symbols.reduce((a,s) => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0.05, SCATTER: 0.22, MULT: 0.04 }[s.tier];
      return a + (s.x3 * 0.6 + s.x4 * 0.15 + s.x5 * 0.025) * tW * (s.weight / 20);
    }, 0) || 1;
    const rows = state.symbols.map(s => {
      const tW = { HP: 0.18, MP: 0.55, LP: 1.0, WILD: 0.05, SCATTER: 0.22, MULT: 0.04 }[s.tier];
      const c = (s.x3 * 0.6 + s.x4 * 0.15 + s.x5 * 0.025) * tW * (s.weight / 20);
      return { s, pc: (c / total) * 100 };
    }).sort((a,b) => b.pc - a.pc).slice(0, 7);
    root.innerHTML = rows.map(({ s, pc }) => {
      const cls = s.tier === "SCATTER" ? "cu" : s.tier === "MULT" ? "st" : "";
      return `<div class="contrib-row ${cls}">
        <span class="lbl">${s.code}</span>
        <div class="bar"><i style="width:${Math.max(2, pc * 1.4).toFixed(1)}%"></i></div>
        <span class="pc">${pc.toFixed(1)}%</span>
      </div>`;
    }).join("");
  }

  /* ============================================================
     WORKSPACE SWITCHER
     ============================================================ */
  function switchWorkspace(wsId) {
    // save current state
    workspaces[currentWs] = state;
    currentWs = wsId;
    state = workspaces[wsId] || initialState("workspace-" + wsId);
    workspaces[wsId] = state;

    // update UI tabs
    $$(".ws-tab").forEach(b => {
      const on = b.dataset.ws === wsId;
      b.classList.toggle("is-active", on);
    });
    setText("#ctx-ir", state.irName);

    // re-render
    syncPoolUI();
    if (!state.symbols.length) regenerateSymbols(false);
    renderSymTable();
    renderReels();
    compute();
  }
  $$(".ws-tab").forEach(b => {
    b.addEventListener("click", e => {
      if (e.target.classList.contains("ws-close")) {
        // simulate close — actually just no-op to preserve mockup state
        e.stopPropagation();
        return;
      }
      switchWorkspace(b.dataset.ws);
    });
  });
  $("#ws-new")?.addEventListener("click", () => {
    const newId = "ws" + String.fromCharCode(65 + $$(".ws-tab").length);
    const name = "Workspace " + newId.slice(2);
    workspaces[newId] = initialState(name.toLowerCase() + "-v0.1.0");
    const btn = document.createElement("button");
    btn.className = "ws-tab";
    btn.dataset.ws = newId;
    btn.innerHTML = `<span class="ws-dot"></span>${name} <span class="ws-close" aria-hidden="true">×</span>`;
    btn.addEventListener("click", () => switchWorkspace(newId));
    $("#ws-tabs").insertBefore(btn, $("#ws-new"));
    switchWorkspace(newId);
  });

  /* ============================================================
     TAB ROUTING
     ============================================================ */
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".tab").forEach(t => {
        const on = t === btn;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on);
      });
      $$(".panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + tab));
    });
  });
  // arrow key navigation
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
     PERSONA SWITCHER
     ============================================================ */
  function setPersona(p) {
    document.body.classList.remove("persona-math", "persona-design", "persona-producer");
    document.body.classList.add("persona-" + p);
    $$(".persona-btn").forEach(b => {
      const on = b.dataset.persona === p;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
  }
  $$(".persona-btn").forEach(b => b.addEventListener("click", () => setPersona(b.dataset.persona)));
  setPersona("math");

  /* ============================================================
     IR LIBRARY TREE (left rail)
     ============================================================ */
  const IR_TREE = [
    { label: "Workspaces", type: "section", children: [
      { label: "Lava Falls",  type: "leaf", meta: "wsA · active" },
      { label: "Pearl Dive",  type: "leaf", meta: "wsB" },
      { label: "Solar Path",  type: "leaf", meta: "wsC" },
    ]},
    { label: "IR Library · 5×3", type: "section", children: [
      { label: "5x3-20lines.ir",      type: "leaf", meta: "rect" },
      { label: "5x3-50lines.ir",      type: "leaf", meta: "rect" },
      { label: "5x3-243ways.ir",      type: "leaf", meta: "rect" },
      { label: "5x3-classic-hold.ir", type: "leaf", meta: "rect" },
    ]},
    { label: "IR Library · 6×4 + Megaways", type: "section", children: [
      { label: "6x4-4096ways.ir",     type: "leaf", meta: "rect" },
      { label: "megaways-117649.ir",  type: "leaf", meta: "var"  },
      { label: "megaways-bank.ir",    type: "leaf", meta: "var"  },
    ]},
    { label: "IR Library · 7×7 cluster", type: "section", children: [
      { label: "cluster-7x7-base.ir",    type: "leaf", meta: "cluster" },
      { label: "cluster-7x7-cascade.ir", type: "leaf", meta: "cluster" },
      { label: "cluster-variable.ir",    type: "leaf", meta: "cluster" },
    ]},
    { label: "IR Library · Cascade", type: "section", children: [
      { label: "cascade-5x4.ir",     type: "leaf", meta: "rect" },
      { label: "cascade-cluster.ir", type: "leaf", meta: "cluster" },
    ]},
    { label: "IR Library · Hold & Win", type: "section", children: [
      { label: "hnw-markov-21x4.ir", type: "leaf", meta: "rect" },
      { label: "hnw-multipot.ir",    type: "leaf", meta: "rect" },
    ]},
    { label: "IR Library · Free Spins", type: "section", children: [
      { label: "fs-cascade-v3.ir",     type: "leaf", meta: "rect" },
      { label: "fs-multiplier-seq.ir", type: "leaf", meta: "rect" },
    ]},
    { label: "L&W Templates", type: "section", children: [
      { label: "M1 · Dragon Spin CrossLink",  type: "leaf", meta: "L&W W181", tag: "L&W" },
      { label: "M2 · Huff N' Puff",           type: "leaf", meta: "L&W W182", tag: "L&W" },
      { label: "M3 · Ultimate Fire Link",     type: "leaf", meta: "L&W W183", tag: "L&W" },
      { label: "M4 · Dancing Drums",          type: "leaf", meta: "L&W W184", tag: "L&W" },
      { label: "M5 · Quick Hit mystery",      type: "leaf", meta: "L&W W185", tag: "L&W" },
      { label: "M6 · Triple Cash Wheel",      type: "leaf", meta: "Bally W196", tag: "L&W" },
      { label: "M13 · WOZ Yellow-Brick",      type: "leaf", meta: "WMS W195", tag: "L&W" },
      { label: "M16 · Stellar Jackpots wrap", type: "leaf", meta: "L-Box W194", tag: "L&W" },
    ]},
    { label: "Recent Files", type: "section", children: [
      { label: "tide-lattice-v0.3.77", type: "leaf", meta: "14m ago" },
      { label: "cascade-cluster.ir",   type: "leaf", meta: "1h ago" },
      { label: "hnw-markov-21x4.ir",   type: "leaf", meta: "yesterday" },
    ]},
    { label: "Pinned ★", type: "section", children: [
      { label: "★ Lava Falls master",   type: "leaf", meta: "pinned" },
      { label: "★ M6 Triple Cash Wheel",type: "leaf", meta: "pinned" },
    ]},
  ];
  function renderLibTree() {
    const root = $("#lib-tree");
    if (!root) return;
    root.innerHTML = IR_TREE.map(section => `
      <div class="lib-section">
        <div class="lib-section-h">
          <span>${section.label}</span>
          <span class="meta">${section.children.length}</span>
        </div>
        ${section.children.map((leaf, i) => `
          <div class="lib-leaf ${i===0 && section.label==='Workspaces'?'is-active':''}" data-leaf="${escapeAttr(leaf.label)}">
            <span>${leaf.label}</span>
            <span class="lib-meta">${leaf.tag ? `<span class="lib-tag">${leaf.tag}</span> ` : ""}${leaf.meta}</span>
          </div>
        `).join("")}
      </div>
    `).join("");

    $$('.lib-leaf', root).forEach(el => {
      el.addEventListener("click", () => {
        $$('.lib-leaf').forEach(x => x.classList.remove("is-active"));
        el.classList.add("is-active");
        addLogEntry(`ir.load ${el.dataset.leaf}`);
      });
    });
  }

  /* ============================================================
     CATALOG (97 P-IDs + 16 L&W) — reuse v2-engine seed data
     ============================================================ */
  const LW_GAPS = [
    { m:"M1",  title:"Dragon Spin CrossLink Water",     wave:"W181", pin:"a1b2c3d" },
    { m:"M2",  title:"Huff N' Puff frame upgrade",      wave:"W182", pin:"b2c3d4e" },
    { m:"M3",  title:"Ultimate Fire Link grid-expand",  wave:"W183", pin:"c3d4e5f" },
    { m:"M4",  title:"Dancing Drums Explosion",         wave:"W184", pin:"d4e5f6a" },
    { m:"M5",  title:"Quick Hit reel-bound mystery",    wave:"W185", pin:"e5f6a7b" },
    { m:"M6",  title:"Triple Cash Wheel",               wave:"W196", pin:"bf9b1be" },
    { m:"M7",  title:"Spartacus Colossal Reels",        wave:"W187", pin:"fa1b2c3" },
    { m:"M8",  title:"Goldfish Race competitive pick",  wave:"W188", pin:"0b1c2d3" },
    { m:"M9",  title:"Big Bet UK paid-package",         wave:"W189", pin:"1c2d3e4" },
    { m:"M10", title:"RR Megaways Bonus Bank",          wave:"W190", pin:"2d3e4f5" },
    { m:"M11", title:"Player-elects Composition",       wave:"W191", pin:"3e4f5a6" },
    { m:"M12", title:"Munchkinland random injection",   wave:"W192", pin:"4f5a6b7" },
    { m:"M13", title:"WOZ YBR Glinda reshape",          wave:"W195", pin:"3dbf5ca" },
    { m:"M14", title:"LOTR Two Towers nested slot",     wave:"W193", pin:"5a6b7c8" },
    { m:"M15", title:"Rich Little Piggies multi-pot",   wave:"W194", pin:"7b16ddb" },
    { m:"M16", title:"Stellar Jackpots arcade wrapper", wave:"W194", pin:"7b16ddb" },
  ];
  const FAM = [
    { code:"hnw",      title:"Hold & Win persistence",    v:"high" },
    { code:"cascade",  title:"Cascade chain",             v:"mid"  },
    { code:"cluster",  title:"Cluster pays",              v:"mid"  },
    { code:"fs",       title:"Free spins multiplier",     v:"high" },
    { code:"wheel",    title:"Wheel bonus prize",         v:"mid"  },
    { code:"pick",     title:"Pick-em selector",          v:"low"  },
    { code:"mw",       title:"Megaways variable rows",    v:"high" },
    { code:"colossal", title:"Colossal reels merge",      v:"high" },
    { code:"wild",     title:"Expanding wild",            v:"mid"  },
    { code:"sticky",   title:"Sticky wild persistence",   v:"high" },
    { code:"walking",  title:"Walking wild step",         v:"mid"  },
    { code:"mystery",  title:"Mystery symbol reveal",     v:"mid"  },
    { code:"upgrade",  title:"Symbol upgrade ladder",     v:"mid"  },
    { code:"hex",      title:"Hexagonal cluster",         v:"high" },
    { code:"both",     title:"Both-ways pay",             v:"low"  },
    { code:"jackpot",  title:"WAP multi-jackpot",         v:"high" },
  ];
  function hexHash(seed) {
    return ((seed * 2654435761) >>> 0).toString(16).padStart(8,"0").slice(0,7);
  }
  function rtpBand(i) {
    const bands = ["88.4–92.1%","92.0–94.2%","94.1–96.4%","95.5–97.2%","96.0–98.0%"];
    return bands[i % bands.length];
  }
  function makePatterns() {
    const arr = [];
    LW_GAPS.forEach((g, i) => {
      arr.push({
        pid: "P-" + String(i+1).padStart(3,"0"),
        title: g.title,
        wave: g.wave, pin: g.pin,
        rtp: rtpBand(i),
        var: ["mid","high","mid","high","high","high","high","mid","high","high","mid","high","high","high","high","mid"][i],
        fam: ["hnw","wild","cascade","fs","mystery","wheel","colossal","pick","fs","mw","cascade","mystery","cluster","fs","jackpot","jackpot"][i],
        lw: g.m,
      });
    });
    for (let i = 16; i < 97; i++) {
      const f = FAM[i % FAM.length];
      arr.push({
        pid: "P-" + String(i+1).padStart(3,"0"),
        title: f.title + " · variant " + Math.floor(i/FAM.length+1),
        wave: "W" + String(49 + i*2).padStart(3,"0"),
        pin: hexHash(i),
        rtp: rtpBand(i),
        var: f.v, fam: f.code, lw: null,
      });
    }
    return arr;
  }
  const PATTERNS = makePatterns();

  function renderLwChips() {
    const root = $("#lw-chips");
    if (!root) return;
    root.innerHTML = LW_GAPS.map((g, i) => `
      <button class="lw-chip" data-pid="P-${String(i+1).padStart(3,"0")}"><b>${g.m}</b>${g.title}</button>
    `).join("");
    $$('.lw-chip', root).forEach(c => c.addEventListener("click", () => selectPattern(c.dataset.pid)));
  }
  function renderCards(filter = "") {
    const root = $("#catalog-cards");
    if (!root) return;
    const lwOnly = $("#lw-only")?.checked;
    const m = PATTERNS.filter(p => {
      if (filter && !p.title.toLowerCase().includes(filter) && !p.pid.toLowerCase().includes(filter)) return false;
      if (lwOnly && !p.lw) return false;
      return true;
    });
    $("#cat-shown").textContent = `${m.length} of ${PATTERNS.length} shown`;
    root.innerHTML = m.map(p => `
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
    $$('.pcard', root).forEach(c => c.addEventListener("click", () => selectPattern(c.dataset.pid)));
  }
  function selectPattern(pid) {
    $$('.pcard').forEach(c => c.classList.toggle("is-active", c.dataset.pid === pid));
    const p = PATTERNS.find(x => x.pid === pid); if (!p) return;
    setText("#cd-id", p.pid);
    setText("#cd-title", p.title);
    setText("#cd-wave", `${p.wave} · ${p.pin}`);
    setText("#cd-rtp", `RTP ${p.rtp}`);
    setText("#cd-var", `var ${p.var.toUpperCase()}`);
    const lwEl = $("#cd-lw");
    if (p.lw) { lwEl.style.display = "inline-block"; lwEl.textContent = "L&W " + p.lw; }
    else lwEl.style.display = "none";
    const formulae = {
      hnw:"π_n · M = π_{n+1}\nE[win | bonus] = Σ π_i · v_i + Σ p_jackpot · v_jackpot",
      cascade:"E[chain] = Σ_{k=0..K} p_hit^k · μ_k · decay^k",
      fs:"E[FS] = Σ_{k=3..5} P(k scat) · μ_k · m̄",
      cluster:"E[win] = Σ_size P(size) · paytable(size)",
      mw:"E[lines] = Π_i rows_i / max_rows^5",
      wheel:"E[wheel] = Σ p_segment · prize_segment · trigger_p",
      pick:"E[pick] = Σ_{i=1..n} (Σ_{j=i..n} v_j) / (n-i+1)",
      jackpot:"E[jp] = Σ p_tier · jackpot_tier · WAP_share",
      colossal:"E[col] = Σ frame_p · merged_payout(frame)",
    };
    setText("#cd-formula", formulae[p.fam] || "E[X] = Σ p_i · v_i  (closed-form solver)");
  }

  /* ============================================================
     SENSITIVITY parameters + heatmap
     ============================================================ */
  const PARAMS = [
    { name:"scatter_trigger_p",    val:0.038, min:0.01, max:0.10 },
    { name:"fs_award",             val:10,    min:5,    max:30 },
    { name:"fs_multiplier_max",    val:5,     min:1,    max:20 },
    { name:"cascade_decay",        val:0.78,  min:0.4,  max:0.95 },
    { name:"cascade_max_chain",    val:8,     min:2,    max:16 },
    { name:"persistence_p",        val:0.62,  min:0.1,  max:0.95 },
    { name:"wild_density",         val:0.022, min:0.0,  max:0.08 },
    { name:"sticky_wild_life",     val:3,     min:1,    max:12 },
    { name:"expanding_wild_p",     val:0.18,  min:0.0,  max:0.6 },
    { name:"walking_wild_step",    val:1,     min:1,    max:4 },
    { name:"pick_count",           val:4,     min:2,    max:12 },
    { name:"wheel_segments",       val:12,    min:6,    max:24 },
    { name:"wheel_jackpot_p",      val:0.0008,min:0.0,  max:0.005 },
    { name:"mystery_reveal_rate",  val:0.27,  min:0.0,  max:1.0 },
    { name:"upgrade_step_prob",    val:0.4,   min:0.0,  max:1.0 },
    { name:"megaways_max_rows",    val:7,     min:2,    max:7 },
    { name:"max_bet_eur",          val:1.0,   min:0.10, max:50.0 },
    { name:"base_reel_weight_var", val:4.0,   min:0.0,  max:20 },
  ];
  function formatVal(v) {
    if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(2);
    if (Number.isInteger(v) || Math.abs(v) > 10) return v.toString();
    return v.toFixed(3);
  }
  function renderParams() {
    const root = $("#param-list");
    if (!root) return;
    root.innerHTML = PARAMS.map((p, i) => `
      <li>
        <div class="pl-name"><span>${p.name}</span><span class="pl-val" data-i="${i}">${formatVal(p.val)}</span></div>
        <div class="pl-range">
          <span class="pl-min">${formatVal(p.min)}</span>
          <input type="range" min="${p.min}" max="${p.max}" step="${(p.max-p.min)/200}" value="${p.val}" data-i="${i}"/>
          <span class="pl-max">${formatVal(p.max)}</span>
        </div>
      </li>
    `).join("");
    $$('input[type="range"]', root).forEach(sl => {
      sl.addEventListener("input", () => {
        const i = +sl.dataset.i;
        PARAMS[i].val = +sl.value;
        $(`.pl-val[data-i="${i}"]`).textContent = formatVal(+sl.value);
        regenHeatmap();
      });
    });
  }
  function regenHeatmap() {
    const root = $("#heatmap");
    if (!root) return;
    root.innerHTML = "";
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 16; c++) {
        const xN = c/15, yN = r/11;
        const v = 0.93 + 0.04 * Math.exp(-((xN-0.6)**2 + (yN-0.4)**2) * 6)
                + 0.012 * Math.sin(xN*4) * Math.cos(yN*3);
        const t = Math.max(0, Math.min(1, (v - 0.91) / 0.06));
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.style.background = heatColor(t);
        cell.title = `RTP ${(v*100).toFixed(2)}%`;
        root.appendChild(cell);
      }
    }
  }
  function heatColor(t) {
    // bg-3 (cold) → steel → moss → copper → amber (hot) — match midnight theme
    const stops = [
      [36, 48, 84],     // bg-3
      [122, 155, 196],  // steel
      [125, 166, 125],  // moss
      [198, 125, 67],   // copper
      [224, 167, 94],   // amber
    ];
    const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const localT = t * (stops.length - 1) - idx;
    const a = stops[idx], b = stops[idx + 1];
    const r = Math.round(a[0] + (b[0]-a[0])*localT);
    const g = Math.round(a[1] + (b[1]-a[1])*localT);
    const bl= Math.round(a[2] + (b[2]-a[2])*localT);
    return `rgb(${r},${g},${bl})`;
  }

  /* ============================================================
     CERTIFY — MC, PAR sections, jurisdictions
     ============================================================ */
  let mcSize = 1_000_000;
  $$(".mc-size").forEach(b => {
    b.addEventListener("click", () => {
      $$(".mc-size").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
      mcSize = +b.dataset.mc;
      const btn = $("#btn-mc");
      if (btn) btn.textContent = `Run · ${formatMC(mcSize)} spins`;
    });
  });
  function formatMC(n) {
    if (n >= 1e9) return (n/1e9) + " B";
    if (n >= 1e6) return (n/1e6) + " M";
    if (n >= 1e3) return (n/1e3) + " K";
    return n.toString();
  }
  $$(".rng-pill").forEach(p => {
    p.addEventListener("click", () => {
      $$(".rng-pill").forEach(x => x.classList.remove("is-active"));
      p.classList.add("is-active");
    });
  });
  $("#btn-mc")?.addEventListener("click", () => {
    const btn = $("#btn-mc");
    if (btn.dataset.running === "1") return;
    btn.dataset.running = "1";
    btn.textContent = "Running…";
    const targ = formatMC(mcSize);
    let p = 0;
    $("#mc-stat").innerHTML = `<b>running</b> · 0 / ${targ} · ETA 12s`;
    $("#bp-mc-val").textContent = "RUNNING";
    const bpBar = $("#bp-mc > i"), mcBar = $("#mc-progress > i");
    const iv = setInterval(() => {
      p += 2 + Math.random()*4;
      if (p >= 100) p = 100;
      bpBar.style.width = p + "%";
      mcBar.style.width = p + "%";
      const eta = Math.max(0, Math.round((100-p)*0.12));
      $("#mc-stat").innerHTML = `<b>running</b> · ${formatMC(Math.round(p/100 * mcSize))} / ${targ} · ETA ${eta}s`;
      if (p >= 100) {
        clearInterval(iv);
        const ci = mcSize >= 1e9 ? "±0.002%" : mcSize >= 1e8 ? "±0.006%" : mcSize >= 1e7 ? "±0.018%" : mcSize >= 1e6 ? "±0.058%" : "±0.18%";
        const rtp = (state.rtp + (Math.random()-0.5)*0.04).toFixed(3);
        $("#mc-stat").innerHTML = `<b style="color:var(--moss)">complete</b> · RTP ${rtp}% · CI95 ${ci}`;
        btn.textContent = `Run · ${targ} spins`;
        btn.dataset.running = "0";
        $("#bp-mc-val").textContent = "COMPLETE";
        addLogEntry(`mc.run ${targ} → ${rtp}% · CI ${ci}`);
        setTimeout(() => { bpBar.style.width = "0%"; mcBar.style.width = "0%"; $("#bp-mc-val").textContent = "IDLE"; }, 800);
      }
    }, 120);
  });

  const PAR_SECTIONS = [
    { h:"Identification",       kv:[["build id","TL-0.3.0"],["irhash","9F2E1B…AC04"],["engine","sme/77"]],         detail:"ISO/IEC 17025 traceable · SBOM cyclonedx-1.5 · ed25519 signed." },
    { h:"RTP & moments",        kv:[["RTP (closed)","95.421%"],["RTP (MC 1M)","95.408%"],["σ","8.41"]],            detail:"Closed-form from Markov 21×4; MC drift 0.013%." },
    { h:"Hit frequency",        kv:[["overall","27.83%"],["base","26.10%"],["feature","1.73%"]],                   detail:"Includes scatter pays + zero-win cascades." },
    { h:"Volatility band",      kv:[["category","MID"],["VI (TW)","11.6"],["SD / bet","8.41×"]],                   detail:"Per Taiwan KMOEA gambling spec." },
    { h:"Win distribution",     kv:[["P50","0.00×"],["P90","2.10×"],["P99","38.5×"]],                              detail:"Quantiles from 1M MC; tail vs closed-form CDF." },
    { h:"Jackpot exposure",     kv:[["cap","2 145×"],["hit prob.","1 : 3.4M"],["tail mass","2.1e-7"]],             detail:"Max-win cap per GLI-16 §6.1." },
    { h:"Compliance",           kv:[["FastFwd","PASS"],["SE hooks","PASS"],["UK pacing","2.5s OK"]],               detail:"Per-jurisdiction adapter validation." },
    { h:"Confidence intervals", kv:[["RTP CI95","±0.018%"],["σ CI95","±0.02"]],                                    detail:"Batch-means on 1M run, batch 1K." },
    { h:"Quantiles",            kv:[["P10","0.00×"],["P95","5.40×"],["P99.99","1100×"]],                           detail:"Regulator tail-risk assessment." },
    { h:"Moments",              kv:[["E[X]","0.954"],["E[X²]","71.2"],["E[X³]","8412"]],                           detail:"First three moments analytic." },
    { h:"Bonus distances",      kv:[["avg","48.2 sp"],["std","65.7 sp"],["P99","320 sp"]],                         detail:"Geometric distribution of trigger distance." },
    { h:"Required spins",       kv:[["95% CI ±0.1%","8.6M"],["99% CI ±0.05%","52.4M"]],                            detail:"Spins to achieve CI band per closed-form variance." },
  ];
  function renderPar() {
    const root = $("#par-sections");
    if (!root) return;
    root.innerHTML = PAR_SECTIONS.map((s, i) => `
      <div class="par-section">
        <h5>${s.h} <span class="num">${String(i+1).padStart(2,"0")}</span></h5>
        ${s.kv.map(([k,v]) => `<div class="par-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
        <div class="par-detail"><div class="par-kv"><span class="k" style="font-style:italic">${s.detail}</span></div></div>
      </div>
    `).join("");
    $$('.par-section').forEach(el => el.addEventListener("click", () => el.classList.toggle("is-open")));
  }

  const JURIS = [
    { code:"ukgc",   name:"UKGC",      sub:"UK · RTS 7A/12/14",       state:"on",  uk:true },
    { code:"mga",    name:"MGA",       sub:"Malta · DOI/SR 06",       state:"on" },
    { code:"adm",    name:"ADM",       sub:"Italy · D.D. 39/2011",    state:"" },
    { code:"ecogra", name:"eCOGRA",    sub:"GAP v6",                  state:"on" },
    { code:"dgoj",   name:"DGOJ",      sub:"Spain · RNG-2023",        state:"on" },
    { code:"se",     name:"SE",        sub:"Sweden · SIFO-23",        state:"" },
    { code:"pa",     name:"PA",        sub:"Portugal · SRIJ §V",      state:"" },
    { code:"nl",     name:"NL",        sub:"NL · KSA Cruks",          state:"" },
    { code:"de",     name:"DE",        sub:"Germany GGL · GlüStV",    state:"" },
    { code:"caon",   name:"CA-ON",     sub:"Ontario · iGOR",          state:"on" },
    { code:"au",     name:"AU",        sub:"NSW GMC + state",         state:"" },
    { code:"nz",     name:"NZ",        sub:"DIA Class 4",             state:"" },
    { code:"jp",     name:"JP",        sub:"Pachislot 80%-cycle",     state:"" },
    { code:"kr",     name:"KR",        sub:"NGCC",                    state:"" },
    { code:"br",     name:"BR",        sub:"SBT/MF 1.330/23",         state:"" },
  ];
  function renderJuris() {
    const root = $("#juris-grid");
    if (!root) return;
    root.innerHTML = JURIS.map(j => `
      <div class="juris-chip ${j.state} ${j.uk?'uk-crit':''}" data-juris="${j.code}">
        <b>${j.name}</b><small>${j.sub}</small>
      </div>
    `).join("");
    $$('.juris-chip', root).forEach(c => c.addEventListener("click", () => c.classList.toggle("on")));
  }

  /* ============================================================
     PLAY — SPIN button mock + history
     ============================================================ */
  let spinCounter = 42;
  $("#btn-spin")?.addEventListener("click", () => {
    spinCounter++;
    const machine = $("#machine");
    if (machine) {
      $$('.cell', machine).forEach(c => { c.style.opacity = ".4"; setTimeout(() => c.style.opacity = "1", 250 + Math.random()*300); });
    }
    const win = Math.random() < 0.32;
    const amt = win ? (Math.random()*18 + 0.5).toFixed(2) : "0.00";
    const sym = state.symbols.filter(s => s.tier !== "WILD" && s.tier !== "MULT")[0];
    const desc = win ? `3× ${sym ? sym.name.toUpperCase() : "PRISM"} · line ${1 + Math.floor(Math.random()*15)}` : "no win";
    const hist = $("#history");
    if (hist) {
      const row = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML = `<span class="n">#${String(spinCounter).padStart(3,"0")}</span><span class="res ${win?'win':'loss'}">${desc}</span><span class="amt ${win?'':'zero'}">${win?'+'+amt:'0.00'}</span>`;
      hist.prepend(row);
      while (hist.children.length > 14) hist.removeChild(hist.lastChild);
    }
    setText("#merkle-hash", `${hexHash(spinCounter*31)}${hexHash(spinCounter*7)} · ${hexHash(spinCounter)} · spin ${String(spinCounter).padStart(3,"0")}`);
  });
  $("#btn-replay")?.addEventListener("click", () => {
    const b = $("#btn-replay");
    const orig = b.textContent;
    b.textContent = "Replaying " + $("#seed-override").value + "…";
    setTimeout(() => b.textContent = "✓ replay matched · 0 drift", 700);
    setTimeout(() => b.textContent = orig, 2200);
  });

  $("#btn-package")?.addEventListener("click", () => {
    const b = $("#btn-package");
    const orig = b.innerHTML;
    b.innerHTML = `Bundling 153 artefacts… <span class="filename">10 categories · ed25519</span>`;
    setTimeout(() => {
      b.innerHTML = `Ready · operator-package.zip <span class="filename">42.8 MB · sha256 e1a4…c8d2</span>`;
      setTimeout(() => b.innerHTML = orig, 2400);
    }, 900);
  });

  /* ============================================================
     ICON PICKER MODAL
     ============================================================ */
  let pickerForId = null;
  function openPicker(symbolId) {
    pickerForId = symbolId;
    const grid = $("#picker-grid");
    grid.innerHTML = "";
    Object.entries(ICON_LIB).forEach(([cat, list]) => {
      const h = document.createElement("div");
      h.className = "picker-cat-h";
      h.textContent = cat + " · " + list.length;
      grid.appendChild(h);
      list.forEach(iconId => {
        const cell = document.createElement("div");
        cell.className = "picker-cell";
        cell.title = iconId;
        cell.innerHTML = `<svg style="color:var(--amber)"><use href="#ic-${iconId}"/></svg>`;
        cell.addEventListener("click", () => {
          const s = state.symbols.find(x => x.id === pickerForId);
          if (s) {
            s.icon = iconId;
            renderSymTable();
            renderReels();
          }
          $("#picker-overlay").classList.remove("is-open");
        });
        grid.appendChild(cell);
      });
    });
    $("#picker-overlay").classList.add("is-open");
  }
  $("#picker-close")?.addEventListener("click", () => $("#picker-overlay").classList.remove("is-open"));
  $("#picker-overlay")?.addEventListener("click", e => {
    if (e.target.id === "picker-overlay") $("#picker-overlay").classList.remove("is-open");
  });

  /* ============================================================
     COMMAND PALETTE (⌘K)
     ============================================================ */
  const COMMANDS = [
    { cat:"nav",  name:"Open Build",            short:"⌘1",       run: () => $("[data-tab='build']").click() },
    { cat:"nav",  name:"Open Compose",          short:"⌘2",       run: () => $("[data-tab='compose']").click() },
    { cat:"nav",  name:"Open Catalog",          short:"⌘3",       run: () => $("[data-tab='catalog']").click() },
    { cat:"nav",  name:"Open Play",             short:"⌘4",       run: () => $("[data-tab='play']").click() },
    { cat:"nav",  name:"Open Sensitivity",      short:"⌘5",       run: () => $("[data-tab='sensitivity']").click() },
    { cat:"nav",  name:"Open Certify",          short:"⌘6",       run: () => $("[data-tab='certify']").click() },
    { cat:"ws",   name:"Switch workspace · Lava Falls", short:"⌥1", run: () => switchWorkspace("wsA") },
    { cat:"ws",   name:"Switch workspace · Pearl Dive", short:"⌥2", run: () => switchWorkspace("wsB") },
    { cat:"ws",   name:"Switch workspace · Solar Path", short:"⌥3", run: () => switchWorkspace("wsC") },
    { cat:"ws",   name:"New workspace",         short:"⌘N",       run: () => $("#ws-new").click() },
    { cat:"persona", name:"Switch persona · Math",     short:"⇧M", run: () => setPersona("math") },
    { cat:"persona", name:"Switch persona · Design",   short:"⇧D", run: () => setPersona("design") },
    { cat:"persona", name:"Switch persona · Producer", short:"⇧P", run: () => setPersona("producer") },
    { cat:"mc",   name:"Run MC · 100K",         short:"",         run: () => { $('[data-mc="100000"]').click(); $("#btn-mc").click(); } },
    { cat:"mc",   name:"Run MC · 1M",           short:"",         run: () => { $('[data-mc="1000000"]').click(); $("#btn-mc").click(); } },
    { cat:"mc",   name:"Run MC · 10M",          short:"",         run: () => { $('[data-mc="10000000"]').click(); $("#btn-mc").click(); } },
    { cat:"mc",   name:"Run MC · 1B",           short:"",         run: () => { $('[data-mc="1000000000"]').click(); $("#btn-mc").click(); } },
    { cat:"sym",  name:"Add HP symbol",         short:"",         run: () => { if (state.pool.HP < 8) { state.pool.HP++; syncPoolUI(); regenerateSymbols(); renderSymTable(); renderReels(); compute(); } } },
    { cat:"sym",  name:"Remove HP symbol",      short:"",         run: () => { if (state.pool.HP > 1) { state.pool.HP--; syncPoolUI(); regenerateSymbols(); renderSymTable(); renderReels(); compute(); } } },
    { cat:"sym",  name:"Add WILD",              short:"",         run: () => { if (state.pool.WILD < 3) { state.pool.WILD++; syncPoolUI(); regenerateSymbols(); renderSymTable(); renderReels(); compute(); } } },
    { cat:"sym",  name:"Reset symbol pool to default", short:"", run: () => { state.pool = { HP:3, MP:3, LP:3, WILD:1, SCATTER:1, MULT:1 }; syncPoolUI(); regenerateSymbols(false); renderSymTable(); renderReels(); compute(); } },
    { cat:"ir",   name:"Load IR · 5x3-20lines.ir",      short:"", run: () => { setText("#ctx-ir", "5x3-20lines"); addLogEntry("ir.load 5x3-20lines"); } },
    { cat:"ir",   name:"Load IR · megaways-117649.ir",  short:"", run: () => { setText("#ctx-ir", "megaways-117649"); addLogEntry("ir.load megaways-117649"); } },
    { cat:"ir",   name:"Load IR · cluster-7x7-base.ir", short:"", run: () => { setText("#ctx-ir", "cluster-7x7-base"); addLogEntry("ir.load cluster-7x7-base"); } },
    { cat:"ir",   name:"Load L&W template · M6 Triple Cash Wheel", short:"", run: () => { setText("#ctx-ir", "M6-triple-cash-wheel"); addLogEntry("template.load M6 Bally W196"); } },
    { cat:"ir",   name:"Load L&W template · M13 WOZ Yellow-Brick", short:"", run: () => { setText("#ctx-ir", "M13-woz-glinda"); addLogEntry("template.load M13 WMS W195"); } },
    { cat:"export", name:"Export operator-package.zip", short:"⌘E", run: () => $("#btn-package").click() },
    { cat:"export", name:"Save IR",                short:"⌘S",     run: () => addLogEntry("ir.save autosave") },
    { cat:"util", name:"Reset gauge / metrics",   short:"",         run: () => compute() },
    { cat:"util", name:"Toggle command palette",  short:"⌘K",       run: toggleCmd },
  ];
  let cmdIndex = 0;
  function openCmd() {
    $("#cmd-overlay").classList.add("is-open");
    $("#cmd-input").value = "";
    cmdIndex = 0;
    renderCmd("");
    setTimeout(() => $("#cmd-input").focus(), 30);
  }
  function closeCmd() {
    $("#cmd-overlay").classList.remove("is-open");
  }
  function toggleCmd() {
    if ($("#cmd-overlay").classList.contains("is-open")) closeCmd();
    else openCmd();
  }
  function renderCmd(filter) {
    const list = $("#cmd-list");
    const f = filter.toLowerCase();
    const m = COMMANDS.filter(c => !f || c.name.toLowerCase().includes(f) || c.cat.toLowerCase().includes(f));
    list.innerHTML = m.map((c, i) => `
      <div class="cmd-row ${i===cmdIndex?'is-focus':''}" data-i="${i}">
        <span class="cmd-cat">${c.cat}</span>
        <span>${c.name}</span>
        <span class="cmd-shortcut">${c.short || ""}</span>
      </div>
    `).join("");
    $$('.cmd-row', list).forEach(row => {
      row.addEventListener("mouseenter", () => {
        $$('.cmd-row').forEach(x => x.classList.remove("is-focus"));
        row.classList.add("is-focus");
        cmdIndex = +row.dataset.i;
      });
      row.addEventListener("click", () => {
        m[+row.dataset.i].run();
        closeCmd();
      });
    });
    window._cmdMatches = m;
  }
  $("#btn-cmdk")?.addEventListener("click", openCmd);
  $("#cmd-input")?.addEventListener("input", e => { cmdIndex = 0; renderCmd(e.target.value); });
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      toggleCmd();
    } else if (e.key === "Escape") {
      closeCmd();
      $("#picker-overlay")?.classList.remove("is-open");
    } else if ($("#cmd-overlay")?.classList.contains("is-open")) {
      const m = window._cmdMatches || [];
      if (e.key === "ArrowDown") { e.preventDefault(); cmdIndex = (cmdIndex + 1) % m.length; renderCmd($("#cmd-input").value); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cmdIndex = (cmdIndex - 1 + m.length) % m.length; renderCmd($("#cmd-input").value); }
      else if (e.key === "Enter")   { e.preventDefault(); if (m[cmdIndex]) { m[cmdIndex].run(); closeCmd(); } }
    }
  });
  $("#cmd-overlay")?.addEventListener("click", e => {
    if (e.target.id === "cmd-overlay") closeCmd();
  });

  /* ============================================================
     ACTIVITY LOG
     ============================================================ */
  function addLogEntry(msg) {
    const log = $("#bp-log");
    if (!log) return;
    const time = new Date();
    const hh = String(time.getHours()).padStart(2,"0");
    const mm = String(time.getMinutes()).padStart(2,"0");
    const ss = String(time.getSeconds()).padStart(2,"0");
    const span = document.createElement("span");
    span.innerHTML = `[${hh}:${mm}:${ss}] ${msg}`;
    log.prepend(span);
    while (log.children.length > 12) log.removeChild(log.lastChild);
  }

  /* ============================================================
     COMPOSE — node selection
     ============================================================ */
  $$(".node").forEach(n => {
    n.addEventListener("click", () => {
      $$(".node").forEach(x => x.classList.remove("is-selected"));
      n.classList.add("is-selected");
    });
  });

  /* ============================================================
     CATALOG SEARCH wiring
     ============================================================ */
  $("#cat-search")?.addEventListener("input", e => renderCards(e.target.value.toLowerCase()));
  $("#lw-only")?.addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase()));
  $$(".filter-block input[type='checkbox']").forEach(cb => cb.addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase())));
  $("#cd-insert")?.addEventListener("click", () => {
    const b = $("#cd-insert");
    const o = b.textContent;
    b.textContent = "Inserted into BUILD ✓";
    setTimeout(() => b.textContent = o, 1400);
  });

  /* ============================================================
     INIT
     ============================================================ */
  syncPoolUI();
  regenerateSymbols(false);
  renderSymTable();
  renderReels();
  bindPool();
  renderLibTree();
  renderLwChips();
  renderCards();
  selectPattern("P-001");
  renderParams();
  regenHeatmap();
  renderPar();
  renderJuris();
  compute();

  // demo: live-tick the spark chart every few seconds (subtle)
  setInterval(() => {
    if (Math.random() < 0.5) compute();
  }, 8000);
})();
