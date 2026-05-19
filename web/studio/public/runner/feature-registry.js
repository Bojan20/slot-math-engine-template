/*
 * ════════════════════════════════════════════════════════════════════════════
 *   FEATURE REGISTRY  —  IR.features[].kind  →  component manifest
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The slot template ships a thin UNIVERSAL shell (reels frame, payline
 * overlay, balance/bet/spin/auto/sound controls, paytable drawer, autoplay
 * panel, intro modal, big-win overlay).  Anything OPTIONAL — multiplier
 * strips, power meters, FS HUDs, H&W badges, expanding-wild animations,
 * mystery-symbol reveals, buy-feature buttons, bonus-pick wheels, cascade
 * drop FX — lives as a SEPARATE feature module that mounts only when the
 * IR's `features[]` array declares it.
 *
 * This registry is the **single source of truth** for that mapping.  When a
 * new mechanic enters the industry, you register it here once and Studio
 * + runtime + every future game IR pick it up automatically.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Contract a component manifest must satisfy
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   {
 *     kind:       string         IR.features[].kind value that triggers it
 *     module:     string         component filename under /runner/features/
 *     mountSlot:  string         which #mtl-features-* DOM slot to render into
 *     priority:   number         render order (lower = earlier; 100 = default)
 *     conflictsWith?: string[]   kinds that cannot co-exist (e.g. lines ↔ cluster)
 *     description: string        short doc surfaced in dev tools
 *   }
 *
 * Slot ids the universal shell exposes:
 *   #mtl-features-top         — top HUB row (meters, multiplier strip)
 *   #mtl-features-side-l      — left side rail (rare; reserved for vertical widgets)
 *   #mtl-features-side-r      — right side rail (FS multiplier ladder, etc.)
 *   #mtl-features-overlay     — full-stage overlay (FS HUD strip, H&W backdrop)
 *   #mtl-features-cells       — per-cell decorations (H&W locked-orb badges)
 *   #mtl-features-bottom      — bottom-bar buttons (buy-feature, bonus-pick)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Industry coverage
 * ──────────────────────────────────────────────────────────────────────────
 * Each entry below was hand-picked to cover the 12 most common slot
 * mechanics across major suppliers (Pragmatic, Hacksaw, Push, Stakelogic,
 * Nolimit, Relax, Yggdrasil, Play'n GO, NetEnt, Microgaming, Big Time
 * Gaming, Light & Wonder).  Unknown kinds are tolerated — `unknown_kind`
 * fires a console warning but does NOT block boot.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  const REGISTRY = [
    // ── Universal-but-optional ─────────────────────────────────────────────
    {
      kind: 'multiplier',
      module: 'multiplier.js',
      mountSlot: '#mtl-features-top',
      priority: 30,
      description: 'Generic multiplier strip — values + weights from IR.features.multiplier.distribution. Rolls on each winning spin per trigger.probability.',
    },
    {
      kind: 'power_meter',
      module: 'power-meter.js',
      mountSlot: '#mtl-features-top',
      priority: 20,
      description: 'Generic power accumulator — fills from base wins (or per-spin), label tiers (IDLE / CHARGING / FULL).',
    },
    {
      kind: 'accumulator',
      module: 'power-meter.js',
      mountSlot: '#mtl-features-top',
      priority: 20,
      description: 'Alias for power_meter — some IRs use accumulator to mean the same gauge.',
    },

    // ── Free Spins variants (one module covers all common variants) ────────
    {
      kind: 'free_spins',
      module: 'free-spins.js',
      mountSlot: '#mtl-features-overlay',
      priority: 40,
      description: 'FS HUD strip (spin counter, current mult, total win) + optional progressive multiplier ladder on right rail.',
    },

    // ── Hold & Win family ──────────────────────────────────────────────────
    {
      kind: 'hold_and_win',
      module: 'hold-and-win.js',
      mountSlot: '#mtl-features-cells',
      priority: 50,
      description: 'Locked-orb cell badges (per-cell value / jackpot tag), respin counter, full-grid bonus reveal.',
    },
    {
      kind: 'link_and_win',
      module: 'hold-and-win.js',
      mountSlot: '#mtl-features-cells',
      priority: 50,
      description: 'Alias for hold_and_win used by some suppliers (Link & Win — Pragmatic Money Train family).',
    },

    // ── Wild behaviors ─────────────────────────────────────────────────────
    {
      kind: 'expanding_wild',
      module: 'expanding-wild.js',
      mountSlot: '#mtl-features-cells',
      priority: 60,
      description: 'Full-reel wild expansion animation when a wild lands on configured reels.',
    },
    {
      kind: 'walking_wild',
      module: 'walking-wild.js',
      mountSlot: '#mtl-features-cells',
      priority: 60,
      description: 'Wild moves one reel left/right each spin until off-screen — useful in FS variants.',
    },
    {
      kind: 'sticky_wild',
      module: 'sticky-wild.js',
      mountSlot: '#mtl-features-cells',
      priority: 60,
      description: 'Wilds stay locked for N respins or until feature ends.',
    },

    // ── Symbol behaviors ───────────────────────────────────────────────────
    {
      kind: 'mystery_symbol',
      module: 'mystery-symbol.js',
      mountSlot: '#mtl-features-cells',
      priority: 70,
      description: 'Generic placeholder symbol reveals as a real symbol after spin stop (Hacksaw / Nolimit pattern).',
    },

    // ── Cascade family ─────────────────────────────────────────────────────
    {
      kind: 'cascade',
      module: 'cascade.js',
      mountSlot: '#mtl-features-overlay',
      priority: 35,
      description: 'Winning symbols vanish, remaining symbols drop, new symbols fall in — continues while wins land.',
    },
    {
      kind: 'tumble',
      module: 'cascade.js',
      mountSlot: '#mtl-features-overlay',
      priority: 35,
      description: 'Alias for cascade used by some suppliers (Pragmatic Tumble).',
    },

    // ── Player-initiated features ──────────────────────────────────────────
    {
      kind: 'buy_feature',
      module: 'buy-feature.js',
      mountSlot: '#mtl-features-bottom',
      priority: 80,
      description: 'BUY FEATURE button — IR provides per-feature buy multipliers; on click runner skips base game and enters the bought feature.',
    },
    {
      kind: 'bonus_buy',
      module: 'buy-feature.js',
      mountSlot: '#mtl-features-bottom',
      priority: 80,
      description: 'Alias for buy_feature used by some suppliers.',
    },

    // ── Bonus / pick games ─────────────────────────────────────────────────
    {
      kind: 'bonus_pick',
      module: 'bonus-pick.js',
      mountSlot: '#mtl-features-overlay',
      priority: 55,
      description: 'Generic pick-N-of-M bonus game; reveals prizes one-by-one with optional collect/lose terminator.',
    },
    {
      kind: 'wheel_bonus',
      module: 'bonus-pick.js',
      mountSlot: '#mtl-features-overlay',
      priority: 55,
      description: 'Wheel-of-fortune style bonus — also covered by bonus-pick.js (treats wheel as fixed-N pick).',
    },

    // ── Topology-specific (informational; renderer reads IR.topology.kind) ─
    {
      kind: 'cluster_pays',
      module: 'cluster-pays.js',
      mountSlot: '#mtl-features-overlay',
      priority: 25,
      conflictsWith: ['ways'],
      description: 'Cluster-pays renderer: replaces payline overlay with cluster outline (groups of connected matching symbols).',
    },
    {
      kind: 'ways',
      module: 'ways.js',
      mountSlot: '#mtl-features-overlay',
      priority: 25,
      conflictsWith: ['cluster_pays'],
      description: 'Ways-pays renderer: shows ways count badge + left-to-right matching cells highlight (no paylines).',
    },
  ];

  // ──────────────────────────────────────────────────────────────────────────
  //  Public API
  // ──────────────────────────────────────────────────────────────────────────

  function find(kind) {
    return REGISTRY.find(function (e) { return e.kind === kind; }) || null;
  }
  function all() { return REGISTRY.slice(); }
  function kinds() { return REGISTRY.map(function (e) { return e.kind; }); }

  // Check that the IR's feature set is internally consistent (no
  // conflicting mechanics declared together).
  function validateConflicts(irFeatures) {
    if (!Array.isArray(irFeatures)) return [];
    const declared = new Set(irFeatures.map(function (f) { return f && f.kind; }).filter(Boolean));
    const conflicts = [];
    for (const f of irFeatures) {
      if (!f || !f.kind) continue;
      const entry = find(f.kind);
      if (!entry || !entry.conflictsWith) continue;
      for (const c of entry.conflictsWith) {
        if (declared.has(c)) {
          conflicts.push({ a: f.kind, b: c, msg: `${f.kind} conflicts with ${c}` });
        }
      }
    }
    return conflicts;
  }

  // Plan the mount order for an IR's features — registry priority first,
  // then declaration order for ties.  Filters out kinds with no registered
  // component (returns them in `unknown` so the boot logs a warning).
  function plan(irFeatures) {
    const out = [];
    const unknown = [];
    if (!Array.isArray(irFeatures)) return { ordered: out, unknown: unknown };
    for (let i = 0; i < irFeatures.length; i++) {
      const f = irFeatures[i];
      if (!f || !f.kind) continue;
      const entry = find(f.kind);
      if (!entry) { unknown.push(f.kind); continue; }
      out.push({ entry: entry, irFeature: f, order: i });
    }
    out.sort(function (a, b) {
      const dp = a.entry.priority - b.entry.priority;
      return dp !== 0 ? dp : a.order - b.order;
    });
    return { ordered: out, unknown: unknown };
  }

  root.MTLFeatureRegistry = {
    find: find,
    all: all,
    kinds: kinds,
    validateConflicts: validateConflicts,
    plan: plan,
  };
})(typeof window !== 'undefined' ? window : globalThis);
