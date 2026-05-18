/* =============================================================
   Slot Math Studio · v2-engine
   Vanilla JS, no deps. 6 tabs + persona switcher.
   ============================================================= */

(() => {
  "use strict";

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ============================================================
     CORE DATA
     ============================================================ */
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

  const DEFAULT_REELS = [
    ["s01","s05","s02","s08","s03","s06","s10","s04","s07","s09","s11","s02"],
    ["s02","s06","s01","s08","s05","s03","s07","s10","s01","s09","s04","s11"],
    ["s03","s07","s05","s10","s02","s08","s01","s06","s09","s04","s11","s05"],
    ["s04","s05","s09","s07","s01","s10","s06","s02","s08","s03","s11","s07"],
    ["s05","s08","s02","s06","s10","s09","s03","s01","s07","s04","s11","s06"],
  ];
  const DEFAULT_WEIGHTS = [22, 20, 18, 20, 20];

  const state = {
    reels: DEFAULT_REELS.map(r => r.slice()),
    weights: DEFAULT_WEIGHTS.slice(),
    pays: SYMBOLS.reduce((a, s) => (a[s.id] = { x3: s.base3, x4: s.base4, x5: s.base5 }, a), {}),
    rtp: 95.42, hit: 27.8, maxWin: 2145, vola: 3,
    selectedSym: null,
    persona: "math",
  };

  function symDef(id) { return SYMBOLS.find(s => s.id === id); }

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
  setPersona("math");

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
        next.focus();
        next.click();
      }
    });
  });

  /* ============================================================
     TAB 01 — BUILD (reels + paytable + PAR)
     ============================================================ */
  const reelsRoot = $("#reels");
  function renderReels() {
    reelsRoot.innerHTML = "";
    state.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";

      const head = document.createElement("div");
      head.className = "reel-head";
      head.innerHTML = `<span class="idx">REEL ${ri+1}</span><span>${col.length} pos</span>`;
      reel.appendChild(head);

      const cells = document.createElement("div");
      cells.className = "reel-cells";
      col.forEach((sid, pi) => {
        const c = document.createElement("div");
        c.className = "reel-cell";
        c.dataset.reel = ri;
        c.dataset.pos = pi;
        if (!sid) c.classList.add("empty");
        else {
          const sd = symDef(sid);
          if (sd?.tier === "wild") c.classList.add("is-wild");
          if (sd?.tier === "scatter") c.classList.add("is-scatter");
          c.innerHTML = `<svg><use href="#g-${sid}"/></svg><span class="x" data-action="remove">×</span>`;
        }
        cells.appendChild(c);
      });
      reel.appendChild(cells);

      const foot = document.createElement("div");
      foot.className = "reel-foot";
      foot.innerHTML = `<label>Reel weight</label>
        <div class="weight-row"><input type="range" min="5" max="40" value="${state.weights[ri]}" data-reel="${ri}"/><span class="pct">${state.weights[ri].toFixed(1)} %</span></div>`;
      reel.appendChild(foot);

      reelsRoot.appendChild(reel);
    });
    bindCells(); bindWeights();
  }
  function bindCells() {
    $$(".reel-cell").forEach(c => {
      c.addEventListener("dragover", e => { e.preventDefault(); c.classList.add("dragover"); });
      c.addEventListener("dragleave", () => c.classList.remove("dragover"));
      c.addEventListener("drop", e => {
        e.preventDefault();
        c.classList.remove("dragover");
        const sid = e.dataTransfer.getData("text/sym");
        if (sid) placeSym(+c.dataset.reel, +c.dataset.pos, sid);
      });
      c.addEventListener("click", e => {
        if (e.target.dataset.action === "remove") {
          placeSym(+c.dataset.reel, +c.dataset.pos, null);
          e.stopPropagation(); return;
        }
        if (state.selectedSym && c.classList.contains("empty"))
          placeSym(+c.dataset.reel, +c.dataset.pos, state.selectedSym);
      });
    });
  }
  function bindWeights() {
    $$('.reel-foot input[type="range"]').forEach(s => {
      s.addEventListener("input", () => {
        const ri = +s.dataset.reel;
        state.weights[ri] = +s.value;
        s.nextElementSibling.textContent = (+s.value).toFixed(1) + " %";
        scheduleRecompute("weight Δ reel " + (ri+1));
      });
    });
  }
  function placeSym(ri, pi, sid) {
    state.reels[ri][pi] = sid;
    renderReels();
    scheduleRecompute(sid ? `place ${sid} → R${ri+1}·${pi+1}` : `clear R${ri+1}·${pi+1}`);
  }

  $$("#palette .sym").forEach(el => {
    el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/sym", el.dataset.sym); e.dataTransfer.effectAllowed="copy"; });
    el.addEventListener("click", () => {
      state.selectedSym = state.selectedSym === el.dataset.sym ? null : el.dataset.sym;
      $$("#palette .sym").forEach(s => s.style.outline = "");
      if (state.selectedSym) el.style.outline = "1px solid var(--accent)";
    });
  });

  const paytableBody = $("#paytable tbody");
  function renderPaytable() {
    paytableBody.innerHTML = "";
    SYMBOLS.forEach(s => {
      const tr = document.createElement("tr");
      const p = state.pays[s.id];
      const hr = approxHitRate(s.id);
      const isWild = s.tier === "wild";
      const isSct = s.tier === "scatter";
      tr.innerHTML = `
        <td>
          <div class="sym-cell">
            <svg style="${isWild?'color:var(--accent)':isSct?'color:var(--warn)':''}"><use href="#g-${s.id}"/></svg>
            <span class="nm">${s.name}${isWild?' · WILD':isSct?' · SCATTER':''}</span>
          </div>
        </td>
        <td><input class="pay" data-sym="${s.id}" data-of="x3" value="${p.x3}" ${isWild?'disabled':''}/></td>
        <td><input class="pay" data-sym="${s.id}" data-of="x4" value="${p.x4}" ${isWild?'disabled':''}/></td>
        <td><input class="pay" data-sym="${s.id}" data-of="x5" value="${p.x5}" ${isWild?'disabled':''}/></td>
        <td style="color:var(--muted)">${hr}</td>`;
      paytableBody.appendChild(tr);
    });
    $$("input.pay").forEach(i => i.addEventListener("input", () => {
      const v = parseInt(i.value, 10); if (!isFinite(v)) return;
      state.pays[i.dataset.sym][i.dataset.of] = v;
      scheduleRecompute(`pay Δ ${i.dataset.sym}·${i.dataset.of}`);
    }));
  }
  function approxHitRate(sid) {
    const sd = symDef(sid); if (!sd) return "—";
    const base = { low: 8.5, mid: 4.2, high: 1.8, wild: 0.9, scatter: 0.6 }[sd.tier];
    const n = state.reels.reduce((a, col) => a + col.filter(x => x === sid).length, 0);
    return (base * (1 + n/40)).toFixed(2) + " %";
  }

  const rtpEl = $("#rtp-value"), hitEl = $("#hit-value"), maxEl = $("#max-value");
  const recomp = $("#recompute"), recompTxt = $("#recompute-text");
  const statusTime = $("#status-time"), statusDrift = $("#status-drift");
  const volaPipsEl = $("#vola-pips"), volaCatEl = $("#vola-cat"), contribEl = $("#contrib");
  let recomputeTimer = null;

  function scheduleRecompute(reason) {
    recomp.classList.add("active");
    recompTxt.textContent = `recomputing · ${reason}`;
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => compute(reason), 110);
  }
  function compute() {
    let payMass = 0;
    SYMBOLS.forEach(s => {
      const p = state.pays[s.id];
      const tW = { low: 1.0, mid: 0.55, high: 0.18, wild: 0, scatter: 0.22 }[s.tier];
      payMass += (p.x3*0.62 + p.x4*0.12 + p.x5*0.018) * tW;
    });
    const wAvg = state.weights.reduce((a,b)=>a+b,0)/5;
    const rtp = Math.max(82, Math.min(99, 88 + payMass*0.0086 + (wAvg-20)*0.04));
    const hit = Math.max(15, Math.min(45, 24 + payMass*0.0009));
    const maxW = Math.round(800 + payMass*1.4);
    const sigma = 5 + (rtp>95?4.2:2.8) + (payMass-6000)*0.0004;
    const pips = Math.max(1, Math.min(5, Math.round((sigma-4)/2)));
    state.rtp = rtp; state.hit = hit; state.maxWin = maxW; state.vola = pips;

    pulseValue(rtpEl, rtp.toFixed(2), "%");
    pulseValue(hitEl, hit.toFixed(1), "%");
    pulseValue(maxEl, maxW.toLocaleString("en-US").replace(/,/g," "), "×");
    Array.from(volaPipsEl.children).forEach((pip, i) => pip.classList.toggle("on", i < pips));
    const cat = pips <= 1 ? "LOW" : pips <= 2 ? "LOW-MID" : pips <= 3 ? "MID" : pips <= 4 ? "HIGH" : "EXTREME";
    volaCatEl.textContent = `${cat} · σ ${sigma.toFixed(1)}`;

    renderContrib();

    const ms = (0.9 + Math.random()*1.4).toFixed(1);
    recomp.classList.remove("active");
    recompTxt.textContent = `closed-form · ${ms} ms`;
    statusTime.textContent = ms + " ms";
    const drift = (rtp-96).toFixed(2);
    statusDrift.textContent = (drift>0?"+":"") + drift + " pp";
  }
  function pulseValue(el, num, unit) {
    el.classList.add("pulse");
    el.innerHTML = `${num}<span class="unit">${unit}</span>`;
    setTimeout(() => el.classList.remove("pulse"), 380);
  }
  function renderContrib() {
    const C = SYMBOLS.map(s => {
      const p = state.pays[s.id];
      const tW = { low: 1.0, mid: 0.55, high: 0.18, wild: 0, scatter: 0.22 }[s.tier];
      const n = state.reels.reduce((a, col) => a + col.filter(x => x === s.id).length, 0);
      return { s, c: (p.x3*0.62 + p.x4*0.12 + p.x5*0.018) * tW * (1 + n/40) };
    });
    const tot = C.reduce((a,b)=>a+b.c, 0) || 1;
    C.sort((a,b) => b.c - a.c);
    contribEl.innerHTML = C.slice(0,9).map(({s,c}) => {
      const pc = (c/tot)*100;
      const cls = s.tier === "wild" ? "is-wild" : s.tier === "scatter" ? "is-scatter" : "";
      return `<div class="contrib-row ${cls}"><svg class="glyph" viewBox="0 0 64 64" width="14" height="14"><use href="#g-${s.id}"/></svg><div class="contrib-bar"><i style="width:${Math.max(2, pc*1.6).toFixed(1)}%"></i></div><span class="pc">${pc.toFixed(1)} %</span></div>`;
    }).join("");
  }

  /* ============================================================
     TAB 02 — COMPOSE (node graph)
     ============================================================ */
  // Node click → highlight + inspector update
  $$(".node").forEach(n => {
    n.addEventListener("click", () => {
      $$(".node").forEach(x => x.classList.remove("is-selected"));
      n.classList.add("is-selected");
      const target = n.querySelector(".node-head")?.textContent.trim();
      const insp = $("#insp-target");
      if (insp && target) insp.textContent = target;
    });
  });
  // Drag nodes within canvas (placeholder—mouse only)
  $$(".node").forEach(n => {
    let dx = 0, dy = 0, dragging = false;
    n.addEventListener("mousedown", e => {
      if (e.target.closest(".node-head") === null) return;
      dragging = true;
      const r = n.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      n.style.zIndex = 10;
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const stage = $("#graph-stage").getBoundingClientRect();
      n.style.left = Math.max(0, e.clientX - stage.left - dx) + "px";
      n.style.top  = Math.max(0, e.clientY - stage.top  - dy) + "px";
    });
    window.addEventListener("mouseup", () => { dragging = false; });
  });
  // Node chip drop hint
  $$(".node-chip").forEach(c => {
    c.addEventListener("click", () => {
      c.style.borderLeftWidth = "5px";
      setTimeout(() => c.style.borderLeftWidth = "", 200);
    });
  });

  /* ============================================================
     TAB 03 — CATALOG (97 P-IDs + 16 L&W gaps)
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
    { m: "M16", title: "Stellar Jackpots arcade wrapper", wave: "W194", pin: "7b16ddb" },
  ];

  // 97 patterns — generate with realistic spread
  const FAM = [
    { code:"hnw",      title:"Hold & Win persistence",    var:"high" },
    { code:"cascade",  title:"Cascade chain",             var:"mid"  },
    { code:"cluster",  title:"Cluster pays",              var:"mid"  },
    { code:"fs",       title:"Free spins multiplier",     var:"high" },
    { code:"wheel",    title:"Wheel bonus prize",         var:"mid"  },
    { code:"pick",     title:"Pick-em selector",          var:"low"  },
    { code:"mw",       title:"Megaways variable rows",    var:"high" },
    { code:"colossal", title:"Colossal reels merge",      var:"high" },
    { code:"wild",     title:"Expanding wild",            var:"mid"  },
    { code:"sticky",   title:"Sticky wild persistence",   var:"high" },
    { code:"walking",  title:"Walking wild step",         var:"mid"  },
    { code:"mystery",  title:"Mystery symbol reveal",     var:"mid"  },
    { code:"upgrade",  title:"Symbol upgrade ladder",     var:"mid"  },
    { code:"hex",      title:"Hexagonal cluster",         var:"high" },
    { code:"both",     title:"Both-ways pay",             var:"low"  },
    { code:"scatter",  title:"Scatter-anywhere",          var:"low"  },
    { code:"jackpot",  title:"WAP multi-jackpot",         var:"high" },
    { code:"trigger",  title:"Compound trigger gating",   var:"mid"  },
  ];

  function makePatterns() {
    const arr = [];
    // first 16 are L&W gaps (P-001..P-016)
    LW_GAPS.forEach((g, i) => {
      arr.push({
        pid: "P-" + String(i+1).padStart(3,"0"),
        title: g.title,
        wave: g.wave,
        pin: g.pin,
        rtp: rtpBand(i),
        var: ["mid","high","mid","high","high","high","high","mid","high","high","mid","high","high","high","high","mid"][i],
        fam: ["hnw","wild","cascade","fs","mystery","wheel","colossal","pick","fs","mw","cascade","mystery","cluster","fs","jackpot","jackpot"][i],
        lw: g.m,
      });
    });
    // remaining 81 patterns — synthetic but plausible
    for (let i = 16; i < 97; i++) {
      const f = FAM[i % FAM.length];
      arr.push({
        pid: "P-" + String(i+1).padStart(3,"0"),
        title: f.title + " · variant " + Math.floor(i/FAM.length+1),
        wave: "W" + String(49 + i*2).padStart(3,"0"),
        pin: hexHash(i),
        rtp: rtpBand(i),
        var: f.var,
        fam: f.code,
        lw: null,
      });
    }
    return arr;
  }
  function rtpBand(i) {
    const bands = ["88.4–92.1%", "92.0–94.2%", "94.1–96.4%", "95.5–97.2%", "96.0–98.0%"];
    return bands[i % bands.length];
  }
  function hexHash(seed) {
    const x = ((seed * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0,7);
    return x;
  }
  const PATTERNS = makePatterns();

  // L&W chip strip
  const lwChips = $("#lw-chips");
  LW_GAPS.forEach((g, i) => {
    const c = document.createElement("button");
    c.className = "lw-chip";
    c.innerHTML = `<b>${g.m}</b>${g.title}`;
    c.addEventListener("click", () => {
      const pid = "P-" + String(i+1).padStart(3,"0");
      selectPattern(pid);
    });
    lwChips.appendChild(c);
  });

  // pattern cards
  const catalogCards = $("#catalog-cards");
  function renderCards(filter = "") {
    const lwOnly = $("#lw-only")?.checked;
    const matches = PATTERNS.filter(p => {
      if (filter && !p.title.toLowerCase().includes(filter) && !p.pid.toLowerCase().includes(filter)) return false;
      if (lwOnly && !p.lw) return false;
      return true;
    });
    $("#cat-shown").textContent = `${matches.length} of ${PATTERNS.length} shown`;
    $("#cat-count").textContent = matches.length;
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
    // formula varies by family (small flavor)
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
  selectPattern("P-001");

  $("#cat-search").addEventListener("input", e => renderCards(e.target.value.toLowerCase()));
  $("#lw-only").addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase()));
  $$(".filter-block input[type='checkbox']").forEach(cb => cb.addEventListener("change", () => renderCards($("#cat-search").value.toLowerCase())));

  $("#cd-insert").addEventListener("click", () => {
    const orig = $("#cd-insert").textContent;
    $("#cd-insert").textContent = "Inserted into BUILD ✓";
    setTimeout(() => $("#cd-insert").textContent = orig, 1400);
  });

  /* ============================================================
     TAB 04 — PLAY (spin + replay + merkle)
     ============================================================ */
  const btnSpin = $("#btn-spin"), historyEl = $("#history");
  let spinCounter = 42;
  btnSpin.addEventListener("click", () => {
    btnSpin.style.transform = "scale(0.96)";
    setTimeout(() => btnSpin.style.transform = "", 150);
    $$("#machine .cell").forEach(c => { c.style.opacity = "0.4"; setTimeout(() => c.style.opacity = "1", 250 + Math.random()*300); });

    spinCounter++;
    const win = Math.random() < 0.32;
    const amt = win ? (Math.random()*18 + 0.5).toFixed(2) : "0.00";
    const desc = win
      ? ["3× PRISM · line 2","4× SHARD · line 9","5× KEYSTONE · line 7","Scatter trigger · 8 FS","3× MERIDIAN · line 5"][Math.floor(Math.random()*5)]
      : "no win";
    const row = document.createElement("div");
    row.className = "hist-row";
    row.innerHTML = `<span class="n">#${String(spinCounter).padStart(3,"0")}</span><span class="res ${win?'win':'loss'}">${desc}</span><span class="amt ${win?'':'zero'}">${win?'+'+amt:'0.00'}</span>`;
    historyEl.prepend(row);
    while (historyEl.children.length > 14) historyEl.removeChild(historyEl.lastChild);
    // update merkle hash
    $("#merkle-hash").textContent = `${hexHash(spinCounter*31)}${hexHash(spinCounter*7)} · ${hexHash(spinCounter)} · spin ${String(spinCounter).padStart(3,"0")}`;
  });

  $("#btn-replay").addEventListener("click", () => {
    const b = $("#btn-replay");
    const o = b.textContent;
    b.textContent = "Replaying seed " + $("#seed-override").value + " …";
    setTimeout(() => b.textContent = "✓ replay matched · 0 drift", 700);
    setTimeout(() => b.textContent = o, 2200);
  });

  /* ============================================================
     TAB 05 — SENSITIVITY (param sliders + heatmap + curve)
     ============================================================ */
  const PARAMS = [
    { name: "scatter_trigger_p",       val: 0.038,  min: 0.01, max: 0.10 },
    { name: "fs_award",                val: 10,     min: 5,    max: 30 },
    { name: "fs_multiplier_seq_max",   val: 5,      min: 1,    max: 20 },
    { name: "cascade_decay",           val: 0.78,   min: 0.4,  max: 0.95 },
    { name: "cascade_max_chain",       val: 8,      min: 2,    max: 16 },
    { name: "persistence_p",           val: 0.62,   min: 0.1,  max: 0.95 },
    { name: "wild_density",            val: 0.022,  min: 0.0,  max: 0.08 },
    { name: "sticky_wild_lifetime",    val: 3,      min: 1,    max: 12 },
    { name: "expanding_wild_prob",     val: 0.18,   min: 0.0,  max: 0.6 },
    { name: "walking_wild_step",       val: 1,      min: 1,    max: 4 },
    { name: "pick_count",              val: 4,      min: 2,    max: 12 },
    { name: "wheel_segments",          val: 12,     min: 6,    max: 24 },
    { name: "wheel_jackpot_p",         val: 0.0008, min: 0.0,  max: 0.005 },
    { name: "mystery_reveal_rate",     val: 0.27,   min: 0.0,  max: 1.0 },
    { name: "upgrade_step_prob",       val: 0.4,    min: 0.0,  max: 1.0 },
    { name: "megaways_max_rows",       val: 7,      min: 2,    max: 7 },
    { name: "max_bet_eur",             val: 1.0,    min: 0.10, max: 50.0 },
    { name: "base_reel_weight_var",    val: 4.0,    min: 0.0,  max: 20 },
  ];

  const paramList = $("#param-list");
  paramList.innerHTML = PARAMS.map((p, i) => `
    <li>
      <div class="pl-name"><span>${p.name}</span><span class="pl-val" data-i="${i}">${formatVal(p.val)}</span></div>
      <div class="pl-range">
        <span class="pl-min">${formatVal(p.min)}</span>
        <input type="range" min="${p.min}" max="${p.max}" step="${(p.max-p.min)/200}" value="${p.val}" data-i="${i}"/>
        <span class="pl-max">${formatVal(p.max)}</span>
      </div>
    </li>
  `).join("");
  function formatVal(v) {
    if (Math.abs(v) < 0.01 && v !== 0) return v.toExponential(2);
    if (Number.isInteger(v) || Math.abs(v) > 10) return v.toString();
    return v.toFixed(3);
  }
  $$("#param-list input[type='range']").forEach(s => {
    s.addEventListener("input", () => {
      const i = +s.dataset.i;
      PARAMS[i].val = +s.value;
      paramList.querySelector(`.pl-val[data-i="${i}"]`).textContent = formatVal(+s.value);
      regenHeatmap();
    });
  });

  const heatmapEl = $("#heatmap");
  function regenHeatmap() {
    heatmapEl.innerHTML = "";
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 16; c++) {
        const xN = c / 15, yN = r / 11;
        // synthesize an RTP surface that peaks somewhere
        const v = 0.93 + 0.04 * Math.exp(-((xN-0.6)**2 + (yN-0.4)**2) * 6)
                + 0.012 * Math.sin(xN*4) * Math.cos(yN*3);
        const t = Math.max(0, Math.min(1, (v - 0.91) / 0.06));
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.style.background = heatColor(t);
        cell.title = `RTP ${(v*100).toFixed(2)}%`;
        heatmapEl.appendChild(cell);
      }
    }
  }
  function heatColor(t) {
    // gradient: paper-2 (cold) → accent (hot)
    const c1 = [216, 200, 168]; // cold
    const c2 = [30, 143, 138];  // hot
    const r = Math.round(c1[0] + (c2[0]-c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1]-c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2]-c1[2]) * t);
    return `rgb(${r},${g},${b})`;
  }
  regenHeatmap();

  /* ============================================================
     TAB 06 — CERTIFY (MC + PAR + 15 juris + RNG + Merkle)
     ============================================================ */
  // MC size buttons
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
    if (n >= 1e9) return (n/1e9) + " B";
    if (n >= 1e6) return (n/1e6) + " M";
    if (n >= 1e3) return (n/1e3) + " K";
    return n.toString();
  }

  // RNG pills
  $$(".rng-pill").forEach(p => {
    p.addEventListener("click", () => {
      $$(".rng-pill").forEach(x => x.classList.remove("is-active"));
      p.classList.add("is-active");
    });
  });

  // MC run
  const btnMc = $("#btn-mc"), mcProg = $("#mc-progress > i"), mcStat = $("#mc-stat");
  btnMc.addEventListener("click", () => {
    if (btnMc.dataset.running === "1") return;
    btnMc.dataset.running = "1";
    btnMc.textContent = "Running…";
    let p = 0;
    const targ = formatMC(mcSize);
    mcStat.innerHTML = `<b>running</b> · 0 / ${targ} · ETA 12s`;
    const iv = setInterval(() => {
      p += 2 + Math.random()*4;
      if (p >= 100) p = 100;
      mcProg.style.width = p + "%";
      const spinsDone = Math.round((p/100) * mcSize);
      const eta = Math.max(0, Math.round((100-p)*0.12));
      mcStat.innerHTML = `<b>running</b> · ${formatMC(spinsDone)} / ${targ} · ETA ${eta}s`;
      if (p >= 100) {
        clearInterval(iv);
        const ci = mcSize >= 1e9 ? "±0.002%" : mcSize >= 1e8 ? "±0.006%" : mcSize >= 1e7 ? "±0.018%" : mcSize >= 1e6 ? "±0.058%" : "±0.18%";
        const rtp = (state.rtp + (Math.random()-0.5)*0.04).toFixed(3);
        mcStat.innerHTML = `<b style="color:var(--accent)">complete</b> · RTP ${rtp}% · 95% CI ${ci}`;
        btnMc.textContent = `Run · ${targ} spins`;
        btnMc.dataset.running = "0";
        setTimeout(() => mcProg.style.width = "0%", 600);
      }
    }, 120);
  });

  // PAR sheet (12 sections, expandable)
  const PAR_SECTIONS = [
    { h: "Identification",      kv: [["build id","TL-0.3.0"],["irhash","9F2E1B…AC04"],["engine","sme/77"]], detail: "ANSI/ISO/IEC 17025 traceable. SBOM cyclonedx-1.5, signed ed25519, HSM-anchored." },
    { h: "RTP & moments",       kv: [["RTP (closed)","95.421%"],["RTP (MC 1M)","95.408%"],["σ","8.41"],["skew","+12.7"],["kurt","+86.4"]], detail: "Closed-form derived from Markov 21×4 state space; MC validation 600K spins, drift 0.013%." },
    { h: "Hit frequency",       kv: [["overall","27.83%"],["base","26.10%"],["feature","1.73%"]], detail: "Per-spin hit frequency including scatter pays and zero-win cascades." },
    { h: "Volatility band",     kv: [["category","MID"],["VI (gov.tw)","11.6"],["SD / bet","8.41×"]], detail: "Volatility index per Taiwan KMOEA gambling spec." },
    { h: "Win distribution",    kv: [["P50","0.00×"],["P90","2.10×"],["P99","38.5×"],["P99.9","220×"]], detail: "Quantiles based on 1M MC sample; tail validated against closed-form CDF." },
    { h: "Jackpot exposure",    kv: [["cap","2 145×"],["hit prob.","1 : 3.4M"],["tail mass","2.1e-7"]], detail: "Max-win cap regulated per GLI-16 §6.1. WAP exposure modeled separately." },
    { h: "Compliance",          kv: [["FastFwd","PASS"],["SE hooks","PASS"],["UK pacing","2.5s OK"]], detail: "Per-jurisdiction adapter validates: spin pacing, loss limits, FastForward suppression." },
    { h: "Confidence intervals",kv: [["RTP CI95","±0.018%"],["σ CI95","±0.02"]], detail: "Computed via batch-means on 1M run, batch size 1K." },
    { h: "Quantiles",           kv: [["P10","0.00×"],["P95","5.40×"],["P99.99","1100×"]], detail: "Used by regulator review boards for tail-risk assessment." },
    { h: "Moments",             kv: [["E[X]","0.954"],["E[X²]","71.2"],["E[X³]","8 412"]], detail: "First three moments derived analytically from per-spin distribution." },
    { h: "Bonus distances",     kv: [["avg dist","48.2 spins"],["std dist","65.7 spins"],["P99 dist","320 spins"]], detail: "Geometric distribution of feature trigger distance." },
    { h: "Required spins",      kv: [["95% CI ±0.1%","8.6M"],["99% CI ±0.05%","52.4M"]], detail: "Spins required to achieve target CI band per closed-form variance." },
  ];
  $("#par-sections").innerHTML = PAR_SECTIONS.map((s, i) => `
    <div class="par-section">
      <h4>${s.h} <span class="num">${String(i+1).padStart(2,"0")}</span></h4>
      ${s.kv.map(([k,v]) => `<div class="par-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}
      <div class="par-detail"><div class="par-kv"><span class="k" style="font-style:italic">${s.detail}</span></div></div>
    </div>
  `).join("");
  $$(".par-section").forEach(p => p.addEventListener("click", () => p.classList.toggle("is-open")));

  // 15 jurisdictions
  const JURIS = [
    { code:"ukgc",   name:"UKGC",       sub:"UK Gambling Commission · RTS 7A/12/14",          state:"on",  uk:true,
      rules:[
        ["RTS 7A", "Statistical analysis of game outcomes"],
        ["RTS 12", "Game cycle display & player information"],
        ["RTS 14", "Time and event marker for play sessions"],
        ["SI 2025/215", "Game design code · 2.5s spin pacing min, £2 max stake (online)"],
        ["LCCP 4.2", "Compulsive play indicators"],
        ["RNG", "ChaCha20 CSPRNG mandatory (DCMS 2024)"],
      ]
    },
    { code:"mga",    name:"MGA",        sub:"Malta · DOI/SR 06 · PPD §11",                    state:"on",
      rules:[["DOI/SR 06","RNG attestation requirement"],["PPD §11","Player protection · self-exclusion hooks"],["L/Player Funds","Segregated player liabilities"]]
    },
    { code:"adm",    name:"ADM",        sub:"Italy · D.D. 39 / 2011 · ADM 2024",              state:"",
      rules:[["D.D. 39/2011","RTP min 90%, sample size 10M"],["Cert renewal","Annual recertification"],["AAMS legacy compat","Backward-compatible PAR sheet"]]
    },
    { code:"ecogra", name:"eCOGRA",     sub:"Generally Accepted Practices · v6",              state:"on",
      rules:[["GAP §3.2","RNG cycle test"],["GAP §4.1","Player return verification monthly"]]
    },
    { code:"dgoj",   name:"DGOJ",       sub:"Spain · DGOJ-RNG-2023 · Real Decreto",           state:"on",
      rules:[["DGOJ-RNG-2023","Spanish RNG attestation"],["RD 958/2020","Advertising restrictions"],["RTP","Min 88% slots, 95% video poker"]]
    },
    { code:"se",     name:"SE",         sub:"Sweden · Spelinspektionen SIFO-23",              state:"",
      rules:[["SIFO-23","Pause-spelar feature mandatory"],["Lossing limit","Per-session loss limit display"]]
    },
    { code:"pa",     name:"PA",         sub:"Portugal · SRIJ §V",                              state:"",
      rules:[["SRIJ §V","RNG period proof"],["Player protocol","Mandatory deposit limit on signup"]]
    },
    { code:"nl",     name:"NL",         sub:"Netherlands · KSA Cruks 2021",                   state:"",
      rules:[["Cruks","Central self-exclusion register API"],["KSA bonus","No win-condition wagering"]]
    },
    { code:"de",     name:"DE",         sub:"Germany GGL · Glücksspielstaatsvertrag",         state:"",
      rules:[["GlüStV §6","€1 stake cap online slots"],["GlüStV §22a","5s minimum spin pacing"],["Limit-Datei","Cross-operator deposit cap €1 000/month"]]
    },
    { code:"caon",   name:"CA-ON",      sub:"Ontario AGCO · iGOR Standard",                   state:"on",
      rules:[["iGOR","Internet gaming operations regulation"],["AGCO-RG","Responsible gambling toolkit"]]
    },
    { code:"au",     name:"AU",         sub:"Australia · NSW GMC + state codes",              state:"",
      rules:[["GMC §3.1","Approved game probability"],["NSW LL Act","Loss limit enforcement"]]
    },
    { code:"nz",     name:"NZ",         sub:"New Zealand · DIA Class 4",                      state:"",
      rules:[["DIA Class 4","Community gaming code"],["G2G","Game-to-Government audit hook"]]
    },
    { code:"jp",     name:"JP",         sub:"Pachislot · 80%-cycle / kakuhen",                state:"",
      rules:[["Pachislot 80%","80%-cycle RTP rule (1 000-spin cycle)"],["6.0號機","Tier 6 device specification 2018"],["Kakuhen","Trigger probability bounded by JPN code"]]
    },
    { code:"kr",     name:"KR",         sub:"South Korea · NGCC",                              state:"",
      rules:[["NGCC code","National Gambling Control Commission"],["RTP cap","Max 94% on slot devices"]]
    },
    { code:"br",     name:"BR",         sub:"Brazil · SBT/MF Portaria 1.330/2023",            state:"",
      rules:[["Portaria 1.330","Federal sports betting authorization"],["RNG","Lab test by approved entity"]]
    },
  ];

  const jurisGrid = $("#juris-grid");
  jurisGrid.innerHTML = JURIS.map(j => `
    <div class="juris-chip ${j.state} ${j.uk?'uk-crit':''}" data-juris="${j.code}">
      <b>${j.name}</b>
      <small>${j.sub}</small>
    </div>
  `).join("");
  $$("#juris-grid .juris-chip").forEach(c => {
    c.addEventListener("click", () => {
      // single-click toggles selection, but also opens overlay
      const j = JURIS.find(x => x.code === c.dataset.juris);
      $("#jo-title").textContent = j.name + " · " + j.sub.split(" · ")[0];
      $("#jo-sub").textContent = j.sub;
      $("#jo-body").innerHTML = j.rules.map(([code, txt]) => `<div class="rule"><span class="code">${code}</span><b>${txt}</b></div>`).join("");
      $("#juris-overlay").classList.add("is-open");
      c.classList.toggle("on");
    });
  });
  $("#jo-close").addEventListener("click", () => $("#juris-overlay").classList.remove("is-open"));
  $("#juris-overlay").addEventListener("click", e => {
    if (e.target.id === "juris-overlay") $("#juris-overlay").classList.remove("is-open");
  });

  // package button
  $("#btn-package").addEventListener("click", () => {
    const b = $("#btn-package");
    const orig = b.innerHTML;
    b.innerHTML = `Bundling 153 artefacts… <span class="filename">10 categories · ed25519 sign</span>`;
    setTimeout(() => {
      b.innerHTML = `Ready · operator-package.zip <span class="filename">42.8 MB · sha256 e1a4…c8d2</span>`;
      setTimeout(() => b.innerHTML = orig, 2400);
    }, 900);
  });

  /* ============================================================
     INIT
     ============================================================ */
  renderReels();
  renderPaytable();
  compute();
})();
