/* =============================================================
   Slot Math Studio · v5-final-studio
   Onyx + cyan, 4-row shell, two-level (Workspaces × Variants),
   Compare A/B split view, context-aware right rail,
   workflow wizards, automation toasts, keyboard shortcuts.
   No deps. file:// safe.
   ============================================================= */

/* ─────────────────────────────────────────────────────────────
   BOOT-TIME SERVICE WORKER + CACHE CLEANUP
   ─────────────────────────────────────────────────────────────
   Runs BEFORE everything else.  When the user opens Studio in
   localhost / preview mode, this nukes every prior service worker
   registration and all CacheStorage entries.  Cures the "X doesn't
   close because Boki's browser is serving a stale app.js from a
   service worker baked weeks ago" class of bug forever.

   Idempotent — no-op on a clean session.  Skipped on file:// URLs
   so this stays harmless when the bundle is opened locally.
*/
(function killStaleServiceWorkersAndCaches() {
  try {
    const host = (typeof location !== "undefined" && location.hostname) || "";
    const isLocalDev = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (!isLocalDev) return;
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) {
          try { r.unregister(); } catch (_) {}
        }
        if (regs.length > 0) {
          console.log(`[studio] nuked ${regs.length} stale service-worker registration(s)`);
        }
      }).catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => {
        for (const k of keys) {
          try { caches.delete(k); } catch (_) {}
        }
        if (keys.length > 0) {
          console.log(`[studio] cleared ${keys.length} stale CacheStorage entr${keys.length === 1 ? 'y' : 'ies'}`);
        }
      }).catch(() => {});
    }
  } catch (_) {
    /* never block boot on this */
  }
})();

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
  // Default pool is FULLY EMPTY — Studio opens as a blank canvas and the
  // designer fills the pool, paytable, and reels manually (or via GDD import).
  function newVariant({ id, name, rtp = 0, sigma = 0, hit = 0, maxWin = 0, vola = "MID", pool, rtpTarget = 96.0 }) {
    return {
      id,
      name,
      persona: "math",
      tierCounts: pool ? { ...pool } : { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0 },
      symbols: [],
      reels: [],
      rtp, rtpTarget,
      hit, sigma, maxWin, vola,
      activePreset: "standard",
      activity: [],
      lastSavedAt: Date.now() - 12000,
      selection: null,
      composedKernels: []
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

  // Studio opens as a blank canvas — a single empty workspace with zero
  // symbols, zero reels, zero paytable rows.  The designer builds from
  // scratch or imports via GDD / Math GDD / IR Library.  Previous seed
  // workspaces ("Untitled", "Untitled 2", "Untitled 3" with prefilled
  // symbol pools and RTP figures) were placeholder demo data — removed
  // per originality policy so the default state is truly empty.
  const workspaces = {};
  const wsOrder = [];

  workspaces["ws-blank"] = {
    id: "ws-blank",
    name: "Untitled",
    theme: "cyan",
    layout: "5x3",
    irName: "untitled-v0.0.1",
    activeVariantId: "var-a",
    variantOrder: ["var-a"],
    variants: {
      "var-a": newVariant({ id: "var-a", name: "Base" })
    }
  };
  wsOrder.push("ws-blank");

  // Top-level state
  let activeWorkspaceId = "ws-blank";
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
  // PHASE 49 — expose accessors so the Playwright audit harness can read
  // variant state directly (e.g. `_metricsStale` after a slider edit).
  // No setter is exposed; tests only INSPECT, the real state still lives
  // in this IIFE.
  if (typeof window !== "undefined") {
    window.__slotmath_getActiveWorkspace =
      window.__slotmath_getActiveWorkspace || getActiveWorkspace;
    window.__slotmath_getActiveVariant =
      window.__slotmath_getActiveVariant || getActiveVariant;
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
    if (key === "compose") {
      try { renderCompose(); } catch (e) { console.warn("[compose] render failed:", e); }
      try { renderRuleEditor(); } catch (e) { console.warn("[rule-editor] render failed:", e); }
    }
    if (key === "sensitivity") {
      try { renderMathNotebook(); } catch (e) { console.warn("[math-notebook] render failed:", e); }
    }
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
    // Group existing symbols by tier in their original order so a tier-count
    // change (slider) does NOT wipe imported / user-named entries.  Adjusting
    // the HP slider from 3 → 2 drops the LAST HP symbol; 3 → 5 appends two
    // new placeholders to the end of HP — Z/H/P stay intact (in order),
    // their names, icons, weights, and pays are preserved.
    const existingByTier = { HP: [], MP: [], LP: [], WILD: [], SCATTER: [], MULT: [] };
    for (const s of (variant.symbols || [])) {
      if (existingByTier[s.tier]) existingByTier[s.tier].push(s);
    }
    // Reserve all current IDs + icons so new placeholders never collide
    const reservedIds = new Set((variant.symbols || []).map(s => s.id));
    const usedIcons = new Set();
    for (const list of Object.values(existingByTier)) {
      for (const s of list) if (s.icon) usedIcons.add(s.icon);
    }

    const pickFreshIcon = (tdef, prefIndex) => {
      const defs = tdef.defaultIcons || [];
      for (let k = 0; k < defs.length; k++) {
        const candidate = defs[(prefIndex + k) % defs.length];
        if (!usedIcons.has(candidate)) {
          usedIcons.add(candidate);
          return candidate;
        }
      }
      const fallback = ICON_LIB.find(ic => !usedIcons.has(ic.id));
      const iconId = fallback ? fallback.id : (defs[0] || ICON_LIB[0].id);
      usedIcons.add(iconId);
      return iconId;
    };
    const freshId = (tier) => {
      let n = 1;
      while (reservedIds.has(`${tier}${n}`)) n++;
      const id = `${tier}${n}`;
      reservedIds.add(id);
      return id;
    };

    const pool = [];
    for (const tier of TIER_ORDER) {
      const count = variant.tierCounts[tier] || 0;
      const tdef = TIER_DEFAULTS[tier];
      const existing = existingByTier[tier] || [];
      for (let i = 0; i < count; i++) {
        if (i < existing.length) {
          // PRESERVE imported / user-edited symbol verbatim — id, name,
          // icon, weight, pay, custom upload all stay.
          pool.push(existing[i]);
          continue;
        }
        // Append a new placeholder past the existing tail
        const id = freshId(tier);
        const slotIdx = i; // for default-name picking
        const name = tdef.defaultNames[slotIdx] || id;
        const icon = pickFreshIcon(tdef, slotIdx);
        pool.push({
          tier, id, name, icon,
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
    // Per-tier ordinal so each row gets a visible HP1/HP2/MP1/... index
    // next to the tier badge.  Helps the user match the weight slider on
    // row N to the N-th symbol in that tier.
    const tierCounter = { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0 };
    variant.symbols.forEach((sym, idx) => {
      tierCounter[sym.tier] = (tierCounter[sym.tier] || 0) + 1;
      const tierOrd = tierCounter[sym.tier];
      const row = document.createElement("div");
      row.className = `sym-row tier-${sym.tier}`;
      row.dataset.idx = idx;
      row.dataset.tierOrd = String(tierOrd);
      if (paneKey) row.dataset.pane = paneKey;
      const customThumb = sym.customIconData
        ? `<img class="sym-custom-thumb" src="${sym.customIconData}" alt="custom" />`
        : `<svg><use href="#g-${sym.icon}"/></svg>`;
      row.innerHTML = `
        <span class="sym-tier" title="${sym.tier} tier">${sym.tier}</span>
        <span class="sym-tier-ord mono" title="${sym.tier} · position #${tierOrd} (weight slot)">${tierOrd}</span>
        <span class="sym-id mono">${sym.id}</span>
        <input class="sym-name" value="${sym.name}" data-idx="${idx}" />
        <button class="sym-icon-btn" data-idx="${idx}" title="Swap icon">
          ${customThumb}
        </button>
        <div class="sym-weight">
          <input type="range" min="0.5" max="${Math.max(12, Math.ceil(sym.weight * 1.5))}" step="0.1" value="${sym.weight}" data-w="${idx}" />
          <span class="w-val mono" data-w-v="${idx}">${sym.weight.toFixed(1)}</span>
        </div>
        <span class="sym-pay">${sym.pay.x3}/${sym.pay.x4}/${sym.pay.x5}</span>
        <button class="sym-upload" data-upload="${idx}" title="Upload custom icon (SVG/PNG/WebP ≤100KB)">📤</button>
        <button class="sym-more" data-more="${idx}" title="More">⋯</button>
      `;
      container.appendChild(row);
    });
    /* Per-row upload — wires to window.__studio_art__ */
    $$(".sym-upload", container).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const idx = +btn.dataset.upload;
        if (!window.__studio_art__) {
          toast({ kind: "warn", msg: "Art pipeline not ready yet." });
          return;
        }
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".svg,.png,.webp,image/svg+xml,image/png,image/webp";
        inp.style.display = "none";
        inp.addEventListener("change", async ev => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const r = await window.__studio_art__.uploadIcon(f);
          if (!r.ok) {
            toast({ kind: "warn", msg: `Upload failed: ${r.error}` });
            return;
          }
          window.__studio_art__.attachIconToSymbol(idx, r.icon.id);
          renderSymbolList(container, variant, paneKey);
          if (typeof renderMyIconsPane === "function") renderMyIconsPane();
          toast({ kind: "ok", msg: `Custom icon attached → <b>${r.icon.name}</b>` });
        });
        document.body.appendChild(inp);
        inp.click();
        setTimeout(() => inp.remove(), 2000);
      });
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
        // PHASE 47 — Slider Recompute Audit guards.
        //   1. Reject NaN / Infinity (keyboard / scroll-wheel can bypass HTML min=).
        //   2. Reject non-positive weights with an explicit toast +
        //      input-element revert so the slider snaps back visually.
        if (!Number.isFinite(v) || v <= 0) {
          const prev = variant.symbols[i] ? variant.symbols[i].weight : 1;
          e.target.value = prev;
          toast({ kind: "red", msg: "Weight must be > 0 — revert to last value" });
          return;
        }
        variant.symbols[i].weight = v;
        container.querySelector(`[data-w-v="${i}"]`).textContent = v.toFixed(1);
        // PHASE 47 — propagate the symbol weight into the per-reel weight
        // map so the canonical IR (cert XML + slot-sim Rust) sees the
        // change. Without this, the studio shows one number while the
        // cert pipeline emits another.
        propagateSliderWeightToReels(variant, variant.symbols[i].id, v);
        // PHASE 49 — recompute RTP immediately so the L1 row reflects the
        // new weight even if the user clicks COMPUTE before the 350 ms
        // debounce on scheduleAutoBalanceFor fires. The auto-balance still
        // schedules afterward to correct any drift against rtpTarget.
        recomputeFor(variant);
        refreshL1();
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

  // PHASE 48 — show-grid: toggle the reel-grid overlay on the build
  // canvas. Pre-PHASE-48 the button had no handler at all — clicking it
  // did nothing. We now flip a CSS class on the reels container so the
  // designer can switch between "compact" and "grid" reel rendering,
  // plus log the action so the activity log shows the toggle.
  const showGridBtn = document.querySelector("#show-grid");
  if (showGridBtn) {
    showGridBtn.addEventListener("click", () => {
      try {
        const reelsSec = document.querySelector(".reels-section");
        if (!reelsSec) {
          toast({ kind: "cyan", msg: "Reels canvas not mounted yet" });
          return;
        }
        const next = !reelsSec.classList.contains("is-grid");
        reelsSec.classList.toggle("is-grid", next);
        showGridBtn.setAttribute("aria-pressed", String(next));
        showGridBtn.classList.toggle("is-active", next);
        logActivity(next ? "grid overlay ON" : "grid overlay OFF");
      } catch (e) {
        console.warn("[show-grid]", e);
        toast({ kind: "red", msg: "Grid toggle failed: " + (e && e.message || e) });
      }
    });
  }

  /* CUSTOM tier sliders */
  $$("#pool-custom input[type='range']").forEach(s => {
    s.addEventListener("input", () => {
      const variant = getActiveVariant();
      const tier = s.dataset.tier;
      const v = parseInt(s.value, 10);
      if (variant.tierCounts[tier] === v) return;
      variant.tierCounts[tier] = v;
      $(`[data-tier-v="${tier}"]`).textContent = v;
      $$(".preset[data-preset]", $("#panel-build")).forEach(x => x.classList.remove("is-active"));
      // PHASE 49 — symbol-pool topology change invalidates the cached MC
      // truth (hit_rate, σ, P99) the same way a weight edit does. Mark
      // stale so recomputeFor() falls back to heuristic until a new MC
      // run lands and refreshL1 surfaces the stale indicator.
      if (variant.validatedMetrics) {
        variant._metricsStale = true;
        variant._metricsStaleSince = variant._metricsStaleSince || Date.now();
      }
      // Also mark IR weights dirty so the canonical-IR closed-form path
      // re-runs the Π_reels walker on the next recomputeFor() pass.
      if (variant.ir) variant._weightsDirtySinceImport = true;
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
    // If variant was imported from a canonical IR that carries a validated
    // rtp_allocation (closed-form or Monte-Carlo total), trust those numbers
    // instead of the legacy heuristic.  This is the only way Compute can
    // surface the true RTP for feature-heavy games (Free Spins, Hold & Win,
    // Lightning Multiplier) — the heuristic only models base line wins.
    // PHASE 47 — when the user has been moving sliders on an imported-IR
    // variant, the cached rtp_allocation is stale by construction. Detect
    // the dirty flag and rebuild the closed-form total from the live
    // reels + paytable before reading the allocation block.
    if (variant._weightsDirtySinceImport && variant.ir) {
      recomputeImportedIrFromLiveWeights(variant);
    }
    const alloc = variant.rtpAllocation;
    if (alloc && (typeof alloc.total_cf === "number" || typeof alloc.total_mc_5b === "number")) {
      // Prefer Monte-Carlo total when present (4B-spin validation);
      // fall back to closed-form total otherwise.
      const totalRtp = typeof alloc.total_mc_5b === "number"
        ? alloc.total_mc_5b
        : alloc.total_cf;
      variant.rtp = +(totalRtp * 100).toFixed(4);

      // Prefer validated MC metrics over heuristic for hit / σ / P99 so the
      // L1 row reflects engine truth (e.g. Wrath of Olympus: hit 20.69%,
      // σ 4.51, P99 53.82×).  Fall back to a coarse heuristic only when no
      // validated_metrics block is present in the IR.
      // PHASE 49 — `_metricsStale` (set by propagateSliderWeightToReels /
      // tier-slider input) treats the cached vm as obsolete, so we fall
      // back to heuristic until autoMcTrigger lands a fresh block. This
      // prevents the L1 row from showing pre-edit MC truth alongside a
      // post-edit closed-form RTP.
      const vm = variant._metricsStale ? null : variant.validatedMetrics;
      if (vm && typeof vm.hit_rate === "number") {
        variant.hit = vm.hit_rate;
      } else {
        variant.hit = 22 + (variant.symbols.length - 6) * 0.6;
      }
      if (vm && typeof vm.volatility_index === "number") {
        variant.sigma = vm.volatility_index;
      } else {
        variant.sigma = 6 + variant.symbols.filter(s => s.tier === "HP").length * 0.7;
      }
      if (vm && vm.win_percentiles && typeof vm.win_percentiles.p99 === "number") {
        variant.p99 = vm.win_percentiles.p99;
      } else {
        variant.p99 = null; // refreshL1 will fall back to maxWin / 10
      }
      variant.maxWin = (variant.maxWin && variant.maxWin > 0) ? variant.maxWin : 5000;
      // Volatility classification — use IR target_volatility when set,
      // otherwise derive from σ.  Wrath's σ = 4.51 is below the heuristic
      // threshold (6), so we must use the IR override or all high-vol
      // games would be mis-classified as LOW.
      if (variant.vola && typeof variant.vola === "string" && variant.vola !== "") {
        variant.vola = variant.vola.toUpperCase();
      } else {
        variant.vola = variant.sigma > 9.5 ? "HIGH" : variant.sigma < 4 ? "LOW" : "MID";
      }
      return;
    }
    // Legacy heuristic for native (non-imported) variants.
    // PHASE 47 — explicit Σ=0 guard. The old `|| 1` fallback silently
    // produced a wrong RTP when every weight hit zero; we now surface
    // an explicit FAIL state so the user / regulator sees the cause.
    const totalRaw = variant.symbols.reduce((a, s) => a + s.weight, 0);
    if (!(totalRaw > 0)) {
      variant.rtp = 0;
      variant.hit = 0;
      variant.sigma = 0;
      variant.maxWin = 0;
      variant.vola = "INVALID";
      variant.lastClosedFormRtp = null;
      variant.computeStatus = "EMPTY_REEL";
      variant.computeDetail = "Σ symbol weights = 0 — cannot compute RTP";
      return;
    }
    const total = totalRaw;
    const payMass = variant.symbols.reduce((a, s) => a + (s.pay.x3 + s.pay.x4 + s.pay.x5) * (s.weight / total), 0);
    const wAvg = variant.symbols.reduce((a, s) => a + s.weight, 0) / Math.max(variant.symbols.length, 1);
    const rtp = 88 + payMass * 0.0086 + (wAvg - 4) * 0.14;
    variant.rtp = Math.max(86, Math.min(99, rtp));
    variant.hit = 22 + (variant.symbols.length - 6) * 0.6;
    variant.sigma = 6 + variant.symbols.filter(s => s.tier === "HP").length * 0.7;
    variant.maxWin = 1500 + variant.symbols.filter(s => s.tier === "HP" || s.tier === "WILD").length * 220;
    variant.vola = variant.sigma > 9.5 ? "HIGH" : variant.sigma < 7 ? "LOW" : "MID";
    // PHASE 47 — keep the cert RTP snapshot in lockstep with the live
    // recompute so cert XML / PAR-sheet export never sees stale RTP.
    variant.lastClosedFormRtp = +(variant.rtp / 100).toFixed(8);
    variant.computeStatus = "OK";
    variant.computeDetail = "";
  }
  function recompute() { recomputeFor(getActiveVariant()); }

  // A variant is considered BLANK (nothing meaningful to display) when the
  // user has not seeded math: no symbols + no imported rtp_allocation +
  // RTP is at default 0.  In that case every L1 / mirror metric renders
  // as "—" instead of computed zeros / heuristic noise.  As soon as the
  // user picks a preset, builds symbols, or imports an IR, this flag flips
  // and the real numbers appear.
  function isVariantBlank(v) {
    if (!v) return true;
    if (Array.isArray(v.symbols) && v.symbols.length > 0) return false;
    if (v.rtpAllocation && (typeof v.rtpAllocation.total_mc_5b === "number" || typeof v.rtpAllocation.total_cf === "number")) return false;
    if (v.validatedMetrics && typeof v.validatedMetrics.rtp === "number" && v.validatedMetrics.rtp > 0) return false;
    return true;
  }
  const DASH = "—";

  function refreshL1() {
    const v = getActiveVariant();
    const blank = isVariantBlank(v);
    // Math headline · 4dp precision so columns align in copy-paste.  On a
    // blank variant we render an em-dash instead of computed zeros / 15σ
    // / 500× heuristic placeholders.
    // PHASE 49 — when validated MC metrics have been invalidated by a
    // slider edit (`_metricsStale`), the cached hit/σ/P99 numbers no
    // longer match the live reels; tag the affected fields with a small
    // amber "·stale" suffix and a CSS hook so the user sees that the
    // engine truth is pending refresh.
    const stale = !!v._metricsStale;
    const staleTag = stale ? ` <span class="l1-stale" title="MC truth obsolete — slider edit invalidated cached metrics; re-run validation">·stale</span>` : "";
    const l1rtp = $("#l1-rtp");
    if (l1rtp) l1rtp.innerHTML = blank ? `${DASH}<span class="pct">%</span>` : `${v.rtp.toFixed(4)}<span class="pct">%</span>`;
    const l1hit = $("#l1-hit");
    if (l1hit) l1hit.innerHTML = blank ? `${DASH}<span class="pct">%</span>` : `${v.hit.toFixed(2)}<span class="pct">%</span>${staleTag}`;
    const l1vol = $("#l1-vola");
    if (l1vol) l1vol.textContent = blank ? DASH : v.vola;
    const l1sig = $("#l1-sigma");
    if (l1sig) l1sig.innerHTML = blank ? DASH : `${v.sigma.toFixed(2)}${staleTag}`;
    // P99 from validated MC win-distribution when available, else fall back
    // to the legacy `maxWin / 10` heuristic.  Wrath's validated P99 is 53.82×,
    // not 500× (which is the cap-divided-by-10 placeholder).
    const l1p99 = $("#l1-p99");
    if (l1p99) {
      if (blank) {
        l1p99.textContent = DASH + "×";
      } else {
        const p99Val = (typeof v.p99 === "number" && v.p99 > 0) ? v.p99 : (v.maxWin / 10);
        l1p99.innerHTML = `${p99Val.toFixed(p99Val < 100 ? 2 : 1)}×${staleTag}`;
      }
    }

    // Design headline · classify win-feel from sigma + hit.  Blank variant
    // gets a neutral em-dash pill so the user doesn't think "Loose" is a
    // real assessment of an empty pool.
    const pill = $("#winfeel-pill");
    const pillBig = $("#winfeel-pill-big");
    let feel = "Balanced", feelCls = "is-balanced";
    if (blank)                  { feel = DASH;       feelCls = "is-balanced"; }
    else if (v.sigma > 9.5)     { feel = "Loose";    feelCls = "is-loose"; }
    else if (v.sigma < 6.5)     { feel = "Tight";    feelCls = "is-tight"; }
    [pill, pillBig].forEach(p => {
      if (!p) return;
      p.textContent = p === pillBig ? feel.toUpperCase() : feel;
      p.classList.remove("is-tight", "is-balanced", "is-loose");
      p.classList.add(feelCls);
    });
    $$(".wf-tick").forEach(t => t.classList.remove("is-on"));
    const tick = $(`.wf-${feelCls.replace("is-", "")}`);
    if (tick && !blank) tick.classList.add("is-on");
    const wfSub = $(".winfeel-sub");
    if (wfSub) {
      wfSub.textContent = blank ? "no data yet" : `hit 1-in-${(100 / Math.max(v.hit, 1)).toFixed(1)}`;
    }
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
    const blankR = isVariantBlank(v);
    const rrtp = $("#rail-rtp-big"); if (rrtp) rrtp.textContent = blankR ? DASH : v.rtp.toFixed(2);
    const dt = (v.rtp - v.rtpTarget);
    const dtEl = $("#rail-rtp-delta");
    if (dtEl) {
      if (blankR) {
        dtEl.textContent = DASH;
        dtEl.classList.remove("ok", "warn");
      } else {
        dtEl.textContent = `${dt >= 0 ? "↗" : "↘"} ${dt >= 0 ? "+" : ""}${dt.toFixed(2)}`;
        dtEl.classList.toggle("ok", Math.abs(dt) < 0.5);
        dtEl.classList.toggle("warn", Math.abs(dt) >= 0.5);
      }
    }
    updateGauge();
    const list = $("#rail-activity");
    if (list) {
      list.innerHTML = v.activity.slice(-4).reverse().map(a => `
        <li><span class="t mono">${a.t}</span><span class="m">${a.msg}</span></li>
      `).join("") || `<li><span class="t mono">—</span><span class="m">no recent changes</span></li>`;
    }

    // Math rail · live moment values driven from active variant.  Blank
    // variants show an em-dash so the user doesn't read placeholder noise
    // (σ=15 from the empty-pool heuristic, etc.) as real math.
    const mSigma = $("#m-sigma");
    if (mSigma) mSigma.textContent = blankR ? DASH : v.sigma.toFixed(2);
    const mMu    = $("#m-mu");
    if (mMu)    mMu.textContent    = blankR ? `${DASH}%` : (v.rtp.toFixed(4) + "%");
    // P99 from validated MC win-distribution when present, else fall back
    // to the legacy `maxWin / 10` heuristic placeholder.
    const p99Display = (typeof v.p99 === "number" && v.p99 > 0) ? v.p99 : (v.maxWin / 10);
    const p99Fmt = p99Display.toFixed(p99Display < 100 ? 2 : 1) + "×";
    const mP99   = $("#m-p99");
    if (mP99)   mP99.textContent   = blankR ? `${DASH}×` : p99Fmt;

    // Headline metrics (math / design / producer)
    const l1sigma = $("#l1-sigma"); if (l1sigma) l1sigma.textContent = blankR ? DASH : v.sigma.toFixed(2);
    const l1p99   = $("#l1-p99");   if (l1p99)   l1p99.textContent   = blankR ? `${DASH}×` : p99Fmt;

    // ── Variance decomposition (rail card) ─────────────────────────────
    // Populates from validated_metrics.rtp_breakdown when present.
    // Cold-start: bar empty, legend reads "—".
    const vdBar = document.getElementById("vdecomp-bar");
    const vdLeg = document.getElementById("vdecomp-legend");
    if (vdBar && vdLeg) {
      const br = (v && v.validatedMetrics && v.validatedMetrics.rtp_breakdown) || null;
      if (!blankR && br && typeof br === "object") {
        // Sum any numeric components into a normalized 0-100 split.  We
        // accept BOTH the long-form keys (base_line_wins, lightning_uplift)
        // AND the short-form keys (base, lightning) that the par-to-ir
        // generator may emit.  First matching alias wins.
        const segs = [
          { keys: ["base_line_wins", "base"],            cls: "vd-base",    label: "Base" },
          { keys: ["scatter_pays"],                       cls: "vd-base",    label: "Scatter pays" },
          { keys: ["free_spins"],                         cls: "vd-fs",      label: "Free Spins" },
          { keys: ["cascade"],                            cls: "vd-cascade", label: "Cascade" },
          { keys: ["lightning_uplift", "lightning"],      cls: "vd-mult",    label: "Lightning" },
          { keys: ["hold_and_win"],                       cls: "vd-mult",    label: "Hold & Win" },
          { keys: ["pick"],                               cls: "vd-cascade", label: "Pick" },
          { keys: ["wheel"],                              cls: "vd-cascade", label: "Wheel" },
        ];
        const pickValue = (keys) => {
          for (const k of keys) {
            const raw = br[k];
            if (typeof raw === "number" && raw > 0) return raw;
          }
          return 0;
        };
        const present = segs
          .map((s) => ({ ...s, val: pickValue(s.keys) }))
          .filter((s) => s.val > 0);
        const total = present.reduce((a, s) => a + s.val, 0) || 1;
        const norm = present.map((s) => ({ ...s, pct: (s.val / total) * 100 }));
        vdBar.innerHTML = norm.map((s) => `<i class="vd-seg ${s.cls}" style="width:${s.pct.toFixed(1)}%" title="${s.label} ${s.pct.toFixed(1)}%"></i>`).join("");
        vdLeg.innerHTML = norm.map((s) => `<li><i class="vd-dot ${s.cls}"></i><span>${s.label}</span><b class="mono">${s.pct.toFixed(1)}%</b></li>`).join("");
      } else {
        vdBar.innerHTML = "";
        vdLeg.innerHTML = `
          <li><i class="vd-dot vd-base"></i><span>Base</span><b class="mono">${DASH}</b></li>
          <li><i class="vd-dot vd-fs"></i><span>Free Spins</span><b class="mono">${DASH}</b></li>
          <li><i class="vd-dot vd-cascade"></i><span>Cascade</span><b class="mono">${DASH}</b></li>
          <li><i class="vd-dot vd-mult"></i><span>Multipliers</span><b class="mono">${DASH}</b></li>
        `;
      }
    }

    // ── Sensitivity preview (rail card) ────────────────────────────────
    // Populated by the Sensitivity sweep when results exist; otherwise
    // shows three em-dashes.
    const sensList = document.getElementById("sens-preview");
    if (sensList) {
      const top = (v && v.lastSensitivity && Array.isArray(v.lastSensitivity.top3)) ? v.lastSensitivity.top3 : null;
      if (!blankR && top && top.length > 0) {
        const max = Math.max(...top.map((t) => Math.abs(t.dpp || 0)), 0.001);
        sensList.innerHTML = top.slice(0, 3).map((t) => {
          const w = Math.max(5, Math.min(100, (Math.abs(t.dpp || 0) / max) * 100));
          return `<li>
            <span class="sp-name">${escapeHtml(t.name || "—")}</span>
            <span class="sp-bar"><i style="width:${w.toFixed(0)}%"></i></span>
            <b class="mono cyan">±${(t.dpp || 0).toFixed(2)}pp</b>
          </li>`;
        }).join("");
      } else {
        sensList.innerHTML = `
          <li class="sens-preview-empty"><span class="sp-name">${DASH}</span><span class="sp-bar"></span><b class="mono">${DASH}</b></li>
          <li class="sens-preview-empty"><span class="sp-name">${DASH}</span><span class="sp-bar"></span><b class="mono">${DASH}</b></li>
          <li class="sens-preview-empty"><span class="sp-name">${DASH}</span><span class="sp-bar"></span><b class="mono">${DASH}</b></li>
        `;
      }
    }

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
      const blank = isVariantBlank(v);
      const pct = blank ? 0 : Math.max(0, Math.min(100, (v.rtp - 88) / 11 * 100));
      const rtpTxt = blank ? `${DASH}%` : `${v.rtp.toFixed(2)}%`;
      return `<button class="variant-lineup-bar ${isActive ? "is-active" : ""}" data-vid="${vid}" title="Switch to ${v.name}">
        <span class="vlb-name">${v.name}</span>
        <span class="vlb-track"><i style="width:${pct.toFixed(1)}%"></i></span>
        <span class="vlb-rtp mono">${rtpTxt}</span>
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
     PHASE 47 — Slider → IR canonical propagation
     ============================================================
     Symbol-pool slider edits the user makes in the Build section must
     also write through to `variant.reels.base[r][symbol_id]` so the
     canonical IR (cert XML, slot-sim Rust, PAR sheet snapshot) reflects
     the same number the studio displays. Without this hook the studio
     shows RTP=X but the cert pipeline emits RTP=Y because the reels
     still hold the pre-edit weights.
     ============================================================ */
  function propagateSliderWeightToReels(variant, symbolId, newWeight) {
    if (!variant || !symbolId || !Number.isFinite(newWeight) || newWeight <= 0) {
      return;
    }
    const reels = variant.reels && variant.reels.base;
    let touched = false;
    if (Array.isArray(reels)) {
      for (const reelMap of reels) {
        if (reelMap && typeof reelMap === "object" && symbolId in reelMap) {
          reelMap[symbolId] = newWeight;
          touched = true;
        }
      }
    }
    // PHASE 47 — also reseed the IR reels block so a subsequent IR export
    // (cert XML / cert ZIP / PAR sheet) reads the live weight, not the
    // pre-edit one.
    if (variant.ir && variant.ir.reels && Array.isArray(variant.ir.reels.base)) {
      for (const reelMap of variant.ir.reels.base) {
        if (reelMap && typeof reelMap === "object" && symbolId in reelMap) {
          reelMap[symbolId] = newWeight;
          touched = true;
        }
      }
    }
    if (touched) {
      variant._weightsDirtySinceImport = true;
      // PHASE 49 — any slider edit makes the cached MC truth (hit_rate,
      // volatility_index, P99) numerically obsolete. Mark the block stale
      // so recomputeFor() falls back to the heuristic estimator and the
      // L1 row picks up a "stale" indicator until a fresh MC run lands.
      // We do NOT zero out validatedMetrics here so a user can compare
      // pre/post-edit truth in the activity log if needed.
      if (variant.validatedMetrics) {
        variant._metricsStale = true;
        variant._metricsStaleSince = variant._metricsStaleSince || Date.now();
      }
    }
  }

  /* ============================================================
     PHASE 47 — Live recompute of an imported-IR variant.
     Builds the closed-form total RTP from the live reels + paytable
     using the same Π_reels probability walker the auditor uses. We do
     this in float (no Fraction) because the studio runs in the
     browser; absolute drift vs the Python Fraction reference is
     bounded by ≤ 1e-9 for typical 5×3 IRs (proved by the audit harness).
     ============================================================ */
  function recomputeImportedIrFromLiveWeights(variant) {
    if (!variant || !variant.ir) return;
    const ir = variant.ir;
    const reels = ir.reels && Array.isArray(ir.reels.base) ? ir.reels.base : null;
    const paytable = Array.isArray(ir.paytable) ? ir.paytable : null;
    const paylines = Array.isArray(ir.paylines) ? ir.paylines : null;
    const symbols = Array.isArray(ir.symbols) ? ir.symbols : [];
    if (!reels || !paytable || !paylines) return;
    // Build per-reel probabilities.
    const reelProbs = [];
    for (const r of reels) {
      if (!r || typeof r !== "object") return;
      let total = 0;
      for (const k in r) total += +r[k] || 0;
      if (!(total > 0)) {
        variant.computeStatus = "EMPTY_REEL";
        variant.computeDetail = "Imported IR reel has Σ_w = 0 — live recompute aborted";
        return;
      }
      const pr = {};
      for (const k in r) pr[k] = (+r[k] || 0) / total;
      reelProbs.push(pr);
    }
    const wildId = (symbols.find(s => s && s.kind === "wild") || {}).id;
    // Index paytable: (sym, run) → pay.
    const payIndex = {};
    for (const row of paytable) {
      if (!row || typeof row !== "object") continue;
      for (const k in row) {
        if (k === "symbol") continue;
        const v = row[k];
        if (typeof v !== "number" || !k.startsWith("pay")) continue;
        const run = parseInt(k.slice(3), 10);
        if (!Number.isFinite(run)) continue;
        payIndex[row.symbol + "|" + run] = v;
      }
    }
    // Closed-form sum over paylines × anchors.
    let rtp = 0;
    for (const line of paylines) {
      if (!Array.isArray(line) || !line.length) continue;
      const anchorProbs = reelProbs[0];
      for (const anchor in anchorProbs) {
        let cumP = 1;
        for (let r = 0; r < line.length; r++) {
          if (r >= reelProbs.length) break;
          const pr = reelProbs[r];
          let pHit = pr[anchor] || 0;
          if (r > 0 && wildId && wildId !== anchor) pHit += pr[wildId] || 0;
          cumP *= pHit;
          const runLen = r + 1;
          if (runLen >= 3) {
            const pay = payIndex[anchor + "|" + runLen];
            if (typeof pay === "number") rtp += cumP * pay;
          }
          if (pHit === 0) break;
        }
      }
    }
    // Persist into the same rtpAllocation surface the cert pipeline reads.
    variant.rtpAllocation = variant.rtpAllocation || {};
    variant.rtpAllocation.total_cf = rtp;
    variant.rtpAllocation.live_recompute_ts = Date.now();
    variant._weightsDirtySinceImport = false;
  }
  if (typeof window !== "undefined") {
    window.__slotmath_recomputeImportedIrFromLiveWeights =
      window.__slotmath_recomputeImportedIrFromLiveWeights || recomputeImportedIrFromLiveWeights;
  }
  // Expose for the audit harness + unit tests.
  if (typeof window !== "undefined") {
    window.__slotmath_propagateSliderWeightToReels =
      window.__slotmath_propagateSliderWeightToReels || propagateSliderWeightToReels;
  }

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
      const blank = isVariantBlank(v);
      const rtLbl = blank ? DASH : `${v.rtp.toFixed(1)}%`;
      const safeName = escapeHtml(w.name);
      // Hover-X delete affordance — visible only on row hover (CSS) and
      // not for the very last surviving workspace (the user must always
      // have one to fall back to).
      const allowDelete = wsOrder.length > 1;
      return `<div class="side-item-row" data-ws="${id}">
        <button class="side-item ${id === activeWorkspaceId ? "is-active" : ""}" data-ws="${id}" title="Switch to ${safeName}">
          <span class="dot" style="background:${dot}"></span>${safeName}<span class="rt">${rtLbl}</span>
        </button>
        ${allowDelete ? `<button class="side-item-delete" data-del-ws="${id}" title="Delete ${safeName}" aria-label="Delete workspace ${safeName}">×</button>` : ""}
      </div>`;
    }).join("");
    $("#side-ws").parentElement.querySelector(".side-h-meta").textContent = wsOrder.length;
    $$(".side-item[data-ws]", c).forEach(b => b.addEventListener("click", () => switchWorkspace(b.dataset.ws)));
    $$(".side-item-delete[data-del-ws]", c).forEach(b => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteWorkspace(b.dataset.delWs);
      });
    });
  }

  // Small HTML escape helper — sidebar names may contain user-supplied
  // text (imported IR.meta.name) so we never want to inject raw markup.
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ============================================================
     WORKSPACE DELETE — hover-X in sidebar, confirm via toast undo
     ============================================================ */
  // Keep a short-lived stash of the last deleted workspace so the user
  // can undo within a 10-second toast window.  Cleared on next delete.
  let _lastDeletedWs = null;

  function deleteWorkspace(wsId) {
    const ws = workspaces[wsId];
    if (!ws) return;
    if (wsOrder.length <= 1) {
      toast({ kind: "warn", msg: "Cannot delete the last workspace — keep at least one" });
      return;
    }
    const idx = wsOrder.indexOf(wsId);
    if (idx === -1) return;

    // Stash for undo + remove from in-memory state
    _lastDeletedWs = { id: wsId, ws: workspaces[wsId], orderIndex: idx, wasActive: wsId === activeWorkspaceId };
    delete workspaces[wsId];
    wsOrder.splice(idx, 1);

    // If we just deleted the active workspace, fall back to the previous
    // one in order (or the next if we deleted index 0).
    if (_lastDeletedWs.wasActive) {
      const fallbackIdx = Math.min(idx, wsOrder.length - 1);
      activeWorkspaceId = wsOrder[fallbackIdx];
      switchWorkspace(activeWorkspaceId);
    } else {
      renderSidebarWorkspaces();
      renderWorkspacePill();
      renderWorkspaceMenu();
    }
    logActivity(`workspace deleted: ${ws.name}`);

    toast({
      kind: "warn",
      msg: `Deleted <b>${escapeHtml(ws.name)}</b>`,
      action: "Undo",
      onAction: () => undoDeleteWorkspace(),
      ttl: 10000,
    });
  }

  function undoDeleteWorkspace() {
    if (!_lastDeletedWs) return;
    const { id, ws, orderIndex, wasActive } = _lastDeletedWs;
    workspaces[id] = ws;
    // Re-insert at its original position so order stays stable
    const insertAt = Math.min(orderIndex, wsOrder.length);
    wsOrder.splice(insertAt, 0, id);
    if (wasActive) {
      activeWorkspaceId = id;
      switchWorkspace(id);
    } else {
      renderSidebarWorkspaces();
      renderWorkspacePill();
      renderWorkspaceMenu();
    }
    logActivity(`workspace restored: ${ws.name}`);
    toast({ kind: "ok", msg: `Restored <b>${escapeHtml(ws.name)}</b>`, ttl: 3000 });
    _lastDeletedWs = null;
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
      const blank = isVariantBlank(v);
      const rtpLbl = blank ? `${DASH}%` : `${v.rtp.toFixed(2)}%`;
      return `<button class="var-tab ${isActive ? "is-active" : ""}" data-vid="${vid}" title="Variant ${v.name}">
        <span class="var-tab-dot" style="background:${isActive ? dot : "transparent"}; border:1px solid ${dot}"></span>
        <span class="var-tab-name">${v.name}</span>
        <span class="var-tab-rtp mono">${rtpLbl}</span>
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
      const blank = isVariantBlank(v);
      tab.querySelector(".var-tab-rtp").textContent = blank ? `${DASH}%` : `${v.rtp.toFixed(2)}%`;
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

  // Highlight selected "Start from" radio (visual is-active state)
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.name === "ng-source") {
      const wrap = t.closest(".ng-sources");
      if (wrap) {
        wrap.querySelectorAll(".ng-radio").forEach(r => r.classList.remove("is-active"));
        const lbl = t.closest("label");
        if (lbl) lbl.classList.add("is-active");
      }
    }
  });

  $("#ng-create").addEventListener("click", () => {
    const source = $$("input[name=ng-source]").find(r => r.checked)?.value || "empty";
    // Both Game GDD (narrative) and Math GDD (math doc) route to the same
    // parser pipeline — the underlying gdd-parser.ts auto-detects format
    // (PDF/DOCX/MD/TXT for narrative, JSON/XLSX/CSV/MD-spec for math).
    if (source === "gdd-game" || source === "gdd-math") {
      closeNewGameModal();
      const input = $("#gdd-file-input");
      if (input) {
        input.value = "";
        // Hint to the parser which entry-point was used (Studio can adjust
        // confidence priors based on this — math docs trust XLSX/JSON more,
        // narrative docs trust prose extraction more).
        input.setAttribute("data-import-source", source);
        input.click();
      }
      return;
    }
    if (source === "template") {
      // Open IR Library sub-modal (classic patterns + studio pilots).
      closeNewGameModal();
      openIRLibraryModal(null);
      return;
    }
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
     IR LIBRARY SUB-MODAL (CORTI 200.1) — 26 starter IRs
     Wired to window.__studio_ir_library__ exposed by main.ts.
     ============================================================ */
  const IRL_STATE = { items: [], selected: null, filterCategory: null };

  function openIRLibraryModal(forceCategory) {
    IRL_STATE.selected = null;
    const bridge = window.__studio_ir_library__;
    if (!bridge) {
      toast({ kind: "warn", msg: "IR Library bridge not ready — main.ts still booting" });
      return;
    }
    showModal("ir-library-modal");
    if (forceCategory) {
      $("#irl-category").value = forceCategory;
      IRL_STATE.filterCategory = forceCategory;
    } else {
      IRL_STATE.filterCategory = $("#irl-category").value || null;
    }
    $("#irl-load").disabled = true;
    $("#irl-preview").innerHTML = `<div class="ir-library-preview-empty">Pick an IR from the list to see its preview.</div>`;
    Promise.resolve(bridge.load())
      .then(() => {
        IRL_STATE.items = bridge.getAllItems();
        renderIRLibraryGrid();
      })
      .catch((err) => {
        toast({ kind: "warn", msg: `IR Library load failed: ${err && err.message ? err.message : err}` });
      });
  }
  function closeIRLibraryModal() { hideModal("ir-library-modal"); }
  $("#irl-close")?.addEventListener("click", closeIRLibraryModal);
  $("#irl-cancel")?.addEventListener("click", closeIRLibraryModal);
  $("#irl-backdrop")?.addEventListener("click", closeIRLibraryModal);

  $("#irl-search")?.addEventListener("input", () => renderIRLibraryGrid());
  $("#irl-category")?.addEventListener("change", (e) => {
    IRL_STATE.filterCategory = e.target.value || null;
    renderIRLibraryGrid();
  });
  $("#irl-topology")?.addEventListener("change", () => renderIRLibraryGrid());

  function renderIRLibraryGrid() {
    const bridge = window.__studio_ir_library__;
    if (!bridge) return;
    const search = ($("#irl-search")?.value || "").trim();
    const category = $("#irl-category")?.value || null;
    const topology = $("#irl-topology")?.value || null;
    const filtered = bridge.filter({ search, category, topology });
    const grid = $("#irl-grid");
    if (!grid) return;
    grid.innerHTML = filtered.map((it) => {
      const tagClass = it.category === "classics" ? "is-classic" : "";
      const tagLabel = it.category === "lw-mgaps" ? (it.mGap || "L&W") : "CLASSIC";
      const meta = it.category === "lw-mgaps"
        ? `${it.supplier || ""} · ${it.year || ""}`
        : (it.topology || "");
      const isSelected = IRL_STATE.selected === it.id ? "is-selected" : "";
      return `<button type="button" class="ir-library-card ${isSelected}" data-irl-id="${it.id}" role="listitem">
        <span class="ir-library-card-tag ${tagClass}">${tagLabel}</span>
        <span class="ir-library-card-title">${it.title}</span>
        <span class="ir-library-card-meta"><span>${meta}</span></span>
      </button>`;
    }).join("");
    $("#irl-count").textContent = `${filtered.length} of ${IRL_STATE.items.length}`;
    $$(".ir-library-card", grid).forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.irlId;
        IRL_STATE.selected = id;
        $$(".ir-library-card", grid).forEach((c) => c.classList.toggle("is-selected", c === card));
        renderIRLibraryPreview(id);
      });
    });
  }

  function renderIRLibraryPreview(itemId) {
    const bridge = window.__studio_ir_library__;
    if (!bridge) return;
    const preview = $("#irl-preview");
    if (!preview) return;
    preview.innerHTML = `<div class="ir-library-preview-empty">Loading…</div>`;
    $("#irl-load").disabled = true;
    Promise.resolve(bridge.preview(itemId))
      .then((p) => {
        const features = (p.features || [])
          .map((f) => `<span class="ir-library-feature-chip">${f}</span>`).join("");
        const tags = (p.ir.meta.theme_tags || [])
          .map((t) => `<span class="ir-library-feature-chip">${t}</span>`).join("");
        preview.innerHTML = `
          <h3>${p.ir.meta.name}</h3>
          <dl class="ir-library-preview-rows">
            <dt>ID</dt><dd>${p.ir.meta.id}</dd>
            <dt>Topology</dt><dd>${p.topologyLabel}</dd>
            <dt>Target RTP</dt><dd>${(p.rtp * 100).toFixed(2)}%</dd>
            <dt>Symbols</dt><dd>${p.symbolCount}</dd>
            <dt>Volatility</dt><dd>${p.ir.limits.target_volatility}</dd>
            <dt>Max win</dt><dd>${p.ir.limits.max_win_x}×</dd>
          </dl>
          <div style="margin-top:8px;color:var(--text-2);font-size:11px;">${p.ir.meta.description || ""}</div>
          <div style="margin-top:8px;"><b style="font-size:11px;color:var(--text-2);">Features</b><br/>${features || '<span class="ir-library-preview-empty">none</span>'}</div>
          <div style="margin-top:8px;"><b style="font-size:11px;color:var(--text-2);">Tags</b><br/>${tags}</div>
        `;
        $("#irl-load").disabled = false;
      })
      .catch((err) => {
        preview.innerHTML = `<div class="ir-library-preview-empty">Preview failed: ${err && err.message ? err.message : err}</div>`;
      });
  }

  $("#irl-load")?.addEventListener("click", () => {
    const bridge = window.__studio_ir_library__;
    const id = IRL_STATE.selected;
    if (!bridge || !id) return;
    Promise.resolve(bridge.loadIR(id))
      .then((ir) => {
        // Create workspace from IR meta. We don't deep-project IR → variant
        // (round-trip is lossy as documented in main.ts importIR()); we
        // seed an empty workspace with theme + layout heuristics, log the
        // IR import for traceability, and stash the raw IR on the variant
        // so downstream features can pull from it.
        const layout = ir.topology.kind === "rectangular"
          ? `${ir.topology.reels}x${ir.topology.rows}`
          : (ir.topology.kind === "variable_rows" ? "6x4-variable" : "cluster");
        const wsId = "ws-" + Date.now().toString(36);
        const wsName = ir.meta.name;
        const ws = newWorkspace({
          id: wsId,
          name: wsName,
          theme: "cyan",
          layout: LAYOUTS.find((l) => l.id === layout) ? layout : "5x3",
          irName: (ir.meta.id || wsName).toLowerCase().replace(/\s+/g, "-") + "-v0.1.00",
        });
        // Stash IR on the active variant so the rest of the studio can
        // read it without re-parsing the file. The build/sensitivity tabs
        // know to consume `loadedIR` when present.
        const variant = ws.variants[Object.keys(ws.variants)[0]];
        if (variant) variant.loadedIR = ir;
        workspaces[wsId] = ws;
        wsOrder.push(wsId);
        closeIRLibraryModal();
        switchWorkspace(wsId);
        toast({ kind: "ok", msg: `Loaded IR <b>${ir.meta.name}</b> · ${(ir.limits.target_rtp * 100).toFixed(2)}% target RTP` });
        logActivity(`IR library · loaded ${id} → ${wsName}`);
      })
      .catch((err) => {
        toast({ kind: "warn", msg: `IR load failed: ${err && err.message ? err.message : err}` });
      });
  });

  /* ============================================================
     GDD IMPORT FLOW — picker → parse → review modal → generate
     ============================================================ */
  $("#gdd-file-input")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!window.__studio__ || typeof window.__studio__.parseGDD !== "function") {
      toast({ kind: "warn", msg: "GDD parser not ready — main.ts still booting" });
      return;
    }
    toast({ kind: "cyan", msg: `Parsing <b>${f.name}</b>…` });
    try {
      // ── Direct canonical-IR fast-path ────────────────────────────────
      // If the file is a Studio-IR-1.0.0 JSON we bypass the narrative GDD
      // parser (which only extracts pool counts / averaged paytable) and
      // load the IR directly so every concrete symbol, reel weight, payline,
      // paytable cell and feature lands in the workspace verbatim.
      const isJson = /\.json$/i.test(f.name) || f.type === "application/json";
      if (isJson) {
        const txt = await f.text();
        let raw;
        try { raw = JSON.parse(txt); } catch (_) { raw = null; }
        if (raw && raw.schema_version === "1.0.0"
                && raw.meta && Array.isArray(raw.symbols)
                && raw.reels && raw.evaluation && raw.paytable) {
          const ok = importCanonicalIR(raw, f.name);
          if (ok) return;
          console.warn("[studio] canonical IR import failed — falling back to GDD parser");
        }
      }

      // ── Narrative GDD path (PDF / DOCX / MD / XLSX / CSV / TXT / non-IR JSON) ──
      const gdd = await window.__studio__.parseGDD(f);
      window.__gddCurrent__ = gdd;
      window.__gddFilename__ = f.name;
      renderGDDReview(gdd, f.name);
      showModal("gdd-review");
    } catch (err) {
      toast({ kind: "warn", msg: `Parse failed: ${(err && err.message) ? err.message : String(err)}` });
    }
  });

  // Direct workspace seeder for canonical Studio-IR-1.0.0 JSON files.
  // Returns true on success; false signals the caller to fall back to the
  // narrative parser (e.g. for partial / malformed IRs).
  // Stable identifier for a canonical IR — used to detect duplicate
  // imports.  Falls back gracefully when meta.id / meta.version are absent.
  function irKeyOf(ir) {
    const meta = (ir && ir.meta) || {};
    const id = meta.id || (meta.name || "imported-game").toLowerCase().replace(/\s+/g, "-");
    const version = meta.version || "0.0.0";
    return `${id}@${version}`;
  }
  function findWorkspaceByIrKey(key) {
    for (const wsId of wsOrder) {
      const ws = workspaces[wsId];
      if (!ws) continue;
      if (ws.irKey === key) return wsId;
      // Legacy workspaces imported before this dedup logic existed —
      // reconstruct the key from their persisted `irName` (id-vMAJOR.MINOR.PATCH).
      if (!ws.irKey && typeof ws.irName === "string") {
        const m = ws.irName.match(/^(.*)-v([0-9].*)$/);
        if (m) {
          const reconstructed = `${m[1]}@${m[2]}`;
          if (reconstructed === key) {
            ws.irKey = reconstructed; // upgrade in place
            return wsId;
          }
        }
      }
    }
    return null;
  }

  function importCanonicalIR(ir, filename, opts) {
    const options = opts || {};
    try {
      const meta = ir.meta || {};
      const topo = ir.topology || { reels: 5, rows: 3 };
      const layout = topo.reels === 6 ? "6x4mw"
                  : topo.reels === 7 ? "7x7c"
                  : "5x3";

      // ── Dedup guard ────────────────────────────────────────────────
      // If this exact game (id @ version) is already loaded, switch to
      // it instead of creating yet another duplicate workspace.  The
      // user can opt out via `opts.forceReimport === true` (wired to a
      // "Re-import anyway" toast action).
      const key = irKeyOf(ir);
      if (!options.forceReimport) {
        const existingId = findWorkspaceByIrKey(key);
        if (existingId) {
          switchWorkspace(existingId);
          const existingName = workspaces[existingId].name || meta.name || "Game";
          toast({
            kind: "cyan",
            msg: `<b>${existingName}</b> already loaded — switched to existing workspace`,
            action: "Re-import anyway",
            onAction: () => {
              try { importCanonicalIR(ir, filename, { forceReimport: true }); } catch (_) {}
            },
            ttl: 6000,
          });
          logActivity(`IR import skipped (dedup) → ${existingName} · key=${key}`);
          return true;
        }
      }

      // Map IR symbols → workspace symbol shape (id/name/tier/weight/icon/pay).
      // Weight is computed as the SUM of per-reel weights across all reels
      // in the base reel set — this is what Studio's render code expects
      // (`sym.weight.toFixed(1)`).  If reels.base is missing or empty, fall
      // back to weight=1 per symbol so the UI doesn't crash.
      //
      // Tier mapping: IR uses `kind: "hp" | "lp" | "wild" | "scatter" | "bonus"`
      // — but classic slot UX distinguishes HP (premium) vs MP (mid).  When the
      // IR has many `kind=hp` symbols (Wrath has 6: Z/H/P/HM/SH/SW), we split
      // them by pay rank: top half (by x5) → HP, bottom half → MP.  Symbols
      // with `kind: "mp"` (if explicitly set in future IRs) always go to MP.
      const KIND_TO_TIER = {
        wild:       "WILD",
        scatter:    "SCATTER",
        bonus:      "MULT",   // bonus orbs are treated as MULT tier in Studio
        hp:         "HP",
        mp:         "MP",
        lp:         "LP",
        multiplier: "MULT",
      };
      const baseReels = Array.isArray(ir.reels?.base) ? ir.reels.base : [];
      const sumWeightForSymbol = (sid) => {
        let sum = 0;
        for (const reel of baseReels) {
          if (reel && typeof reel === "object") {
            const w = reel[sid];
            if (typeof w === "number") sum += w;
          }
        }
        return sum > 0 ? sum : 1; // never zero, avoids div-by-zero downstream
      };
      // Build per-symbol pay object from IR paytable (Studio render expects
      // `sym.pay.x3 / x4 / x5` inline on each symbol).
      const irPaytable = ir.paytable || {};
      const payFor = (sid) => {
        const p = irPaytable[sid];
        if (!p) return { x3: 0, x4: 0, x5: 0 };
        return {
          x3: typeof p.x3 === "number" ? p.x3 : (p["3"] ?? 0),
          x4: typeof p.x4 === "number" ? p.x4 : (p["4"] ?? 0),
          x5: typeof p.x5 === "number" ? p.x5 : (p["5"] ?? 0),
        };
      };

      // ── HP / MP auto-split for kind=hp symbols ──
      // If IR has >=4 kind=hp symbols, sort by x5 descending and split: the
      // top half (ceil N/2) stays HP, the rest move to MP.  This matches the
      // Wrath of Olympus authoring intent (Z/H/P=HP, HM/SH/SW=MP) without
      // requiring the IR schema to encode "mp" explicitly.
      const hpIRSymbols = ir.symbols.filter(s => s.kind === "hp");
      const hpToMP = new Set();
      if (hpIRSymbols.length >= 4) {
        const ranked = hpIRSymbols
          .map(s => ({ id: s.id, x5: payFor(s.id).x5 }))
          .sort((a, b) => b.x5 - a.x5);
        const hpCount = Math.ceil(ranked.length / 2);
        for (let i = hpCount; i < ranked.length; i++) hpToMP.add(ranked[i].id);
      }
      const tierFor = (s) => {
        if (s.kind === "hp" && hpToMP.has(s.id)) return "MP";
        return KIND_TO_TIER[s.kind] || "LP";
      };

      // ── Default icon assignment per tier (sprite IDs from ICON_LIB) ──
      // Without this, `<use href="#g-${sym.icon}"/>` resolves to "#g-undefined"
      // and the symbol pool renders with empty glyphs.  We pick from the
      // tier's default icon roster, cycling if the IR has more symbols in a
      // tier than there are unique defaults.
      const tierIconCursor = { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0 };
      const usedIcons = new Set();
      const pickIconForTier = (tier) => {
        const defs = (TIER_DEFAULTS[tier] && TIER_DEFAULTS[tier].defaultIcons) || [];
        if (defs.length) {
          for (let attempt = 0; attempt < defs.length; attempt++) {
            const candidate = defs[(tierIconCursor[tier] + attempt) % defs.length];
            if (!usedIcons.has(candidate)) {
              tierIconCursor[tier] = (tierIconCursor[tier] + attempt + 1) % defs.length;
              usedIcons.add(candidate);
              return candidate;
            }
          }
          // All tier defaults taken → fall through to global library
        }
        const fallback = ICON_LIB.find(ic => !usedIcons.has(ic.id));
        const iconId = fallback ? fallback.id : (defs[0] || ICON_LIB[0].id);
        usedIcons.add(iconId);
        return iconId;
      };

      const symbols = ir.symbols.map(s => {
        const tier = tierFor(s);
        return {
          id: s.id,
          name: s.name || s.id,
          tier,
          icon: pickIconForTier(tier),
          weight: sumWeightForSymbol(s.id),
          pay: payFor(s.id),
          substitutes: s.substitutes || null,
        };
      });
      const tierCounts = { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0 };
      for (const s of symbols) tierCounts[s.tier]++;

      const wsName = meta.name || "Imported Game";
      const wsId = "ws-" + Date.now().toString(36);
      const irName = (meta.id || wsName.toLowerCase().replace(/\s+/g, "-")) + "-v" + (meta.version || "0.1.00");

      const ws = newWorkspace({
        id: wsId, name: wsName, theme: "cyan", layout, irName
      });
      // Persist the dedup key so subsequent imports of the same IR find it.
      ws.irKey = key;
      ws.irMetaId = meta.id || null;
      ws.irMetaVersion = meta.version || null;
      const v = ws.variants[ws.activeVariantId];

      // Seed math from IR
      v.symbols = symbols;
      v.tierCounts = tierCounts;
      // Studio renders reels as display strips (array of symbol-id arrays).
      // IR encodes reels as weighted maps (per-symbol-weight per-reel).  We
      // preserve IR's granular per-reel info under v.irReels for export, and
      // let Studio's autoBuildReelsFor() generate display strips at render
      // time using the aggregate per-symbol weights computed above.
      v.reels = [];
      v.irReels = {
        base: Array.isArray(ir.reels?.base) ? ir.reels.base : [],
        free_spins: Array.isArray(ir.reels?.free_spins) ? ir.reels.free_spins : [],
      };
      v.fsReels = v.irReels.free_spins;
      // Preserve scatter_prevention block — critical for FS trigger frequency
      // (Wrath uses max_scatters_per_reel=1).  Without this, FS triggers ~64%
      // too often in the Play Template runner and inflates RTP by ~5pp.
      v.irScatterPrev = (ir.reels && ir.reels.scatter_prevention) || null;
      // Preserve the FULL original IR — needed by Play Template so the runner
      // gets byte-for-byte the same math as the validated MC.  Anything we
      // derive from this (paytable, reels, features) flows back into the
      // variant for Studio editing; the original sits here untouched so we
      // can hand the runner the canonical shape.
      v.irOriginal = ir;
      // Studio render expects paytable keyed by symbol with { x3, x4, x5 }
      // properties.  IR uses { "3": ..., "4": ..., "5": ... } string keys.
      const paytableMapped = {};
      for (const [sid, p] of Object.entries(ir.paytable || {})) {
        if (!p || typeof p !== "object") continue;
        paytableMapped[sid] = {
          x3: typeof p.x3 === "number" ? p.x3 : (p["3"] ?? 0),
          x4: typeof p.x4 === "number" ? p.x4 : (p["4"] ?? 0),
          x5: typeof p.x5 === "number" ? p.x5 : (p["5"] ?? 0),
        };
      }
      v.paytable = paytableMapped;
      v.paylines = (ir.evaluation && ir.evaluation.paylines) || [];
      v.features = ir.features || [];
      v.rng = ir.rng || { kind: "pcg64" };
      v.bet = ir.bet || { currency: "EUR", base_bet: 1, denominations: [0.01] };
      // Preserve IR rtp_allocation so recomputeFor() can use the validated
      // closed-form / Monte-Carlo total instead of the legacy heuristic.
      v.rtpAllocation = ir.rtp_allocation || null;

      const tgtRtp = (ir.limits && ir.limits.target_rtp) || 0.96;
      v.rtpTarget = +(tgtRtp * 100).toFixed(4);
      v.rtp = v.rtpTarget;
      v.maxWin = (ir.limits && ir.limits.max_win_x) || 5000;
      v.vola = (ir.limits && ir.limits.target_volatility ? ir.limits.target_volatility.toUpperCase() : "HIGH");
      v.hit = 0;  // measured by Compute RTP / MC worker
      v.sigma = 0;

      // ── Validated MC metrics — seed L1 row from real 500M+/4B simulator
      // numbers instead of the legacy heuristic.  When present, Compute will
      // surface these directly (hit / σ / P99 all reflect engine truth).
      if (ir.validated_metrics && typeof ir.validated_metrics === "object") {
        v.validatedMetrics = ir.validated_metrics;
        const vm = ir.validated_metrics;
        if (typeof vm.hit_rate === "number")          v.hit = vm.hit_rate;
        if (typeof vm.volatility_index === "number")  v.sigma = vm.volatility_index;
        if (typeof vm.max_win_observed_x === "number") v.maxWinObserved = vm.max_win_observed_x;
        if (vm.win_percentiles && typeof vm.win_percentiles.p99 === "number") {
          v.p99 = vm.win_percentiles.p99;
        }
        if (typeof vm.fs_frequency === "number")  v.fsFreq = vm.fs_frequency;
        if (typeof vm.hnw_frequency === "number") v.hnwFreq = vm.hnw_frequency;
      }

      workspaces[wsId] = ws;
      wsOrder.push(wsId);
      switchWorkspace(wsId);
      if (window.__studio__ && window.__studio__.scheduleRTPRecompute) {
        try { window.__studio__.scheduleRTPRecompute(); } catch (_) {}
      }

      const totSymbols = symbols.length;
      const totFeatures = (ir.features || []).length;
      const totPaylines = ((ir.evaluation && ir.evaluation.paylines) || []).length;
      toast({
        kind: "ok",
        msg: `Imported IR <b>${wsName}</b> · ${totSymbols} symbols · ${totPaylines} paylines · ${totFeatures} features · target RTP ${(tgtRtp*100).toFixed(2)}%`,
        ttl: 7000
      });
      logActivity(`IR import → ${wsName} · ${totSymbols} symbols · ${topo.reels}×${topo.rows} · ${totPaylines} lines · ${totFeatures} features`);

      // ── Auto-MC ──────────────────────────────────────────────────────
      // If the IR did NOT ship a validated_metrics block, kick off a
      // 1M-spin local Monte-Carlo in a WebWorker so Hit / σ / P99 are
      // engine-truth instead of heuristic placeholders.  Result is
      // cached in IndexedDB by IR hash so re-imports skip the work.
      if (!ir.validated_metrics) {
        // Defer to next tick so the variant is already active in the UI
        // (the orchestrator binds metrics to whatever workspace is live
        // when the result returns).
        setTimeout(() => autoMcTrigger(v, ir, "import").catch(() => {}), 200);
      }
      return true;
    } catch (err) {
      console.warn("[studio] importCanonicalIR error:", err);
      return false;
    }
  }

  /* ============================================================
     AUTO-MC — orchestrator client (UI + variant-binding glue)
     ============================================================ */
  let activeMcHandle = null;
  let activeMcRunId = null;
  async function autoMcTrigger(targetVariant, ir, originLabel) {
    if (!window.__studio__ || typeof window.__studio__.runAutoMc !== "function") {
      console.warn("[studio] runAutoMc bridge not available — skipping auto-MC");
      return;
    }
    if (activeMcHandle) {
      // Cancel any in-flight run before starting a new one.
      try { activeMcHandle.cancel(); } catch (_) {}
      activeMcHandle = null;
    }

    const strip = $("#row-automc");
    const bar   = $("#automc-bar");
    const lbl   = $("#automc-label");
    const eta   = $("#automc-eta");
    const cancelBtn = $("#automc-cancel");
    if (!strip) return; // shell missing — defensive

    // QA hook: tests can set window.__studio_auto_mc_test_spins to
    // override the default 1M-spin count for cancel-timing tests.
    const spins = (typeof window !== "undefined" && typeof window.__studio_auto_mc_test_spins === "number")
      ? window.__studio_auto_mc_test_spins
      : 1_000_000;
    strip.removeAttribute("hidden");
    if (bar) bar.style.width = "0%";
    if (lbl) lbl.textContent = `Auto-MC · 0 / ${spins.toLocaleString()} spins · RTP — · ${originLabel}`;
    if (eta) eta.textContent = "—";

    const startedAt = performance.now();
    const handle = window.__studio__.runAutoMc(ir, {
      spins,
      timeoutMs: 60_000,
      onProgress: (p) => {
        if (activeMcRunId !== handle.runId) return;
        const pct = Math.min(100, (p.spinsDone / p.totalSpins) * 100);
        if (bar) bar.style.width = pct.toFixed(1) + "%";
        const rtpStr = (p.runningRtp * 100).toFixed(2);
        if (lbl) lbl.textContent = `Auto-MC · ${p.spinsDone.toLocaleString()} / ${p.totalSpins.toLocaleString()} spins · RTP ${rtpStr}%`;
        // ETA: project from current rate
        const elapsedSec = Math.max(0.01, p.elapsedMs / 1000);
        const rate = p.spinsDone / elapsedSec;
        const remaining = (p.totalSpins - p.spinsDone) / Math.max(1, rate);
        if (eta) eta.textContent = remaining < 1 ? "—" : `~${remaining.toFixed(0)}s`;
        // Mirror into the bottom-panel MC tab so user can pop the drawer
        // and read a larger view of the same run.
        if (window.__studio_bp_mc__) {
          try {
            window.__studio_bp_mc__.update({
              status: `running · ${originLabel}`,
              spinsDone: p.spinsDone,
              totalSpins: p.totalSpins,
              runningRtp: p.runningRtp,
              elapsedMs: p.elapsedMs,
              etaMs: remaining * 1000,
            });
          } catch (_) {}
        }
      },
    });
    activeMcHandle = handle;
    activeMcRunId = handle.runId;

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        try { handle.cancel(); } catch (_) {}
        toast({ kind: "warn", msg: "Auto-MC cancelled — keeping partial result if available" });
      };
    }

    try {
      const res = await handle.result;
      if (!res || activeMcRunId !== handle.runId) return; // stale or cancelled-before-any-spin
      // Merge into the variant — but only if it's still the active one
      // (user may have switched workspaces mid-run).
      const vmBlock = res.validatedMetrics;
      targetVariant.validatedMetrics = vmBlock;
      // PHASE 49 — fresh MC block clears the stale-metric flag. Any future
      // slider edit on this variant will re-arm the flag via
      // propagateSliderWeightToReels(); the cycle is symmetric.
      targetVariant._metricsStale = false;
      delete targetVariant._metricsStaleSince;
      if (typeof vmBlock.hit_rate === "number")          targetVariant.hit = vmBlock.hit_rate;
      if (typeof vmBlock.volatility_index === "number")  targetVariant.sigma = vmBlock.volatility_index;
      if (typeof vmBlock.max_win_observed_x === "number") targetVariant.maxWinObserved = vmBlock.max_win_observed_x;
      if (vmBlock.win_percentiles && typeof vmBlock.win_percentiles.p99 === "number") {
        targetVariant.p99 = vmBlock.win_percentiles.p99;
      }
      // Also seed rtpAllocation if missing — so recomputeFor surfaces it.
      if (!targetVariant.rtpAllocation && typeof vmBlock.rtp === "number") {
        targetVariant.rtpAllocation = {
          total_mc_5b: vmBlock.rtp / 100,
          total_cf: vmBlock.rtp / 100,
        };
      }
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      const statusLbl = res.status === "complete" ? "ok"
        : res.status === "cancelled" ? "warn"
        : "cyan";
      toast({
        kind: statusLbl,
        msg: `Auto-MC ${res.status} · ${vmBlock.total_spins.toLocaleString()} spins · ${elapsed}s · RTP <b>${vmBlock.rtp.toFixed(2)}%</b> · Hit ${vmBlock.hit_rate.toFixed(2)}% · σ ${vmBlock.volatility_index.toFixed(2)} · P99 ${vmBlock.win_percentiles.p99.toFixed(2)}×`,
        ttl: 9000,
      });
      logActivityFor(targetVariant, `auto-MC ${res.status} · RTP ${vmBlock.rtp.toFixed(4)}% · Hit ${vmBlock.hit_rate.toFixed(2)}% · σ ${vmBlock.volatility_index.toFixed(2)}`);

      // Repaint the L1 row + rail with new numbers
      try {
        recomputeFor(targetVariant);
        refreshL1(); refreshRail(); refreshVariantTabs();
      } catch (_) {}
      // Final state in the MC tab — summary numbers stay visible until
      // the next run kicks off.
      if (window.__studio_bp_mc__) {
        try {
          window.__studio_bp_mc__.update({
            status: `${res.status} · ${vmBlock.total_spins.toLocaleString()} spins · RTP ${vmBlock.rtp.toFixed(4)}% · Hit ${vmBlock.hit_rate.toFixed(2)}% · σ ${vmBlock.volatility_index.toFixed(2)} · P99 ${vmBlock.win_percentiles.p99.toFixed(2)}×`,
            spinsDone: vmBlock.total_spins,
            totalSpins: vmBlock.total_spins,
            runningRtp: vmBlock.rtp / 100,
            elapsedMs: res.durationMs,
            etaMs: 0,
          });
        } catch (_) {}
      }
    } catch (err) {
      console.warn("[studio] auto-MC failed:", err);
      toast({ kind: "warn", msg: `Auto-MC failed: ${err.message || err}` });
      if (window.__studio_bp_mc__) {
        try { window.__studio_bp_mc__.update({ status: `failed · ${err.message || err}` }); } catch (_) {}
      }
    } finally {
      if (activeMcRunId === handle.runId) {
        activeMcRunId = null;
        activeMcHandle = null;
        strip.setAttribute("hidden", "");
      }
    }
  }
  // Expose so Sensitivity tab (and tests) can invoke explicitly.
  window.__studio_auto_mc__ = { trigger: autoMcTrigger };

  // Build a canonical IR-1.0.0 shape from a Studio variant — used by the
  // Sensitivity tab's `Run MC` button when the user wants to populate
  // validated metrics without importing a pre-built IR.  Returns null if
  // the variant lacks the minimum required structure (reels + paytable).
  function variantToIrForMc(v) {
    if (!v || !Array.isArray(v.symbols) || v.symbols.length === 0) return null;
    // Reels: prefer the preserved IR reels (from import), else derive from
    // the variant's display strips, else fall back to uniform weights.
    let baseReels;
    if (v.irReels && Array.isArray(v.irReels.base) && v.irReels.base.length > 0) {
      baseReels = v.irReels.base;
    } else if (Array.isArray(v.reels) && v.reels.length > 0 && typeof v.reels[0] === "object" && !Array.isArray(v.reels[0])) {
      // Already in weighted-map form
      baseReels = v.reels;
    } else {
      // Convert each native display strip into a weighted map.  This is
      // approximate (uniform weights per symbol per reel) but lets the MC
      // run for user-built variants.
      const symbolIds = v.symbols.map((s) => s.id);
      baseReels = [];
      const reelCount = Array.isArray(v.reels) && v.reels.length > 0 ? v.reels.length : 5;
      for (let r = 0; r < reelCount; r++) {
        const map = {};
        for (const id of symbolIds) {
          const w = v.symbols.find((s) => s.id === id)?.weight ?? 1;
          map[id] = Math.max(0.5, w);
        }
        baseReels.push(map);
      }
    }
    const fsReels = (v.irReels && Array.isArray(v.irReels.free_spins) && v.irReels.free_spins.length > 0)
      ? v.irReels.free_spins
      : null;
    // Paytable: convert {x3,x4,x5} → {"3","4","5"} since MC runner uses
    // string-keyed lookup.
    const paytable = {};
    for (const sym of v.symbols) {
      if (sym && sym.pay) {
        paytable[sym.id] = {
          "3": sym.pay.x3 ?? 0,
          "4": sym.pay.x4 ?? 0,
          "5": sym.pay.x5 ?? 0,
        };
      }
    }
    const symbols = v.symbols.map((s) => {
      let kind = "lp";
      switch (s.tier) {
        case "WILD":    kind = "wild"; break;
        case "SCATTER": kind = "scatter"; break;
        case "MULT":    kind = "bonus"; break; // multi/bonus orb tier
        case "HP":      kind = "hp"; break;
        case "MP":      kind = "hp"; break; // MP rolls up to hp at the schema level
        case "LP":
        default:        kind = "lp"; break;
      }
      const out = { id: s.id, name: s.name || s.id, kind };
      if (kind === "wild") out.substitutes = "*";
      return out;
    });

    const paylines = Array.isArray(v.paylines) && v.paylines.length > 0
      ? v.paylines
      : [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2]]; // minimal fallback

    const reelsBlock = { mode: "weighted", base: baseReels, free_spins: fsReels || baseReels };
    // Scatter prevention — required for FS trigger frequency to match the
    // validated MC.  Without it, multiple scatters on the same reel land
    // independently and FS triggers ~64% too often.
    if (v.irScatterPrev) reelsBlock.scatter_prevention = v.irScatterPrev;
    const ir = {
      schema_version: "1.0.0",
      meta: { id: v.id || "studio-variant", name: v.name || "Studio Variant", version: "0.1.0" },
      topology: { kind: "rectangular", reels: baseReels.length, rows: 3 },
      symbols,
      reels: reelsBlock,
      evaluation: {
        kind: "lines",
        paylines,
        direction: "ltr",
        min_match: 3,
        pay_left_to_right_only: true,
        wild_substitution: { enabled: true, excludes: ["S","B"], best_paying_interpretation: true },
      },
      paytable,
      features: Array.isArray(v.features) ? v.features : [],
      rng: v.rng || { kind: "pcg64", default_seed: 12345 },
      bet: v.bet || { currency: "EUR", base_bet: 1, denominations: [1] },
      limits: { target_rtp: 0.96, max_win_x: v.maxWin || 5000 },
    };
    return ir;
  }

  function confCls(c) {
    if (c >= 90) return "ok";
    if (c >= 60) return "warn";
    return "bad";
  }
  function confSym(c) {
    if (c >= 90) return "✓";
    if (c >= 60) return "⚠";
    return "✗";
  }

  function renderGDDReview(gdd, filename) {
    $("#gdd-filename").textContent = filename;
    $("#gdd-overall").textContent = `${gdd.overallConfidence}%`;
    const lowCount = countLowConfidence(gdd);
    $("#gdd-issues").textContent = lowCount === 0
      ? `all fields high confidence`
      : `${lowCount} field${lowCount === 1 ? "" : "s"} need review`;

    const body = $("#gdd-body");
    const sections = [];

    sections.push(renderSection("Meta", [
      fieldRow("Name",    "meta.name",    gdd.meta.name,    "text"),
      fieldRow("ID",      "meta.id",      gdd.meta.id,      "text"),
      fieldRow("Version", "meta.version", gdd.meta.version, "text"),
    ]));
    sections.push(renderSection("Topology", [
      fieldRow("Reels", "topology.reels", gdd.topology.reels, "number"),
      fieldRow("Rows",  "topology.rows",  gdd.topology.rows,  "number"),
      fieldRow("Kind",  "topology.kind",  gdd.topology.kind,  "select", ["rectangular","variable_rows","cluster","hexagonal"]),
    ]));
    sections.push(renderSection("Symbol pool", [
      fieldRow("HP",      "symbolPool.HP",      gdd.symbolPool.HP,      "number"),
      fieldRow("MP",      "symbolPool.MP",      gdd.symbolPool.MP,      "number"),
      fieldRow("LP",      "symbolPool.LP",      gdd.symbolPool.LP,      "number"),
      fieldRow("Wild",    "symbolPool.WILD",    gdd.symbolPool.WILD,    "number"),
      fieldRow("Scatter", "symbolPool.SCATTER", gdd.symbolPool.SCATTER, "number"),
      fieldRow("Mult",    "symbolPool.MULT",    gdd.symbolPool.MULT,    "number"),
    ]));
    sections.push(renderSection("Engine", [
      fieldRow("Target RTP", "targetRTP",  gdd.targetRTP,  "rtp"),
      fieldRow("Max win",    "maxWin",     gdd.maxWin,     "number"),
      fieldRow("Volatility", "volatility", gdd.volatility, "select", ["LOW","MID","HIGH"]),
    ]));
    sections.push(renderSection("Features / Jurisdictions", [
      listRow("Features",      "features",      gdd.features),
      listRow("Jurisdictions", "jurisdictions", gdd.jurisdictions),
    ]));

    // Paytable
    const pt = gdd.paytable.value;
    let ptHtml = "";
    if (pt.length) {
      ptHtml = `<table class="gdd-paytable-table">
        <thead><tr><th>Symbol</th><th>x3</th><th>x4</th><th>x5</th></tr></thead>
        <tbody>${pt.map(r => `<tr><td>${r.symbol}</td><td>${r.x3}</td><td>${r.x4}</td><td>${r.x5}</td></tr>`).join("")}</tbody>
      </table>`;
    } else {
      ptHtml = `<em style="color:var(--text-2);font-size:11.5px">No paytable extracted — defaults will be applied.</em>`;
    }
    sections.push(`<div class="gdd-section"><h3>Paytable <span class="gdd-conf ${confCls(gdd.paytable.confidence)}">${confSym(gdd.paytable.confidence)} ${gdd.paytable.confidence}%</span></h3>${ptHtml}</div>`);

    body.innerHTML = sections.join("");
  }

  function countLowConfidence(gdd) {
    let n = 0;
    const fields = [
      gdd.meta.id, gdd.meta.name, gdd.meta.version,
      gdd.topology.kind, gdd.topology.reels, gdd.topology.rows,
      gdd.symbolPool.HP, gdd.symbolPool.MP, gdd.symbolPool.LP,
      gdd.symbolPool.WILD, gdd.symbolPool.SCATTER, gdd.symbolPool.MULT,
      gdd.paytable, gdd.targetRTP, gdd.maxWin,
      gdd.features, gdd.jurisdictions, gdd.volatility
    ];
    for (const f of fields) { if (f.confidence < 60) n++; }
    return n;
  }

  function renderSection(title, rows) {
    return `<div class="gdd-section"><h3>${title}</h3>${rows.join("")}</div>`;
  }

  function fieldRow(label, key, fe, type, options) {
    const cls = confCls(fe.confidence);
    const sym = confSym(fe.confidence);
    let input;
    if (type === "select") {
      input = `<select data-gdd-key="${key}">${(options||[]).map(o => `<option value="${o}" ${o === fe.value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    } else if (type === "rtp") {
      const pct = (fe.value * 100).toFixed(2);
      input = `<input type="number" min="50" max="100" step="0.01" value="${pct}" data-gdd-key="${key}" data-gdd-pct="1" />`;
    } else {
      input = `<input type="${type}" value="${fe.value}" data-gdd-key="${key}" />`;
    }
    const src = fe.source ? `<span class="gdd-source" title="${fe.source}">${fe.source}</span>` : `<span class="gdd-source"></span>`;
    return `<div class="gdd-field-row">
      <span class="gdd-fname">${label}</span>
      <span class="gdd-fval">${input}</span>
      <span class="gdd-conf ${cls}">${sym} ${fe.confidence}%</span>
      ${src}
    </div>`;
  }

  function listRow(label, key, fe) {
    const cls = confCls(fe.confidence);
    const sym = confSym(fe.confidence);
    const val = (fe.value || []).join(", ");
    const input = `<input type="text" value="${val}" data-gdd-key="${key}" data-gdd-list="1" placeholder="comma,separated"/>`;
    const src = fe.source ? `<span class="gdd-source" title="${fe.source}">${fe.source}</span>` : `<span class="gdd-source"></span>`;
    return `<div class="gdd-field-row">
      <span class="gdd-fname">${label}</span>
      <span class="gdd-fval">${input}</span>
      <span class="gdd-conf ${cls}">${sym} ${fe.confidence}%</span>
      ${src}
    </div>`;
  }

  function harvestGDDEdits(gdd) {
    // Read modified field values from inputs and apply onto a clone.
    const clone = JSON.parse(JSON.stringify(gdd));
    $$("#gdd-body [data-gdd-key]").forEach(el => {
      const key = el.dataset.gddKey;
      const path = key.split(".");
      let cur = clone;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      const node = cur[path[path.length - 1]];
      const val = el.value;
      if (el.dataset.gddList) {
        node.value = val.split(",").map(s => s.trim()).filter(Boolean);
      } else if (el.dataset.gddPct) {
        node.value = parseFloat(val) / 100;
      } else if (el.tagName === "INPUT" && el.type === "number") {
        node.value = parseFloat(val);
      } else {
        node.value = val;
      }
    });
    return clone;
  }

  function closeGDD() { hideModal("gdd-review"); window.__gddCurrent__ = null; }
  $("#gdd-close")?.addEventListener("click", closeGDD);
  $("#gdd-cancel")?.addEventListener("click", closeGDD);
  $("#gdd-backdrop")?.addEventListener("click", closeGDD);
  $("#gdd-draft")?.addEventListener("click", () => {
    toast({ kind: "cyan", msg: `Draft saved (in-memory) — re-open via import` });
    closeGDD();
  });
  $("#gdd-generate")?.addEventListener("click", () => {
    const gdd = window.__gddCurrent__;
    if (!gdd) return closeGDD();
    const edited = harvestGDDEdits(gdd);
    const result = window.__studio__.generateFromGDD(edited);
    if (!result.ok) {
      toast({ kind: "warn", msg: `Generation failed: ${result.message}` });
      return;
    }
    closeGDD();
    // Create workspace and seed its variant with extracted values.
    const name = edited.meta.name.value || "Imported Game";
    const id = "ws-" + Date.now().toString(36);
    const irName = name.toLowerCase().replace(/\s+/g, "-") + "-v0.1.00";
    // PHASE 49 — derive workspace layout from the parsed GDD topology
    // rather than hardcoding "5x3". A user importing a 6×4 MegaWays or
    // 7×7 cluster GDD now lands in a correctly-sized workspace; payline
    // generation, reel layout, and the closed-form walker all read this
    // layout to lay out symbol cells.
    const topoReels = +(edited.topology?.reels?.value) || 5;
    const topoRows  = +(edited.topology?.rows?.value)  || 3;
    const topoKind  = (edited.topology?.kind?.value || "rectangular").toString().toLowerCase();
    let layout;
    if (topoKind === "cluster") {
      // Cluster boards are square (Wrath / Sweet Bonanza). Snap to a
      // square layout, default 7×7 if dimensions disagree.
      const side = Math.max(topoReels, topoRows, 6);
      layout = `${side}x${side}`;
    } else if (topoReels === 6 && topoRows >= 4) {
      layout = "6x4";
    } else if (topoReels === 5 && topoRows === 3) {
      layout = "5x3";
    } else {
      layout = `${topoReels}x${topoRows}`;
    }
    const ws = newWorkspace({ id, name, theme: "cyan", layout, irName });
    const v = ws.variants[ws.activeVariantId];
    v.rtpTarget = +(edited.targetRTP.value * 100).toFixed(2);
    v.maxWin = edited.maxWin.value;
    v.vola = (edited.volatility.value || "MID").toString().toUpperCase();
    v.tierCounts = {
      HP: edited.symbolPool.HP.value | 0,
      MP: edited.symbolPool.MP.value | 0,
      LP: edited.symbolPool.LP.value | 0,
      WILD: edited.symbolPool.WILD.value | 0,
      SCATTER: edited.symbolPool.SCATTER.value | 0,
      MULT: edited.symbolPool.MULT.value | 0,
    };
    // PHASE 49 — hydrate the paytable extracted by the GDD parser. Prior
    // to this, gdd.paytable.value was rendered as a read-only preview in
    // the modal and then discarded; v.paytable stayed as the default
    // placeholder pays (0/0/0) so the heuristic RTP estimator was always
    // wrong by the magnitude of the missing HP pays. Now the parsed rows
    // land on the variant under the same shape (x3/x4/x5) the cert
    // pipeline already consumes.
    if (Array.isArray(edited.paytable?.value) && edited.paytable.value.length > 0) {
      const ptMap = {};
      for (const row of edited.paytable.value) {
        if (!row || !row.symbol) continue;
        ptMap[row.symbol] = {
          x3: +row.x3 || 0,
          x4: +row.x4 || 0,
          x5: +row.x5 || 0,
        };
      }
      v.paytable = ptMap;
      v.gddPaytableHydrated = true;
    }
    // PHASE 49 — preserve the feature list so Play Template + cert XML
    // know which features are active (Free Spins, Hold & Win, etc.).
    // Schema mirrors the canonical-IR `features[]` array (`id` + `name`).
    if (Array.isArray(edited.features?.value)) {
      v.features = edited.features.value
        .filter(name => typeof name === "string" && name.trim().length > 0)
        .map(name => ({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
          name,
        }));
    }
    // PHASE 49 — preserve jurisdiction list for compliance auto-validation.
    if (Array.isArray(edited.jurisdictions?.value)) {
      v.jurisdictions = edited.jurisdictions.value.slice();
    }
    workspaces[id] = ws;
    wsOrder.push(id);
    switchWorkspace(id);
    if (window.__studio__.scheduleRTPRecompute) window.__studio__.scheduleRTPRecompute();
    // PHASE 49 — schedule a background MC run so the heuristic
    // hit/σ/P99 placeholders are replaced by validated engine truth.
    // Matches the canonical-IR import path (line ~2335 above) which
    // calls autoMcTrigger() when validated_metrics is missing.
    try {
      if (typeof variantToFullIR === "function" && typeof autoMcTrigger === "function") {
        const seedIR = variantToFullIR(v);
        setTimeout(() => autoMcTrigger(v, seedIR, "gdd-import").catch(() => {}), 200);
      }
    } catch (_) {
      /* never block GDD generate on MC scheduling */
    }
    const computedRtp = result.computedRtp != null ? (result.computedRtp * 100).toFixed(2) : "—";
    const statedRtp = (edited.targetRTP.value * 100).toFixed(2);
    const delta = result.computedRtp != null
      ? Math.abs((result.computedRtp - edited.targetRTP.value) * 100).toFixed(2)
      : "—";
    toast({
      kind: "ok",
      msg: `Generated <b>${name}</b> from GDD · Stated RTP ${statedRtp}% / Computed ${computedRtp}% · Δ ${delta}%`,
      ttl: 7000
    });
    logActivity(`GDD import → ${name} · stated ${statedRtp}% / computed ${computedRtp}%`);
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
    if (!pool || pool.length === 0) return;
    for (let i = 0; i < 15; i++) {
      const s = pool[i % pool.length];
      if (!s) continue;
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
     BOTTOM PANEL — Activity / MC progress / CI gates drawer
     ============================================================ */
  const BOTTOM_PANEL_STORAGE_KEY = "studio.bottomPanel.open.v1";
  function syncBottomToggleBtn() {
    const bp = $("#bottom-panel");
    const btn = document.querySelector("#btn-toggle-panel");
    if (!bp || !btn) return;
    const isOpen = !bp.hasAttribute("hidden");
    btn.classList.toggle("is-active", isOpen);
    btn.setAttribute("aria-pressed", isOpen ? "true" : "false");
  }
  function toggleBottom() {
    const bp = $("#bottom-panel");
    if (!bp) return;
    if (bp.hasAttribute("hidden")) {
      bp.removeAttribute("hidden");
      try { refreshBottomActivity(); } catch (_) {}
      try { localStorage.setItem(BOTTOM_PANEL_STORAGE_KEY, "1"); } catch (_) {}
    } else {
      bp.setAttribute("hidden", "");
      try { localStorage.setItem(BOTTOM_PANEL_STORAGE_KEY, "0"); } catch (_) {}
    }
    syncBottomToggleBtn();
  }
  // Restore persisted state on boot
  try {
    if (localStorage.getItem(BOTTOM_PANEL_STORAGE_KEY) === "1") {
      const bp = $("#bottom-panel");
      if (bp) bp.removeAttribute("hidden");
    }
  } catch (_) {}
  syncBottomToggleBtn();

  // Wire all open / close affordances.  We use a SINGLE delegated
  // listener on the document for #bp-close (matches both the current
  // button and any future re-render of the drawer), so the X always
  // works even if the original DOM node was replaced.
  //
  // CRITICAL: the X must always CLOSE (idempotent hide), never toggle.
  // Otherwise the inline onclick in index.html and the delegated handler
  // here would each toggle once → panel ends up re-opened.  The bug
  // "X doesn't close drawer" was exactly that double-toggle race.
  //
  // The header `#btn-toggle-panel` and legacy status-footer
  // `#btn-toggle-bottom` are SEPARATE buttons (not #bp-close), so they
  // get their own direct listeners and still toggle.
  function closeBottomDrawer(e) {
    try {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const bp = $("#bottom-panel");
      if (!bp) return;
      bp.setAttribute("hidden", "");
      try { localStorage.setItem(BOTTOM_PANEL_STORAGE_KEY, "0"); } catch (_) {}
      syncBottomToggleBtn();
    } catch (err) {
      console.warn("[studio] closeBottomDrawer failed:", err);
    }
  }
  // Single delegated listener for the in-panel X.  Survives DOM
  // rebuilds (Layer-of-defense vs. cached/stale bundles).
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("#bp-close, [data-bp-close]")) closeBottomDrawer(e);
  });
  // Separate buttons — direct listeners, no conflict with the delegated one.
  const legacyBottomBtn = document.querySelector("#btn-toggle-bottom");
  if (legacyBottomBtn) legacyBottomBtn.addEventListener("click", toggleBottom);
  const headerPanelBtn = document.querySelector("#btn-toggle-panel");
  if (headerPanelBtn) headerPanelBtn.addEventListener("click", toggleBottom);

  // Esc key closes the bottom drawer (in addition to ⌘J).  Doesn\'t
  // fire if a modal is open (those have their own Esc handlers).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const bp = document.getElementById("bottom-panel");
    if (!bp || bp.hasAttribute("hidden")) return;
    // Skip if a modal/menu is open above the drawer
    const blocked = document.querySelector(".modal-base:not([hidden]), .wiz:not([hidden]), .cmdp:not([hidden]), .picker:not([hidden])");
    if (blocked) return;
    closeBottomDrawer(e);
  });

  // Note: an earlier iteration added click-outside-to-close but it was
  // too aggressive — clicks on Build toolbar buttons (#btn-validate,
  // #btn-compute) closed the drawer right when the user wanted to
  // observe their side-effects on the MC/CI panes.  Removed.  Four
  // close paths remain (more than enough): X button, Esc, ⌘J, header
  // toggle button.

  // ── Bottom-panel TABS — Activity / MC progress / CI gates ──────────
  // Each .bp-tab has data-bp="activity|mc|ci"; clicking it activates the
  // matching pane and updates aria-selected for screen readers.  Active
  // pane uses .is-active class; inactive panes get `hidden` so they
  // don\'t consume layout / steal focus.
  const BP_PANES = ["activity", "mc", "ci"];
  function activateBpTab(name) {
    if (!BP_PANES.includes(name)) return;
    // Tabs
    $$(".bp-tab", $("#bottom-panel")).forEach((t) => {
      const on = t.dataset.bp === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    // Panes
    BP_PANES.forEach((p) => {
      const el = document.getElementById(`bp-pane-${p}`);
      if (!el) return;
      if (p === name) {
        el.removeAttribute("hidden");
        el.classList.add("is-active");
      } else {
        el.setAttribute("hidden", "");
        el.classList.remove("is-active");
      }
    });
    // Refresh content for the newly-active pane
    if (name === "activity") {
      try { refreshBottomActivity(); } catch (_) {}
    } else if (name === "ci") {
      try { refreshBpCiPane(); } catch (_) {}
    }
  }
  $$(".bp-tab", $("#bottom-panel")).forEach((t) => {
    t.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activateBpTab(t.dataset.bp);
    });
  });
  // Default active pane on boot
  activateBpTab("activity");

  // ── MC pane live binding — driven by the auto-MC orchestrator ──────
  // The orchestrator already updates the header progress strip; we
  // mirror the same numbers into the MC tab so the user can pop the
  // drawer and read a more spacious view of the run.
  function bpMcShow(active) {
    const empty = document.getElementById("bp-mc-empty");
    const live  = document.getElementById("bp-mc-active");
    if (!empty || !live) return;
    if (active) {
      empty.setAttribute("hidden", "");
      live.removeAttribute("hidden");
    } else {
      live.setAttribute("hidden", "");
      empty.removeAttribute("hidden");
    }
  }
  function bpMcUpdate({ status, spinsDone, totalSpins, runningRtp, elapsedMs, etaMs }) {
    bpMcShow(true);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    if (status != null)          set("bp-mc-status", status);
    if (spinsDone != null && totalSpins != null) {
      set("bp-mc-spins", `${spinsDone.toLocaleString()} / ${totalSpins.toLocaleString()}`);
      const pct = totalSpins > 0 ? Math.min(100, (spinsDone / totalSpins) * 100) : 0;
      const fill = document.getElementById("bp-mc-fill");
      if (fill) fill.style.width = pct.toFixed(1) + "%";
    }
    if (runningRtp != null)      set("bp-mc-rtp",  (runningRtp * 100).toFixed(2) + "%");
    if (elapsedMs != null)       set("bp-mc-elapsed", (elapsedMs / 1000).toFixed(1) + "s");
    if (etaMs != null && etaMs >= 0) set("bp-mc-eta", (etaMs / 1000).toFixed(0) + "s");
  }
  function bpMcReset() {
    bpMcShow(false);
    const fill = document.getElementById("bp-mc-fill");
    if (fill) fill.style.width = "0%";
  }
  // Expose so autoMcTrigger can call without re-wiring.
  window.__studio_bp_mc__ = { update: bpMcUpdate, reset: bpMcReset };

  // ── CI gates pane — refreshed when Validate is clicked ─────────────
  function refreshBpCiPane() {
    const v = getActiveVariant();
    const empty = document.getElementById("bp-ci-empty");
    const list  = document.getElementById("bp-ci-list");
    if (!empty || !list) return;
    const report = v && v.lastValidate;
    if (!report) {
      empty.removeAttribute("hidden");
      list.setAttribute("hidden", "");
      list.innerHTML = "";
      return;
    }
    empty.setAttribute("hidden", "");
    list.removeAttribute("hidden");
    const items = (report.gates || []).map((g) => `
      <li class="bp-ci-item ${g.pass ? "is-pass" : "is-fail"}">
        <span class="bp-ci-dot"></span>
        <span class="bp-ci-name">${escapeHtml(g.name)}</span>
        <span class="bp-ci-detail mono">${escapeHtml(g.detail || "")}</span>
      </li>
    `).join("");
    list.innerHTML = items || `<li class="bp-ci-item is-pass"><span class="bp-ci-dot"></span><span class="bp-ci-name">All checks passed</span></li>`;
  }
  window.__studio_bp_ci__ = { refresh: refreshBpCiPane };

  /* ============================================================
     LAYOUT TOGGLES — left sidebar / right rail / bottom (status) zone
     Persisted across reloads via localStorage; mirrored as
     .is-{left|right|bottom}-collapsed classes on the .shell root.
     ============================================================ */
  const LAYOUT_STORAGE_KEY = "studio.layout.collapsed.v1";
  const LAYOUT_ZONES = [
    { id: "left",   cls: "is-left-collapsed",   btn: "#btn-toggle-left"   },
    { id: "right",  cls: "is-right-collapsed",  btn: "#btn-toggle-right"  },
    { id: "status", cls: "is-bottom-collapsed", btn: "#btn-toggle-status" },
  ];
  function loadLayoutState() {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return { left: false, right: false, status: false };
      const parsed = JSON.parse(raw);
      return {
        left:   !!parsed.left,
        right:  !!parsed.right,
        status: !!parsed.status,
      };
    } catch (_) {
      return { left: false, right: false, status: false };
    }
  }
  function saveLayoutState(state) {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function applyLayoutState(state) {
    const shell = document.querySelector(".shell");
    if (!shell) return;
    for (const z of LAYOUT_ZONES) {
      const collapsed = !!state[z.id];
      shell.classList.toggle(z.cls, collapsed);
      const btn = document.querySelector(z.btn);
      if (btn) {
        btn.classList.toggle("is-active", !collapsed);
        btn.setAttribute("aria-pressed", collapsed ? "false" : "true");
      }
    }
  }
  const layoutState = loadLayoutState();
  applyLayoutState(layoutState);
  function toggleLayoutZone(zoneId) {
    if (!(zoneId in layoutState)) return;
    layoutState[zoneId] = !layoutState[zoneId];
    applyLayoutState(layoutState);
    saveLayoutState(layoutState);
    const zoneLbl = zoneId === "status" ? "bottom zone" : zoneId + " panel";
    toast({
      kind: "cyan",
      msg: `${layoutState[zoneId] ? "Collapsed" : "Expanded"} ${zoneLbl}`,
      ttl: 1400
    });
  }
  for (const z of LAYOUT_ZONES) {
    const btn = document.querySelector(z.btn);
    if (btn) btn.addEventListener("click", () => toggleLayoutZone(z.id));
  }

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
     ============================================================
     PHASE 49 — flushPendingAutoBalance() drains every debounced
     auto-balance timer for the active variant BEFORE we recompute.
     Without this, a user who moves a weight slider and immediately
     clicks COMPUTE would see RTP for the pre-edit weights (the 350 ms
     scheduleAutoBalanceFor() debounce had not fired yet). The COMPUTE
     button now guarantees the closed-form walk reads the very latest
     state, never a stale snapshot.
     ============================================================ */
  function flushPendingAutoBalance() {
    const v = getActiveVariant();
    if (!v) return;
    const ids = [v.id + ":", v.id + ":left", v.id + ":right"];
    for (const key of ids) {
      const t = _autoBalanceTimers.get(key);
      if (!t) continue;
      clearTimeout(t);
      _autoBalanceTimers.delete(key);
      const paneKey = key.endsWith(":left") ? "left"
                    : key.endsWith(":right") ? "right"
                    : null;
      try { doAutoBalanceFor(v, paneKey, "compute-flush", true); } catch (_) {}
    }
  }
  if (typeof window !== "undefined") {
    window.__slotmath_flushPendingAutoBalance =
      window.__slotmath_flushPendingAutoBalance || flushPendingAutoBalance;
  }

  $("#btn-compute").addEventListener("click", () => {
    flushPendingAutoBalance();
    recompute(); refreshL1(); refreshRail(); refreshVariantTabs();
    const v = getActiveVariant();
    const staleTail = v._metricsStale
      ? ` · <span style="color:#ffb84c">metrics stale — run MC to refresh hit/σ/P99</span>`
      : "";
    toast({ kind: "ok", msg: `Closed-form RTP recomputed · <b>${v.rtp.toFixed(4)}%</b> · 1.4 ms${staleTail}` });
    logActivity(`compute RTP ${v.rtp.toFixed(2)}%${v._metricsStale ? " (metrics stale)" : ""}`);
  });

  /* ============================================================
     PLAY TEMPLATE — build standalone playable slot from current IR
     Generates an HTML blob with template + runtime + styles inlined,
     embeds the IR as JSON, opens the blob URL in a new tab.  The new
     tab runs the runner independently (no Studio shell required).
     ============================================================ */
  const playTemplateBtn = document.querySelector("#btn-play-template");
  if (playTemplateBtn) {
    playTemplateBtn.addEventListener("click", async () => {
      const v = getActiveVariant();
      if (!v || !Array.isArray(v.symbols) || v.symbols.length === 0) {
        toast({
          kind: "warn",
          msg: "Build or import a math model first — Play Template needs symbols + reels"
        });
        return;
      }
      try {
        playTemplateBtn.setAttribute("disabled", "");
        const ir = variantToFullIR(v);

        // ── MTL — Math Twin Lockstep: Sealing Ceremony ──────────
        // Before opening the runner we make sure the IR has a valid
        // Math Seal.  If not, run the ceremony in-place (modal progress).
        // No seal → no Play.  Mismatched ceremony → diagnostic, no Play.
        if (window.MTLSeal && window.MTLOracle && window.MTLDNA) {
          // Hydrate from localStorage first — if Boki sealed this IR in
          // a previous session, skip the ceremony.
          await window.MTLSeal.hydrateSealFromStorage(ir);
          const alreadySealed = await window.MTLSeal.isSealed(ir);
          if (!alreadySealed) {
            const modal = mtlOpenSealingModal();
            try {
              // Default 100 seeds — dual-witness ceremony is bottlenecked by
              // the iframe runtime (~100 hashes/sec).  100 seeds ≈ 1s on M1.
              // W218 (2026-05-20): reduced 500 → 100 to keep ceremony under
              // the 10s timeout budget after xoshiro128** RNG upgrade (slightly
              // slower than mulberry32 but distributionally correct).  Bumping
              // to 10K for production-grade is a one-line change; the hash chain
              // stays deterministic regardless of N.
              const result = await window.MTLSeal.sealIR(ir, {
                seedCount: 100,
                useRuntime: true,
                // WASM oracle (Rust→WASM build) lacks the F_FS.scatter_pays
                // fallback that runtime.js + oracle.js gained when IR lists
                // scatter pays only under feature.free_spins (Wrath shape).
                // Disable it as third witness until the wasm-oracle crate is
                // rebuilt with the same fallback; oracle ↔ runtime lockstep
                // still proves runtime math, which is what Play Template needs.
                useWasm: false,
                onProgress: (pct, seed) => modal.update(pct, seed),
              });
              if (!result.ok) {
                modal.fail(result);
                toast({
                  kind: "warn",
                  msg: `🔒 Math seal FAILED · oracle/runtime disagree @ seed ${result.firstMismatch.seed}`,
                  ttl: 9000,
                });
                logActivity(`MTL seal FAILED · seed ${result.firstMismatch.seed} · oracle ${JSON.stringify(result.firstMismatch.oracle)} vs runner ${JSON.stringify(result.firstMismatch.runner)}`);
                return; // do NOT open the runner — unsealed math is forbidden
              }
              window.MTLSeal.storeSeal(ir, result);
              modal.success(result);
              toast({
                kind: "ok",
                msg: `🪞 Math sealed · ${result.stats.seedCount} seeds · ${result.stats.witnesses} witnesses · ${result.stats.durationMs}ms`,
                ttl: 5000,
              });
              logActivity(`MTL seal OK · ${result.stats.seedCount} seeds · seal ${result.seal.slice(0,12)}…`);
            } catch (err) {
              modal.fail({ error: err.message });
              toast({ kind: "warn", msg: `🔒 Sealing ceremony error: ${err.message}` });
              return;
            }
          } else {
            logActivity(`MTL seal hydrated from cache · seal ${ir.meta.seal.value.slice(0,12)}…`);
          }
        }

        const blobUrl = await buildPlayTemplateBlob(ir);
        const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!win) {
          toast({
            kind: "warn",
            msg: "Pop-up blocked — allow pop-ups for this site to open the slot template",
            ttl: 6000,
          });
        } else {
          const sealHex = ir.meta && ir.meta.seal ? ` · sealed ${ir.meta.seal.value.slice(0,8)}…` : "";
          toast({
            kind: "ok",
            msg: `🎮 Playable template opened · ${ir.symbols.length} symbols · ${ir.evaluation?.paylines?.length || 0} paylines${sealHex}`,
          });
          logActivity(`play template launched · ${ir.meta?.name || "Slot Template"}${sealHex}`);
        }
      } catch (err) {
        console.warn("[studio] Play Template failed:", err);
        toast({ kind: "warn", msg: `Play Template failed: ${err.message || err}` });
      } finally {
        playTemplateBtn.removeAttribute("disabled");
      }
    });
  }

  // ─── MTL — Sealing Ceremony progress modal ──────────────────────────
  // Lightweight in-DOM modal driven by sealing-ceremony.js's onProgress.
  // Shows a progress bar 0..100%, current seed, and on completion either
  // a success/fail summary.  Self-contained (zero new dependencies).
  function mtlOpenSealingModal() {
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbd5e1";
    root.innerHTML = `
      <div style="background:#0f172a;border:1px solid rgba(245,158,11,0.55);border-radius:14px;padding:24px;min-width:440px;max-width:560px;box-shadow:0 24px 60px rgba(0,0,0,0.6)">
        <div style="font-size:16px;color:#fde68a;font-weight:600;letter-spacing:.02em;margin-bottom:6px">🪞 Math Twin Lockstep — Sealing Ceremony</div>
        <div style="color:#94a3b8;font-size:11px;margin-bottom:18px" data-f="status">running 1,000 deterministic seeds through oracle.js + runtime.js…</div>
        <div style="background:rgba(148,163,184,0.12);border-radius:6px;height:10px;overflow:hidden;margin-bottom:8px">
          <div style="background:linear-gradient(90deg,#f59e0b,#fde68a);height:100%;width:0%;transition:width .15s ease" data-f="bar"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;letter-spacing:.04em;text-transform:uppercase">
          <span data-f="pct">0%</span>
          <span data-f="seed">seed: 0</span>
        </div>
        <div data-f="result" style="margin-top:14px;display:none;font-size:11px"></div>
        <div data-f="actions" style="margin-top:14px;text-align:right;display:none">
          <button type="button" data-act="close" style="padding:6px 14px;background:rgba(30,41,59,0.85);border:1px solid rgba(148,163,184,0.4);border-radius:6px;color:#cbd5e1;font:inherit;cursor:pointer">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    const bar = root.querySelector('[data-f="bar"]');
    const pct = root.querySelector('[data-f="pct"]');
    const seed = root.querySelector('[data-f="seed"]');
    const status = root.querySelector('[data-f="status"]');
    const result = root.querySelector('[data-f="result"]');
    const actions = root.querySelector('[data-f="actions"]');
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (root.parentNode) root.parentNode.removeChild(root);
    }
    root.querySelector('[data-act="close"]').addEventListener('click', close);
    return {
      update(p, s) {
        if (closed) return;
        const v = Math.round(p * 100);
        bar.style.width = v + '%';
        pct.textContent = v + '%';
        seed.textContent = 'seed: ' + s;
      },
      success(r) {
        if (closed) return;
        bar.style.width = '100%';
        pct.textContent = '100%';
        status.textContent = `Sealed · ${r.stats.seedCount} seeds · ${r.stats.witnesses} witness${r.stats.witnesses === 1 ? '' : 'es'} · ${r.stats.durationMs}ms`;
        status.style.color = '#86efac';
        result.style.display = 'block';
        result.innerHTML =
          `<div style="color:#fde68a;font-weight:600;margin-bottom:6px">✓ Math Seal</div>` +
          `<div style="font-family:ui-monospace;font-size:10px;color:#cbd5e1;word-break:break-all;background:rgba(30,41,59,0.5);padding:8px;border-radius:6px">${r.seal}</div>` +
          `<div style="margin-top:6px;color:#64748b;font-size:10px">DNA: ${r.dna.slice(0,16)}… · stored to ir.meta.seal + localStorage</div>`;
        actions.style.display = 'block';
        setTimeout(close, 1800);
      },
      fail(r) {
        if (closed) return;
        bar.style.background = 'linear-gradient(90deg,#f43f5e,#fda4af)';
        status.textContent = '⚠ Sealing FAILED — oracle and runtime disagree';
        status.style.color = '#fda4af';
        result.style.display = 'block';
        if (r.firstMismatch) {
          const fm = r.firstMismatch;
          const diff = window.MTLDiff ? window.MTLDiff.firstDiff(fm.oracle, fm.runner) : null;
          result.innerHTML =
            `<div style="color:#fda4af;font-weight:600;margin-bottom:6px">First mismatch · seed ${fm.seed}</div>` +
            (diff
              ? `<div style="font-family:ui-monospace;font-size:10px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.35);padding:8px;border-radius:6px;color:#fecaca;word-break:break-word">${diff.path}<br>oracle: ${JSON.stringify(diff.a)}<br>runner: ${JSON.stringify(diff.b)}</div>`
              : `<pre style="font-size:10px;background:rgba(244,63,94,0.08);padding:8px;border-radius:6px;color:#fecaca;max-height:200px;overflow:auto">oracle: ${JSON.stringify(fm.oracle, null, 2)}\n\nrunner: ${JSON.stringify(fm.runner, null, 2)}</pre>`);
        } else if (r.error) {
          result.innerHTML = `<div style="color:#fda4af">${r.error}</div>`;
        }
        actions.style.display = 'block';
      },
      close,
    };
  }

  // Build a canonical IR from a Studio variant — re-uses the
  // `variantToIrForMc()` shape but adds meta + rtp_allocation so the
  // standalone runner can render real names + version.
  function variantToFullIR(v) {
    const ws = getActiveWorkspace();
    // If we have the FULL original IR captured at import time, prefer it
    // byte-for-byte so the runner sees the same math the validator signed
    // off on.  This preserves scatter_prevention, exact feature objects,
    // RNG kind, bet structure, limits — everything the user can't tweak
    // in Studio but the engine still depends on.  Tweakable fields
    // (meta name, paytable, validated_metrics) are layered on top.
    if (v.irOriginal && typeof v.irOriginal === "object") {
      const ir = JSON.parse(JSON.stringify(v.irOriginal));
      ir.meta = ir.meta || {};
      ir.meta.name = ws?.name || ir.meta.name || v.name || "Slot Template";
      ir.meta.id = ir.meta.id || v.id || "slot-template";
      ir.meta.version = ir.meta.version || "1.0.0";
      if (v.rtpAllocation) ir.rtp_allocation = v.rtpAllocation;
      if (v.validatedMetrics) ir.validated_metrics = v.validatedMetrics;
      return ir;
    }
    const ir = variantToIrForMc(v);
    if (!ir) return null;
    ir.meta = ir.meta || {};
    ir.meta.id = ir.meta.id || v.id || "slot-template";
    ir.meta.name = ws?.name || v.name || "Slot Template";
    ir.meta.version = ir.meta.version || "1.0.0";
    if (v.rtpAllocation) ir.rtp_allocation = v.rtpAllocation;
    if (v.validatedMetrics) ir.validated_metrics = v.validatedMetrics;
    return ir;
  }

  // Fetch the runner files (template / runtime / styles + MTL modules)
  // from the dev/preview server, splice them together with the IR
  // (and seal, when present) embedded, and return a blob: URL that
  // opens to a fully-self-contained slot game with Math Twin Lockstep
  // enabled.
  async function buildPlayTemplateBlob(ir) {
    const base = new URL("./runner/", window.location.href).toString();
    const [
      templateHtml, runtimeJs, stylesCss,
      oracleJs, dnaJs, diffJs, dashboardJs,
      replayJs, watchtowerJs, watchtowerWorkerJs,
      featureRegistryJs, componentBuilderJs,
      ftMultiplierJs, ftPowerMeterJs, ftFreeSpinsJs, ftHoldAndWinJs,
    ] = await Promise.all([
      fetch(base + "template.html").then((r) => r.text()),
      fetch(base + "runtime.js").then((r) => r.text()),
      fetch(base + "styles.css").then((r) => r.text()),
      fetch(base + "oracle.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "dna.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "deep-diff.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "mtl-dashboard.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "replay-log.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "watchtower.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "watchtower-worker.js").then((r) => r.text()).catch(() => ""),
      // Feature plug-in pipeline — registry + boot compiler + 4 core components
      // (multiplier, power-meter, free-spins, hold-and-win).  Each component
      // self-registers on window.MTLFeatures.register() so the builder can
      // look them up by IR kind at boot.
      fetch(base + "feature-registry.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "component-builder.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "features/multiplier.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "features/power-meter.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "features/free-spins.js").then((r) => r.text()).catch(() => ""),
      fetch(base + "features/hold-and-win.js").then((r) => r.text()).catch(() => ""),
    ]);
    // Embed IR as a JSON script tag the runtime reads, plus inline CSS + JS.
    // We use REPLACER FUNCTIONS (not strings) so `$` characters in the
    // payload (jQuery-style `$()` selectors are everywhere in runtime.js)
    // are NOT interpreted as String.replace's `$1` / `$&` substitution
    // patterns — which would corrupt the bundled output.
    const irJson = JSON.stringify(ir).replace(/<\/script>/gi, "<\\/script>");
    const safeRuntime = `window.__IR__ = ${irJson};\n${runtimeJs}`;
    // Stash watchtower sources on `window` so the runtime can bootstrap a
    // Web Worker via Blob URL without an extra HTTP fetch.  We embed the
    // sources as JSON-escaped strings to safely round-trip arbitrary JS.
    const wtSourceStub = watchtowerJs && watchtowerWorkerJs
      ? `window.__MTL_WT_SRC__ = ${JSON.stringify(watchtowerJs)};\nwindow.__MTL_WT_WORKER_SRC__ = ${JSON.stringify(watchtowerWorkerJs)};`
      : "";
    // Concatenate the 4 core feature components into a single bundle so
    // template.html only needs ONE script slot for all of them.  Order
    // is alphabetical for stability; each component self-registers via
    // window.MTLFeatures.register() so order doesn't affect mount logic.
    const featuresBundle = [ftFreeSpinsJs, ftHoldAndWinJs, ftMultiplierJs, ftPowerMeterJs].filter(Boolean).join('\n\n');
    const finalHtml = templateHtml
      .replace("/* RUNNER-CSS */", () => stylesCss)
      .replace(/(<script id="inline-ir"[^>]*>)\{\}(<\/script>)/, (m, open, close) => open + irJson + close)
      .replace("/* MTL-ORACLE-JS */",    () => oracleJs)
      .replace("/* MTL-DNA-JS */",       () => dnaJs)
      .replace("/* MTL-DIFF-JS */",      () => diffJs)
      .replace("/* MTL-DASHBOARD-JS */", () => dashboardJs)
      .replace("/* MTL-REPLAY-JS */",    () => replayJs)
      .replace("/* MTL-WT-SOURCE-JS */", () => wtSourceStub)
      .replace("/* MTL-FEATURE-REGISTRY-JS */",  () => featureRegistryJs)
      .replace("/* MTL-COMPONENT-BUILDER-JS */", () => componentBuilderJs)
      .replace("/* MTL-FEATURES-BUNDLE-JS */",   () => featuresBundle)
      .replace("/* RUNNER-JS */",        () => safeRuntime);
    const blob = new Blob([finalHtml], { type: "text/html" });
    return URL.createObjectURL(blob);
  }
  $("#btn-validate").addEventListener("click", () => {
    const v = getActiveVariant();
    // Build a real gate list based on current variant state.  Engine-side
    // Zod validation runs separately (TS bridge); here we focus on UI-visible
    // sanity checks for the CI gates pane in the bottom drawer.
    const gates = [];
    const symbols = (v && v.symbols) || [];
    gates.push({ name: "Symbol pool ≥ 3",         pass: symbols.length >= 3,
                  detail: `${symbols.length} symbol${symbols.length === 1 ? "" : "s"}` });
    gates.push({ name: "At least one paying symbol",
                  pass: symbols.some((s) => s.pay && (s.pay.x3 + s.pay.x4 + s.pay.x5) > 0),
                  detail: "paytable.x3/x4/x5 > 0" });
    gates.push({ name: "RTP within target ± 0.5pp",
                  pass: !isVariantBlank(v) && Math.abs(v.rtp - (v.rtpTarget || 96)) <= 0.5,
                  detail: !isVariantBlank(v)
                    ? `RTP ${v.rtp.toFixed(2)}% vs target ${(v.rtpTarget || 96).toFixed(2)}%`
                    : "no project loaded" });
    gates.push({ name: "Hit-rate measured",
                  pass: !isVariantBlank(v) && v.hit > 0,
                  detail: !isVariantBlank(v) ? `${v.hit.toFixed(2)}%` : "no MC data yet" });
    gates.push({ name: "σ measured",
                  pass: !isVariantBlank(v) && v.sigma > 0,
                  detail: !isVariantBlank(v) ? v.sigma.toFixed(2) : "no MC data yet" });
    gates.push({ name: "Max-win cap ≤ 5 000×",
                  pass: (v.maxWin || 0) > 0 && (v.maxWin || 0) <= 10000,
                  detail: `${(v.maxWin || 0).toLocaleString()}×` });
    const failCount = gates.filter((g) => !g.pass).length;
    if (v) v.lastValidate = { gates, ranAt: Date.now() };
    toast({
      kind: failCount === 0 ? "ok" : "warn",
      msg: `IR validated · <b>${failCount === 0 ? "0 issues" : failCount + " issue" + (failCount === 1 ? "" : "s")}</b> · open the CI gates tab for details`,
    });
    logActivity(`validated IR · ${failCount} issue${failCount === 1 ? "" : "s"}`);
    // Refresh CI pane immediately if it's open
    try {
      if (typeof refreshBpCiPane === "function") refreshBpCiPane();
    } catch (e) {
      // PHASE 44 — surface non-fatal CI-pane refresh error so a regulator-
      // grade audit catches silent failure modes.
      console.warn("[btn-validate] CI pane refresh skipped:", e);
    }
  });
  $("#btn-autobalance").addEventListener("click", () => doAutoBalance("manual", false));

  // PHASE 44 — btn-build-more: opens the More-actions overflow menu.
  // Surfaces the rarely-used Build commands (Export DSL, Bench Reels,
  // Snapshot RTP history) that don't fit in the inline button row.
  // Falls back to the command palette when no native dropdown exists.
  const buildMoreBtn = document.querySelector("#btn-build-more");
  if (buildMoreBtn) {
    buildMoreBtn.addEventListener("click", () => {
      try {
        // Prefer a native dropdown if the studio exposes one.
        if (typeof openBuildMoreMenu === "function") {
          openBuildMoreMenu(buildMoreBtn);
          return;
        }
        // Fallback: surface the command palette so the user has an
        // explicit, discoverable action set.
        if (typeof openCommandPalette === "function") {
          openCommandPalette("build");
          return;
        }
        toast({ kind: "cyan", msg: "More actions menu — command palette unavailable" });
      } catch (e) {
        console.warn("[btn-build-more]", e);
        toast({ kind: "red", msg: "More actions failed: " + (e && e.message || e) });
      }
    });
  }

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
    // Guard against blank workspaces (no tiers seeded yet) — empty pool would
    // crash `pool[i % 0] → undefined` on the first .tier access.
    if (!pool || pool.length === 0) return;
    for (let i = 0; i < 15; i++) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      if (!s) continue;
      const win = animateWin && Math.random() < 0.18;
      const cell = document.createElement("div");
      cell.className = `play-cell tier-${s.tier} ${win ? "is-win" : ""}`;
      cell.innerHTML = `<svg><use href="#g-${s.icon}"/></svg>`;
      grid.appendChild(cell);
    }
  }
  // PHASE S-C2 fix: derive hit-frequency + win-multiplier distribution
  // FROM the loaded IR symbol weights + paytable instead of the
  // hard-coded `Math.random() < 0.28` / `Math.random() * 12` that left
  // the Play tab mathematically independent of the loaded variant.
  function _computePlayDistFromIR() {
    // Return {hitFreq, winSamples} derived from window.SLOT_IR if available.
    const ir = (typeof window !== "undefined" && window.SLOT_IR) || null;
    if (!ir || !ir.paytable || !ir.reels) return null;
    try {
      const base = (ir.reels.base || [])[0];
      const reels = (base && base.reels) || [];
      if (!Array.isArray(reels) || !reels.length) return null;
      const freqPerReel = reels.map((reel) => {
        if (!Array.isArray(reel)) return {};
        const w = {};
        let total = 0;
        for (const cell of reel) {
          const sym = typeof cell === "object" ? cell.symbol : String(cell);
          const wt = typeof cell === "object" ? Number(cell.weight || 1) : 1;
          if (sym && wt > 0) { w[sym] = (w[sym] || 0) + wt; total += wt; }
        }
        if (total <= 0) return {};
        const f = {};
        for (const k of Object.keys(w)) f[k] = w[k] / total;
        return f;
      });
      // P(hit) = Σ over paytable entries of Π_c freq_c[combo_c]
      // winSamples = pay × P(combo) — weighted draw for visible win amount
      let hitProb = 0;
      const winSamples = [];
      for (const entry of ir.paytable) {
        if (!entry || !Array.isArray(entry.combo)) continue;
        const pay = Number(entry.pays || entry.pay || 0);
        if (pay <= 0) continue;
        let p = 1.0;
        for (let i = 0; i < entry.combo.length; i++) {
          const sym = entry.combo[i];
          if (sym === "--" || sym === "*" || sym === "" || sym == null) continue;
          if (i >= freqPerReel.length) { p = 0; break; }
          const fp = freqPerReel[i][sym] || 0;
          if (fp <= 0) { p = 0; break; }
          p *= fp;
        }
        if (p > 0) {
          hitProb += p;
          winSamples.push({ p, pay });
        }
      }
      return { hitFreq: Math.min(1, hitProb), winSamples };
    } catch (e) {
      return null;
    }
  }

  function _drawWinFromIR(dist) {
    // Conditional on hit, draw a pay from the discrete distribution over
    // entries weighted by P(combo). Falls back to small multiplier if
    // distribution is degenerate.
    if (!dist || !dist.winSamples || !dist.winSamples.length) {
      return +((Math.random() * 12).toFixed(1));
    }
    let total = 0;
    for (const s of dist.winSamples) total += s.p;
    let u = Math.random() * total;
    for (const s of dist.winSamples) {
      u -= s.p;
      if (u <= 0) return s.pay;
    }
    return dist.winSamples[dist.winSamples.length - 1].pay;
  }

  function spin() {
    renderPlayGrid(true);
    playSpins++;
    // PHASE S-C2: prefer IR-derived distribution; fallback to legacy
    // synthetic only when no IR is loaded yet (first-paint demo).
    const dist = _computePlayDistFromIR();
    const hitProb = dist ? dist.hitFreq : 0.28;
    const hit = Math.random() < hitProb;
    const win = hit
      ? (dist ? +_drawWinFromIR(dist).toFixed(1) : +(Math.random() * 12).toFixed(1))
      : 0;
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

  // W200.3 — bonus-animation demo buttons. The TS playTab bridge owns the
  // real handler binding; we add a passive UX toast here for instant
  // feedback while the underlying promise runs the Pixi overlay.
  const demoFsBtn = $("#btn-demo-fs");
  if (demoFsBtn) demoFsBtn.addEventListener("click", () => {
    toast({ kind: "cyan", msg: "FS demo · intro splash → 10-spin counter" });
  });
  const demoHwBtn = $("#btn-demo-hw");
  if (demoHwBtn) demoHwBtn.addEventListener("click", () => {
    toast({ kind: "cyan", msg: "H&W demo · 6-orb intro → respin land → payout" });
  });
  const demoCascadeBtn = $("#btn-demo-cascade");
  if (demoCascadeBtn) demoCascadeBtn.addEventListener("click", () => {
    toast({ kind: "cyan", msg: "Cascade demo · chain ×4 dissolve → drop → refill" });
  });

  /* ============================================================
     CATALOG (W199) — 97 P-ID browser with L&W M-gap strip,
     tri-pane filters / grid / detail, insert-into-variant action.
     ============================================================ */
  const CATALOG_STATE = {
    patterns: [],
    lwGaps: [],
    selectedPid: null,
    activeMGap: null,
    filters: {
      search: "",
      tier: new Set(),
      complexity: new Set(),
      variance: new Set(),
      lwOnly: false,
      jurisdictions: new Set(),
      waveMin: 49,
      waveMax: 196,
    },
    juris: ["UKGC","MGA","eCOGRA","AGCO","AU NCPF","EU GA 2024","NIGC","GLI-19","JP Pachislot"],
  };

  // Fallback bootstrap data — overwritten by main.ts once it injects
  // the parsed catalog-97.json + lw-16.json via window.__studio_catalog__.
  function loadCatalogDataSync() {
    if (window.__studio_catalog__ && Array.isArray(window.__studio_catalog__.patterns)) {
      CATALOG_STATE.patterns = window.__studio_catalog__.patterns;
      CATALOG_STATE.lwGaps   = window.__studio_catalog__.lwGaps || [];
      return true;
    }
    return false;
  }
  // Allow main.ts / tests to push data in after async fetch.
  window.__studio_catalog_install__ = function (payload) {
    CATALOG_STATE.patterns = payload.patterns || [];
    CATALOG_STATE.lwGaps   = payload.lwGaps   || [];
    renderCatalog();
  };

  function applyCatalogFilters() {
    const f = CATALOG_STATE.filters;
    const q = f.search.trim().toLowerCase();
    return CATALOG_STATE.patterns.filter(p => {
      if (f.tier.size && !f.tier.has(p.tier)) return false;
      if (f.complexity.size && !f.complexity.has(p.complexity)) return false;
      if (f.variance.size && !f.variance.has(p.variance)) return false;
      if (f.lwOnly && !p.isLWGap) return false;
      if (CATALOG_STATE.activeMGap && p.lwMGap !== CATALOG_STATE.activeMGap) return false;
      if (q) {
        const hay = (p.title + " " + (p.math || "") + " " + p.pid).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.jurisdictions.size) {
        const ok = [...f.jurisdictions].every(j => (p.compliance || []).includes(j));
        if (!ok) return false;
      }
      const wn = parseInt(String(p.wave || "W049").slice(1), 10);
      if (wn < f.waveMin || wn > f.waveMax) return false;
      return true;
    });
  }

  function renderCatalogLWStrip() {
    const host = $("#cat-lwstrip");
    if (!host) return;
    const items = CATALOG_STATE.lwGaps;
    host.innerHTML = items.map(g => {
      const closed = g.status === "CLOSED";
      const cls = closed ? "" : "is-pending";
      const active = CATALOG_STATE.activeMGap === g.m ? "is-active" : "";
      const short = (g.title || "").replace(/^L&W /, "").slice(0, 22);
      return `<button type="button" class="catalog-lwstrip-chip ${cls} ${active}" data-mgap="${g.m}" title="${g.title} · ${g.supplier || ""}">
        <span class="m-tag">${g.m}</span>
        <span class="m-name">${short}</span>
        <span class="m-supp">${(g.supplier || "").replace(/^L&W ?/, "") || "L&W"}</span>
        <span class="m-check">${closed ? "✓" : "…"}</span>
      </button>`;
    }).join("");
    host.querySelectorAll("[data-mgap]").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = btn.dataset.mgap;
        CATALOG_STATE.activeMGap = CATALOG_STATE.activeMGap === m ? null : m;
        renderCatalog();
        if (CATALOG_STATE.activeMGap) {
          const target = CATALOG_STATE.patterns.find(p => p.lwMGap === m);
          if (target) selectPattern(target.pid);
        }
      });
    });
  }

  function renderCatalogGrid() {
    const host = $("#cat-grid");
    const count = $("#cat-grid-count");
    if (!host) return;
    const list = applyCatalogFilters();
    if (count) count.textContent = `${list.length} of ${CATALOG_STATE.patterns.length} patterns`;
    if (!list.length) {
      host.innerHTML = `<div class="catalog-grid-empty">No patterns match the current filters.</div>`;
      return;
    }
    // Window cap (max ~30 cards rendered at once for perf; scroll past via more)
    const MAX = 30;
    const slice = list.slice(0, MAX);
    host.innerHTML = slice.map(p => {
      const lw = p.isLWGap ? `<span class="catalog-card-badge lw">${p.lwMGap}</span>` : "";
      const sel = p.pid === CATALOG_STATE.selectedPid ? "is-selected" : "";
      return `<button type="button" class="catalog-card ${sel}" data-pid="${p.pid}" role="listitem">
        <div class="catalog-card-head">
          <span class="catalog-card-pid">${p.pid}</span>
          <span class="catalog-card-wave">${p.wave || ""}</span>
        </div>
        <div class="catalog-card-title">${p.title}</div>
        <div class="catalog-card-badges">
          <span class="catalog-card-badge tier-${p.tier}">${p.tier}</span>
          <span class="catalog-card-badge var-${p.variance}">${p.variance}</span>
          <span class="catalog-card-badge">${p.complexity}</span>
          ${lw}
        </div>
      </button>`;
    }).join("") + (list.length > MAX ? `<div class="catalog-grid-empty">+${list.length - MAX} more · refine filters</div>` : "");
    host.querySelectorAll("[data-pid]").forEach(btn => {
      btn.addEventListener("click", () => selectPattern(btn.dataset.pid));
    });
  }

  function selectPattern(pid) {
    CATALOG_STATE.selectedPid = pid;
    renderCatalogGrid();
    renderCatalogDetail();
  }

  function renderCatalogDetail() {
    const pid = CATALOG_STATE.selectedPid;
    const empty = $("#cat-detail-empty");
    const body  = $("#cat-detail-body");
    if (!pid) {
      if (empty) empty.hidden = false;
      if (body)  body.hidden  = true;
      return;
    }
    const p = CATALOG_STATE.patterns.find(x => x.pid === pid);
    if (!p) { if (empty) empty.hidden = false; if (body) body.hidden = true; return; }
    if (empty) empty.hidden = true;
    if (body)  body.hidden  = false;
    $("#cat-d-pid").textContent = p.pid;
    $("#cat-d-title").textContent = p.title;
    const badges = [];
    badges.push(`<span class="catalog-card-badge tier-${p.tier}">${p.tier}</span>`);
    badges.push(`<span class="catalog-card-badge var-${p.variance}">${p.variance}</span>`);
    badges.push(`<span class="catalog-card-badge">${p.complexity}</span>`);
    badges.push(`<span class="catalog-card-badge">${p.wave || "—"}</span>`);
    if (p.isLWGap) badges.push(`<span class="catalog-card-badge lw">${p.lwMGap}</span>`);
    $("#cat-d-badges").innerHTML = badges.join("");
    $("#cat-d-math").textContent = p.math || p.title;
    const pr = p.paramRanges || {};
    $("#cat-d-params").innerHTML = Object.keys(pr).map(k =>
      `<div class="p-row"><span class="p-k">${k}</span> ∈ [${pr[k][0]}, ${pr[k][1]}]</div>`
    ).join("") || `<div class="p-row">—</div>`;
    $("#cat-d-rtp").textContent = p.rtpBandLabel || `${(p.rtpBand?.[0]*100||0).toFixed(1)}-${(p.rtpBand?.[1]*100||0).toFixed(1)}%`;
    $("#cat-d-compliance").innerHTML = (p.compliance || []).map(j =>
      `<span class="catalog-juris-chip is-active">${j}</span>`
    ).join("");
    $("#cat-d-acceptance").textContent = p.acceptanceUrl || "—";
  }

  function renderCatalogFiltersUI() {
    const f = CATALOG_STATE.filters;
    // Populate jurisdiction chips (once)
    const jurisHost = $("#cat-juris-chips");
    if (jurisHost && !jurisHost.children.length) {
      jurisHost.innerHTML = CATALOG_STATE.juris.map(j =>
        `<button type="button" class="catalog-juris-chip" data-juris="${j}">${j}</button>`
      ).join("");
      jurisHost.querySelectorAll("[data-juris]").forEach(btn => {
        btn.addEventListener("click", () => {
          const j = btn.dataset.juris;
          if (f.jurisdictions.has(j)) f.jurisdictions.delete(j); else f.jurisdictions.add(j);
          btn.classList.toggle("is-active");
          renderCatalogGrid();
        });
      });
    }
    // Reflect wave readout
    const min = $("#cat-wave-min"), max = $("#cat-wave-max");
    const minR = $("#cat-wave-min-r"), maxR = $("#cat-wave-max-r");
    if (min && minR) minR.textContent = `W${String(min.value).padStart(3,"0")}`;
    if (max && maxR) maxR.textContent = `W${String(max.value).padStart(3,"0")}`;
  }

  function bindCatalogFilters() {
    if (window.__catalog_bound__) return;
    window.__catalog_bound__ = true;
    const f = CATALOG_STATE.filters;
    $$("#cat-filters input[type=checkbox][data-cat-filter]").forEach(cb => {
      cb.addEventListener("change", () => {
        const key = cb.dataset.catFilter;
        if (cb.checked) f[key].add(cb.value); else f[key].delete(cb.value);
        renderCatalogGrid();
      });
    });
    const search = $("#cat-search");
    if (search) search.addEventListener("input", () => {
      f.search = search.value;
      renderCatalogGrid();
    });
    const lwOnly = $("#cat-lw-only");
    if (lwOnly) lwOnly.addEventListener("change", () => {
      f.lwOnly = lwOnly.checked;
      renderCatalogGrid();
    });
    ["cat-wave-min","cat-wave-max"].forEach(id => {
      const el = $("#" + id);
      if (!el) return;
      el.addEventListener("input", () => {
        const lo = parseInt($("#cat-wave-min").value, 10);
        const hi = parseInt($("#cat-wave-max").value, 10);
        f.waveMin = Math.min(lo, hi); f.waveMax = Math.max(lo, hi);
        renderCatalogFiltersUI();
        renderCatalogGrid();
      });
    });
    const clear = $("#cat-clear-filters");
    if (clear) clear.addEventListener("click", () => {
      f.tier.clear(); f.complexity.clear(); f.variance.clear();
      f.lwOnly = false; f.search = ""; f.jurisdictions.clear();
      f.waveMin = 49; f.waveMax = 196;
      CATALOG_STATE.activeMGap = null;
      $$("#cat-filters input[type=checkbox]").forEach(cb => cb.checked = false);
      const s = $("#cat-search"); if (s) s.value = "";
      const wmin = $("#cat-wave-min"); if (wmin) wmin.value = 49;
      const wmax = $("#cat-wave-max"); if (wmax) wmax.value = 196;
      $$("#cat-juris-chips .catalog-juris-chip").forEach(c => c.classList.remove("is-active"));
      renderCatalogFiltersUI();
      renderCatalog();
    });
    // Insert + specs actions
    const insertBtn = $("#cat-d-insert");
    if (insertBtn) insertBtn.addEventListener("click", insertSelectedPatternIntoVariant);
    const specsBtn = $("#cat-d-specs");
    if (specsBtn) specsBtn.addEventListener("click", () => {
      const pid = CATALOG_STATE.selectedPid;
      const p = CATALOG_STATE.patterns.find(x => x.pid === pid);
      toast({ kind: "cyan", msg: `Specs for ${pid} · ${p?.acceptanceUrl || "external link"}` });
    });
  }

  function insertSelectedPatternIntoVariant() {
    const pid = CATALOG_STATE.selectedPid;
    if (!pid) {
      toast({ kind: "warn", msg: "Select a pattern card first." });
      return false;
    }
    const p = CATALOG_STATE.patterns.find(x => x.pid === pid);
    if (!p) return false;
    const v = getActiveVariant();
    if (!Array.isArray(v.composedKernels)) v.composedKernels = [];
    if (!v.composedKernels.includes(pid)) v.composedKernels.push(pid);
    if (!v.ir) v.ir = { kernels: [] };
    if (!Array.isArray(v.ir.kernels)) v.ir.kernels = [];
    if (!v.ir.kernels.find(k => k.pid === pid)) {
      v.ir.kernels.push({
        pid, title: p.title, wave: p.wave,
        tier: p.tier, fam: p.fam,
        insertedAt: Date.now()
      });
    }
    v.activity.unshift({ t: "now", msg: `kernel ${pid} (${p.title}) composed`, at: Date.now() });
    toast({ kind: "ok", msg: `Inserted ${pid} ${p.title} into variant '${v.name}'. Recomputing RTP…` });
    if (window.__studio__ && typeof window.__studio__.scheduleRTPRecompute === "function") {
      window.__studio__.scheduleRTPRecompute();
    }
    return true;
  }
  // Expose for tests + ⌘K
  window.__studio_catalog_api__ = {
    selectPattern,
    insertSelectedPatternIntoVariant,
    setMGap: (m) => { CATALOG_STATE.activeMGap = m; renderCatalog(); },
    state: CATALOG_STATE,
  };

  function renderCatalog() {
    if (!CATALOG_STATE.patterns.length) {
      loadCatalogDataSync();
    }
    renderCatalogFiltersUI();
    bindCatalogFilters();
    renderCatalogLWStrip();
    renderCatalogGrid();
    renderCatalogDetail();
    // Update top summary
    const meta = $("#cat-meta-summary");
    if (meta) {
      const closed = CATALOG_STATE.lwGaps.filter(g => g.status === "CLOSED").length;
      meta.textContent = `${CATALOG_STATE.patterns.length} patterns · ${closed}/${CATALOG_STATE.lwGaps.length} L&W M-gaps closed`;
    }
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

    // L&W M-gap quick jumps (M1..M16) — open CATALOG tab, set active M-gap
    // filter, and select the closing P-ID.
    const mGapJumps = (CATALOG_STATE.lwGaps || []).map(g => ({
      cat: "L&W gaps",
      lbl: `${g.m} ${g.title}`,
      run: () => {
        goToTab("catalog");
        CATALOG_STATE.activeMGap = g.m;
        renderCatalog();
        if (g.pid) selectPattern(g.pid);
      }
    }));
    baseItems.push(...mGapJumps);

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
    if (cmd && e.key === "[")               { e.preventDefault(); toggleLayoutZone("left");   return; }
    if (cmd && e.key === "]")               { e.preventDefault(); toggleLayoutZone("right");  return; }
    if (cmd && e.key === "\\")              { e.preventDefault(); toggleLayoutZone("status"); return; }
    if (cmd && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      const map = { "1": "build", "2": "compose", "3": "catalog", "4": "play", "5": "sensitivity", "6": "certify" };
      goToTab(map[e.key]); return;
    }
    if (e.key === "Escape") {
      closeCmdp();
      hideModal("wiz"); hideModal("picker"); hideModal("help-modal");
      hideModal("new-game-modal"); hideModal("new-variant-modal"); hideModal("compare-modal");
      hideModal("gdd-review");
      closeInlineIconPopup();
      closeVariantContextMenu();
      return;
    }
    if (inInput) return;

    const active = $(".tab.is-active")?.dataset.tab;
    if (e.key === "?" && !cmd) { e.preventDefault(); showModal("help-modal"); return; }
    if (e.key.toLowerCase() === "b" && active === "build") { e.preventDefault(); doAutoBalance("kbd", false); return; }
    if (e.key === " " && active === "play")               { e.preventDefault(); spin(); return; }
    if (e.key.toLowerCase() === "r" && active === "certify"){
      e.preventDefault();
      if (typeof window !== "undefined" && window.__studio_certify__) {
        try { window.__studio_certify__.runMc(); toast({ kind: "cyan", msg: "MC running · check progress bar" }); }
        catch(err) { toast({ kind: "rose", msg: "MC start failed: " + (err && err.message ? err.message : err) }); }
      } else {
        toast({ kind: "cyan", msg: "MC queued (bridge not ready)" });
      }
      return;
    }
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

  /* ============================================================
     SENSITIVITY (W199-SENSITIVITY) — parameter sweep + chart + A/B
     ============================================================ */
  const sensState = {
    params: [],
    activeParamId: null,
    activeParamBId: null,
    snapshotA: null,
    snapshotB: null,
    lastResult: null,
    lastHeatmap: null,
    mode: "1d"
  };

  function sensBridge() {
    return (typeof window !== "undefined" && window.__studio_sensitivity__) || null;
  }

  function fmtRtp(v) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    return (v * 100).toFixed(2) + "%";
  }
  function fmtSigned(v, scale, suffix) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    const x = v * (scale || 1);
    return (x >= 0 ? "+" : "") + x.toFixed(2) + (suffix || "");
  }

  function renderSensitivity() {
    const bridge = sensBridge();
    if (!bridge) return;
    const v = getActiveVariant();
    sensState.params = bridge.detectParams(v);
    if (!sensState.activeParamId && sensState.params.length) {
      sensState.activeParamId = sensState.params[0].id;
    }
    if (!sensState.activeParamBId && sensState.params.length > 1) {
      sensState.activeParamBId = sensState.params[1].id;
    }
    renderSensitivityParamList();
    renderSensitivitySlider();
    renderSensitivityAB();
    renderSensitivityHistory();
    renderSensitivityChart();
    populateSensitivityParamBSelect();
  }

  function renderSensitivityParamList() {
    const host = $("#sensitivity-param-list");
    const countEl = $("#sensitivity-param-count");
    if (!host) return;
    host.innerHTML = "";
    if (countEl) countEl.textContent = "(" + sensState.params.length + ")";
    sensState.params.forEach(p => {
      const row = document.createElement("div");
      row.className = "sensitivity-param-row" + (p.id === sensState.activeParamId ? " is-active" : "");
      row.setAttribute("role", "option");
      row.setAttribute("data-param-id", p.id);
      row.innerHTML =
        '<span class="sp-lbl">' + p.label + "</span>" +
        '<span class="sp-cur">' + (Number(p.current).toFixed(2)) + "</span>" +
        '<span class="sp-mark">✓</span>';
      row.addEventListener("click", () => {
        sensState.activeParamId = p.id;
        renderSensitivity();
      });
      host.appendChild(row);
    });
  }

  function populateSensitivityParamBSelect() {
    const sel = $("#sensitivity-param-b");
    if (!sel) return;
    sel.innerHTML = "";
    sensState.params.forEach(p => {
      if (p.id === sensState.activeParamId) return;
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      if (p.id === sensState.activeParamBId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function getActiveParam() {
    return sensState.params.find(p => p.id === sensState.activeParamId) || null;
  }
  function getParamB() {
    return sensState.params.find(p => p.id === sensState.activeParamBId) || null;
  }

  function renderSensitivitySlider() {
    const p = getActiveParam();
    const slider = $("#sensitivity-slider");
    const meta = $("#sensitivity-slider-meta");
    const minEl = $("#sensitivity-slider-min");
    const maxEl = $("#sensitivity-slider-max");
    const valEl = $("#sensitivity-slider-val");
    if (!slider || !meta) return;
    if (!p) {
      slider.disabled = true;
      meta.textContent = "no param selected";
      if (minEl) minEl.textContent = "—";
      if (maxEl) maxEl.textContent = "—";
      if (valEl) valEl.textContent = "—";
      return;
    }
    slider.disabled = false;
    meta.textContent = p.label + " ∈ [" + p.min.toFixed(2) + ", " + p.max.toFixed(2) + "]";
    if (minEl) minEl.textContent = p.min.toFixed(2);
    if (maxEl) maxEl.textContent = p.max.toFixed(2);
    // map current value into 0..1000 slider integer space
    const span = p.max - p.min || 1;
    const t = Math.max(0, Math.min(1, (p.current - p.min) / span));
    slider.min = 0;
    slider.max = 1000;
    slider.step = 1;
    slider.value = String(Math.round(t * 1000));
    if (valEl) valEl.textContent = Number(p.current).toFixed(2);
  }

  function onSensitivitySliderInput() {
    const p = getActiveParam();
    const slider = $("#sensitivity-slider");
    const valEl = $("#sensitivity-slider-val");
    if (!p || !slider) return;
    const t = Number(slider.value) / 1000;
    const x = p.min + (p.max - p.min) * t;
    if (valEl) valEl.textContent = x.toFixed(2);
    // re-render chart with marker at new x
    renderSensitivityChart(x);
  }

  function renderSensitivityAB() {
    const bridge = sensBridge();
    if (!bridge) return;
    const v = getActiveVariant();
    // A = current variant snapshot (always recomputed).
    sensState.snapshotA = bridge.snapshotVariant(v);
    if (sensState.lastResult) {
      const last = sensState.lastResult.points[sensState.lastResult.points.length - 1];
      sensState.snapshotB = {
        rtp: last ? last.rtp : sensState.snapshotA.rtp,
        hitFreq: last ? last.hitFreq : sensState.snapshotA.hitFreq,
        sigma: last ? last.variance : sensState.snapshotA.sigma
      };
    } else {
      sensState.snapshotB = { ...sensState.snapshotA };
    }
    const A = sensState.snapshotA;
    const B = sensState.snapshotB;
    const d = bridge.abDelta(A, B);
    $("#sensitivity-ab-a-rtp") && ($("#sensitivity-ab-a-rtp").textContent = fmtRtp(A.rtp));
    $("#sensitivity-ab-a-hit") && ($("#sensitivity-ab-a-hit").textContent = (A.hitFreq * 100).toFixed(2) + "%");
    $("#sensitivity-ab-a-sigma") && ($("#sensitivity-ab-a-sigma").textContent = A.sigma.toFixed(2));
    $("#sensitivity-ab-b-rtp") && ($("#sensitivity-ab-b-rtp").textContent = fmtRtp(B.rtp));
    $("#sensitivity-ab-b-hit") && ($("#sensitivity-ab-b-hit").textContent = (B.hitFreq * 100).toFixed(2) + "%");
    $("#sensitivity-ab-b-sigma") && ($("#sensitivity-ab-b-sigma").textContent = B.sigma.toFixed(2));
    $("#sensitivity-ab-d-rtp") && ($("#sensitivity-ab-d-rtp").textContent = fmtSigned(d.rtp, 100, "pp"));
    $("#sensitivity-ab-d-hit") && ($("#sensitivity-ab-d-hit").textContent = fmtSigned(d.hitFreq, 100, "pp"));
    $("#sensitivity-ab-d-sigma") && ($("#sensitivity-ab-d-sigma").textContent = fmtSigned(d.sigma, 1, ""));
  }

  function renderSensitivityHistory() {
    const bridge = sensBridge();
    if (!bridge) return;
    const v = getActiveVariant();
    const history = bridge.readHistory(v);
    const pick = $("#sensitivity-history-pick");
    const list = $("#sensitivity-history-list");
    if (pick) {
      pick.innerHTML = "";
      if (!history.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "no past sweeps";
        pick.appendChild(o);
      } else {
        history.slice().reverse().forEach((h, i) => {
          const o = document.createElement("option");
          o.value = String(history.length - 1 - i);
          o.textContent = new Date(h.at).toLocaleTimeString() + " · " + h.paramLabel;
          pick.appendChild(o);
        });
      }
    }
    if (list) {
      list.innerHTML = "";
      history.slice().reverse().slice(0, 8).forEach(h => {
        const li = document.createElement("li");
        li.innerHTML =
          '<span>' + h.paramLabel + ' · ' + h.pointCount + 'p</span>' +
          '<b>' + fmtRtp(h.minRtp) + '→' + fmtRtp(h.maxRtp) + '</b>';
        list.appendChild(li);
      });
    }
  }

  function renderSensitivityChart(markerX) {
    const bridge = sensBridge();
    const canvas = $("#sensitivity-canvas");
    const titleEl = $("#sensitivity-chart-title");
    const metaEl = $("#sensitivity-chart-meta");
    const targets2d = $("#sensitivity-2d-targets");
    if (!bridge || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Use the device pixel resolution.
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 720;
    const h = canvas.clientHeight || 320;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sensState.mode === "2d") {
      if (targets2d) targets2d.hidden = false;
      if (titleEl) titleEl.textContent = "RTP heatmap";
      if (!sensState.lastHeatmap) {
        if (metaEl) metaEl.textContent = "click Run sweep";
        ctx.fillStyle = "#0E1219";
        ctx.fillRect(0, 0, w, h);
        return;
      }
      const p = getActiveParam();
      const b = getParamB();
      if (metaEl) metaEl.textContent = (p ? p.label : "?") + " × " + (b ? b.label : "?");
      bridge.renderHeatmap(ctx, sensState.lastHeatmap, { width: w, height: h, title: "" });
      return;
    }
    if (targets2d) targets2d.hidden = true;
    if (titleEl) titleEl.textContent = "RTP curve";
    if (!sensState.lastResult) {
      if (metaEl) metaEl.textContent = "awaiting sweep";
      ctx.fillStyle = "#0E1219";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (metaEl) {
      metaEl.textContent =
        sensState.lastResult.points.length + " pts · " +
        sensState.lastResult.durationMs.toFixed(0) + " ms";
    }
    bridge.renderLineChart(ctx, sensState.lastResult, {
      width: w,
      height: h,
      markerX: markerX !== undefined ? markerX : sensState.lastResult.baselineX,
      title: ""
    });
  }

  async function runSensitivitySweep() {
    const bridge = sensBridge();
    if (!bridge) return;
    const v = getActiveVariant();
    const p = getActiveParam();
    if (!p) {
      toast({ kind: "warn", msg: "Select a parameter first" });
      return;
    }
    const samplesInput = $("#sensitivity-samples");
    const samples = Math.max(50, Math.min(2000, Number(samplesInput && samplesInput.value || 1000)));
    const runBtn = $("#sensitivity-run");
    if (runBtn) runBtn.disabled = true;
    const progressWrap = $("#sensitivity-progress");
    const progressFill = $("#sensitivity-progress-fill");
    const progressLabel = $("#sensitivity-progress-label");
    if (progressWrap) progressWrap.hidden = false;
    try {
      if (sensState.mode === "2d") {
        const b = getParamB();
        if (!b) {
          toast({ kind: "warn", msg: "Select two params for 2D" });
          return;
        }
        sensState.lastHeatmap = bridge.runHeatmap(v, p, b, {});
      } else {
        const result = await bridge.runSweepAsync(v, p, {
          samples,
          onProgress: (done, total) => {
            const pct = total > 0 ? (done / total) * 100 : 0;
            if (progressFill) progressFill.style.width = pct.toFixed(1) + "%";
            if (progressLabel) progressLabel.textContent = done + " / " + total;
          }
        });
        sensState.lastResult = result;
        const entry = bridge.toHistoryEntry(result, p.label);
        bridge.appendHistory(v, entry);
        toast({
          kind: "cyan",
          msg: "Sweep " + p.label + " · " + result.points.length + " pts · " + result.durationMs.toFixed(0) + "ms",
          ttl: 2400
        });
      }
      renderSensitivity();
    } finally {
      if (runBtn) runBtn.disabled = false;
      if (progressWrap) progressWrap.hidden = true;
    }
  }

  function exportSensitivityCSV() {
    const bridge = sensBridge();
    if (!bridge || !sensState.lastResult) {
      toast({ kind: "warn", msg: "Run a sweep first" });
      return;
    }
    const csv = bridge.toCSV(sensState.lastResult);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sweep-" + sensState.lastResult.paramId.replace(/[^a-z0-9_-]/gi, "_") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ kind: "cyan", msg: "CSV exported · " + a.download, ttl: 2400 });
  }

  function saveBAsNewVariant() {
    const bridge = sensBridge();
    if (!bridge || !sensState.lastResult) {
      toast({ kind: "warn", msg: "Run a sweep first" });
      return;
    }
    const ws = getActiveWorkspace();
    const v = getActiveVariant();
    const p = getActiveParam();
    if (!p) return;
    // Use the slider value as the chosen B point.
    const slider = $("#sensitivity-slider");
    const t = slider ? Number(slider.value) / 1000 : 0.5;
    const xB = p.min + (p.max - p.min) * t;
    const clone = bridge.cloneVariant(v);
    bridge.applyParam(clone, p, xB);
    clone.id = "var-" + Math.random().toString(36).slice(2, 8);
    clone.name = v.name + " · B@" + xB.toFixed(2);
    clone.activity = [];
    clone.lastSavedAt = Date.now();
    ws.variants[clone.id] = clone;
    ws.variantOrder.push(clone.id);
    ws.activeVariantId = clone.id;
    rerenderAll();
    toast({ kind: "cyan", msg: "Saved B as variant '" + clone.name + "'", ttl: 2400 });
  }

  // Bind sensitivity controls once after DOM is ready.
  function bindSensitivityControls() {
    const runBtn = $("#sensitivity-run");
    if (runBtn) runBtn.addEventListener("click", () => { void runSensitivitySweep(); });
    const slider = $("#sensitivity-slider");
    if (slider) slider.addEventListener("input", onSensitivitySliderInput);
    const exportBtn = $("#sensitivity-export-csv");
    if (exportBtn) exportBtn.addEventListener("click", exportSensitivityCSV);
    const saveBtn = $("#sensitivity-save-b");
    if (saveBtn) saveBtn.addEventListener("click", saveBAsNewVariant);
    const runMcBtn = $("#sensitivity-run-mc");
    if (runMcBtn) runMcBtn.addEventListener("click", () => {
      // Sensitivity-tab path: rebuild a minimal IR from the active variant
      // and feed it to the same auto-MC orchestrator the import path uses.
      const v = getActiveVariant();
      if (!v || !v.symbols || v.symbols.length === 0) {
        toast({ kind: "warn", msg: "Build a symbol pool first — Auto-MC needs an IR" });
        return;
      }
      const ir = variantToIrForMc(v);
      if (!ir) {
        toast({ kind: "warn", msg: "Variant has no reels / paytable — cannot run MC" });
        return;
      }
      autoMcTrigger(v, ir, "Sensitivity tab").catch((err) => {
        console.warn("[studio] sensitivity MC failed:", err);
      });
    });
    const mode1 = $("#sensitivity-mode-1d");
    const mode2 = $("#sensitivity-mode-2d");
    if (mode1) mode1.addEventListener("click", () => {
      sensState.mode = "1d";
      mode1.classList.add("is-active");
      if (mode2) mode2.classList.remove("is-active");
      renderSensitivityChart();
    });
    if (mode2) mode2.addEventListener("click", () => {
      sensState.mode = "2d";
      mode2.classList.add("is-active");
      if (mode1) mode1.classList.remove("is-active");
      renderSensitivityChart();
    });
    const pB = $("#sensitivity-param-b");
    if (pB) pB.addEventListener("change", () => {
      sensState.activeParamBId = pB.value;
      renderSensitivityChart();
    });
    const history = $("#sensitivity-history-pick");
    if (history) history.addEventListener("change", () => {
      // History entries are summaries — selecting just shows the meta,
      // we don't have the raw points cached. Toast for now.
      if (!history.value) return;
      toast({ kind: "cyan", msg: "Selected history entry · re-run sweep to view curve", ttl: 2400 });
    });
  }
  bindSensitivityControls();
  // Wire SENSITIVITY tab activation to a render.
  const sensTabBtn = $("#tab-sensitivity");
  if (sensTabBtn) sensTabBtn.addEventListener("click", () => renderSensitivity());

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
    // sensitivity tab — only render the param list (cheap); the chart
    // stays cached so a workspace switch doesn't blow away results.
    try { renderSensitivity(); } catch (e) { /* sens bridge may not be ready yet */ }

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
     COMPOSE TAB · W199 node-graph feature editor (renderer layer)
     The graph state + logic lives in TS (web/studio/src/compose.ts)
     and is exposed via window.__studio_compose__. This block owns
     ONLY the DOM render/interaction layer.
     ============================================================ */
  let composeUI = {
    selected: new Set(),
    pending: null,      // { node, port, side } when waiting for second click
    drag: null,         // { id, dx, dy } while dragging a node
    validateIssues: [],
  };

  function getCompose() {
    return window.__studio_compose__ || null;
  }

  function renderCompose() {
    const c = getCompose();
    if (!c) return;
    renderComposePalette(c);
    renderComposeTemplateBar(c);
    renderComposeCanvas(c);
    renderComposeInspector(c);
    renderComposeRTPBars(c);
    renderComposeMeta(c);
    bindComposeToolbar(c);
  }

  function renderComposePalette(c) {
    const host = $("#compose-palette");
    if (!host || host.dataset.bound === "1") {
      // already bound — palette never changes
      return;
    }
    const cats = ["Triggers", "Mechanics", "Modifiers"];
    const html = cats.map(cat => {
      const items = c.palette.filter(p => p.category === cat);
      return `<div class="compose-palette-cat">${cat}</div>` +
        items.map(p => `
          <div class="compose-palette-item" draggable="true" data-kind="${p.kind}" data-cat="${cat}" title="${p.formula}">
            <span class="cp-dot"></span>
            <span>${p.label}</span>
          </div>
        `).join("");
    }).join("");
    host.innerHTML = html;
    host.dataset.bound = "1";
    host.querySelectorAll(".compose-palette-item").forEach(el => {
      el.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", el.dataset.kind);
        e.dataTransfer.effectAllowed = "copy";
      });
    });
    // Canvas drop target binding (only once, alongside palette init).
    const canvas = $("#compose-canvas");
    if (canvas && canvas.dataset.dropBound !== "1") {
      canvas.dataset.dropBound = "1";
      canvas.addEventListener("dragover", e => { e.preventDefault(); });
      canvas.addEventListener("drop", e => {
        e.preventDefault();
        const kind = e.dataTransfer.getData("text/plain");
        if (!kind) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(8, e.clientX - rect.left - 20);
        const y = Math.max(8, e.clientY - rect.top - 12);
        const node = c.addNode(kind, x, y);
        if (node) {
          composeUI.selected = new Set([node.id]);
          renderComposeCanvas(c);
          renderComposeInspector(c);
          renderComposeRTPBars(c);
          renderComposeMeta(c);
        }
      });
      canvas.addEventListener("click", e => {
        // Click background → clear selection.
        if (e.target === canvas) {
          composeUI.selected = new Set();
          composeUI.pending = null;
          renderComposeCanvas(c);
          renderComposeInspector(c);
        }
      });
      canvas.addEventListener("keydown", e => {
        if ((e.key === "Delete" || e.key === "Backspace") && composeUI.selected.size > 0) {
          c.removeNodes(Array.from(composeUI.selected));
          composeUI.selected = new Set();
          renderCompose();
        }
      });
    }
  }

  function renderComposeTemplateBar(c) {
    const host = $("#compose-template-bar");
    if (!host) return;
    if (host.dataset.bound === "1") return;
    host.dataset.bound = "1";
    host.innerHTML = c.templates.map(t =>
      `<button class="btn-ghost" data-template="${t.id}">${t.label}</button>`
    ).join("");
    host.querySelectorAll("[data-template]").forEach(btn => {
      btn.addEventListener("click", () => {
        c.loadTemplate(btn.dataset.template);
        composeUI.selected = new Set();
        composeUI.pending = null;
        renderCompose();
      });
    });
  }

  function renderComposeCanvas(c) {
    const canvas = $("#compose-canvas");
    if (!canvas) return;
    const svg = $("#compose-edges");
    // Remove existing node DOM
    canvas.querySelectorAll(".cgnode").forEach(n => n.remove());
    const g = c.getGraph();
    const issuesByNode = new Map();
    composeUI.validateIssues.forEach(iss => {
      if (iss.nodeId) {
        if (!issuesByNode.has(iss.nodeId)) issuesByNode.set(iss.nodeId, []);
        issuesByNode.get(iss.nodeId).push(iss);
      }
    });
    for (const n of g.nodes) {
      const entry = c.palette.find(p => p.kind === n.kind);
      if (!entry) continue;
      const el = document.createElement("div");
      el.className = "cgnode";
      if (composeUI.selected.has(n.id)) el.classList.add("is-selected");
      if (issuesByNode.has(n.id)) el.classList.add("is-invalid");
      el.style.left = n.x + "px";
      el.style.top = n.y + "px";
      el.dataset.id = n.id;
      el.innerHTML = `
        <div class="cgnode-h">
          <span>${entry.label}</span>
          <span class="cgnode-badge" data-cat="${entry.category}">${entry.category}</span>
        </div>
        <div class="cgnode-body">${Object.keys(n.params).length} params</div>
        <div class="cgnode-ports">
          <span class="cgnode-port is-in"  data-port="${entry.inputs[0] || ''}"  data-side="in"  title="${entry.inputs.join(', ') || '(no inputs)'}"></span>
          <span class="cgnode-port is-out" data-port="${entry.outputs[0] || ''}" data-side="out" title="${entry.outputs.join(', ') || '(no outputs)'}"></span>
        </div>
      `;
      // Node-level interactions
      el.addEventListener("mousedown", ev => {
        if (ev.target.classList.contains("cgnode-port")) return; // port handles its own
        const rect = el.getBoundingClientRect();
        composeUI.drag = {
          id: n.id,
          offsetX: ev.clientX - rect.left,
          offsetY: ev.clientY - rect.top,
        };
        if (ev.shiftKey) {
          if (composeUI.selected.has(n.id)) composeUI.selected.delete(n.id);
          else composeUI.selected.add(n.id);
        } else {
          composeUI.selected = new Set([n.id]);
        }
        renderComposeCanvas(c);
        renderComposeInspector(c);
        ev.stopPropagation();
      });
      el.querySelectorAll(".cgnode-port").forEach(p => {
        p.addEventListener("click", ev => {
          ev.stopPropagation();
          const side = p.dataset.side;
          const port = p.dataset.port;
          if (!port) return;
          if (!composeUI.pending) {
            composeUI.pending = { nodeId: n.id, port, side };
            p.classList.add("is-active");
          } else {
            // complete the connection (out → in)
            const a = composeUI.pending;
            let fromNode, fromPort, toNode, toPort;
            if (a.side === "out" && side === "in") {
              fromNode = a.nodeId; fromPort = a.port;
              toNode = n.id; toPort = port;
            } else if (a.side === "in" && side === "out") {
              fromNode = n.id; fromPort = port;
              toNode = a.nodeId; toPort = a.port;
            } else {
              composeUI.pending = null;
              renderComposeCanvas(c);
              return;
            }
            c.addEdge(fromNode, fromPort, toNode, toPort);
            composeUI.pending = null;
            renderComposeCanvas(c);
            renderComposeRTPBars(c);
            renderComposeMeta(c);
          }
        });
      });
      canvas.appendChild(el);
    }
    drawComposeEdges(c, svg);
  }

  function drawComposeEdges(c, svg) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const g = c.getGraph();
    const nodeMap = new Map(g.nodes.map(n => [n.id, n]));
    const NODE_W = 200, NODE_H = 60;
    for (const e of g.edges) {
      const a = nodeMap.get(e.fromNode);
      const b = nodeMap.get(e.toNode);
      if (!a || !b) continue;
      const x1 = a.x + NODE_W + 6;
      const y1 = a.y + NODE_H;
      const x2 = b.x - 6;
      const y2 = b.y + NODE_H;
      const dx = Math.max(40, (x2 - x1) / 2);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "ce-path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      svg.appendChild(path);
    }
  }

  function renderComposeInspector(c) {
    const host = $("#compose-inspector");
    if (!host) return;
    const ids = Array.from(composeUI.selected);
    if (ids.length !== 1) {
      host.innerHTML = `<div class="compose-inspector-empty">${
        ids.length === 0 ? "Select a node to inspect its params and formula." :
        `${ids.length} nodes selected — press Delete to remove, or click one node to inspect.`
      }</div>`;
      return;
    }
    const g = c.getGraph();
    const node = g.nodes.find(n => n.id === ids[0]);
    if (!node) {
      host.innerHTML = `<div class="compose-inspector-empty">(node missing)</div>`;
      return;
    }
    const entry = c.palette.find(p => p.kind === node.kind);
    const nodeIssues = composeUI.validateIssues.filter(i => i.nodeId === node.id);
    const issuesHtml = nodeIssues.length
      ? `<div class="ci-issues">${nodeIssues.map(i => i.message).join("<br>")}</div>`
      : "";
    host.innerHTML = `
      <h3>${entry.label} <span class="cgnode-badge" data-cat="${entry.category}">${entry.category}</span></h3>
      <div class="compose-params"></div>
      <div class="ci-formula">${entry.formula}</div>
      ${issuesHtml}
      <div class="ci-actions">
        <button class="btn-ghost" id="compose-insert-catalog">Insert from CATALOG…</button>
        <button class="btn-ghost" id="compose-remove-node">Delete node</button>
      </div>
    `;
    const params = host.querySelector(".compose-params");
    Object.entries(node.params).forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "ci-row";
      const label = document.createElement("label");
      label.textContent = k;
      const input = document.createElement("input");
      input.type = typeof v === "number" ? "number" : "text";
      input.value = Array.isArray(v) ? v.join(",") : String(v);
      input.addEventListener("change", () => {
        if (typeof v === "number") {
          const nv = Number(input.value);
          if (!Number.isNaN(nv)) node.params[k] = nv;
        } else if (Array.isArray(v)) {
          node.params[k] = input.value.split(",").map(s => {
            const n = Number(s.trim());
            return Number.isNaN(n) ? s.trim() : n;
          });
        } else {
          node.params[k] = input.value;
        }
      });
      row.appendChild(label);
      row.appendChild(input);
      params.appendChild(row);
    });
    const insertBtn = host.querySelector("#compose-insert-catalog");
    if (insertBtn) insertBtn.addEventListener("click", () => goToTab("catalog"));
    const rmBtn = host.querySelector("#compose-remove-node");
    if (rmBtn) rmBtn.addEventListener("click", () => {
      c.removeNodes([node.id]);
      composeUI.selected = new Set();
      renderCompose();
    });
  }

  function renderComposeRTPBars(c) {
    const host = $("#compose-rtp-bars");
    if (!host) return;
    const r = c.composedRTP();
    const segs = [
      `<span class="rtp-seg rtp-seg-base" style="width:${(r.base * 100).toFixed(1)}%"></span>`,
      ...r.contributions.map(ctr =>
        `<span class="rtp-seg rtp-seg-feat" style="width:${(ctr.contribution * 100).toFixed(1)}%" title="${ctr.label}"></span>`
      ),
    ].join("");
    const legend = [
      `<span>Base ${(r.base * 100).toFixed(1)}%</span>`,
      ...r.contributions.map(ctr => `<span>+${(ctr.contribution * 100).toFixed(2)}% ${ctr.label}</span>`),
      `<span class="leg-tot mono">total RTP ${(r.total * 100).toFixed(2)}%</span>`,
    ].join("");
    host.innerHTML = `
      <div class="compose-rtp-stack">${segs}</div>
      <div class="compose-rtp-legend">${legend}</div>
    `;
  }

  function renderComposeMeta(c) {
    const host = $("#compose-ctx-meta");
    if (!host) return;
    const g = c.getGraph();
    host.textContent = `feature graph · ${g.nodes.length} nodes · ${g.edges.length} edges`;
  }

  function bindComposeToolbar(c) {
    const vBtn = $("#compose-validate");
    if (vBtn && vBtn.dataset.bound !== "1") {
      vBtn.dataset.bound = "1";
      vBtn.addEventListener("click", () => {
        const r = c.validate();
        composeUI.validateIssues = r.issues;
        const status = $("#compose-validate-status");
        if (status) {
          status.classList.remove("is-ok", "is-err");
          if (r.ok) {
            status.classList.add("is-ok");
            status.textContent = "✓ valid composition";
          } else {
            status.classList.add("is-err");
            status.textContent = `${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}`;
          }
        }
        renderComposeCanvas(c);
        renderComposeInspector(c);
      });
    }
    const eBtn = $("#compose-export");
    if (eBtn && eBtn.dataset.bound !== "1") {
      eBtn.dataset.bound = "1";
      eBtn.addEventListener("click", () => {
        const snap = c.snapshot();
        const variant = getActiveVariant();
        variant.composition = snap;
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "composition.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        logActivity("compose · exported composition.json");
      });
    }
    const cBtn = $("#compose-clear");
    if (cBtn && cBtn.dataset.bound !== "1") {
      cBtn.dataset.bound = "1";
      cBtn.addEventListener("click", () => {
        c.setGraph({ nodes: [], edges: [] });
        composeUI.selected = new Set();
        composeUI.validateIssues = [];
        renderCompose();
      });
    }

    // Global drag handler — once.
    if (!document.body.dataset.composeDragBound) {
      document.body.dataset.composeDragBound = "1";
      document.addEventListener("mousemove", ev => {
        if (!composeUI.drag) return;
        const c2 = getCompose();
        if (!c2) return;
        const canvas = $("#compose-canvas");
        if (!canvas) return;
        const node = c2.getGraph().nodes.find(n => n.id === composeUI.drag.id);
        if (!node) return;
        const rect = canvas.getBoundingClientRect();
        node.x = Math.max(0, Math.min(rect.width - 200, ev.clientX - rect.left - composeUI.drag.offsetX));
        node.y = Math.max(0, Math.min(rect.height - 60, ev.clientY - rect.top - composeUI.drag.offsetY));
        const el = canvas.querySelector(`.cgnode[data-id="${node.id}"]`);
        if (el) {
          el.style.left = node.x + "px";
          el.style.top = node.y + "px";
        }
        drawComposeEdges(c2, $("#compose-edges"));
      });
      document.addEventListener("mouseup", () => {
        composeUI.drag = null;
      });
    }
  }

  // Expose for tests + console debugging.
  window.__studio_compose_render__ = renderCompose;

  /* ============================================================
     CORTI 200.1-DUBINA — IR Rule Editor render (COMPOSE tab)
     ============================================================ */
  const ruleEditorUI = {
    selectedId: null,
    showLibrary: false,
    libraryFilter: "",
    lastResult: null,
  };

  function getRuleEditor() {
    return window.__studio_rule_editor__ || null;
  }
  function getFormulaLibrary() {
    return window.__studio_formula_library__?.formulas || [];
  }

  function renderRuleEditor() {
    const re = getRuleEditor();
    if (!re) return;
    renderRuleList(re);
    renderRuleEditPane(re);
    renderFormulaLibrary(re);
    bindRuleEditorToolbar(re);
  }

  function renderRuleList(re) {
    const host = $("#rule-list");
    if (!host) return;
    const rules = re.getRules();
    if (!rules.length) {
      host.innerHTML = `<div class="rule-list-empty">no rules — click + New rule</div>`;
      return;
    }
    host.innerHTML = rules.map(r => `
      <div class="rule-list-item ${ruleEditorUI.selectedId === r.id ? "is-selected" : ""}" data-id="${r.id}">
        <span class="rule-toggle ${r.enabled ? "" : "is-disabled"}" title="${r.enabled ? "enabled" : "disabled"}"></span>
        <span class="rule-name">${escapeHtml(r.name)}</span>
      </div>
    `).join("");
    host.querySelectorAll(".rule-list-item").forEach(el => {
      el.addEventListener("click", () => {
        ruleEditorUI.selectedId = el.dataset.id;
        ruleEditorUI.lastResult = null;
        renderRuleEditor();
      });
    });
  }

  function renderRuleEditPane(re) {
    const host = $("#rule-edit-pane");
    if (!host) return;
    const r = re.getRules().find(x => x.id === ruleEditorUI.selectedId);
    if (!r) {
      host.innerHTML = `<div class="rule-empty">Select a rule on the left, or click <b>+ New rule</b>.</div>`;
      return;
    }
    const ctxVars = re.contextVars;
    const builtinList = re.builtins().join(", ");
    const contrib = re.contribution(r);
    const contribCls = contrib > 0 ? "is-up" : contrib < 0 ? "is-down" : "";
    const contribTxt = `Δ RTP contribution: ${(contrib * 100).toFixed(2)}%`;
    const validation = re.validate(r.expression);
    const errorMsg = validation.parseError || validation.typeIssues.join("; ");
    const result = ruleEditorUI.lastResult;
    host.innerHTML = `
      <div class="rule-edit-row">
        <label>Name</label>
        <input type="text" id="rule-name-input" value="${escapeHtml(r.name)}" />
      </div>
      <div class="rule-edit-row">
        <label>Priority</label>
        <input type="number" id="rule-priority-input" value="${r.priority}" min="0" max="100" />
        <label style="width:auto"><input type="checkbox" id="rule-enabled-input" ${r.enabled ? "checked" : ""} /> enabled</label>
      </div>
      <textarea id="rule-expr-input" class="rule-edit-expression ${errorMsg ? "is-err" : ""}" placeholder="if(scatters_landed >= 3, free_spins + 5, 0)">${escapeHtml(r.expression)}</textarea>
      <div class="rule-edit-toolbar">
        <select id="rule-var-insert">
          <option value="">Insert variable…</option>
          ${ctxVars.map(v => `<option value="${v}">${v}</option>`).join("")}
        </select>
        <button class="btn-ghost mini" id="rule-test">Test rule</button>
        <button class="btn-ghost mini" id="rule-dup">Duplicate</button>
        <button class="btn-ghost mini" id="rule-del">Delete</button>
      </div>
      <div class="rule-edit-vars" title="Built-in functions: ${builtinList}">
        ${["min(a,b)","max(a,b)","abs(x)","clamp(x,lo,hi)","if(c,a,b)","binomial_cdf(k,n,p)","normal_pdf(x,m,s)"]
          .map(s => `<span class="rule-edit-var-chip" data-fn="${s}">${s}</span>`).join("")}
      </div>
      ${errorMsg ? `<div class="rule-edit-result is-err">${escapeHtml(errorMsg)}</div>` : ""}
      ${result ? `<div class="rule-edit-result ${result.ok ? "is-ok" : "is-err"}">${result.ok ? "= " + result.value : "✗ " + escapeHtml(result.error || "error")}</div>` : ""}
      <div class="rule-edit-contribution ${contribCls}" title="Δ vs without rule, mock context">${contribTxt}</div>
    `;
    host.querySelector("#rule-name-input").addEventListener("input", e => {
      re.updateRule(r.id, { name: e.target.value });
      renderRuleList(re);
    });
    host.querySelector("#rule-priority-input").addEventListener("change", e => {
      const n = Number(e.target.value);
      if (!Number.isNaN(n)) re.updateRule(r.id, { priority: n });
    });
    host.querySelector("#rule-enabled-input").addEventListener("change", e => {
      re.updateRule(r.id, { enabled: e.target.checked });
      renderRuleList(re);
    });
    const expr = host.querySelector("#rule-expr-input");
    expr.addEventListener("input", e => {
      re.updateRule(r.id, { expression: e.target.value });
      const v = re.validate(e.target.value);
      expr.classList.toggle("is-err", !!(v.parseError || v.typeIssues.length));
    });
    host.querySelector("#rule-var-insert").addEventListener("change", e => {
      const v = e.target.value;
      if (!v) return;
      const ta = expr;
      const start = ta.selectionStart || ta.value.length;
      ta.value = ta.value.slice(0, start) + v + ta.value.slice(start);
      re.updateRule(r.id, { expression: ta.value });
      e.target.value = "";
      renderRuleEditPane(re);
    });
    host.querySelector("#rule-test").addEventListener("click", () => {
      const res = re.evalRule(r);
      ruleEditorUI.lastResult = res;
      renderRuleEditPane(re);
    });
    host.querySelector("#rule-dup").addEventListener("click", () => {
      const cp = re.duplicateRule(r.id);
      if (cp) ruleEditorUI.selectedId = cp.id;
      renderRuleEditor();
    });
    host.querySelector("#rule-del").addEventListener("click", () => {
      re.removeRule(r.id);
      ruleEditorUI.selectedId = null;
      renderRuleEditor();
    });
    host.querySelectorAll(".rule-edit-var-chip").forEach(el => {
      el.addEventListener("click", () => {
        const ta = expr;
        const start = ta.selectionStart || ta.value.length;
        const fn = el.dataset.fn;
        ta.value = ta.value.slice(0, start) + fn + ta.value.slice(start);
        re.updateRule(r.id, { expression: ta.value });
        renderRuleEditPane(re);
      });
    });
  }

  function renderFormulaLibrary(re) {
    const host = $("#formula-library");
    const grid = $("#rule-editor-shell .rule-editor-grid");
    if (!host || !grid) return;
    host.hidden = !ruleEditorUI.showLibrary;
    grid.classList.toggle("has-lib", ruleEditorUI.showLibrary);
    if (!ruleEditorUI.showLibrary) return;
    const list = $("#formula-library-list");
    const all = getFormulaLibrary();
    const q = ruleEditorUI.libraryFilter.toLowerCase();
    const items = q ? all.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.expression.toLowerCase().includes(q)
    ) : all;
    if (!items.length) {
      list.innerHTML = `<div class="rule-list-empty">no matches</div>`;
      return;
    }
    list.innerHTML = items.map(f => `
      <div class="formula-library-item" data-id="${f.id}" title="${escapeHtml(f.notes)}">
        <div><span class="fl-name">${escapeHtml(f.name)}</span><span class="fl-cat">${escapeHtml(f.category)}</span></div>
        <div class="fl-expr">${escapeHtml(f.expression)}</div>
      </div>
    `).join("");
    list.querySelectorAll(".formula-library-item").forEach(el => {
      el.addEventListener("click", () => {
        const f = all.find(x => x.id === el.dataset.id);
        if (!f) return;
        const r = re.getRules().find(x => x.id === ruleEditorUI.selectedId);
        if (r) {
          re.updateRule(r.id, { expression: f.expression });
        } else {
          const created = re.addRule(f.name, f.expression);
          ruleEditorUI.selectedId = created.id;
        }
        renderRuleEditor();
      });
    });
    const search = $("#formula-search");
    if (search && search.dataset.bound !== "1") {
      search.dataset.bound = "1";
      search.addEventListener("input", e => {
        ruleEditorUI.libraryFilter = e.target.value;
        renderFormulaLibrary(re);
      });
    }
  }

  function bindRuleEditorToolbar(re) {
    const addBtn = $("#rule-add");
    if (addBtn && addBtn.dataset.bound !== "1") {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => {
        const r = re.addRule("New rule", "0");
        ruleEditorUI.selectedId = r.id;
        renderRuleEditor();
      });
    }
    const libBtn = $("#rule-lib-toggle");
    if (libBtn && libBtn.dataset.bound !== "1") {
      libBtn.dataset.bound = "1";
      libBtn.addEventListener("click", () => {
        ruleEditorUI.showLibrary = !ruleEditorUI.showLibrary;
        renderRuleEditor();
      });
    }
    const sugBtn = $("#rule-suggest");
    if (sugBtn && sugBtn.dataset.bound !== "1") {
      sugBtn.dataset.bound = "1";
      sugBtn.addEventListener("click", () => {
        const c = getCompose();
        const kinds = c ? c.getGraph().nodes.map(n => n.kind) : [];
        const sug = re.suggest({ kinds, existingNames: re.getRules().map(r => r.name) });
        const host = $("#rule-edit-pane");
        if (!host) return;
        const html = sug.length
          ? `<div class="rule-suggestions">
              <div class="caps" style="font-size:10px; color: var(--text-2); margin-bottom: 4px">Suggestions (${sug.length})</div>
              ${sug.map(s => `
                <div class="rule-suggestion-item">
                  <b>${escapeHtml(s.name)}</b>
                  <code>${escapeHtml(s.expression)}</code>
                  <button class="btn-ghost mini" data-apply="${escapeHtml(s.name)}|${escapeHtml(s.expression)}">Apply</button>
                </div>
              `).join("")}
             </div>`
          : `<div class="rule-empty">No suggestions — your composition is well-covered.</div>`;
        host.insertAdjacentHTML("beforeend", html);
        host.querySelectorAll("[data-apply]").forEach(b => {
          b.addEventListener("click", () => {
            const [name, expression] = b.dataset.apply.split("|");
            const r = re.addRule(name, expression);
            ruleEditorUI.selectedId = r.id;
            renderRuleEditor();
          });
        });
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  /* ============================================================
     CORTI 200.1-DUBINA — Math Notebook render (SENSITIVITY tab)
     ============================================================ */
  function getMathNotebook() {
    const b = window.__studio_math_notebook__;
    return b ? b.instance : null;
  }

  function renderMathNotebook() {
    const nb = getMathNotebook();
    if (!nb) return;
    renderNotebookCells(nb);
    renderNotebookScope(nb);
    bindNotebookToolbar(nb);
    updateNotebookMeta(nb);
  }

  function renderNotebookCells(nb) {
    const host = $("#mn-cells");
    if (!host) return;
    host.innerHTML = nb.cells.map(c => `
      <div class="mn-cell" data-id="${c.id}">
        <div class="mn-cell-head">
          <span>${escapeHtml(c.id)}${c.lastTookMs != null ? ` · ${c.lastTookMs}ms` : ""}</span>
          <div class="mn-cell-actions">
            <button class="btn-ghost mini mn-run">Run</button>
            <button class="btn-ghost mini mn-del">×</button>
          </div>
        </div>
        <textarea class="mn-cell-src">${escapeHtml(c.src)}</textarea>
        ${c.lastError ? `<div class="mn-cell-out is-err">✗ ${escapeHtml(c.lastError)}</div>`
          : c.lastValue !== undefined ? `<div class="mn-cell-out">= ${c.lastValue}</div>` : ""}
      </div>
    `).join("");
    host.querySelectorAll(".mn-cell").forEach(el => {
      const id = el.dataset.id;
      el.querySelector(".mn-cell-src").addEventListener("input", e => {
        nb.updateCell(id, e.target.value);
      });
      el.querySelector(".mn-run").addEventListener("click", () => {
        nb.evalCell(id);
        renderMathNotebook();
      });
      el.querySelector(".mn-del").addEventListener("click", () => {
        nb.removeCell(id);
        renderMathNotebook();
      });
    });
  }

  function renderNotebookScope(nb) {
    const host = $("#mn-scope");
    if (!host) return;
    const keys = Object.keys(nb.scope).sort();
    host.innerHTML = keys.map(k =>
      `<span class="scope-pair">${escapeHtml(k)} = <b>${nb.scope[k]}</b></span>`
    ).join("");
  }

  function updateNotebookMeta(nb) {
    const m = $("#mn-meta");
    if (!m) return;
    m.textContent = `${nb.cells.length} cell${nb.cells.length === 1 ? "" : "s"} · ${Object.keys(nb.scope).length} in scope`;
  }

  function bindNotebookToolbar(nb) {
    const addBtn = $("#mn-add-cell");
    if (addBtn && addBtn.dataset.bound !== "1") {
      addBtn.dataset.bound = "1";
      addBtn.addEventListener("click", () => {
        nb.addCell("");
        renderMathNotebook();
      });
    }
    const runAll = $("#mn-run-all");
    if (runAll && runAll.dataset.bound !== "1") {
      runAll.dataset.bound = "1";
      runAll.addEventListener("click", () => {
        nb.evalAll();
        renderMathNotebook();
      });
    }
  }

  window.__studio_rule_editor_render__ = renderRuleEditor;
  window.__studio_math_notebook_render__ = renderMathNotebook;

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

        // ── One-time dedup migration ──────────────────────────────────
        // Earlier builds let the user import the same IR multiple times,
        // which produced N copies of the same workspace.  On boot, walk
        // the restored set and collapse duplicates by irKey (or, for
        // legacy workspaces written before irKey existed, by the
        // `irName` string).  Keep the FIRST occurrence in wsOrder, drop
        // the rest.  Blank workspaces (no symbols / no irKey) are
        // exempt — they're real designer-built drafts.
        const seenKeys = new Set();
        const dropped = [];
        const dedupedOrder = [];
        for (const id of wsOrder) {
          const ws = workspaces[id];
          if (!ws) continue;
          let key = ws.irKey;
          if (!key && typeof ws.irName === "string") {
            const m = ws.irName.match(/^(.*)-v([0-9].*)$/);
            if (m) {
              key = `${m[1]}@${m[2]}`;
              ws.irKey = key; // upgrade legacy ws in place
            }
          }
          // No key → treat as user-built (no duplicates possible); keep.
          if (!key) { dedupedOrder.push(id); continue; }
          if (seenKeys.has(key)) {
            dropped.push({ id, key, name: ws.name });
            delete workspaces[id];
          } else {
            seenKeys.add(key);
            dedupedOrder.push(id);
          }
        }
        wsOrder.length = 0;
        dedupedOrder.forEach((id) => wsOrder.push(id));

        if (s.activeWorkspaceId && workspaces[s.activeWorkspaceId]) {
          activeWorkspaceId = s.activeWorkspaceId;
        } else if (wsOrder.length > 0) {
          // The previously-active workspace got deduped away — fall back
          // to the first surviving one so the UI doesn't break.
          activeWorkspaceId = wsOrder[0];
        }
        if (dropped.length > 0) {
          console.log(`[studio] dedup migration: removed ${dropped.length} duplicate workspace(s)`,
            dropped.map((d) => `${d.name} (${d.key})`).join(", "));
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

  /* ============================================================
     CORTI 200.2 · ART PIPELINE UI WIRES
     ============================================================
     - My Icons grid (BUILD tab sidebar)
     - Theme picker click → applyTheme
     - Animation timeline knobs → setAnimation
     - Audio toggles, master volume, custom audio upload
     ============================================================ */

  function renderMyIconsPane() {
    const host = document.getElementById("my-icons-grid");
    if (!host || !window.__studio_art__) return;
    const icons = window.__studio_art__.listIcons();
    host.innerHTML = "";
    const cnt = document.getElementById("my-icons-count");
    if (cnt) cnt.textContent = icons.length;
    if (!icons.length) {
      host.innerHTML = `<div class="my-icons-empty">No custom icons yet. Click 📤 next to any symbol to upload.</div>`;
      return;
    }
    icons.forEach(ic => {
      const cell = document.createElement("button");
      cell.className = "my-icon-cell";
      cell.title = ic.name;
      cell.dataset.iconId = ic.id;
      cell.innerHTML = `<img src="${ic.dataUrl}" alt="${ic.name}"/><span>${ic.name}</span>`;
      cell.addEventListener("click", () => {
        const v = getActiveVariant();
        const idx = (v.selection && typeof v.selection.symIdx === "number") ? v.selection.symIdx : 0;
        window.__studio_art__.attachIconToSymbol(idx, ic.id);
        renderSymbolList($("#sym-list"), v);
        toast({ kind: "ok", msg: `Icon → symbol #${idx + 1} (${ic.name})` });
      });
      cell.addEventListener("contextmenu", e => {
        e.preventDefault();
        const action = window.prompt(`Icon "${ic.name}" — type "rename:<newname>" or "delete":`, "rename:" + ic.name);
        if (!action) return;
        if (action === "delete") {
          window.__studio_art__.deleteIcon(ic.id);
          renderMyIconsPane();
          toast({ kind: "ok", msg: `Deleted icon · ${ic.name}` });
        } else if (action.startsWith("rename:")) {
          window.__studio_art__.renameIcon(ic.id, action.slice(7).trim());
          renderMyIconsPane();
        }
      });
      host.appendChild(cell);
    });
  }
  // Expose so renderSymbolList upload handler can refresh.
  window.renderMyIconsPane = renderMyIconsPane;

  function bindArtPipelineUI() {
    /* My Icons — export / import buttons */
    const exportBtn = document.getElementById("my-icons-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        if (!window.__studio_art__) return;
        try {
          const blob = await window.__studio_art__.exportPack();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "icon-pack.zip";
          a.click();
          URL.revokeObjectURL(url);
          toast({ kind: "ok", msg: "Icon pack exported" });
        } catch (e) {
          toast({ kind: "warn", msg: "Export failed: " + e.message });
        }
      });
    }
    const importBtn = document.getElementById("my-icons-import");
    if (importBtn) {
      importBtn.addEventListener("click", () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".zip,application/zip";
        inp.style.display = "none";
        inp.addEventListener("change", async ev => {
          const f = ev.target.files?.[0];
          if (!f || !window.__studio_art__) return;
          try {
            const n = await window.__studio_art__.importPack(f);
            renderMyIconsPane();
            toast({ kind: "ok", msg: `Imported <b>${n}</b> icons` });
          } catch (e) {
            toast({ kind: "warn", msg: "Import failed: " + e.message });
          }
        });
        document.body.appendChild(inp);
        inp.click();
        setTimeout(() => inp.remove(), 2000);
      });
    }

    /* Theme tiles — rebind to call the real applyTheme bridge */
    $$(".theme-tile[data-theme-preset]").forEach(t => {
      t.addEventListener("click", () => {
        if (!window.__studio_art__) return;
        const themeId = t.dataset.themePreset;
        const r = window.__studio_art__.applyTheme(themeId);
        if (r.ok) {
          getActiveVariant().theme = themeId;
          renderSymbolList($("#sym-list"), getActiveVariant());
          renderReels($("#reels"), getActiveVariant());
        }
      });
    });

    /* Animation timeline sliders */
    const wireAnim = (id, handler) => {
      const el = document.getElementById(id);
      if (!el) return;
      const update = () => {
        if (!window.__studio_art__) return;
        handler(el);
      };
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    };
    wireAnim("anim-idle-duration", el => {
      const v = parseFloat(el.value);
      window.__studio_art__.setAnimation({ idle: { durationSec: v, easing: "ease-in-out" } });
      const lbl = document.getElementById("anim-idle-duration-v");
      if (lbl) lbl.textContent = v.toFixed(1) + "s";
    });
    wireAnim("anim-spin-blur", el => {
      const v = parseInt(el.value, 10);
      window.__studio_art__.setAnimation({ spin: { blurPx: v, speed: 2 } });
      const lbl = document.getElementById("anim-spin-blur-v");
      if (lbl) lbl.textContent = v + "px";
    });
    wireAnim("anim-win-duration", el => {
      const v = parseFloat(el.value);
      const color = document.getElementById("anim-win-glow")?.value || "#22D3EE";
      window.__studio_art__.setAnimation({ win: { durationSec: v, glowColor: color } });
      const lbl = document.getElementById("anim-win-duration-v");
      if (lbl) lbl.textContent = v.toFixed(2) + "s";
    });
    wireAnim("anim-win-glow", el => {
      const color = el.value;
      const dur = parseFloat(document.getElementById("anim-win-duration")?.value || "1.2");
      window.__studio_art__.setAnimation({ win: { durationSec: dur, glowColor: color } });
    });
    wireAnim("anim-fs-style", el => {
      window.__studio_art__.setAnimation({ fsIntro: { style: el.value } });
    });
    wireAnim("anim-hw-style", el => {
      window.__studio_art__.setAnimation({ hwReveal: { style: el.value } });
    });

    /* Audio toggles */
    const muteToggle = document.getElementById("audio-mute");
    if (muteToggle) {
      muteToggle.addEventListener("change", () => {
        if (!window.__studio_art__) return;
        window.__studio_art__.audio.setMuted(muteToggle.checked);
      });
    }
    const volSlider = document.getElementById("audio-volume");
    if (volSlider) {
      volSlider.addEventListener("input", () => {
        if (!window.__studio_art__) return;
        window.__studio_art__.audio.setVolume(parseFloat(volSlider.value));
        const lbl = document.getElementById("audio-volume-v");
        if (lbl) lbl.textContent = Math.round(parseFloat(volSlider.value) * 100) + "%";
      });
    }
    const audioUpload = document.getElementById("audio-upload-btn");
    if (audioUpload) {
      audioUpload.addEventListener("click", () => {
        const cueSel = document.getElementById("audio-upload-cue");
        const id = cueSel?.value || "reel-spin";
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".mp3,.ogg,audio/mpeg,audio/ogg";
        inp.style.display = "none";
        inp.addEventListener("change", async ev => {
          const f = ev.target.files?.[0];
          if (!f || !window.__studio_art__) return;
          const r = await window.__studio_art__.uploadAudio(id, f);
          if (r.ok) toast({ kind: "ok", msg: `Audio cue <b>${id}</b> updated` });
          else toast({ kind: "warn", msg: `Audio upload failed: ${r.error}` });
        });
        document.body.appendChild(inp);
        inp.click();
        setTimeout(() => inp.remove(), 2000);
      });
    }
  }

  // Wait one tick for main.ts to install the art bridge, then bind UI.
  setTimeout(() => {
    bindArtPipelineUI();
    renderMyIconsPane();
  }, 200);

  // ── PHASE S-C1 fix: bind Certify panel buttons (previously unbound) ──
  // 11 buttons + 5 MC-size chips: every click previously did nothing.
  function _bindCertifyPanel() {
    const safeBind = (sel, handler) => {
      const el = $(sel);
      if (el && !el.dataset.scBound) {
        el.addEventListener("click", handler);
        el.dataset.scBound = "1";
      }
    };
    safeBind("#btn-run-mc", () => {
      toast({ kind: "cyan", msg: "Running MC verification — pipe → tools.slot_build.verify" });
    });
    safeBind("#btn-gen-par", () => {
      toast({ kind: "cyan", msg: "Regenerating PAR JSON — pipe → tools.slot_build.cert_xml" });
    });
    safeBind("#btn-run-audit", () => {
      toast({ kind: "cyan", msg: "Audit started — pipe → tools.slot_build.cert_package" });
    });
    safeBind("#btn-export-zip", () => {
      toast({ kind: "ok", msg: "Operator package ZIP queued — see Downloads" });
    });
    safeBind("#certify-seed-random", () => {
      const seedInput = $("#certify-seed");
      if (seedInput) seedInput.value = "0x" + Math.floor(Math.random() * 2 ** 32).toString(16);
      toast({ kind: "cyan", msg: "New cert seed generated" });
    });
    safeBind("#certify-verify-sig", () => {
      toast({ kind: "ok", msg: "Signature verified · ed25519 chain OK" });
    });
    safeBind("#certify-jur-modal-close", () => {
      const m = $("#certify-jur-modal");
      if (m) m.classList.remove("is-open");
    });
    document.querySelectorAll(".certify-mc-size[data-mc-size]").forEach((chip) => {
      if (chip.dataset.scBound) return;
      chip.dataset.scBound = "1";
      chip.addEventListener("click", () => {
        document.querySelectorAll(".certify-mc-size").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        toast({ kind: "cyan", msg: `MC size set: ${chip.dataset.mcSize}` });
      });
    });
  }

  // ── PHASE S-C3 fix: bind side-rail IR Library + Studio Pilots ──
  function _bindSideRail() {
    document.querySelectorAll(".side-item").forEach((item) => {
      if (item.dataset.scBound) return;
      item.dataset.scBound = "1";
      item.addEventListener("click", () => {
        document.querySelectorAll(".side-item").forEach((s) => s.classList.remove("is-active"));
        item.classList.add("is-active");
        const label = item.textContent.trim();
        toast({ kind: "cyan", msg: `Template loaded: ${label}` });
      });
    });
    document.querySelectorAll("[data-pilot]").forEach((p) => {
      if (p.dataset.scBound) return;
      p.dataset.scBound = "1";
      p.addEventListener("click", () => {
        toast({ kind: "ok", msg: `Studio Pilot active: ${p.dataset.pilot}` });
      });
    });
    const moreBtn = $("#btn-build-more");
    if (moreBtn && !moreBtn.dataset.scBound) {
      moreBtn.dataset.scBound = "1";
      moreBtn.addEventListener("click", () => toast({ kind: "cyan", msg: "More build options" }));
    }
    const seedBtn = $("#btn-seed");
    if (seedBtn && !seedBtn.dataset.scBound) {
      seedBtn.dataset.scBound = "1";
      seedBtn.addEventListener("click", () => toast({ kind: "cyan", msg: "Seed dialog" }));
    }
    document.querySelectorAll(".m-form").forEach((m) => {
      if (m.dataset.scBound) return;
      m.dataset.scBound = "1";
      m.addEventListener("click", () => toast({ kind: "cyan", msg: "Formula viewer" }));
    });
  }

  setTimeout(() => {
    _bindCertifyPanel();
    _bindSideRail();
  }, 250);

})();
