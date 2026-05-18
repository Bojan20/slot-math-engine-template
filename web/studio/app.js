/* =============================================================
   Slot Math Studio · v5-final-studio
   Onyx + cyan, 4-row shell, two-level (Workspaces × Variants),
   Compare A/B split view, context-aware right rail,
   workflow wizards, automation toasts, keyboard shortcuts.
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
    HP:      { defaultIcons: ["keystone", "obelisk", "prism", "shard", "crystal", "sigil", "orbit", "diamond"], defaultNames: ["Sapphire","Ruby","Emerald","Topaz","Onyx","Pearl","Garnet","Opal"], basePay: { x3: 50, x4: 150, x5: 500 } },
    MP:      { defaultIcons: ["hexagon", "star5", "octagon", "gear", "sun", "moon", "key", "eye"],              defaultNames: ["Crown","Compass","Coin","Cog","Orbit","Cipher","Vortex","Lyre"], basePay: { x3: 20, x4: 60, x5: 200 } },
    LP:      { defaultIcons: ["pebble", "wave", "arc", "chevron", "leaf", "drop", "circle", "knot"],            defaultNames: ["Sphere","Block","Spire","Arc","Bolt","Wave","Drop","Knot"], basePay: { x3: 5, x4: 20, x5: 75 } },
    WILD:    { defaultIcons: ["wild", "lattice", "star6"],         defaultNames: ["WILD1","WILD2","WILD3"], basePay: { x3: 0, x4: 0, x5: 0 } },
    SCATTER: { defaultIcons: ["scatter", "sonar"],                 defaultNames: ["SCATTER1","SCATTER2"],   basePay: { x3: 5, x4: 20, x5: 100 } },
    MULT:    { defaultIcons: ["mult", "bonus", "flame", "vortex"], defaultNames: ["MULT1","BONUS1","MULT2","BONUS2"], basePay: { x3: 0, x4: 0, x5: 0 } }
  };

  const POOL_PRESETS = {
    compact:  { HP: 3, MP: 0, LP: 3, WILD: 0, SCATTER: 1, MULT: 0 },
    standard: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 0 },
    rich:     { HP: 3, MP: 3, LP: 4, WILD: 2, SCATTER: 1, MULT: 2 }
  };

  const THEME_PALETTE = {
    lava:   { dot: "#F97316", name: "Lava red" },
    pearl:  { dot: "#60A5FA", name: "Pearl blue" },
    solar:  { dot: "#F59E0B", name: "Solar amber" },
    mint:   { dot: "#34D399", name: "Mint green" },
    violet: { dot: "#A78BFA", name: "Violet" },
    rose:   { dot: "#FB7185", name: "Rose" },
    cyan:   { dot: "#22D3EE", name: "Cyan" },
    slate:  { dot: "#94A3B8", name: "Slate" }
  };

  const LAYOUTS = [
    { id: "5x3",       label: "5×3 · 20 lines" },
    { id: "5x4",       label: "5×4 · 40 lines" },
    { id: "6x4",       label: "6×4 · 4 096 ways" },
    { id: "6x4mw",     label: "6×4 Megaways" },
    { id: "7x7c",      label: "7×7 cluster" },
    { id: "6x3",       label: "6×3 · 50 lines" },
    { id: "3x3",       label: "3×3 · 9 lines" }
  ];

  /* ============================================================
     STATE — two levels: Workspaces × Variants
     ============================================================ */
  function newVariant({ id, name, rtp = 95.42, sigma = 8.41, hit = 27.83, maxWin = 2145, vola = "MID", pool, rtpTarget = 95.5 }) {
    return {
      id,
      name,
      persona: "math",
      tierCounts: pool ? { ...pool } : { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 0 },
      symbols: [],
      reels: [],
      rtp, rtpTarget,
      hit, sigma, maxWin, vola,
      activePreset: "standard",
      activity: [],
      lastSavedAt: Date.now() - 12000,
      selection: null
    };
  }

  function newWorkspace({ id, name, theme, layout, irName }) {
    return {
      id, name, theme, layout, irName,
      activeVariantId: "var-a",
      variantOrder: ["var-a"],
      variants: {
        "var-a": newVariant({ id: "var-a", name: "Base" })
      }
    };
  }

  // Seed three workspaces with realistic variants
  const workspaces = {};
  const wsOrder = [];

  // Untitled — 3 variants
  workspaces["ws-lava"] = {
    id: "ws-lava", name: "Untitled", theme: "lava", layout: "5x3",
    irName: "untitled-v0.4.12",
    activeVariantId: "var-a",
    variantOrder: ["var-a", "var-b", "var-c"],
    variants: {
      "var-a": newVariant({ id: "var-a", name: "Base", rtp: 95.42, sigma: 6.2, hit: 26.8, maxWin: 5000, vola: "MID", pool: { HP: 3, MP: 3, LP: 3, WILD: 1, SCATTER: 1, MULT: 1 } }),
      "var-b": newVariant({ id: "var-b", name: "Higher Hit", rtp: 94.80, sigma: 5.1, hit: 32.5, maxWin: 3000, vola: "LOW", pool: { HP: 3, MP: 3, LP: 4, WILD: 1, SCATTER: 1, MULT: 1 } }),
      "var-c": newVariant({ id: "var-c", name: "Jackpot Heavy", rtp: 96.20, sigma: 9.8, hit: 18.4, maxWin: 12000, vola: "HIGH", pool: { HP: 4, MP: 2, LP: 3, WILD: 1, SCATTER: 1, MULT: 2 } })
    }
  };
  wsOrder.push("ws-lava");

  // Untitled 2 — 1 variant
  workspaces["ws-pearl"] = {
    id: "ws-pearl", name: "Untitled 2", theme: "pearl", layout: "6x4mw",
    irName: "untitled-2-v0.2.05",
    activeVariantId: "var-a",
    variantOrder: ["var-a"],
    variants: {
      "var-a": newVariant({ id: "var-a", name: "Base", rtp: 96.00, sigma: 8.0, hit: 22.1, maxWin: 10000, vola: "MID", pool: { HP: 4, MP: 4, LP: 4, WILD: 1, SCATTER: 1, MULT: 1 } })
    }
  };
  wsOrder.push("ws-pearl");

  // Untitled 3 — 2 variants
  workspaces["ws-solar"] = {
    id: "ws-solar", name: "Untitled 3", theme: "solar", layout: "7x7c",
    irName: "untitled-3-v0.1.18",
    activeVariantId: "var-a",
    variantOrder: ["var-a", "var-b"],
    variants: {
      "var-a": newVariant({ id: "var-a", name: "Base", rtp: 94.50, sigma: 7.4, hit: 28.0, maxWin: 7500, vola: "MID", pool: { HP: 3, MP: 3, LP: 3, WILD: 0, SCATTER: 2, MULT: 1 } }),
      "var-b": newVariant({ id: "var-b", name: "Slow Burn", rtp: 95.00, sigma: 4.5, hit: 38.0, maxWin: 2500, vola: "LOW", pool: { HP: 3, MP: 4, LP: 5, WILD: 0, SCATTER: 1, MULT: 1 } })
    }
  };
  wsOrder.push("ws-solar");

  // Top-level state
  let activeWorkspaceId = "ws-lava";
  let compareMode = false;
  let compareVariantIds = []; // [leftId, rightId]
  let comparePane = "left";   // which pane is being edited in compare mode (drives state proxy)

  /* Accessors */
  function getActiveWorkspace() { return workspaces[activeWorkspaceId]; }
  function getActiveVariant() {
    const ws = getActiveWorkspace();
    if (compareMode) {
      const id = comparePane === "left" ? compareVariantIds[0] : compareVariantIds[1];
      return ws.variants[id] || ws.variants[ws.activeVariantId];
    }
    return ws.variants[ws.activeVariantId];
  }
  function getVariant(wsId, varId) {
    return workspaces[wsId]?.variants[varId];
  }

  /* ============================================================
     PERSONA · real per-persona layout (math / design / producer)
     ============================================================ */
  const PERSONA_DEFAULTS = {
    math:     { tab: "sensitivity", ctaIcon: "∇",  ctaLabel: "Run sweep",            chipLbl: "RTP range 88–98%" },
    design:   { tab: "play",        ctaIcon: "▶",  ctaLabel: "Spin preview",         chipLbl: "Visual theme · all" },
    producer: { tab: "certify",     ctaIcon: "↗",  ctaLabel: "Submit to regulator",  chipLbl: "Jurisdiction · all green" }
  };

  // Last time user clicked a tab manually (within 30s of persona switch → respect intent)
  let lastTabSwitchTime = 0;
  // First-time-this-session welcome toast tracker
  const personaSeen = { math: false, design: false, producer: false };
  // Manual tab override during the 30s grace window after persona switch
  let lastManualTabAt = 0;

  function applyPersonaCTA(p) {
    const d = PERSONA_DEFAULTS[p];
    if (!d) return;
    const ic = document.getElementById("persona-cta-ic");
    const lbl = document.getElementById("persona-cta-lbl");
    const btn = document.getElementById("persona-cta");
    if (ic) ic.textContent = d.ctaIcon;
    if (lbl) lbl.textContent = d.ctaLabel;
    if (btn) btn.title = `${d.ctaLabel} (persona primary action)`;
  }

  function applyPersonaCatalogChip(p) {
    const d = PERSONA_DEFAULTS[p];
    const lbl = document.getElementById("cat-chip-lbl");
    if (lbl && d) lbl.textContent = d.chipLbl;
  }

  function showPersonaWelcomeToast(p) {
    const msgs = {
      math:     `Welcome <b>math designer</b> · <b>Sensitivity</b> is your home tab`,
      design:   `Welcome <b>game designer</b> · <b>Play</b> tab for spin preview`,
      producer: `Welcome <b>producer</b> · <b>Certify</b> tab for cert pipeline`
    };
    toast({ kind: "cyan", msg: msgs[p], ttl: 5500 });
  }

  function setPersona(p, opts) {
    opts = opts || {};
    const d = PERSONA_DEFAULTS[p];
    if (!d) return;
    const v = getActiveVariant();
    if (v) v.persona = p;
    document.body.classList.remove("persona-math", "persona-design", "persona-producer");
    document.body.classList.add("persona-" + p);
    $$(".persona-btn").forEach(b => {
      const on = b.dataset.persona === p;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    applyPersonaCTA(p);
    applyPersonaCatalogChip(p);

    // Auto-switch to persona default tab — UNLESS the user manually
    // clicked a different tab in the last 30s (they have intent).
    const now = Date.now();
    const respectManual = (now - lastManualTabAt) < 30000;
    if (!opts.silentTab && !respectManual) {
      goToTab(d.tab, /*manual=*/false);
    }

    // First-time welcome toast per session
    if (!personaSeen[p] && !opts.silentToast) {
      personaSeen[p] = true;
      // Skip on initial bootstrap to avoid double-toast with the welcome banner
      if (!opts.bootstrap) showPersonaWelcomeToast(p);
    }

    if (!opts.bootstrap) logActivity(`persona → ${p}`);
  }
  $$(".persona-btn").forEach(b => b.addEventListener("click", () => setPersona(b.dataset.persona)));

  // Persona primary CTA click handler (text & action vary by persona)
  const personaCtaBtn = document.getElementById("persona-cta");
  if (personaCtaBtn) {
    personaCtaBtn.addEventListener("click", () => {
      const cur = document.body.classList.contains("persona-design") ? "design"
                : document.body.classList.contains("persona-producer") ? "producer"
                : "math";
      if (cur === "math") {
        goToTab("sensitivity", false);
        // Auto-trigger sweep
        toast({ kind: "cyan", msg: `Sweep started · <b>HP1 weight</b> · 12 points · ETA ~1.4s` });
        logActivity(`persona CTA · run sweep`);
      } else if (cur === "design") {
        goToTab("play", false);
        // Auto spin
        setTimeout(() => { try { spin(); } catch(e) {} }, 80);
        logActivity(`persona CTA · spin preview`);
      } else if (cur === "producer") {
        goToTab("certify", false);
        toast({
          kind: "cyan",
          msg: `Submit to regulator · pick jurisdiction below`,
          action: "UKGC",
          onAction: () => toast({ kind: "ok", msg: `Queued op-package.zip → <b>UKGC RTS-14</b>` })
        });
        logActivity(`persona CTA · submit to regulator`);
      }
    });
  }

  // Copy-on-click for math 4dp RTP headline
  const l1rtpEl = document.getElementById("l1-rtp");
  if (l1rtpEl) {
    l1rtpEl.addEventListener("click", () => {
      if (!document.body.classList.contains("persona-math")) return;
      const txt = l1rtpEl.textContent.trim();
      try { navigator.clipboard.writeText(txt); } catch(e) {}
      toast({ kind: "ok", msg: `Copied <b>${txt}</b> to clipboard` });
    });
  }

  // Theme tile picker (Design persona rail)
  $$(".theme-tile[data-theme-preset]").forEach(t => {
    t.addEventListener("click", () => {
      $$(".theme-tile").forEach(x => x.classList.remove("is-active"));
      t.classList.add("is-active");
      toast({ kind: "cyan", msg: `Theme → <b>${t.querySelector(".theme-tile-lbl").textContent}</b>` });
    });
  });

  /* ============================================================
     TAB ROUTING
     ============================================================ */
  function goToTab(key, manual) {
    if (manual === undefined) manual = true;
    if (manual) lastManualTabAt = Date.now();
    lastTabSwitchTime = Date.now();
    $$(".tab").forEach(t => {
      const on = t.dataset.tab === key;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $$(".panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + key));
    setRailContext(key === "play" ? "spin" : (getActiveVariant().selection?.kind || "overall"));
    applyCompareViewToTab(key);
  }
  $$(".tab").forEach(btn => btn.addEventListener("click", () => goToTab(btn.dataset.tab, /*manual=*/true)));
  const tabsEls = $$(".tab");
  tabsEls.forEach((t, i) => {
    t.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const nx = tabsEls[(i + dir + tabsEls.length) % tabsEls.length];
        nx.focus(); nx.click();
      }
    });
  });

  /* ============================================================
     SYMBOL POOL — build + render (for active variant)
     ============================================================ */
  function buildSymbolPoolFor(variant) {
    const used = new Set();
    const pool = [];
    for (const tier of TIER_ORDER) {
      const count = variant.tierCounts[tier] || 0;
      const tdef = TIER_DEFAULTS[tier];
      for (let i = 0; i < count; i++) {
        const id = `${tier}${i + 1}`;
        const existing = variant.symbols.find(s => s.id === id && s.tier === tier);
        if (existing) {
          used.add(existing.icon);
          pool.push(existing);
          continue;
        }
        let icon = tdef.defaultIcons[i % tdef.defaultIcons.length];
        if (used.has(icon)) {
          const fallback = ICON_LIB.find(ic => !used.has(ic.id));
          icon = fallback ? fallback.id : icon;
        }
        used.add(icon);
        pool.push({
          tier, id, name: tdef.defaultNames[i] || id, icon,
          weight: tier === "HP" ? 3.5 : tier === "MP" ? 5.2 : tier === "LP" ? 8.0 : 1.5,
          pay: { ...tdef.basePay }
        });
      }
    }
    variant.symbols = pool;
    return pool;
  }
  function buildSymbolPool() { return buildSymbolPoolFor(getActiveVariant()); }

  function renderSymbolList(container = $("#sym-list"), variant = getActiveVariant(), paneKey = null) {
    container.innerHTML = "";
    variant.symbols.forEach((sym, idx) => {
      const row = document.createElement("div");
      row.className = `sym-row tier-${sym.tier}`;
      row.dataset.idx = idx;
      if (paneKey) row.dataset.pane = paneKey;
      row.innerHTML = `
        <span class="sym-tier">${sym.tier}</span>
        <span class="sym-id mono">${sym.id}</span>
        <input class="sym-name" value="${sym.name}" data-idx="${idx}" />
        <button class="sym-icon-btn" data-idx="${idx}" title="Swap icon">
          <svg><use href="#g-${sym.icon}"/></svg>
        </button>
        <div class="sym-weight">
          <input type="range" min="0.5" max="12" step="0.1" value="${sym.weight}" data-w="${idx}" />
          <span class="w-val mono" data-w-v="${idx}">${sym.weight.toFixed(1)}</span>
        </div>
        <span class="sym-pay">${sym.pay.x3}/${sym.pay.x4}/${sym.pay.x5}</span>
        <button class="sym-more" data-more="${idx}" title="More">⋯</button>
      `;
      container.appendChild(row);
    });
    $$(".sym-name", container).forEach(inp => {
      inp.addEventListener("input", e => {
        const i = +e.target.dataset.idx;
        variant.symbols[i].name = e.target.value;
      });
      inp.addEventListener("blur", e => logActivityFor(variant, `renamed → ${e.target.value}`));
    });
    $$(".sym-icon-btn", container).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openInlineIconPopup(+btn.dataset.idx, btn, variant, paneKey);
      });
    });
    $$("[data-w]", container).forEach(s => {
      s.addEventListener("input", e => {
        const i = +e.target.dataset.w;
        const v = parseFloat(e.target.value);
        variant.symbols[i].weight = v;
        container.querySelector(`[data-w-v="${i}"]`).textContent = v.toFixed(1);
        scheduleAutoBalanceFor(variant, paneKey, i);
      });
    });
    if (paneKey) {
      const cntEl = paneKey === "left" ? $("#pool-count-A") : $("#pool-count-B");
      if (cntEl) cntEl.textContent = variant.symbols.length;
    } else {
      const cntEl = $("#pool-count");
      if (cntEl) cntEl.textContent = variant.symbols.length;
    }
  }

  /* INLINE ICON POPUP */
  let inlinePopup = null;
  function closeInlineIconPopup() {
    if (inlinePopup) { inlinePopup.remove(); inlinePopup = null; }
  }
  function openInlineIconPopup(idx, anchorEl, variant = getActiveVariant(), paneKey = null) {
    closeInlineIconPopup();
    const used = new Set(variant.symbols.map(s => s.icon));
    const cur = variant.symbols[idx].icon;
    const popup = document.createElement("div");
    popup.className = "sym-icon-popup";
    const candidates = ICON_LIB.filter(ic => ic.id === cur || !used.has(ic.id)).slice(0, 12);
    candidates.forEach(ic => {
      const b = document.createElement("button");
      b.className = "sym-icon-popup-cell";
      b.title = ic.name;
      b.innerHTML = `<svg><use href="#g-${ic.id}"/></svg>`;
      b.addEventListener("click", () => {
        variant.symbols[idx].icon = ic.id;
        closeInlineIconPopup();
        rerenderActive();
        logActivityFor(variant, `icon swap → ${ic.name}`);
      });
      popup.appendChild(b);
    });
    const browse = document.createElement("button");
    browse.className = "sym-icon-popup-browse";
    browse.textContent = "Browse all 40 icons →";
    browse.addEventListener("click", () => { closeInlineIconPopup(); openIconPicker(idx, variant); });
    popup.appendChild(browse);
    document.body.appendChild(popup);
    const r = anchorEl.getBoundingClientRect();
    popup.style.left = `${Math.max(8, r.left - 80)}px`;
    popup.style.top  = `${r.bottom + 4}px`;
    setTimeout(() => {
      document.addEventListener("click", function once(e) {
        if (!popup.contains(e.target)) closeInlineIconPopup();
        document.removeEventListener("click", once);
      });
    }, 0);
    inlinePopup = popup;
  }

  /* FULL ICON PICKER MODAL */
  let pickerTargetIdx = null;
  let pickerTargetVariant = null;
  function openIconPicker(idx, variant = getActiveVariant()) {
    pickerTargetIdx = idx;
    pickerTargetVariant = variant;
    const grid = $("#picker-grid");
    grid.innerHTML = "";
    ICON_LIB.forEach(ic => {
      const b = document.createElement("button");
      b.className = "picker-cell";
      b.title = ic.name;
      b.innerHTML = `<svg><use href="#g-${ic.id}"/></svg>`;
      b.addEventListener("click", () => {
        pickerTargetVariant.symbols[pickerTargetIdx].icon = ic.id;
        rerenderActive();
        closeIconPicker();
        logActivityFor(pickerTargetVariant, `icon swap → ${ic.name}`);
      });
      grid.appendChild(b);
    });
    showModal("picker");
  }
  function closeIconPicker() { hideModal("picker"); pickerTargetIdx = null; pickerTargetVariant = null; }
  $("#picker-close").addEventListener("click", closeIconPicker);
  $("#picker-backdrop").addEventListener("click", closeIconPicker);

  /* ============================================================
     REELS + PAYTABLE render
     ============================================================ */
  function autoBuildReelsFor(variant) {
    if (!variant.symbols.length) buildSymbolPoolFor(variant);
    const ids = variant.symbols.map(s => s.id);
    const reels = [];
    for (let r = 0; r < 5; r++) {
      const col = [];
      for (let p = 0; p < 6; p++) col.push(ids[(r * 3 + p * 2) % ids.length]);
      reels.push(col);
    }
    variant.reels = reels;
  }
  function symByIdFor(variant, id) { return variant.symbols.find(s => s.id === id); }

  function renderReels(container = $("#reels"), variant = getActiveVariant(), paneKey = null) {
    if (!variant.reels.length) autoBuildReelsFor(variant);
    const total = variant.symbols.reduce((a, s) => a + s.weight, 0) || 1;
    container.innerHTML = "";
    variant.reels.forEach((col, ri) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      reel.innerHTML = `<div class="reel-h">R${ri+1}</div>` +
        col.map((id, pi) => {
          const sym = symByIdFor(variant, id);
          if (!sym) return "";
          const pmf = ((sym.weight / total) * 100).toFixed(1);
          return `<div class="reel-cell tier-${sym.tier}" data-reel="${ri}" data-pos="${pi}" data-id="${id}">
            <svg><use href="#g-${sym.icon}"/></svg>
            <span class="pmf">${pmf}%</span>
          </div>`;
        }).join("");
      container.appendChild(reel);
    });
    $$(".reel-cell", container).forEach(cell => {
      cell.addEventListener("click", () => {
        $$(".reel-cell.is-selected", container).forEach(e => e.classList.remove("is-selected"));
        cell.classList.add("is-selected");
        setSelectionFor(variant, paneKey, { kind: "reel", reel: +cell.dataset.reel, pos: +cell.dataset.pos, id: cell.dataset.id });
      });
    });
  }

  function renderPaytable(container = $("#paytable"), variant = getActiveVariant(), paneKey = null) {
    container.innerHTML = "";
    const header = `<div></div><div class="pt-h">3oak</div><div class="pt-h">4oak</div><div class="pt-h">5oak</div>`;
    container.insertAdjacentHTML("beforeend", header);
    variant.symbols.forEach((sym, idx) => {
      container.insertAdjacentHTML("beforeend", `
        <div class="pt-row-lbl">${sym.id}</div>
        <div class="pt-cell" data-pt="${idx}-x3">${sym.pay.x3}</div>
        <div class="pt-cell" data-pt="${idx}-x4">${sym.pay.x4}</div>
        <div class="pt-cell" data-pt="${idx}-x5">${sym.pay.x5}</div>
      `);
    });
    $$(".pt-cell", container).forEach(cell => {
      cell.addEventListener("click", () => {
        $$(".pt-cell.is-selected", container).forEach(e => e.classList.remove("is-selected"));
        cell.classList.add("is-selected");
        const [idx, oak] = cell.dataset.pt.split("-");
        setSelectionFor(variant, paneKey, { kind: "paytable", symIdx: +idx, oak });
      });
    });
  }

  /* ============================================================
     POOL PRESETS — bind to active variant
     ============================================================ */
  $$(".preset[data-preset]").forEach(b => {
    b.addEventListener("click", () => {
      const variant = getActiveVariant();
      const preset = b.dataset.preset;
      variant.activePreset = preset;
      variant.tierCounts = { ...POOL_PRESETS[preset] };
      variant.symbols = [];
      $$(".preset[data-preset]", $("#panel-build")).forEach(x => x.classList.toggle("is-active", x === b));
      Object.keys(variant.tierCounts).forEach(t => {
        const sl = $(`#pool-custom input[data-tier="${t}"]`);
        if (sl) { sl.value = variant.tierCounts[t]; $(`[data-tier-v="${t}"]`).textContent = variant.tierCounts[t]; }
      });
      buildSymbolPoolFor(variant); autoBuildReelsFor(variant);
      rerenderActive();
      recomputeFor(variant);
      refreshL1(); refreshRail(); refreshVariantTabs();
      toast({ kind: "ok", msg: `Preset <b>${preset}</b> applied · ${variant.symbols.length} symbols loaded` });
      logActivityFor(variant, `preset → ${preset}`);
    });
  });

  $("#preset-custom-toggle").addEventListener("click", () => {
    const cust = $("#pool-custom");
    const open = cust.hasAttribute("hidden");
    if (open) { cust.removeAttribute("hidden"); $("#preset-custom-toggle").setAttribute("aria-expanded", "true"); }
    else      { cust.setAttribute("hidden", "");  $("#preset-custom-toggle").setAttribute("aria-expanded", "false"); }
  });

  /* CUSTOM tier sliders */
  $$("#pool-custom input[type='range']").forEach(s => {
    s.addEventListener("input", () => {
      const variant = getActiveVariant();
      const tier = s.dataset.tier;
      const v = parseInt(s.value, 10);
      variant.tierCounts[tier] = v;
      $(`[data-tier-v="${tier}"]`).textContent = v;
      $$(".preset[data-preset]", $("#panel-build")).forEach(x => x.classList.remove("is-active"));
      buildSymbolPoolFor(variant); autoBuildReelsFor(variant);
      rerenderActive();
      recomputeFor(variant);
      refreshL1(); refreshRail(); refreshVariantTabs();
    });
    s.addEventListener("change", () => {
      scheduleAutoBalanceFor(getActiveVariant(), null, "tier-" + s.dataset.tier);
    });
  });

  /* ============================================================
     COMPUTE (mock closed-form)
     ============================================================ */
  function recomputeFor(variant) {
    const total = variant.symbols.reduce((a, s) => a + s.weight, 0) || 1;
    const payMass = variant.symbols.reduce((a, s) => a + (s.pay.x3 + s.pay.x4 + s.pay.x5) * (s.weight / total), 0);
    const wAvg = variant.symbols.reduce((a, s) => a + s.weight, 0) / Math.max(variant.symbols.length, 1);
    const rtp = 88 + payMass * 0.0086 + (wAvg - 4) * 0.14;
    variant.rtp = Math.max(86, Math.min(99, rtp));
    variant.hit = 22 + (variant.symbols.length - 6) * 0.6;
    variant.sigma = 6 + variant.symbols.filter(s => s.tier === "HP").length * 0.7;
    variant.maxWin = 1500 + variant.symbols.filter(s => s.tier === "HP" || s.tier === "WILD").length * 220;
    variant.vola = variant.sigma > 9.5 ? "HIGH" : variant.sigma < 7 ? "LOW" : "MID";
  }
  function recompute() { recomputeFor(getActiveVariant()); }

  function refreshL1() {
    const v = getActiveVariant();
    // Math headline · 4dp precision so columns align in copy-paste
    const l1rtp = $("#l1-rtp");   if (l1rtp) l1rtp.innerHTML = `${v.rtp.toFixed(4)}<span class="pct">%</span>`;
    const l1hit = $("#l1-hit");   if (l1hit) l1hit.innerHTML = `${v.hit.toFixed(2)}<span class="pct">%</span>`;
    const l1vol = $("#l1-vola");  if (l1vol) l1vol.textContent = v.vola;
    const l1sig = $("#l1-sigma"); if (l1sig) l1sig.textContent = v.sigma.toFixed(2);
    const l1p99 = $("#l1-p99");   if (l1p99) l1p99.textContent = (v.maxWin / 10).toFixed(1) + "×";

    // Design headline · classify win-feel from sigma + hit
    const pill = $("#winfeel-pill");
    const pillBig = $("#winfeel-pill-big");
    let feel = "Balanced", feelCls = "is-balanced";
    if (v.sigma > 9.5)      { feel = "Loose";    feelCls = "is-loose"; }
    else if (v.sigma < 6.5) { feel = "Tight";    feelCls = "is-tight"; }
    [pill, pillBig].forEach(p => {
      if (!p) return;
      p.textContent = p === pillBig ? feel.toUpperCase() : feel;
      p.classList.remove("is-tight", "is-balanced", "is-loose");
      p.classList.add(feelCls);
    });
    $$(".wf-tick").forEach(t => t.classList.remove("is-on"));
    const tick = $(`.wf-${feelCls.replace("is-", "")}`);
    if (tick) tick.classList.add("is-on");
    const wfSub = $(".winfeel-sub");
    if (wfSub) wfSub.textContent = `hit 1-in-${(100 / Math.max(v.hit, 1)).toFixed(1)}`;
  }

  /* ============================================================
     RIGHT RAIL · context-aware
     ============================================================ */
  function setSelectionFor(variant, paneKey, sel) {
    variant.selection = sel;
    // Only update right rail in single-view mode (or for the "primary" left pane)
    if (!compareMode || paneKey === "left" || paneKey === null) {
      setRailContext(sel.kind);
      refreshRail();
    }
  }
  function setRailContext(ctx) {
    $("#rail-ctx").textContent = ctx;
    const isOverall = ctx === "overall" || ctx === "spin";
    // Persona rails are shown via CSS based on body class; we only
    // toggle the legacy #rail-default for selection-driven contexts.
    // When a selection is active we show the selection block AND hide
    // both persona rails and the default. When in overall context we
    // show the persona rail (via CSS) and keep #rail-default hidden so
    // it doesn't double up underneath.
    const railSel = $("#rail-selection");
    if (railSel) railSel.hidden = isOverall;
    const railDef = $("#rail-default");
    if (railDef) railDef.hidden = true;
    // Hide persona rails when there's an active selection
    $$(".rail-persona").forEach(el => {
      el.style.display = isOverall ? "" : "none";
    });
  }

  function refreshRail() {
    const v = getActiveVariant();
    const ws = getActiveWorkspace();
    // Legacy "Overall RTP" elements (kept for backwards-compat — currently
    // hidden by persona rails; keep updated so toggling stays accurate)
    const rrtp = $("#rail-rtp-big"); if (rrtp) rrtp.textContent = v.rtp.toFixed(2);
    const dt = (v.rtp - v.rtpTarget);
    const dtEl = $("#rail-rtp-delta");
    if (dtEl) {
      dtEl.textContent = `${dt >= 0 ? "↗" : "↘"} ${dt >= 0 ? "+" : ""}${dt.toFixed(2)}`;
      dtEl.classList.toggle("ok", Math.abs(dt) < 0.5);
      dtEl.classList.toggle("warn", Math.abs(dt) >= 0.5);
    }
    updateGauge();
    const list = $("#rail-activity");
    if (list) {
      list.innerHTML = v.activity.slice(-4).reverse().map(a => `
        <li><span class="t mono">${a.t}</span><span class="m">${a.msg}</span></li>
      `).join("") || `<li><span class="t mono">—</span><span class="m">no recent changes</span></li>`;
    }

    // Math rail · live moment values driven from active variant
    const mSigma = $("#m-sigma"); if (mSigma) mSigma.textContent = v.sigma.toFixed(2);
    const mMu    = $("#m-mu");    if (mMu)    mMu.textContent    = v.rtp.toFixed(4) + "%";
    const mP99   = $("#m-p99");   if (mP99)   mP99.textContent   = (v.maxWin / 10).toFixed(1) + "×";

    // Headline metrics (math / design / producer)
    const l1sigma = $("#l1-sigma"); if (l1sigma) l1sigma.textContent = v.sigma.toFixed(2);
    const l1p99   = $("#l1-p99");   if (l1p99)   l1p99.textContent   = (v.maxWin / 10).toFixed(1) + "×";

    // Variant lineup mini-section (only if element exists, since it's
    // inside legacy #rail-default now hidden — guarded inside fn)
    renderVariantLineup();

    const selDiv = $("#rail-selection");
    if (v.selection?.kind === "paytable") {
      const s = v.symbols[v.selection.symIdx];
      if (!s) { selDiv.innerHTML = ""; return; }
      const oak = v.selection.oak;
      const pay = s.pay[oak];
      const total = v.symbols.reduce((a, x) => a + x.weight, 0);
      const contrib = ((s.weight / total) * pay * 0.0086).toFixed(3);
      selDiv.innerHTML = `
        <section class="rail-card">
          <div class="rail-card-h"><span>This symbol</span><span class="rail-card-r mono">${s.id} · ${oak}</span></div>
          <div class="rail-rtp"><b class="mono">${pay}</b><span class="rail-rtp-pct">×</span></div>
          <div class="rail-mini-row">
            <div><span class="caps">weight</span><b class="mono">${s.weight.toFixed(1)}</b></div>
            <div><span class="caps">contrib</span><b class="mono cyan">+${contrib}%</b></div>
          </div>
        </section>
        <section class="rail-card">
          <div class="rail-card-h"><span>What-if Δ</span></div>
          <div class="rail-mini-row">
            <div><span class="caps">+10% pay</span><b class="mono ok">+${(contrib * 0.1).toFixed(3)}%</b></div>
            <div><span class="caps">−10% pay</span><b class="mono err">−${(contrib * 0.1).toFixed(3)}%</b></div>
          </div>
        </section>
        <section class="rail-card">
          <div class="rail-card-h"><span>Tier neighbors</span><span class="rail-card-r mono">${s.tier}</span></div>
          <ul class="rail-activity">
            ${v.symbols.filter(x => x.tier === s.tier).slice(0, 4).map(x => `
              <li><span class="t mono">${x.id}</span><span class="m">${x.pay.x3}/${x.pay.x4}/${x.pay.x5}</span></li>
            `).join("")}
          </ul>
        </section>
      `;
    } else if (v.selection?.kind === "reel") {
      const s = symByIdFor(v, v.selection.id);
      if (!s) { selDiv.innerHTML = ""; return; }
      const total = v.symbols.reduce((a, x) => a + x.weight, 0);
      const pmf = ((s.weight / total) * 100).toFixed(2);
      selDiv.innerHTML = `
        <section class="rail-card">
          <div class="rail-card-h"><span>Reel cell</span><span class="rail-card-r mono">R${v.selection.reel+1}·${v.selection.pos+1}</span></div>
          <div class="rail-rtp"><b class="mono">${pmf}</b><span class="rail-rtp-pct">%</span></div>
          <div class="rail-mini-row">
            <div><span class="caps">symbol</span><b class="mono">${s.id}</b></div>
            <div><span class="caps">tier</span><b class="mono">${s.tier}</b></div>
          </div>
        </section>
        <section class="rail-card">
          <div class="rail-card-h"><span>Reel weight balance</span></div>
          <div class="rail-mini-row">
            <div><span class="caps">this reel σ</span><b class="mono">${(v.sigma * 0.9).toFixed(2)}</b></div>
            <div><span class="caps">vs avg</span><b class="mono ok">+2.1%</b></div>
          </div>
        </section>
        <section class="rail-card">
          <div class="rail-card-h"><span>Impact on RTP</span></div>
          <div class="rail-mini-row">
            <div><span class="caps">contrib</span><b class="mono cyan">+${(s.weight / total * 6).toFixed(2)}%</b></div>
            <div><span class="caps">if doubled</span><b class="mono warn">+${(s.weight / total * 11).toFixed(2)}%</b></div>
          </div>
        </section>
      `;
    }
  }

  function renderVariantLineup() {
    const ws = getActiveWorkspace();
    const c = $("#rail-variant-lineup");
    if (!c) return;
    const rows = ws.variantOrder.map(vid => {
      const v = ws.variants[vid];
      const isActive = vid === ws.activeVariantId;
      const pct = Math.max(0, Math.min(100, (v.rtp - 88) / 11 * 100));
      return `<button class="variant-lineup-bar ${isActive ? "is-active" : ""}" data-vid="${vid}" title="Switch to ${v.name}">
        <span class="vlb-name">${v.name}</span>
        <span class="vlb-track"><i style="width:${pct.toFixed(1)}%"></i></span>
        <span class="vlb-rtp mono">${v.rtp.toFixed(2)}%</span>
      </button>`;
    }).join("");
    c.innerHTML = rows;
    $$(".variant-lineup-bar", c).forEach(btn => {
      btn.addEventListener("click", () => switchVariant(btn.dataset.vid));
    });
  }

  function updateGauge() {
    const arc = $("#gauge-arc");
    if (!arc) return;
    const v = getActiveVariant();
    const pct = Math.max(0, Math.min(1, (v.rtp - 88) / 11));
    const angleRad = Math.PI * (1 - pct);
    const cx = 100, cy = 100, r = 90;
    const xx = cx + r * Math.cos(Math.PI - angleRad);
    const yy = cy - r * Math.sin(Math.PI - angleRad);
    arc.setAttribute("d", `M 10 100 A 90 90 0 0 1 ${xx.toFixed(1)} ${yy.toFixed(1)}`);
  }

  $("#rail-expand").addEventListener("click", () => {
    const ex = $("#rail-expanded");
    const open = ex.hasAttribute("hidden");
    if (open) { ex.removeAttribute("hidden"); $("#rail-expand").textContent = "Collapse"; }
    else { ex.setAttribute("hidden", ""); $("#rail-expand").textContent = "Expand"; }
  });

  /* ============================================================
     AUTO-BALANCE
     ============================================================ */
  const _autoBalanceTimers = new Map();
  function scheduleAutoBalanceFor(variant, paneKey, trigger) {
    const key = variant.id + ":" + (paneKey || "");
    clearTimeout(_autoBalanceTimers.get(key));
    _autoBalanceTimers.set(key, setTimeout(() => doAutoBalanceFor(variant, paneKey, trigger, false), 350));
  }
  function doAutoBalanceFor(variant, paneKey, trigger, silent) {
    recomputeFor(variant);
    const drift = variant.rtp - variant.rtpTarget;
    if (Math.abs(drift) < 0.05) {
      if (!silent) toast({ kind: "ok", msg: `On target · RTP <b>${variant.rtp.toFixed(2)}%</b> · no rebalance needed` });
      refreshL1(); refreshRail(); refreshVariantTabs();
      return;
    }
    const changed = [];
    const adj = drift > 0 ? -0.15 : +0.15;
    variant.symbols.filter(s => s.tier === "HP").slice(0, 3).forEach(s => {
      const before = s.weight;
      s.weight = Math.max(0.5, Math.min(12, +(s.weight + adj).toFixed(2)));
      changed.push(`${s.id}: ${before.toFixed(2)} → ${s.weight.toFixed(2)}`);
    });
    recomputeFor(variant);
    rerenderActive();
    refreshL1(); refreshRail(); refreshVariantTabs();
    if (!silent) toast({
      kind: "cyan",
      msg: `Auto-balanced [${variant.name}] · ${changed.length} deltas · RTP → <b>${variant.rtp.toFixed(2)}%</b>`,
      action: "Show diff",
      onAction: () => alert(changed.join("\n"))
    });
    logActivityFor(variant, `auto-balance (${changed.length} deltas)`);
  }
  function doAutoBalance(trigger, silent) { doAutoBalanceFor(getActiveVariant(), null, trigger, silent); }

  /* ============================================================
     ACTIVITY LOG
     ============================================================ */
  function logActivityFor(variant, msg) {
    const t = relTime(Date.now());
    variant.activity.push({ t, msg, at: Date.now() });
    if (variant.activity.length > 40) variant.activity.shift();
    if (variant === getActiveVariant()) { refreshRail(); refreshBottomActivity(); }
  }
  function logActivity(msg) { logActivityFor(getActiveVariant(), msg); }
  function relTime(at) {
    const d = Math.round((Date.now() - at) / 1000);
    if (d < 60) return d + "s";
    if (d < 3600) return Math.round(d/60) + "m";
    return Math.round(d/3600) + "h";
  }
  function refreshBottomActivity() {
    const ul = $("#bp-activity");
    if (!ul) return;
    const v = getActiveVariant();
    ul.innerHTML = v.activity.slice(-30).reverse().map(a => `
      <li><span class="t">${a.t}</span><span class="m">${a.msg}</span></li>
    `).join("");
  }

  /* ============================================================
     TOAST
     ============================================================ */
  function toast({ kind = "cyan", msg, action, onAction, ttl = 4500 }) {
    const c = $("#toasts");
    const el = document.createElement("div");
    el.className = `toast is-${kind}`;
    el.innerHTML = `<span>${msg}</span>${action ? `<button class="toast-act">${action}</button>` : ""}`;
    if (action && onAction) el.querySelector(".toast-act").addEventListener("click", onAction);
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 240); }, ttl);
  }

  /* ============================================================
     AUTO-SAVE
     ============================================================ */
  function tickSave() {
    const v = getActiveVariant();
    const age = Math.round((Date.now() - v.lastSavedAt) / 1000);
    let txt;
    if (age < 60) txt = `${age}s`;
    else if (age < 3600) txt = `${Math.round(age/60)}m`;
    else txt = `${Math.round(age/3600)}h`;
    $("#save-age").textContent = txt;
  }
  function doSave() {
    const v = getActiveVariant();
    const ws = getActiveWorkspace();
    v.lastSavedAt = Date.now();
    tickSave();
    toast({ kind: "ok", msg: `Saved <b>${ws.irName}</b> · variant ${v.name} · IR validated · 0 issues` });
    logActivity(`saved ${ws.irName}/${v.name}`);
  }
  setInterval(tickSave, 1000);
  setInterval(() => {
    const v = getActiveVariant();
    if (Date.now() - v.lastSavedAt > 30000) doSave();
  }, 30000);

  /* ============================================================
     WORKSPACE SWITCHER — header pill + dropdown
     ============================================================ */
  function renderWorkspacePill() {
    const ws = getActiveWorkspace();
    const dot = THEME_PALETTE[ws.theme]?.dot || "#22D3EE";
    $("#ws-name").textContent = ws.name;
    $("#ws-pill-dot").style.background = dot;
    $("#ws-pill-dot").style.boxShadow = `0 0 6px ${dot}66`;
  }
  function renderWorkspaceMenu() {
    const m = $("#ws-menu");
    const itemsHtml = wsOrder.map(id => {
      const w = workspaces[id];
      const dot = THEME_PALETTE[w.theme]?.dot || "#22D3EE";
      const vCount = w.variantOrder.length;
      return `<button class="ws-menu-item ${id === activeWorkspaceId ? "is-active" : ""}" data-ws="${id}">
        <span class="theme-dot" style="background:${dot}"></span>
        <span class="ws-menu-name">${w.name}</span>
        <span class="ws-menu-vcount">${vCount} var</span>
      </button>`;
    }).join("");
    m.innerHTML = `
      <div class="ws-menu-h">Workspaces</div>
      ${itemsHtml}
      <div class="ws-menu-sep"></div>
      <button class="ws-menu-item ws-menu-new" id="ws-menu-new">+ New game…</button>
    `;
    $$(".ws-menu-item[data-ws]", m).forEach(b => {
      b.addEventListener("click", () => {
        switchWorkspace(b.dataset.ws);
        m.setAttribute("hidden", "");
      });
    });
    $("#ws-menu-new").addEventListener("click", () => {
      m.setAttribute("hidden", "");
      openNewGameModal();
    });
  }

  function renderSidebarWorkspaces() {
    const c = $("#side-ws");
    if (!c) return;
    c.innerHTML = wsOrder.map(id => {
      const w = workspaces[id];
      const v = w.variants[w.activeVariantId];
      const dot = THEME_PALETTE[w.theme]?.dot || "#22D3EE";
      return `<button class="side-item ${id === activeWorkspaceId ? "is-active" : ""}" data-ws="${id}">
        <span class="dot" style="background:${dot}"></span>${w.name}<span class="rt">${v.rtp.toFixed(1)}%</span>
      </button>`;
    }).join("");
    $("#side-ws").parentElement.querySelector(".side-h-meta").textContent = wsOrder.length;
    $$(".side-item[data-ws]", c).forEach(b => b.addEventListener("click", () => switchWorkspace(b.dataset.ws)));
  }

  function switchWorkspace(id) {
    if (!workspaces[id]) return;
    activeWorkspaceId = id;
    const ws = workspaces[id];
    if (compareMode) exitCompareMode(/*silent=*/true);
    renderWorkspacePill();
    renderWorkspaceMenu();
    renderSidebarWorkspaces();
    renderVariantTabs();
    rerenderAll();
    toast({ kind: "cyan", msg: `Switched to <b>${ws.name}</b>` });
    logActivity(`workspace → ${ws.name}`);
  }

  $("#ws-switch").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("#ws-menu");
    if (m.hasAttribute("hidden")) m.removeAttribute("hidden"); else m.setAttribute("hidden", "");
  });
  document.addEventListener("click", e => {
    const m = $("#ws-menu");
    if (!m.contains(e.target) && e.target !== $("#ws-switch") && !$("#ws-switch").contains(e.target)) m.setAttribute("hidden", "");
  });
  // sidebar workspace items are rendered/bound dynamically in renderSidebarWorkspaces()
  $("#ws-newgame-btn").addEventListener("click", () => openNewGameModal());

  /* ============================================================
     VARIANT TABS — render + switch
     ============================================================ */
  function renderVariantTabs() {
    const ws = getActiveWorkspace();
    const wrap = $("#var-tabs");
    const dot = THEME_PALETTE[ws.theme]?.dot || "#22D3EE";
    const tabsHtml = ws.variantOrder.map(vid => {
      const v = ws.variants[vid];
      const isActive = vid === ws.activeVariantId;
      return `<button class="var-tab ${isActive ? "is-active" : ""}" data-vid="${vid}" title="Variant ${v.name}">
        <span class="var-tab-dot" style="background:${isActive ? dot : "transparent"}; border:1px solid ${dot}"></span>
        <span class="var-tab-name">${v.name}</span>
        <span class="var-tab-rtp mono">${v.rtp.toFixed(2)}%</span>
      </button>`;
    }).join("");
    wrap.innerHTML = tabsHtml + `
      <button class="var-add" id="var-add" title="Add variant">+ Add variant</button>
    `;
    $$(".var-tab", wrap).forEach(t => {
      t.addEventListener("click", () => switchVariant(t.dataset.vid));
      t.addEventListener("contextmenu", e => {
        e.preventDefault();
        openVariantContextMenu(t.dataset.vid, e.clientX, e.clientY);
      });
    });
    $("#var-add").addEventListener("click", () => openNewVariantModal());
  }
  function refreshVariantTabs() {
    // Lightweight refresh — just the RTP values & active state
    const ws = getActiveWorkspace();
    $$(".var-tab", $("#var-tabs")).forEach(tab => {
      const v = ws.variants[tab.dataset.vid];
      if (!v) return;
      tab.querySelector(".var-tab-rtp").textContent = `${v.rtp.toFixed(2)}%`;
      const isActive = tab.dataset.vid === ws.activeVariantId;
      tab.classList.toggle("is-active", isActive);
    });
    renderVariantLineup();
    renderStatusVariantInfo();
  }

  function switchVariant(vid) {
    const ws = getActiveWorkspace();
    if (!ws.variants[vid]) return;
    if (compareMode) {
      // In compare mode, clicking a variant tab assigns it to the "left" pane
      compareVariantIds[0] = vid;
      ws.activeVariantId = vid;
      renderCompareViews();
      refreshVariantTabs();
      refreshL1(); refreshRail();
      return;
    }
    ws.activeVariantId = vid;
    rerenderAll();
    refreshVariantTabs();
    toast({ kind: "cyan", msg: `Variant → <b>${ws.variants[vid].name}</b>` });
    logActivity(`variant → ${ws.variants[vid].name}`);
  }

  /* Variant context menu */
  let _ctxMenu = null;
  function closeVariantContextMenu() {
    if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
  }
  function openVariantContextMenu(vid, x, y) {
    closeVariantContextMenu();
    const ws = getActiveWorkspace();
    const v = ws.variants[vid];
    const menu = document.createElement("div");
    menu.className = "var-ctx-menu";
    menu.innerHTML = `
      <button data-act="rename">Rename</button>
      <button data-act="duplicate">Duplicate</button>
      <button data-act="set-default">Set as default</button>
      <div class="var-ctx-sep"></div>
      <button data-act="delete" class="var-ctx-danger">Delete</button>
    `;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
    _ctxMenu = menu;
    $$("button[data-act]", menu).forEach(b => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        closeVariantContextMenu();
        if (act === "rename") {
          const newName = prompt(`Rename variant "${v.name}" →`, v.name);
          if (newName && newName.trim()) {
            v.name = newName.trim();
            renderVariantTabs();
            toast({ kind: "ok", msg: `Renamed → <b>${v.name}</b>` });
          }
        } else if (act === "duplicate") {
          duplicateVariant(vid);
        } else if (act === "set-default") {
          // Move vid to front of variantOrder
          ws.variantOrder = [vid, ...ws.variantOrder.filter(x => x !== vid)];
          renderVariantTabs();
          toast({ kind: "ok", msg: `Default → <b>${v.name}</b>` });
        } else if (act === "delete") {
          deleteVariant(vid);
        }
      });
    });
    setTimeout(() => {
      document.addEventListener("click", function once(e) {
        if (!menu.contains(e.target)) closeVariantContextMenu();
        document.removeEventListener("click", once);
      });
    }, 0);
  }

  function nextVariantId(ws) {
    let i = 1;
    while (ws.variants["var-" + String.fromCharCode(96 + i)]) i++;
    return "var-" + String.fromCharCode(96 + i);
  }
  function nextVariantLetter(ws) {
    let i = ws.variantOrder.length + 1;
    return String.fromCharCode(64 + i); // 1→A
  }

  function cloneVariant(srcId, newName) {
    const ws = getActiveWorkspace();
    const src = ws.variants[srcId];
    if (!src) return null;
    const id = nextVariantId(ws);
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = id;
    clone.name = newName || `${src.name} copy`;
    clone.activity = [];
    clone.selection = null;
    clone.lastSavedAt = Date.now();
    ws.variants[id] = clone;
    ws.variantOrder.push(id);
    return id;
  }

  function duplicateVariant(srcId) {
    const ws = getActiveWorkspace();
    const src = ws.variants[srcId];
    const newId = cloneVariant(srcId, `${src.name} copy`);
    if (newId) {
      ws.activeVariantId = newId;
      renderVariantTabs();
      rerenderAll();
      toast({ kind: "ok", msg: `Duplicated → <b>${ws.variants[newId].name}</b>` });
    }
  }

  function deleteVariant(vid) {
    const ws = getActiveWorkspace();
    if (ws.variantOrder.length <= 1) {
      toast({ kind: "warn", msg: `Cannot delete last variant` });
      return;
    }
    const v = ws.variants[vid];
    if (!confirm(`Delete variant "${v.name}"?`)) return;
    delete ws.variants[vid];
    ws.variantOrder = ws.variantOrder.filter(x => x !== vid);
    if (ws.activeVariantId === vid) ws.activeVariantId = ws.variantOrder[0];
    // Exit compare mode if it depended on this variant
    if (compareMode && compareVariantIds.includes(vid)) exitCompareMode(true);
    renderVariantTabs();
    rerenderAll();
    toast({ kind: "ok", msg: `Deleted variant ${v.name}` });
  }

  /* ============================================================
     NEW GAME MODAL (workspace creation)
     ============================================================ */
  const newGameModal = $("#new-game-modal");
  function openNewGameModal() {
    const idx = wsOrder.length + 1;
    $("#ng-name").value = `Untitled Game ${idx}`;
    // Reset radio selections
    $$("#ng-layouts input[type=radio]").forEach((r, i) => r.checked = i === 0);
    $$("#ng-themes .theme-swatch").forEach((s, i) => s.classList.toggle("is-active", i === 0));
    showModal("new-game-modal");
    setTimeout(() => $("#ng-name").focus(), 30);
  }
  function closeNewGameModal() { hideModal("new-game-modal"); }
  $("#ng-close").addEventListener("click", closeNewGameModal);
  $("#ng-cancel").addEventListener("click", closeNewGameModal);
  $("#ng-backdrop").addEventListener("click", closeNewGameModal);

  function renderNewGameLayouts() {
    const c = $("#ng-layouts");
    c.innerHTML = LAYOUTS.map((l, i) => `
      <label class="ng-radio">
        <input type="radio" name="ng-layout" value="${l.id}" ${i === 0 ? "checked" : ""} />
        <span>${l.label}</span>
      </label>
    `).join("");
  }
  function renderNewGameThemes() {
    const c = $("#ng-themes");
    c.innerHTML = Object.entries(THEME_PALETTE).map(([k, v], i) => `
      <button type="button" class="theme-swatch ${i === 0 ? "is-active" : ""}" data-theme="${k}" title="${v.name}">
        <span class="theme-dot" style="background:${v.dot}"></span>
      </button>
    `).join("");
    $$(".theme-swatch", c).forEach(b => {
      b.addEventListener("click", () => {
        $$(".theme-swatch", c).forEach(x => x.classList.remove("is-active"));
        b.classList.add("is-active");
      });
    });
  }
  renderNewGameLayouts();
  renderNewGameThemes();

  $("#ng-create").addEventListener("click", () => {
    const name = $("#ng-name").value.trim() || `Untitled Game ${wsOrder.length + 1}`;
    const layout = $$("#ng-layouts input[type=radio]").find(r => r.checked)?.value || "5x3";
    const theme = $(".theme-swatch.is-active", $("#ng-themes"))?.dataset.theme || "cyan";
    const id = "ws-" + Date.now().toString(36);
    const irName = name.toLowerCase().replace(/\s+/g, "-") + "-v0.1.00";
    const ws = newWorkspace({ id, name, theme, layout, irName });
    workspaces[id] = ws;
    wsOrder.push(id);
    closeNewGameModal();
    switchWorkspace(id);
    toast({ kind: "ok", msg: `Created <b>${name}</b> · ${LAYOUTS.find(l => l.id === layout)?.label || layout}` });
  });

  /* ============================================================
     NEW VARIANT MODAL
     ============================================================ */
  function openNewVariantModal() {
    const ws = getActiveWorkspace();
    const letter = nextVariantLetter(ws);
    $("#nv-name").value = `Variant ${letter}`;
    // Build source radios
    const src = $("#nv-sources");
    const currentId = ws.activeVariantId;
    const currentName = ws.variants[currentId].name;
    let html = `
      <label class="nv-radio">
        <input type="radio" name="nv-src" value="__blank__" />
        <span><b>Blank</b> · default settings</span>
      </label>
      <label class="nv-radio">
        <input type="radio" name="nv-src" value="${currentId}" checked />
        <span>Clone <b>"${currentName}"</b></span>
      </label>
    `;
    ws.variantOrder.filter(id => id !== currentId).forEach(id => {
      html += `<label class="nv-radio">
        <input type="radio" name="nv-src" value="${id}" />
        <span>Clone "${ws.variants[id].name}"</span>
      </label>`;
    });
    src.innerHTML = html;
    showModal("new-variant-modal");
    setTimeout(() => $("#nv-name").focus(), 30);
  }
  function closeNewVariantModal() { hideModal("new-variant-modal"); }
  $("#nv-close").addEventListener("click", closeNewVariantModal);
  $("#nv-cancel").addEventListener("click", closeNewVariantModal);
  $("#nv-backdrop").addEventListener("click", closeNewVariantModal);

  $("#nv-create").addEventListener("click", () => {
    const ws = getActiveWorkspace();
    const name = $("#nv-name").value.trim() || `Variant ${nextVariantLetter(ws)}`;
    const src = $$("#nv-sources input[type=radio]").find(r => r.checked)?.value;
    let newId;
    if (src === "__blank__") {
      newId = nextVariantId(ws);
      ws.variants[newId] = newVariant({ id: newId, name });
      ws.variantOrder.push(newId);
    } else {
      newId = cloneVariant(src, name);
    }
    ws.activeVariantId = newId;
    closeNewVariantModal();
    renderVariantTabs();
    rerenderAll();
    toast({ kind: "ok", msg: `Created variant <b>${name}</b>` });
    logActivity(`variant created · ${name}`);
  });

  /* ============================================================
     COMPARE A/B MODAL + SPLIT VIEW
     ============================================================ */
  function openCompareModal() {
    const ws = getActiveWorkspace();
    if (ws.variantOrder.length < 2) {
      toast({ kind: "warn", msg: `Need at least 2 variants to compare · add one first` });
      return;
    }
    const opts = ws.variantOrder.map(id => `<option value="${id}">${ws.variants[id].name} (${ws.variants[id].rtp.toFixed(2)}%)</option>`).join("");
    const defaultA = ws.activeVariantId;
    const defaultB = ws.variantOrder.find(id => id !== defaultA);
    $("#cmp-a").innerHTML = opts;
    $("#cmp-b").innerHTML = opts;
    $("#cmp-a").value = defaultA;
    $("#cmp-b").value = defaultB;
    showModal("compare-modal");
  }
  function closeCompareModal() { hideModal("compare-modal"); }
  $("#cmp-close").addEventListener("click", closeCompareModal);
  $("#cmp-cancel").addEventListener("click", closeCompareModal);
  $("#cmp-backdrop").addEventListener("click", closeCompareModal);
  $("#btn-compare").addEventListener("click", openCompareModal);

  // Prevent picking same A and B
  function syncCompareModalSelectors() {
    const a = $("#cmp-a").value, b = $("#cmp-b").value;
    $("#cmp-enter").disabled = (a === b);
    $("#cmp-warn").hidden = (a !== b) ? true : false;
  }
  $("#cmp-a").addEventListener("change", syncCompareModalSelectors);
  $("#cmp-b").addEventListener("change", syncCompareModalSelectors);

  $("#cmp-enter").addEventListener("click", () => {
    const a = $("#cmp-a").value, b = $("#cmp-b").value;
    if (a === b) return;
    closeCompareModal();
    enterCompareMode([a, b]);
  });

  function enterCompareMode(ids) {
    if (!ids || ids.length !== 2) return;
    compareMode = true;
    compareVariantIds = ids.slice();
    comparePane = "left";
    document.body.classList.add("is-compare");
    // Set workspace active to A
    const ws = getActiveWorkspace();
    ws.activeVariantId = ids[0];
    renderVariantTabs();
    // Re-render the current tab in split mode
    const active = $(".tab.is-active")?.dataset.tab || "build";
    applyCompareViewToTab(active);
    toast({ kind: "cyan", msg: `Compare mode · <b>${ws.variants[ids[0]].name}</b> ↔ <b>${ws.variants[ids[1]].name}</b>` });
    logActivity(`compare entered · ${ws.variants[ids[0]].name} ↔ ${ws.variants[ids[1]].name}`);
    refreshL1(); refreshRail();
  }

  function exitCompareMode(silent) {
    if (!compareMode) return;
    compareMode = false;
    compareVariantIds = [];
    comparePane = "left";
    document.body.classList.remove("is-compare");
    // Reset all build/play/sensitivity panels to single-pane mode
    ["build", "play", "sensitivity"].forEach(t => {
      const splitWrap = $(`#split-${t}`);
      if (splitWrap) splitWrap.hidden = true;
      const single = $(`#single-${t}`);
      if (single) single.hidden = false;
    });
    rerenderAll();
    if (!silent) toast({ kind: "cyan", msg: `Compare exited` });
  }
  window.__exitCompareMode = exitCompareMode; // for HTML inline use if needed

  $$(".btn-exit-compare").forEach(b => b.addEventListener("click", () => exitCompareMode(false)));
  $$(".btn-swap-compare").forEach(b => b.addEventListener("click", () => {
    if (!compareMode) return;
    compareVariantIds = [compareVariantIds[1], compareVariantIds[0]];
    const ws = getActiveWorkspace();
    ws.activeVariantId = compareVariantIds[0];
    renderVariantTabs();
    renderCompareViews();
    refreshL1(); refreshRail();
  }));

  function applyCompareViewToTab(tabKey) {
    const supports = ["build", "play", "sensitivity"];
    supports.forEach(t => {
      const splitWrap = $(`#split-${t}`);
      const single = $(`#single-${t}`);
      if (!splitWrap || !single) return;
      if (compareMode && t === tabKey) {
        splitWrap.hidden = false;
        single.hidden = true;
      } else {
        splitWrap.hidden = true;
        single.hidden = false;
      }
    });
    // For compose/catalog/certify show a banner when in compare mode
    ["compose", "catalog", "certify"].forEach(t => {
      const banner = $(`#cmp-banner-${t}`);
      if (banner) banner.hidden = !compareMode;
    });
    if (compareMode) renderCompareViews();
  }

  function renderCompareViews() {
    if (!compareMode) return;
    const ws = getActiveWorkspace();
    const vA = ws.variants[compareVariantIds[0]];
    const vB = ws.variants[compareVariantIds[1]];
    if (!vA || !vB) return;
    // BUILD split
    const buildSplit = $("#split-build");
    if (buildSplit && !buildSplit.hidden) {
      renderCompareBuildPane("A", vA);
      renderCompareBuildPane("B", vB);
      renderDiffCallouts(vA, vB);
    }
    // PLAY split
    const playSplit = $("#split-play");
    if (playSplit && !playSplit.hidden) {
      renderComparePlayPane("A", vA);
      renderComparePlayPane("B", vB);
    }
    // SENSITIVITY split
    const sensSplit = $("#split-sensitivity");
    if (sensSplit && !sensSplit.hidden) {
      renderCompareSensPane("A", vA);
      renderCompareSensPane("B", vB);
    }
  }

  function renderCompareBuildPane(side, variant) {
    const paneKey = side === "A" ? "left" : "right";
    const headSel = side === "A" ? "#split-build-head-A" : "#split-build-head-B";
    const head = $(headSel);
    head.innerHTML = `
      <span class="split-pane-name">${variant.name}</span>
      <span class="split-pane-rtp mono">RTP <b>${variant.rtp.toFixed(2)}%</b></span>
      <span class="split-pane-meta mono">σ ${variant.sigma.toFixed(2)} · hit ${variant.hit.toFixed(1)}%</span>
    `;
    // Pool count display
    const cntEl = side === "A" ? $("#pool-count-A") : $("#pool-count-B");
    if (cntEl) cntEl.textContent = variant.symbols.length;
    const symList = side === "A" ? $("#sym-list-A") : $("#sym-list-B");
    const reels = side === "A" ? $("#reels-A") : $("#reels-B");
    const paytable = side === "A" ? $("#paytable-A") : $("#paytable-B");
    if (!variant.symbols.length) buildSymbolPoolFor(variant);
    if (!variant.reels.length) autoBuildReelsFor(variant);
    if (symList) renderSymbolList(symList, variant, paneKey);
    if (reels) renderReels(reels, variant, paneKey);
    if (paytable) renderPaytable(paytable, variant, paneKey);
  }

  function renderDiffCallouts(vA, vB) {
    const c = $("#diff-callout");
    if (!c) return;
    const dRtp = vB.rtp - vA.rtp;
    const dHit = vB.hit - vA.hit;
    const dSigma = vB.sigma - vA.sigma;
    const fmt = (v, suffix = "pp") => `${v >= 0 ? "↗ +" : "↘ "}${v.toFixed(2)}${suffix}`;
    const cls = (v) => Math.abs(v) < 0.2 ? "neutral" : v > 0 ? "up" : "down";
    c.innerHTML = `
      <div class="diff-row ${cls(dRtp)}">
        <span class="diff-lbl">RTP</span>
        <span class="diff-val mono">A→B ${fmt(dRtp)}</span>
      </div>
      <div class="diff-row ${cls(dHit)}">
        <span class="diff-lbl">Hit</span>
        <span class="diff-val mono">A→B ${fmt(dHit)}</span>
      </div>
      <div class="diff-row ${cls(dSigma)}">
        <span class="diff-lbl">σ</span>
        <span class="diff-val mono">A→B ${fmt(dSigma, "")}</span>
      </div>
    `;
  }

  function renderComparePlayPane(side, variant) {
    const head = side === "A" ? $("#split-play-head-A") : $("#split-play-head-B");
    head.innerHTML = `
      <span class="split-pane-name">${variant.name}</span>
      <span class="split-pane-rtp mono">RTP <b>${variant.rtp.toFixed(2)}%</b></span>
    `;
    const grid = side === "A" ? $("#play-grid-A") : $("#play-grid-B");
    const pool = variant.symbols.length ? variant.symbols : (buildSymbolPoolFor(variant), variant.symbols);
    grid.innerHTML = "";
    for (let i = 0; i < 15; i++) {
      const s = pool[i % pool.length];
      const cell = document.createElement("div");
      cell.className = `play-cell tier-${s.tier}`;
      cell.innerHTML = `<svg><use href="#g-${s.icon}"/></svg>`;
      grid.appendChild(cell);
    }
  }

  function renderCompareSensPane(side, variant) {
    const head = side === "A" ? $("#split-sens-head-A") : $("#split-sens-head-B");
    head.innerHTML = `
      <span class="split-pane-name">${variant.name}</span>
      <span class="split-pane-rtp mono">RTP <b>${variant.rtp.toFixed(2)}%</b></span>
    `;
  }

  /* ============================================================
     QUICK START WIZARD (existing flow, lightly adapted)
     ============================================================ */
  let WIZARDS_DATA = null;
  fetch("./data/wizards.json").then(r => r.json()).then(d => { WIZARDS_DATA = d; }).catch(() => {
    WIZARDS_DATA = inlineWizardsData();
  });

  function inlineWizardsData() {
    return {
      wizards: [
        { id: "new-game", icon: "+", label: "New Game", desc: "Build a slot from a blank IR in 3 steps",
          steps: [
            { title: "Choose template", options: [
              { id:"5x3-lines", label:"Classic 5×3 · 20 lines", hint:"compact paytable, low feature load" },
              { id:"megaways", label:"Megaways 6-reel · 117 649", hint:"BTG variable-row, high volatility" },
              { id:"cluster", label:"Cluster Pays 7×7", hint:"match-N adjacent, NLE chains" },
              { id:"cascade", label:"Cascade 5×5 · drop refill", hint:"tumble until no win" },
              { id:"holdwin", label:"Hold & Win 5×3 · sticky", hint:"scatter-collect bonus round" }
            ]},
            { title: "Symbol pool", options: [
              { id:"compact", label:"Compact 7", hint:"3 HP · 3 LP · 1 SCATTER" },
              { id:"standard", label:"Standard 11", hint:"3 HP · 3 MP · 3 LP · 1 WILD · 1 SCATTER" },
              { id:"rich", label:"Rich 15", hint:"3 HP · 3 MP · 4 LP · 2 WILD · 1 SCATTER · 2 MULT" }
            ]},
            { title: "Target RTP & jurisdiction", fields: [
              { kind:"slider", id:"rtp", min:88, max:98, step:0.1, default:95.5, label:"Target RTP %" },
              { kind:"select", id:"jur", label:"Primary jurisdiction", options:["UKGC","MGA","NJ DGE","ONT iGO","GLI-19"] }
            ]}
          ], next: "Adjust paytable in BUILD" },
        { id: "rebalance", icon: "⚖", label: "Re-balance Existing", desc: "Drop IR · system suggests changes" },
        { id: "compare", icon: "≡", label: "Compare Two", desc: "Pick A + B · side-by-side diff" },
        { id: "run-cert", icon: "✓", label: "Run Cert", desc: "MC + PAR + op-package automated flow" },
        { id: "compose", icon: "⌬", label: "Compose Features", desc: "Opens COMPOSE tab with template graph" }
      ]
    };
  }

  $("#btn-quickstart").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("#quickstart-menu");
    if (!m.hasAttribute("hidden")) { m.setAttribute("hidden", ""); return; }
    const data = WIZARDS_DATA || inlineWizardsData();
    m.innerHTML = data.wizards.map(w => `
      <button class="qs-item" data-wiz="${w.id}">
        <span class="qs-ic">${typeof w.icon === "string" && w.icon.length <= 2 ? w.icon : "•"}</span>
        <div>
          <div class="qs-lbl">${w.label}</div>
          <div class="qs-desc">${w.desc}</div>
        </div>
      </button>
    `).join("");
    m.removeAttribute("hidden");
    $$(".qs-item", m).forEach(b => b.addEventListener("click", () => {
      m.setAttribute("hidden", "");
      openWizard(b.dataset.wiz);
    }));
  });
  document.addEventListener("click", e => {
    const m = $("#quickstart-menu");
    if (!m.contains(e.target) && e.target !== $("#btn-quickstart")) m.setAttribute("hidden", "");
  });

  let WIZ_STATE = null;
  function openWizard(id) {
    const data = WIZARDS_DATA || inlineWizardsData();
    const w = data.wizards.find(x => x.id === id);
    if (!w) return;
    if (!w.steps || !w.steps.length) {
      simpleWizardRun(w);
      return;
    }
    WIZ_STATE = { w, step: 0, choices: {} };
    $("#wiz-title").textContent = w.label;
    renderWizardStep();
    showModal("wiz");
  }
  function renderWizardStep() {
    const { w, step, choices } = WIZ_STATE;
    const total = w.steps.length;
    const dotsEl = $("#wiz-steps");
    dotsEl.innerHTML = w.steps.map((_, i) => {
      const cls = i < step ? "is-done" : i === step ? "is-active" : "";
      return `<span class="wiz-step-dot ${cls}">${i+1}</span>`;
    }).join("");
    $("#wiz-hint").textContent = `Step ${step+1} / ${total}`;
    $("#wiz-back").disabled = step === 0;
    $("#wiz-next").textContent = step === total - 1 ? "Finish →" : "Next →";

    const s = w.steps[step];
    const body = $("#wiz-body");
    if (s.options) {
      body.innerHTML = `<h3>${s.title}</h3><div class="wiz-opts">` +
        s.options.map(o => `
          <button class="wiz-opt ${choices[step]?.id === o.id ? "is-active" : ""}" data-id="${o.id}" data-step="${step}">
            <span class="wiz-opt-lbl">${o.label}</span>
            <span class="wiz-opt-hint">${o.hint || ""}</span>
          </button>
        `).join("") + `</div>`;
      $$(".wiz-opt", body).forEach(b => b.addEventListener("click", () => {
        choices[step] = { id: b.dataset.id };
        $$(".wiz-opt", body).forEach(x => x.classList.toggle("is-active", x === b));
      }));
    } else if (s.fields) {
      body.innerHTML = `<h3>${s.title}</h3><div class="wiz-fields">` +
        s.fields.map(f => {
          if (f.kind === "slider") {
            const v = choices[step]?.[f.id] ?? f.default;
            return `<div class="wiz-field">
              <label class="wiz-field-lbl">${f.label} · <b class="mono cyan" id="wf-${f.id}-v">${v}</b></label>
              <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" data-fid="${f.id}" />
            </div>`;
          }
          if (f.kind === "select") {
            const cur = choices[step]?.[f.id] ?? f.options[0];
            return `<div class="wiz-field">
              <label class="wiz-field-lbl">${f.label}</label>
              <select data-fid="${f.id}">${f.options.map(o => `<option ${o===cur?"selected":""}>${o}</option>`).join("")}</select>
            </div>`;
          }
          return "";
        }).join("") + `</div>`;
      choices[step] = choices[step] || {};
      $$("input[type=range]", body).forEach(inp => {
        inp.addEventListener("input", e => {
          choices[step][e.target.dataset.fid] = parseFloat(e.target.value);
          $(`#wf-${e.target.dataset.fid}-v`).textContent = e.target.value;
        });
      });
      $$("select", body).forEach(sel => {
        sel.addEventListener("change", e => { choices[step][e.target.dataset.fid] = e.target.value; });
      });
    }
  }
  $("#wiz-next").addEventListener("click", () => {
    if (!WIZ_STATE) return;
    const total = WIZ_STATE.w.steps.length;
    if (WIZ_STATE.step < total - 1) { WIZ_STATE.step++; renderWizardStep(); return; }
    finishWizard();
  });
  $("#wiz-back").addEventListener("click", () => {
    if (!WIZ_STATE || WIZ_STATE.step === 0) return;
    WIZ_STATE.step--; renderWizardStep();
  });
  $("#wiz-close").addEventListener("click", () => { hideModal("wiz"); WIZ_STATE = null; });
  $("#wiz-backdrop").addEventListener("click", () => { hideModal("wiz"); WIZ_STATE = null; });

  function finishWizard() {
    const { w, choices } = WIZ_STATE;
    const v = getActiveVariant();
    const pool = choices[1]?.id || "standard";
    if (POOL_PRESETS[pool]) {
      v.tierCounts = { ...POOL_PRESETS[pool] };
      v.activePreset = pool;
      v.symbols = [];
      buildSymbolPoolFor(v); autoBuildReelsFor(v);
      $$(".preset[data-preset]", $("#panel-build")).forEach(x => x.classList.toggle("is-active", x.dataset.preset === pool));
    }
    if (choices[2]?.rtp) v.rtpTarget = choices[2].rtp;
    recomputeFor(v);
    rerenderAll();
    hideModal("wiz");
    WIZ_STATE = null;
    goToTab("build");
    toast({
      kind: "cyan",
      msg: `New game from <b>${w.label}</b> · ${v.symbols.length} symbols · target <b>${v.rtpTarget.toFixed(1)}%</b> · ${w.next || "ready"}`,
      action: "Auto-balance →",
      onAction: () => doAutoBalance("post-wizard", false),
      ttl: 7000
    });
    logActivity(`wizard ${w.label} finished`);
  }

  function simpleWizardRun(w) {
    if (w.id === "rebalance") {
      doAutoBalance("rebalance-wiz", false);
    } else if (w.id === "run-cert") {
      goToTab("certify");
      toast({ kind: "cyan", msg: `Cert flow started · MC 100M queued · ETA ~3 min`, action: "Open logs", onAction: toggleBottom });
    } else if (w.id === "compose") {
      goToTab("compose");
      toast({ kind: "cyan", msg: `Compose canvas pre-loaded with feature graph template` });
    } else if (w.id === "compare") {
      openCompareModal();
    }
  }

  /* ============================================================
     BOTTOM PANEL
     ============================================================ */
  function toggleBottom() {
    const bp = $("#bottom-panel");
    if (bp.hasAttribute("hidden")) { bp.removeAttribute("hidden"); refreshBottomActivity(); }
    else bp.setAttribute("hidden", "");
  }
  $("#btn-toggle-bottom").addEventListener("click", toggleBottom);
  $("#bp-close").addEventListener("click", toggleBottom);

  /* ============================================================
     STATUSBAR · variant segment
     ============================================================ */
  function renderStatusVariantInfo() {
    const ws = getActiveWorkspace();
    const v = getActiveVariant();
    const el = $("#status-variant");
    if (!el) return;
    el.innerHTML = `ws: <b>${ws.name}</b> · var: <b>${v.name}</b> · <button class="status-variant-count" id="status-vcount">${ws.variantOrder.length} variants</button>`;
    $("#status-vcount").addEventListener("click", e => {
      e.stopPropagation();
      openStatusVariantMenu(e.target);
    });
  }
  let _statusVarMenu = null;
  function openStatusVariantMenu(anchor) {
    if (_statusVarMenu) { _statusVarMenu.remove(); _statusVarMenu = null; return; }
    const ws = getActiveWorkspace();
    const m = document.createElement("div");
    m.className = "status-var-menu";
    m.innerHTML = ws.variantOrder.map(vid => {
      const v = ws.variants[vid];
      return `<button data-vid="${vid}" class="${vid === ws.activeVariantId ? "is-active" : ""}">
        ${v.name} <span class="mono">${v.rtp.toFixed(2)}%</span>
      </button>`;
    }).join("");
    document.body.appendChild(m);
    _statusVarMenu = m;
    const r = anchor.getBoundingClientRect();
    m.style.left = r.left + "px";
    m.style.bottom = (window.innerHeight - r.top + 4) + "px";
    $$("button[data-vid]", m).forEach(b => b.addEventListener("click", () => {
      switchVariant(b.dataset.vid);
      m.remove(); _statusVarMenu = null;
    }));
    setTimeout(() => {
      document.addEventListener("click", function once(e) {
        if (_statusVarMenu && !_statusVarMenu.contains(e.target)) { _statusVarMenu.remove(); _statusVarMenu = null; }
        document.removeEventListener("click", once);
      });
    }, 0);
  }

  /* ============================================================
     COMPUTE / VALIDATE / AUTO-BAL BUTTONS
     ============================================================ */
  $("#btn-compute").addEventListener("click", () => {
    recompute(); refreshL1(); refreshRail(); refreshVariantTabs();
    const v = getActiveVariant();
    toast({ kind: "ok", msg: `Closed-form RTP recomputed · <b>${v.rtp.toFixed(4)}%</b> · 1.4 ms` });
    logActivity(`compute RTP ${v.rtp.toFixed(2)}%`);
  });
  $("#btn-validate").addEventListener("click", () => {
    toast({ kind: "ok", msg: `IR validated · <b>0 issues</b> · ready to run` });
    logActivity(`validated IR`);
  });
  $("#btn-autobalance").addEventListener("click", () => doAutoBalance("manual", false));

  /* ============================================================
     PLAY (Spin)
     ============================================================ */
  let playSpins = 0, playHits = 0, playWinSum = 0;
  function renderPlayGrid(animateWin = false) {
    const grid = $("#play-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const v = getActiveVariant();
    const pool = v.symbols.length ? v.symbols : (buildSymbolPoolFor(v), v.symbols);
    for (let i = 0; i < 15; i++) {
      const s = pool[(Math.floor(Math.random() * pool.length)) % pool.length];
      const win = animateWin && Math.random() < 0.18;
      const cell = document.createElement("div");
      cell.className = `play-cell tier-${s.tier} ${win ? "is-win" : ""}`;
      cell.innerHTML = `<svg><use href="#g-${s.icon}"/></svg>`;
      grid.appendChild(cell);
    }
  }
  function spin() {
    renderPlayGrid(true);
    playSpins++;
    const hit = Math.random() < 0.28;
    const win = hit ? +(Math.random() * 12).toFixed(1) : 0;
    if (hit) { playHits++; playWinSum += win; }
    $("#play-spins").textContent = playSpins;
    $("#play-win").textContent = win.toFixed(1) + "×";
    $("#play-hit").textContent = ((playHits / playSpins) * 100).toFixed(1) + "%";
    $("#play-rtp-sim").textContent = ((playWinSum / playSpins) * 100).toFixed(2) + "%";
  }
  $("#btn-spin").addEventListener("click", spin);
  $("#btn-auto10").addEventListener("click", () => {
    let n = 0; const id = setInterval(() => { spin(); if (++n >= 10) clearInterval(id); }, 200);
  });
  $("#btn-replay").addEventListener("click", () => toast({ kind: "cyan", msg: `Replayed last spin · seed 0x9F-2E1B` }));

  /* ============================================================
     CATALOG render (mock subset)
     ============================================================ */
  function renderCatalog() {
    const rows = [
      ["1","P001","Lines pay 5×3 · LR","NetEnt","96.10","8.4","GREEN","W181"],
      ["2","P011","Megaways variable","BTG","96.43","11.2","GREEN","W184"],
      ["3","P027","Cluster NLE 7×7","Push","96.20","9.8","GREEN","W187"],
      ["4","P033","Cascade drop refill","P.Play","96.50","10.4","GREEN","W189"],
      ["5","P058","Hold & Win 6-coin","Bally","95.80","12.1","GREEN","W192"],
      ["6","P061","Cash Wheel composite","Bally","96.04","9.6","GREEN","W196"],
      ["7","P074","Reel reshape WoO","WMS","95.42","8.7","GREEN","W195"],
      ["8","P081","Stellar Jackpot wrap","LBX","96.18","11.5","GREEN","W194"]
    ];
    const tbody = $("#cat-tbody");
    tbody.innerHTML = rows.map(r => `<tr>
      <td>${r[0]}</td><td class="pid">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td>
      <td class="mono">${r[4]}%</td><td class="mono">${r[5]}</td>
      <td class="ok">${r[6]}</td><td class="mono">${r[7]}</td>
    </tr>`).join("");
  }

  /* ============================================================
     COMMAND PALETTE — dynamic items based on workspaces/variants
     ============================================================ */
  function buildCmdpItems() {
    const baseItems = [
      { cat: "Navigation", lbl: "Open Build",       kbd: "⌘1", run: () => goToTab("build") },
      { cat: "Navigation", lbl: "Open Compose",     kbd: "⌘2", run: () => goToTab("compose") },
      { cat: "Navigation", lbl: "Open Catalog",     kbd: "⌘3", run: () => goToTab("catalog") },
      { cat: "Navigation", lbl: "Open Play",        kbd: "⌘4", run: () => goToTab("play") },
      { cat: "Navigation", lbl: "Open Sensitivity", kbd: "⌘5", run: () => goToTab("sensitivity") },
      { cat: "Navigation", lbl: "Open Certify",     kbd: "⌘6", run: () => goToTab("certify") },
      { cat: "Actions",    lbl: "Compute RTP",      run: () => $("#btn-compute").click() },
      { cat: "Actions",    lbl: "Auto-balance",     kbd: "B",  run: () => doAutoBalance("palette", false) },
      { cat: "Actions",    lbl: "Validate IR",      run: () => $("#btn-validate").click() },
      { cat: "Actions",    lbl: "Save IR",          kbd: "⌘S", run: doSave },
      { cat: "Actions",    lbl: "Run MC 100M",      kbd: "R",  run: () => toast({ kind:"cyan", msg:"MC 100M queued · ETA ~3 min" }) },
      { cat: "Actions",    lbl: "Export op-package",            run: () => toast({ kind:"ok",   msg:"operator-package.zip · 2.4 MB" }) },
      { cat: "Quick Start", lbl: "Wizard · New Game",          run: () => openWizard("new-game") },
      { cat: "Quick Start", lbl: "Wizard · Re-balance",        run: () => openWizard("rebalance") },
      { cat: "Quick Start", lbl: "Wizard · Compare Two",       run: () => openWizard("compare") },
      { cat: "Quick Start", lbl: "Wizard · Run Cert",          run: () => openWizard("run-cert") },
      { cat: "Quick Start", lbl: "Wizard · Compose Features",  run: () => openWizard("compose") },
      { cat: "Persona",    lbl: "Persona · Math",     run: () => setPersona("math") },
      { cat: "Persona",    lbl: "Persona · Design",   run: () => setPersona("design") },
      { cat: "Persona",    lbl: "Persona · Producer", run: () => setPersona("producer") },
      { cat: "View",       lbl: "Toggle bottom panel", kbd: "⌘J", run: toggleBottom },
      { cat: "View",       lbl: "Toggle Expanded rail", run: () => $("#rail-expand").click() },
      { cat: "Help",       lbl: "Keyboard shortcuts", kbd: "?", run: () => showModal("help-modal") }
    ];

    const wsItems = wsOrder.map(id => ({
      cat: "Workspace", lbl: `Switch to ${workspaces[id].name}`,
      run: () => switchWorkspace(id)
    }));
    wsItems.push({ cat: "Workspace", lbl: "New game (workspace)", run: openNewGameModal });

    const ws = getActiveWorkspace();
    const varItems = ws.variantOrder.map(vid => ({
      cat: "Variant", lbl: `Switch to variant ${ws.variants[vid].name}`,
      run: () => switchVariant(vid)
    }));
    varItems.push({ cat: "Variant", lbl: "New variant", run: openNewVariantModal });
    varItems.push({ cat: "Variant", lbl: "Enter Compare A/B", run: openCompareModal });
    if (compareMode) varItems.push({ cat: "Variant", lbl: "Exit Compare A/B", run: () => exitCompareMode(false) });

    return [...baseItems, ...wsItems, ...varItems];
  }

  let CMDP = buildCmdpItems();
  let cmdpActiveIdx = 0, cmdpFiltered = CMDP;
  function renderCmdp() {
    CMDP = buildCmdpItems(); // refresh in case workspaces/variants changed
    const q = $("#cmdp-input").value.toLowerCase();
    cmdpFiltered = q ? CMDP.filter(c => (c.lbl + " " + c.cat).toLowerCase().includes(q)) : CMDP;
    const list = $("#cmdp-list");
    list.innerHTML = "";
    let lastCat = null;
    cmdpFiltered.forEach((c, i) => {
      if (c.cat !== lastCat) {
        const h = document.createElement("div");
        h.className = "cmdp-cat"; h.textContent = c.cat;
        list.appendChild(h);
        lastCat = c.cat;
      }
      const it = document.createElement("div");
      it.className = "cmdp-item" + (i === cmdpActiveIdx ? " is-active" : "");
      it.innerHTML = `<span class="lbl">${c.lbl}</span>${c.kbd ? `<span class="meta">${c.kbd}</span>` : ""}`;
      it.addEventListener("click", () => { c.run(); closeCmdp(); });
      list.appendChild(it);
    });
  }
  function openCmdp() {
    cmdpActiveIdx = 0;
    $("#cmdp-input").value = "";
    showModal("cmdp");
    renderCmdp();
    setTimeout(() => $("#cmdp-input").focus(), 30);
  }
  function closeCmdp() { hideModal("cmdp"); }
  $("#btn-cmdp").addEventListener("click", openCmdp);
  $("#cmdp-backdrop").addEventListener("click", closeCmdp);
  $("#cmdp-input").addEventListener("input", () => { cmdpActiveIdx = 0; renderCmdp(); });
  $("#cmdp-input").addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); cmdpActiveIdx = (cmdpActiveIdx + 1) % cmdpFiltered.length; renderCmdp(); ensureActiveVisible(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); cmdpActiveIdx = (cmdpActiveIdx - 1 + cmdpFiltered.length) % cmdpFiltered.length; renderCmdp(); ensureActiveVisible(); }
    if (e.key === "Enter")     { e.preventDefault(); cmdpFiltered[cmdpActiveIdx]?.run(); closeCmdp(); }
    if (e.key === "Escape")    { closeCmdp(); }
  });
  function ensureActiveVisible() {
    const a = $(".cmdp-item.is-active");
    if (a) a.scrollIntoView({ block: "nearest" });
  }

  /* ============================================================
     MODAL helpers
     ============================================================ */
  function showModal(id) {
    const el = document.getElementById(id);
    el.removeAttribute("hidden");
    el.removeAttribute("aria-hidden");
  }
  function hideModal(id) {
    const el = document.getElementById(id);
    el.setAttribute("hidden", "");
    el.setAttribute("aria-hidden", "true");
  }
  $("#help-close").addEventListener("click", () => hideModal("help-modal"));
  $("#help-backdrop").addEventListener("click", () => hideModal("help-modal"));
  $("#btn-help").addEventListener("click", () => showModal("help-modal"));
  $("#btn-status-help").addEventListener("click", () => showModal("help-modal"));

  /* ============================================================
     SIDE SECTION TOGGLES
     ============================================================ */
  $$(".side-h[data-toggle]").forEach(h => {
    h.addEventListener("click", () => {
      const tgt = $("#" + h.dataset.toggle);
      if (tgt.style.display === "none") tgt.style.display = ""; else tgt.style.display = "none";
    });
  });

  /* ============================================================
     KEYBOARD SHORTCUTS
     ============================================================ */
  document.addEventListener("keydown", e => {
    const inInput = e.target.matches("input, textarea, select");
    const cmd = e.metaKey || e.ctrlKey;

    if (cmd && e.key.toLowerCase() === "k") { e.preventDefault(); openCmdp(); return; }
    if (cmd && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); return; }
    if (cmd && e.key.toLowerCase() === "z") { e.preventDefault(); toast({ kind:"cyan", msg: e.shiftKey ? "Redo" : "Undo" }); return; }
    if (cmd && e.key.toLowerCase() === "j") { e.preventDefault(); toggleBottom(); return; }
    if (cmd && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      const map = { "1": "build", "2": "compose", "3": "catalog", "4": "play", "5": "sensitivity", "6": "certify" };
      goToTab(map[e.key]); return;
    }
    if (e.key === "Escape") {
      closeCmdp();
      hideModal("wiz"); hideModal("picker"); hideModal("help-modal");
      hideModal("new-game-modal"); hideModal("new-variant-modal"); hideModal("compare-modal");
      closeInlineIconPopup();
      closeVariantContextMenu();
      return;
    }
    if (inInput) return;

    const active = $(".tab.is-active")?.dataset.tab;
    if (e.key === "?" && !cmd) { e.preventDefault(); showModal("help-modal"); return; }
    if (e.key.toLowerCase() === "b" && active === "build") { e.preventDefault(); doAutoBalance("kbd", false); return; }
    if (e.key === " " && active === "play")               { e.preventDefault(); spin(); return; }
    if (e.key.toLowerCase() === "r" && active === "certify"){ e.preventDefault(); toast({ kind:"cyan", msg:"MC 100M queued · ETA ~3 min" }); return; }
  });

  /* ============================================================
     INIT
     ============================================================ */
  function rerenderActive() {
    if (compareMode) {
      // re-render both panes
      renderCompareViews();
      return;
    }
    const v = getActiveVariant();
    if (!v.symbols.length) buildSymbolPoolFor(v);
    if (!v.reels.length) autoBuildReelsFor(v);
    renderSymbolList($("#sym-list"), v);
    renderReels($("#reels"), v);
    renderPaytable($("#paytable"), v);
    // sync presets row
    $$(".preset[data-preset]", $("#panel-build")).forEach(x => x.classList.toggle("is-active", x.dataset.preset === v.activePreset));
    // sync custom sliders
    Object.keys(v.tierCounts).forEach(t => {
      const sl = $(`#pool-custom input[data-tier="${t}"]`);
      if (sl) { sl.value = v.tierCounts[t]; const vEl = $(`[data-tier-v="${t}"]`); if (vEl) vEl.textContent = v.tierCounts[t]; }
    });
  }

  function rerenderAll() {
    const v = getActiveVariant();
    const ws = getActiveWorkspace();
    if (!v.symbols.length) buildSymbolPoolFor(v);
    if (!v.reels.length) autoBuildReelsFor(v);
    // NB: don't recompute here — preserve authored RTP/hit/sigma seeds.
    // Recompute fires explicitly on user actions (preset/slider/auto-bal/compute btn).

    // build/play single panels
    rerenderActive();
    renderCatalog();
    renderPlayGrid(false);

    // update IR name in ctx-bar
    const irNameEl = $("#ctx-irname");
    if (irNameEl) irNameEl.textContent = ws.irName;
    const layoutEl = $("#ctx-layout");
    if (layoutEl) layoutEl.textContent = LAYOUTS.find(l => l.id === ws.layout)?.label || ws.layout;

    refreshL1();
    refreshRail();
    refreshBottomActivity();
    refreshVariantTabs();
    renderStatusVariantInfo();

    // sync compare view if active
    if (compareMode) {
      const active = $(".tab.is-active")?.dataset.tab || "build";
      applyCompareViewToTab(active);
    }

    // Studio bridge — ask the real engine to recompute live RTP/vola
    // off the current variant state. Debounced inside main.ts.
    if (typeof window !== "undefined" && window.__studio__ && typeof window.__studio__.scheduleRTPRecompute === "function") {
      window.__studio__.scheduleRTPRecompute();
    }
  }

  function init() {
    // Build all variants up-front (so RTPs in tabs come from real computed values)
    wsOrder.forEach(wid => {
      const w = workspaces[wid];
      w.variantOrder.forEach(vid => {
        const v = w.variants[vid];
        if (!v.symbols.length) buildSymbolPoolFor(v);
        if (!v.reels.length) autoBuildReelsFor(v);
        // Keep seeded RTP values (don't overwrite with recompute) — they're authored
      });
    });
    renderWorkspacePill();
    renderWorkspaceMenu();
    renderSidebarWorkspaces();
    renderVariantTabs();
    rerenderAll();

    // Bootstrap persona = math (already on body via index.html class).
    // Use setPersona to ensure CTA + chip + headline state is correct,
    // but do not auto-switch tab (we want to land on BUILD by default
    // on first load — math users will switch personas to trigger sense).
    setPersona("math", { bootstrap: true, silentTab: true, silentToast: true });
    personaSeen.math = true; // first session view counts

    // simulated first activity
    const v = getActiveVariant();
    v.activity.push({ t: "3m",  msg: "workspace Untitled opened", at: Date.now() - 180000 });
    v.activity.push({ t: "1m",  msg: "variant Base loaded",         at: Date.now() - 60000 });
    v.activity.push({ t: "42s", msg: "auto-balance applied (3 deltas)", at: Date.now() - 42000 });
    v.activity.push({ t: "12s", msg: "HP1 weight 3.5 → 3.8",         at: Date.now() - 12000 });
    refreshRail();
    refreshBottomActivity();

    setTimeout(() => {
      toast({
        kind: "cyan",
        msg: `Welcome · Press <b>⌘K</b> to search · <b>Compare A/B</b> on variant row · 3 games × 1-3 variants seeded`,
        ttl: 6500
      });
    }, 400);
  }
  init();

  /* ============================================================
     STUDIO BRIDGE HOOK — installs window.__studio_ui_hook__ so the
     TypeScript `main.ts` (Vite-loaded module) can drive the real
     engine over this UI's mutable state. KEEP THIS AT THE BOTTOM —
     it is the only contract the TS layer reads.
     ============================================================ */
  window.__studio_ui_hook__ = {
    getWorkspaces: () => workspaces,
    getWsOrder: () => wsOrder.slice(),
    getActiveWorkspaceId: () => activeWorkspaceId,
    getActiveVariant: () => getActiveVariant(),
    applyState: (s) => {
      try {
        const keepIds = Object.keys(workspaces);
        for (const k of keepIds) delete workspaces[k];
        for (const k of Object.keys(s.workspaces || {})) workspaces[k] = s.workspaces[k];
        wsOrder.length = 0;
        (s.wsOrder || []).forEach(id => wsOrder.push(id));
        if (s.activeWorkspaceId && workspaces[s.activeWorkspaceId]) {
          activeWorkspaceId = s.activeWorkspaceId;
        }
        renderWorkspacePill();
        renderSidebarWorkspaces();
        renderVariantTabs();
        rerenderAll();
      } catch (e) {
        console.warn("[studio] applyState failed:", e);
      }
    },
    onRTPUpdate: (live) => {
      refreshL1();
      refreshRail();
      refreshVariantTabs();
      void live;
    },
    logActivity: (msg) => logActivity(msg)
  };

  // Hook the existing recompute so any UI path that already calls it
  // (sliders, presets, paytable edits, rename, etc.) automatically goes
  // through the real engine via the debounced bridge.
  const _origRecompute = (typeof recompute !== "undefined") ? recompute : null;
  if (_origRecompute) {
    window.recompute = function () {
      _origRecompute();
      if (window.__studio__ && typeof window.__studio__.scheduleRTPRecompute === "function") {
        window.__studio__.scheduleRTPRecompute();
      }
    };
  }

})();
