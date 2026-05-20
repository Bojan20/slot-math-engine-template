/* ════════════════════════════════════════════════════════════════════
   SLOT TEMPLATE RUNTIME — Wrath-of-Olympus-shape skin (art-free)
   ────────────────────────────────────────────────────────────────────
   Standalone playable slot game.  Reads window.__IR__ (embedded by
   Studio's "Play Template" build step) and runs the FULL production
   experience minus art:

     • PCG-style RNG seeded from ir.rng.default_seed
     • Weighted reel draw across N reels × M rows
     • Line evaluation with wild substitution + scatter pays
     • Lightning Multiplier — strip-scroll meter, pointer stop on result
     • Free Spins   — epic intro, FS HUD (counter + mult + total),
                      progressive multiplier ladder, retrigger, outro
     • Hold & Win   — intro card, locked-orb board, value/jackpot reveal,
                      respin reset on new orb, full-grid bonus
     • Win cap (limits.max_win_x)
     • Reel spin: WINDUP → ACCEL → STEADY → DECEL → CUSHION BOUNCE
                  (mirrors SPIN_PROFILE_NORMAL from Wrath timing.ts)
     • Anticipation glow on remaining reels when 2+ scatter already land
     • Cell highlights on payline + scatter cells + pulse loops
     • Big / Mega / Epic Win count-up (10× / 25× / 50× thresholds,
       4s per tier — mirrors bigWinController.ts BIG_WIN_TIERS)
     • Zeus Power Meter (fill from base wins, drives forced Lightning)
     • Lightning Multiplier meter (visual strip-stop on roll result)
     • Status bar rollup (PRESS SPIN → WIN: X.XX with scale pulse)
     • Spin hint / skip hint timing (mirrors spinHintManager.ts)
     • Quick menu (paytable / rules / help / sound / settings)
     • Autoplay panel (spin count + stop conditions + start)
     • Sound toggle (state-only — no audio bound, art pass)
     • Turbo toggle — switches to SPIN_PROFILE_TURBO timing
     • Intro modal (fake 1.4s loader, dismissable)
     • History rail (last 10 spins)
     • Paytable drawer (collapsible)
     • MTL Math Twin Lockstep — pre-flight reseal, per-spin lockstep,
       watchtower worker, replay log (UNCHANGED math contract)

   NO art assets — colored tier-gradient cells only.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  0 · BOOT — load IR                                           ║
  // ╚══════════════════════════════════════════════════════════════╝

  let IR;
  try {
    const raw = document.getElementById('inline-ir');
    if (raw && raw.textContent.trim()) {
      IR = JSON.parse(raw.textContent);
    } else if (window.__IR__) {
      IR = window.__IR__;
    } else {
      throw new Error('no IR embedded');
    }
  } catch (err) {
    document.body.innerHTML = `<pre style="padding:24px;color:#f43f5e;font:14px monospace">Slot template failed to load: ${err.message}</pre>`;
    return;
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  1 · HELPERS                                                  ║
  // ╚══════════════════════════════════════════════════════════════╝

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmt = (n, d = 2) => Number(n).toFixed(d);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // W222 — module-level easing helpers ported from
  // slot-game-template/src/animation/timing.ts.  Used by reel decel,
  // rollup counter, cascade fall, and any future settle animation.
  // Keeping them at module scope (instead of inline) makes them
  // reusable + benchmarkable + replaceable from a single point.
  //
  //   easeOutCubic    — gentle weighted-settle (rollup, reel decel)
  //   easeOutBounce   — refill landing curve (cascade drop)
  //   easeInOutSine   — celebrate-pulse / shimmer cycles
  //   easeOutQuart    — even slower-settle (big-win finale snap)
  //   easeInOutCubic  — symmetric ramp (intro pan)
  function easeOutCubic(t)   { const u = 1 - t; return 1 - u * u * u; }
  function easeOutQuart(t)   { const u = 1 - t; return 1 - u * u * u * u; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInOutSine(t)  { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutBounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { const t2 = t - 1.5 / d1;  return n1 * t2 * t2 + 0.75; }
    if (t < 2.5 / d1){ const t2 = t - 2.25 / d1; return n1 * t2 * t2 + 0.9375; }
    const t2 = t - 2.625 / d1; return n1 * t2 * t2 + 0.984375;
  }
  // Tier-based rollup duration helper — mirrors
  // slot-game-template/timing.ts `rollupDurationMs` so big-win count-ups
  // stretch in proportion to win magnitude.  Turbo halves all durations.
  function rollupDurationMs(winCoins, betCoins, turbo) {
    if (!(betCoins > 0)) return turbo ? 220 : 400;
    const x = winCoins / betCoins;
    let d;
    if (x >= 50)      d = 4500;   // tier3 EPIC
    else if (x >= 25) d = 3500;   // tier2 MEGA
    else if (x >= 10) d = 2500;   // tier1 BIG
    else if (x >= 3)  d = 600;    // medium
    else              d = 400;    // small
    return turbo ? Math.max(180, Math.round(d * 0.55)) : d;
  }

  // xoshiro128** — Blackman/Vigna 2018, 32-bit Number-only impl
  // (Math.imul + shifts, no BigInt).  Distributionally superior to mulberry32
  // (eliminates measured +0.06% H&W upward bias from mulberry32's
  // distribution skew, validated against 16B MC + brute-force enumeration).
  // Period 2^128 − 1.  Must be bit-identical to MTL oracle.js makeRng().
  // Replay-from-seed parity is preserved.  W218 (2026-05-20).
  function makeRng(seed) {
    // splitmix32 seeder — expands single u32 seed to 4 state words.
    let z = (seed >>> 0) || 0x9E3779B9;
    const sm32 = () => {
      z = (z + 0x9E3779B9) >>> 0;
      let x = z;
      x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B) >>> 0;
      x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35) >>> 0;
      return (x ^ (x >>> 16)) >>> 0;
    };
    let s0 = sm32(), s1 = sm32(), s2 = sm32(), s3 = sm32();
    // Guard against all-zero state (which xoshiro forbids).
    if ((s0 | s1 | s2 | s3) === 0) s0 = 1;
    return () => {
      // result = rotl(s1 * 5, 7) * 9
      const m = Math.imul(s1, 5) >>> 0;
      const r = ((m << 7) | (m >>> 25)) >>> 0;
      const result = Math.imul(r, 9) >>> 0;
      // state update
      const t = (s1 << 9) >>> 0;
      s2 = (s2 ^ s0) >>> 0;
      s3 = (s3 ^ s1) >>> 0;
      s1 = (s1 ^ s2) >>> 0;
      s0 = (s0 ^ s3) >>> 0;
      s2 = (s2 ^ t) >>> 0;
      s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;
      return result / 4294967296;
    };
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  2 · IR DERIVATIONS                                           ║
  // ╚══════════════════════════════════════════════════════════════╝

  const REELS = (IR.topology && IR.topology.reels) || 5;
  const ROWS = (IR.topology && IR.topology.rows) || 3;
  const PAYLINES = (IR.evaluation && IR.evaluation.paylines) || [];
  const MIN_MATCH = (IR.evaluation && IR.evaluation.min_match) || 3;
  const WILD_SUB = (IR.evaluation && IR.evaluation.wild_substitution && IR.evaluation.wild_substitution.enabled) !== false;
  const SYM_BY_ID = Object.fromEntries((IR.symbols || []).map((s) => [s.id, s]));
  const WIN_CAP = (IR.limits && IR.limits.max_win_x) || Infinity;
  const CURRENCY = (IR.bet && IR.bet.currency) || 'EUR';
  const BASE_BET = (IR.bet && IR.bet.base_bet) || 1;
  const BET_LEVELS = (IR.bet && IR.bet.bet_multipliers) || [1, 2, 3, 5, 10, 20, 50, 100];

  function findFeature(kind) {
    return ((IR.features || []).find((f) => f.kind === kind)) || null;
  }
  const F_FS  = findFeature('free_spins');
  const F_HNW = findFeature('hold_and_win');
  const F_MUL = findFeature('multiplier');

  function tierOf(sym) {
    if (!sym) return 'LP';
    switch (sym.kind) {
      case 'wild':       return 'WILD';
      case 'scatter':    return 'SCATTER';
      case 'bonus':      return 'MULT';
      case 'multiplier': return 'MULT';
      case 'hp':         return 'HP';
      case 'mp':         return 'MP';
      case 'lp':
      default:           return 'LP';
    }
  }
  // Split kind=hp into HP/MP by paytable rank (top half = HP, bottom = MP).
  (function deriveHpMpSplit() {
    const hpSyms = (IR.symbols || []).filter((s) => s.kind === 'hp');
    if (hpSyms.length < 4) return;
    const pt = IR.paytable || {};
    const ranked = hpSyms
      .map((s) => ({ id: s.id, x5: Number((pt[s.id] && (pt[s.id]['5'] ?? pt[s.id].x5)) || 0) }))
      .sort((a, b) => b.x5 - a.x5);
    const hpCount = Math.ceil(ranked.length / 2);
    for (let i = hpCount; i < ranked.length; i++) {
      const sym = SYM_BY_ID[ranked[i].id];
      if (sym) sym._displayTier = 'MP';
    }
  })();
  function displayTierOf(symId) {
    const s = SYM_BY_ID[symId];
    if (!s) return 'LP';
    if (s._displayTier) return s._displayTier;
    return tierOf(s);
  }

  // Pre-build reel draw tables (cumulative weights).
  function buildReels(reelMaps) {
    if (!Array.isArray(reelMaps)) return null;
    return reelMaps.map((m) => {
      const entries = Object.entries(m || {});
      const cum = new Float64Array(entries.length);
      const syms = new Array(entries.length);
      let acc = 0;
      for (let i = 0; i < entries.length; i++) {
        const [id, w] = entries[i];
        acc += Math.max(0.0001, Number(w));
        cum[i] = acc;
        syms[i] = id;
      }
      return { cum, syms, total: acc };
    });
  }
  const BASE_REELS = buildReels((IR.reels && IR.reels.base) || []);
  const FS_REELS   = buildReels((IR.reels && IR.reels.free_spins) || []);

  function drawSymbol(rng, reelIdx, reels) {
    const r = reels[reelIdx] || reels[reels.length - 1];
    const x = rng() * r.total;
    let lo = 0, hi = r.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x <= r.cum[mid]) hi = mid;
      else lo = mid + 1;
    }
    return r.syms[lo];
  }
  // Scatter prevention (Wrath-style "max N scatters per reel").
  const SCAT_PREV = (IR.reels && IR.reels.scatter_prevention) || null;
  function applyScatterPrevention(grid) {
    if (!SCAT_PREV || !SCAT_PREV.enabled) return grid;
    const maxPer = SCAT_PREV.max_scatters_per_reel || 1;
    const replace = SCAT_PREV.replacement_symbol;
    const scId = scatterId();
    if (!scId || !replace) return grid;
    for (let r = 0; r < REELS; r++) {
      let scSeen = 0;
      for (let y = 0; y < ROWS; y++) {
        if (grid[r][y] === scId) {
          if (scSeen >= maxPer) grid[r][y] = replace;
          else scSeen++;
        }
      }
    }
    return grid;
  }
  function drawGrid(rng, reels) {
    const grid = [];
    for (let r = 0; r < REELS; r++) {
      const col = [];
      for (let y = 0; y < ROWS; y++) col.push(drawSymbol(rng, r, reels));
      grid.push(col);
    }
    return applyScatterPrevention(grid);
  }

  function isWild(id)  { return SYM_BY_ID[id] && SYM_BY_ID[id].kind === 'wild'; }
  function scatterId() { const s = (IR.symbols || []).find((x) => x.kind === 'scatter'); return s ? s.id : null; }
  function bonusId()   { const s = (IR.symbols || []).find((x) => x.kind === 'bonus');   return s ? s.id : null; }
  function payAt(symId, count) {
    const pt = IR.paytable || {};
    const e = pt[symId];
    if (!e) return 0;
    return Number(e[String(count)] ?? e['x' + count] ?? 0);
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  3 · MATH — base eval / FS / H&W / Lightning                  ║
  // ╚══════════════════════════════════════════════════════════════╝

  function evalBase(grid) {
    const lineWins = [];
    let lineTotal = 0;
    // Canonical "best_paying_interpretation: true" — try BOTH candidates and
    // pick the max-paying:
    //   (1) first non-wild paying symbol on the line, and
    //   (2) WILD itself (for pure-wild prefixes).
    // The old code only used (1), which silently lost the ~0.33pp where
    // wild paytable beats the leftmost non-wild for short prefixes
    // (e.g. W,W,W,LA,GM: target=W@3 pays 2.0, target=LA@4 pays 1.55 — old
    // code returned 1.55).
    const wildSym = ((IR.symbols || []).find((x) => x.kind === 'wild') || {}).id;
    for (let li = 0; li < PAYLINES.length; li++) {
      const line = PAYLINES[li];
      const first = grid[0][line[0] ?? 0];
      const candidates = [];
      // Candidate A: first non-wild paying symbol along the chain
      if (WILD_SUB && isWild(first)) {
        for (let c = 1; c < REELS; c++) {
          const s = grid[c][line[c] ?? 0];
          if (!isWild(s)) { candidates.push(s); break; }
        }
      } else if (first) {
        candidates.push(first);
      }
      // Candidate B: WILD itself (always a candidate when wild_substitution
      // is enabled — covers pure-wild runs).
      if (WILD_SUB && wildSym && !candidates.includes(wildSym)) {
        candidates.push(wildSym);
      }
      let bestPay = 0, bestTarget = null, bestRun = 0;
      for (const target of candidates) {
        let runLen = 0;
        for (let c = 0; c < REELS; c++) {
          const s = grid[c][line[c] ?? 0];
          if (s === target || (WILD_SUB && isWild(s))) runLen++;
          else break;
        }
        if (runLen < MIN_MATCH) continue;
        const p = payAt(target, Math.min(runLen, 5));
        if (p > bestPay) {
          bestPay = p;
          bestTarget = target;
          bestRun = runLen;
        }
      }
      if (bestPay > 0 && bestTarget) {
        lineTotal += bestPay;
        const cells = [];
        for (let c = 0; c < bestRun; c++) cells.push({ r: c, y: line[c] ?? 0 });
        lineWins.push({ lineIdx: li, sym: bestTarget, count: bestRun, pay: bestPay, cells });
      }
    }
    const scId = scatterId();
    let scCount = 0, scatterPay = 0;
    const scCells = [];
    if (scId) {
      for (let r = 0; r < REELS; r++)
        for (let y = 0; y < ROWS; y++)
          if (grid[r][y] === scId) { scCount++; scCells.push({ r, y }); }
      if (scCount >= 3) {
        // 1) IR.paytable[S] is the canonical place for scatter pay
        scatterPay = payAt(scId, Math.min(scCount, 5));
        // 2) If author only declared scatter_pays on the FS feature
        //    (e.g. Wrath of Olympus IR — paytable has no "S" key), fall
        //    back to F_FS.scatter_pays — the same table the canonical
        //    Wrath engine reads in features.ts.  Without this fallback
        //    every scatter pay is silently zero, costing ~1.75pp RTP.
        if (scatterPay === 0 && F_FS && F_FS.scatter_pays) {
          const k = String(Math.min(scCount, 5));
          const v = F_FS.scatter_pays[k] ?? F_FS.scatter_pays[Math.min(scCount, 5)];
          scatterPay = Number(v) || 0;
        }
      }
    }
    const bnId = bonusId();
    let bonusCount = 0;
    if (bnId) {
      for (let r = 0; r < REELS; r++)
        for (let y = 0; y < ROWS; y++)
          if (grid[r][y] === bnId) bonusCount++;
    }
    return {
      grid, lineWins, lineTotal, scatterPay, scCount, scCells,
      bonusCount, baseWin: lineTotal + scatterPay,
    };
  }

  function awardFsSpins(scCount) {
    if (!F_FS || !F_FS.trigger || !F_FS.trigger.thresholds) return 0;
    let best = 0;
    for (const [k, v] of Object.entries(F_FS.trigger.thresholds)) {
      const n = parseInt(k, 10);
      if (n <= scCount && v > best) best = v;
    }
    return best;
  }
  function awardFsRetrigger(scCount) {
    if (!F_FS || !F_FS.retrigger || !F_FS.retrigger.enabled) return 0;
    const t = F_FS.retrigger.thresholds || (F_FS.trigger && F_FS.trigger.thresholds) || {};
    let best = 0;
    for (const [k, v] of Object.entries(t)) {
      const n = parseInt(k, 10);
      if (n <= scCount && v > best) best = v;
    }
    return best;
  }
  function pickWeighted(rng, list) {
    let total = 0;
    for (const e of list) total += Math.max(0, e.weight);
    let x = rng() * total;
    for (const e of list) {
      x -= Math.max(0, e.weight);
      if (x <= 0) return e.value;
    }
    return list[list.length - 1].value;
  }
  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function rollLightning(rng) {
    if (!F_MUL) return 1;
    if (F_MUL.scope && F_MUL.scope !== 'base_game_only') return 1;
    const prob = (F_MUL.trigger && F_MUL.trigger.probability) || 0;
    if (rng() >= prob) return 1;
    const dist = F_MUL.distribution || [];
    if (!dist.length) return 1;
    return pickWeighted(rng, dist);
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  4 · STATE + SPIN PROFILE                                     ║
  // ╚══════════════════════════════════════════════════════════════╝

  // Spin profile — mirrors Wrath SPIN_PROFILE_NORMAL / SPIN_PROFILE_TURBO,
  // shortened for the no-art template so a full spin cycle (windup → spin
  // → 5-reel staggered decel → bounce) lands inside ~1.5s.  Production
  // would use Wrath's heavier 1350ms steady; template ships snappier.
  // Wrath-canonical timing (src/timing.ts SPIN_PROFILE_NORMAL / TURBO / SLAM).
  // Numbers verified by audit against the production reels:
  //   • windupMs = 115 (7 frames @ 60fps) with 42px pull-up
  //   • accelMs = 130 (acceleration up to steady speed)
  //   • steadyMs = 1350 (full-speed scroll; turbo 450)
  //   • decelMs = 300 (ease-out to landing position)
  //   • staggerMs = 180 between reel STOPS (turbo 45)
  //   • bouncePx = 6 (turbo 3), bounceCount = 2 (turbo 1), bounceDecay = 0.3
  //   • windupStaggerMs = 33 between reel STARTS (~2 frames @ 60fps)
  //   • anticipationMs = +2000 on reels 3+ when 2+ scatters landed (turbo +800)
  // staggerMs lowered to Wrath canonical 90ms (was 180ms) — reels stop
  // more snappily, "boom-boom-boom-boom-boom" left-to-right rhythm rather
  // than the slower IGT 250ms cadence.  Wrath src/timing.ts ships 90.
  //
  // ghostMs = IGT pre-stop "nazre" preview window (final symbol shown 3px
  // above target at opacity 0.6 for N ms before bounce kicks in).  Industry
  // spec is 50ms — short enough to feel intentional, long enough for the
  // player to read what's about to land.
  //
  // rotateMs = symbol-rotation interval during steady spin — every N ms
  // each reel re-picks a random symbol on each visible cell, so the strip
  // feels alive (real motion) instead of three static symbols translating.
  // Wrath uses requestAnimationFrame at ~60fps; ours runs ~80ms (~12fps)
  // which reads identically with the blur(4px) motion filter applied.
  const SPIN_PROFILE = {
    normal: {
      windupMs: 115, accelMs: 130, steadyMs: 1350, decelMs: 300,
      staggerMs: 90, windupStaggerMs: 33,
      rotateMs: 80,
      ghostMs: 50,
      bouncePx: 6, bounceCount: 2, bounceDecay: 0.3, bounceElasticity: 1.8,
      anticipationMs: 2000,
      stopGap: 120, betweenSpinsMs: 200,
      bounceMs: 320, // total cushion settle window (2 iterations × ~160ms)
    },
    turbo: {
      windupMs:  65, accelMs:  70, steadyMs:  450, decelMs: 120,
      staggerMs:  35, windupStaggerMs: 16,
      rotateMs: 45,
      ghostMs: 25,
      bouncePx: 3, bounceCount: 1, bounceDecay: 0.2, bounceElasticity: 2.0,
      anticipationMs: 800,
      stopGap:  40, betweenSpinsMs:  50,
      bounceMs: 160,
    },
    slam: {
      windupMs: 0, accelMs: 0, steadyMs: 0, decelMs: 100,
      staggerMs: 30, windupStaggerMs: 0,
      rotateMs: 0,
      ghostMs: 0,
      bouncePx: 0, bounceCount: 0, bounceDecay: 0, bounceElasticity: 0,
      anticipationMs: 0,
      stopGap: 0, betweenSpinsMs: 0,
      bounceMs: 0,
    },
  };

  const state = {
    rng: makeRng((IR.rng && IR.rng.default_seed) || Math.floor(Math.random() * 1e9)),
    balance: 100.0,
    betLevelIdx: 0,
    spinsPlayed: 0,
    hits: 0,
    totalWagered: 0,
    totalWon: 0,
    maxWin: 0,
    lastWin: 0,
    history: [],
    spinning: false,
    autoplay: { active: false, remaining: 0, stopOnFs: true, stopOnBonus: true, stopOnWin: 0, stopOnLoss: 0, stopOnProfit: 0, startBalance: 0 },
    featureLabel: '',
    hnwLockedCells: null,
    zeusFill: 0,
    soundMuted: false,
    turbo: false,
    skipBigWin: false,
  };
  function currentProfile() { return state.turbo ? SPIN_PROFILE.turbo : SPIN_PROFILE.normal; }
  function currentBet() { return Number(BASE_BET) * Number(BET_LEVELS[state.betLevelIdx] || 1); }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  5 · DOM HOOKS — grouped by area                              ║
  // ╚══════════════════════════════════════════════════════════════╝

  // Top hub
  const titleEl       = $('#game-title');
  const versionEl     = $('#game-version');
  const zeusFillEl    = $('#zeusMeterFill');
  const zeusLabelEl   = $('#zeusMeterLabel');
  const zeusMeterEl   = $('#zeusMeter');
  const topBalanceEl  = $('#topBalanceValue');
  const currencyEl    = $('#currency');
  const lightningMeterEl = $('#lightningMeter');

  // Stats rails
  const spinsEl       = $('#stat-spins');
  const hitsEl        = $('#stat-hits');
  const hitPctEl      = $('#stat-hit-pct');
  const totalWinEl    = $('#stat-total-win');
  const rtpEl         = $('#stat-rtp');
  const maxWinEl      = $('#stat-max-win');

  // Stage
  const reelsEl       = $('#reels-grid');
  const winBannerEl   = $('#win-banner');
  const winBannerAmt  = $('#win-banner-amount');
  const winBannerMult = $('#win-banner-mult');
  const featOverlay   = $('#feature-overlay');
  const featKindEl    = $('#fo-kind');
  const featTitleEl   = $('#fo-title');
  const featDetailEl  = $('#fo-detail');
  const featGoBtn     = $('#fo-go');

  // Bottom bar
  const balEl         = $('#bal');
  const balLegacyEl   = $('#balance');
  const betDisplayEl  = $('#bet');
  const betLegacyEl   = $('#bet-amount');
  const statusTextEl  = $('#statusBarText');
  const statusValueEl = $('#statusBarValue');
  const spinBtn       = $('#spin-btn');
  const betPlusBtn    = $('#betPlusBtn') || $('#bet-up');
  const betMinusBtn   = $('#betMinusBtn') || $('#bet-down');
  const auto10Btn     = $('#auto-10');
  const auto100Btn    = $('#auto-100');
  const autoStopBtn   = $('#auto-stop');
  const autoOpenBtn   = $('#autoPlayOpenBtn');
  const menuBtnEl     = $('#menuBtn');
  const soundBtnEl    = $('#soundBtn');

  // Quick menu
  const quickMenuEl     = $('#quickMenu');
  const menuPaytableBtn = $('#menuPaytableBtn');
  const menuSoundBtn    = $('#menuSoundBtn');
  const menuRulesBtn    = $('#menuRulesBtn');
  const menuHelpBtn     = $('#menuHelpBtn');
  const menuSettingsBtn = $('#menuSettingsBtn');
  const menuBalValEl    = $('#menuBalanceValue');

  // Autoplay panel
  const autoplayPanelEl   = $('#autoPlayPanel');
  const autoplayCloseBtn  = $('#autoPlayCloseBtn');
  const autoplayStartBtn  = $('#autoPlayStartBtn');
  const stopOnFsCheck     = $('#stopOnFreeSpins');
  const stopOnBonusCheck  = $('#stopOnBonus');

  // Intro modal
  const introModalEl      = $('#introModal');
  const introProgressFill = $('#introProgressFill');
  const introContinueBtn  = $('#introContinueBtn');
  const introLoadPercent  = $('#introLoadPercent');
  const introStatusText   = $('#introStatusText');

  // History rail + paytable drawer
  const historyListEl    = $('#history-list');
  const paytableToggle   = $('#paytable-toggle');
  const paytableDrawer   = $('#paytable-drawer');
  const paytableCloseBtn = $('#pd-close');

  // Big Win — created lazily
  let bigWinEl = null;

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  6 · GRID — build + paint                                     ║
  // ╚══════════════════════════════════════════════════════════════╝

  function setupGrid() {
    if (!reelsEl) return;
    reelsEl.style.gridTemplateColumns = `repeat(${REELS}, 1fr)`;
    reelsEl.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
    reelsEl.innerHTML = '';
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.y = String(y);
        cell.innerHTML = '<span class="cell-id">·</span>';
        reelsEl.appendChild(cell);
      }
    }
  }
  function cellAt(r, y) {
    if (!reelsEl) return null;
    return reelsEl.querySelector(`.cell[data-r="${r}"][data-y="${y}"]`);
  }
  function paintCell(r, y, symId, opts) {
    const cell = cellAt(r, y);
    if (!cell) return;
    const tier = displayTierOf(symId);
    cell.className = 'cell tier-' + tier;
    if (opts) {
      if (opts.spinning)   cell.classList.add('is-spinning');
      if (opts.windup)     cell.classList.add('is-windup');
      if (opts.decel)      cell.classList.add('is-decel');
      if (opts.ghost)      cell.classList.add('is-ghost');
      if (opts.bounce)     cell.classList.add('is-bounce');
      if (opts.win)        cell.classList.add('is-win');
      if (opts.scatter)    cell.classList.add('is-scatter-win');
      if (opts.anticipate) cell.classList.add('is-anticipate');
    }
    // For the strip-motion CSS pseudo-elements we expose the current
    // symbol via data-spin-sym so the ::before / ::after "ghost trails"
    // above + below the cell render the same character during spinning.
    cell.setAttribute('data-spin-sym', symId || '?');
    const sym = SYM_BY_ID[symId];
    const name = sym && sym.name && sym.name !== symId ? `<span class="cell-name">${sym.name}</span>` : '';
    cell.innerHTML = `<span class="cell-id">${symId || '?'}</span>${name}`;
  }
  function clearWinHighlights() {
    if (!reelsEl) return;
    $$('#reels-grid .cell').forEach((c) => {
      c.classList.remove('is-win', 'is-scatter-win', 'is-anticipate',
                         'is-windup', 'is-spinning', 'is-decel', 'is-ghost', 'is-bounce');
      // Release the "locked" flag set during the previous spin's decel.
      // The next spin's rotation interval needs to be free to repaint.
    delete c.dataset.locked;
    });
  }
  function pickAnyId() {
    const syms = IR.symbols || [];
    if (!syms.length) return '?';
    return syms[Math.floor(Math.random() * syms.length)].id;
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  7 · SPIN ANIMATION — windup → spin → decel → bounce          ║
  // ╚══════════════════════════════════════════════════════════════╝

  async function animateGrid(finalGrid, result, opts) {
    opts = opts || {};
    let P = currentProfile();
    const scId = scatterId();
    state.slamRequested = false;

    // Push profile timings to CSS so keyframes pick them up (--t-windup
    // / --t-decel / --t-bounce drive cell-windup / cell-decel / cell-bounce
    // durations).  Also set the per-cell pixel vars (--rwp-px windup pull-up,
    // --rsp-px spin scroll throw, --rbn-px bounce overshoot).  This lets the
    // turbo/slam profiles override the keyframe geometry without touching CSS.
    const root = document.documentElement;
    root.style.setProperty('--t-windup', P.windupMs + 'ms');
    root.style.setProperty('--t-decel',  P.decelMs  + 'ms');
    root.style.setProperty('--t-bounce', P.bounceMs + 'ms');
    const windupPx = state.turbo ? 18 : 42;     // Wrath windupRise
    const spinPx   = state.turbo ? 30 : 24;     // per-frame scroll throw
    function applyReelVars(reelIdx) {
      // Stagger the windup START per reel (windupStaggerMs) — reel 0 begins
      // at t=0, reel N at t=N*windupStaggerMs.  We bake this in via animation-delay
      // on each cell so the keyframe itself stays uniform.
      const delay = reelIdx * P.windupStaggerMs + 'ms';
      for (let y = 0; y < ROWS; y++) {
        const c = cellAt(reelIdx, y);
        if (!c) continue;
        c.style.setProperty('--rwp-px', -windupPx + 'px');
        c.style.setProperty('--rsp-px', spinPx + 'px');
        c.style.setProperty('--rbn-px', P.bouncePx + 'px');
        c.style.animationDelay = delay;
      }
    }

    // Phase A — windup pull-up with per-reel stagger (windupStaggerMs)
    for (let r = 0; r < REELS; r++) {
      applyReelVars(r);
      for (let y = 0; y < ROWS; y++) {
        paintCell(r, y, pickAnyId(), { windup: true });
      }
    }
    // Wait for the slowest reel's windup to finish (last reel start + windupMs)
    await wait(P.windupMs + (REELS - 1) * P.windupStaggerMs);

    // Phase B — start spinning all reels with the same windup stagger so
    // reel N "catches up" rather than all reels snapping to spin at once.
    // Also flip on the grid-level speedlines overlay (IGT-style 8 white
    // horizontal lines repeating-linear-gradient).  We let the CSS keyframe
    // fade them in/out automatically — only need to toggle the class.
    //
    // CRITICAL: each reel gets a symbol-rotation interval (setInterval at
    // P.rotateMs) so the visible cells re-randomize while spinning — a
    // real strip moving, not three static symbols just oscillating on
    // translateY.  The interval is killed the instant the reel enters
    // decel phase (commitStopSymbols pattern from Wrath src/reels.ts:7272)
    // so finalized symbols are NEVER overwritten by another random pick.
    if (reelsEl) reelsEl.classList.add('is-speeding');
    const reelRotateTimers = new Array(REELS).fill(null);
    function startReelRotation(reelIdx) {
      if (P.rotateMs <= 0) return;
      reelRotateTimers[reelIdx] = setInterval(() => {
        for (let y = 0; y < ROWS; y++) {
          const c = cellAt(reelIdx, y);
          if (!c || c.dataset.locked === '1') continue;
          const symId = pickAnyId();
          const tier = displayTierOf(symId);
          c.className = 'cell tier-' + tier + ' is-spinning';
          c.setAttribute('data-spin-sym', symId);
          const sym = SYM_BY_ID[symId];
          const name = sym && sym.name && sym.name !== symId ? `<span class="cell-name">${sym.name}</span>` : '';
          c.innerHTML = `<span class="cell-id">${symId || '?'}</span>${name}`;
        }
      }, P.rotateMs);
    }
    function stopReelRotation(reelIdx) {
      if (reelRotateTimers[reelIdx]) {
        clearInterval(reelRotateTimers[reelIdx]);
        reelRotateTimers[reelIdx] = null;
      }
    }
    for (let r = 0; r < REELS; r++) {
      const reelIdx = r;
      setTimeout(() => {
        for (let y = 0; y < ROWS; y++) {
          const c = cellAt(reelIdx, y);
          if (c) c.style.animationDelay = '';   // clear stagger after windup
          paintCell(reelIdx, y, pickAnyId(), { spinning: true });
        }
        startReelRotation(reelIdx);
      }, reelIdx * P.windupStaggerMs);
    }
    // The speedlines keyframe runs for 1.2s then fades out; once that
    // window passes, the grid no longer needs the class.  Schedule the
    // removal to coincide with the steady→decel transition of the LAST
    // reel so the lines disappear right as reels start settling.
    const speedlinesOffAt =
      P.windupMs + (REELS - 1) * P.windupStaggerMs +
      P.steadyMs + (REELS - 1) * P.staggerMs;
    setTimeout(() => { if (reelsEl) reelsEl.classList.remove('is-speeding'); }, speedlinesOffAt);

    // Phase C — stop each reel sequentially with stagger + anticipation
    //   • staggerMs = gap between consecutive reel STOPS (Wrath 180ms)
    //   • anticipationMs = extra hold on reels 3+ when 2+ scatters landed
    //   • slam: if state.slamRequested fires mid-spin, all remaining reels
    //     short-circuit through slam profile (100ms decel, no bounce)
    let scLandedSoFar = 0;
    const stopOps = [];
    const spinStartedAt = performance.now() + P.windupMs;
    for (let r = 0; r < REELS; r++) {
      const reelIdx = r;
      const willHaveScatter = scId && finalGrid[reelIdx].some((s) => s === scId);
      const isAnticipated = scLandedSoFar >= 2 && reelIdx >= 2 && reelIdx < REELS;
      const baseDelay =
        P.windupMs +
        (REELS - 1) * P.windupStaggerMs +     // wait for last reel to finish windup
        P.steadyMs +
        reelIdx * P.staggerMs +
        (isAnticipated ? P.anticipationMs : 0);

      stopOps.push(new Promise((resolve) => {
        setTimeout(async () => {
          // If a slam was requested, swap to the slam profile for the rest
          // of the run (Wrath behavior — clicking SPIN mid-spin collapses
          // the decel + bounce window).
          const useSlam = !!state.slamRequested;
          const PD = useSlam ? SPIN_PROFILE.slam : P;
          // ── COMMIT STOP SYMBOLS (Wrath src/reels.ts:7272 pattern) ──
          // STOP the random-symbol rotation for this reel and IMMEDIATELY
          // paint the FINAL symbols.  From this moment forward those cells
          // are LOCKED — no further repaints, no random flips.  The decel
          // CSS animation then visually slides the locked symbols from
          // above the cell down into place via translateY easeOutCubic.
          stopReelRotation(reelIdx);
          root.style.setProperty('--t-decel', PD.decelMs + 'ms');
          for (let y = 0; y < ROWS; y++) {
            const c = cellAt(reelIdx, y);
            if (c) c.style.animationDelay = '';
            paintCell(reelIdx, y, finalGrid[reelIdx][y], { decel: true });
            if (c) c.dataset.locked = '1';   // hard-lock: no future repaints
          }
          await wait(PD.decelMs);
          // IGT pre-stop GHOST phase — final symbol nazre 3px above
          // target at opacity 0.6 for ghostMs window before bounce.
          if (PD.ghostMs > 0) {
            root.style.setProperty('--t-ghost', PD.ghostMs + 'ms');
            for (let y = 0; y < ROWS; y++) {
              paintCell(reelIdx, y, finalGrid[reelIdx][y], { ghost: true });
              const c = cellAt(reelIdx, y);
              if (c) c.dataset.locked = '1';
            }
            await wait(PD.ghostMs);
          }
          // Land final cells with cushion bounce.  Symbols already locked —
          // we just toggle the bounce class so the spring keyframe runs.
          root.style.setProperty('--t-bounce', PD.bounceMs + 'ms');
          for (let y = 0; y < ROWS; y++) {
            const c = cellAt(reelIdx, y);
            if (c) c.style.setProperty('--rbn-px', PD.bouncePx + 'px');
            paintCell(reelIdx, y, finalGrid[reelIdx][y], { bounce: PD.bounceMs > 0 });
            if (c) c.dataset.locked = '1';
          }
          if (willHaveScatter) scLandedSoFar++;
          // Trigger anticipation glow on next unland reels if threshold reached
          if (!useSlam && scLandedSoFar === 2 && reelIdx < REELS - 1) {
            for (let rr = reelIdx + 1; rr < REELS; rr++) {
              for (let y = 0; y < ROWS; y++) {
                const c = cellAt(rr, y);
                if (c) c.classList.add('is-anticipate');
              }
            }
          }
          resolve();
        }, baseDelay);
      }));
    }
    await Promise.all(stopOps);
    // Hold for the bounce window so the cushion animation completes before
    // wins highlight (otherwise the scale-pop overlaps with .is-win pulse).
    await wait(P.bounceMs);

    // Phase D — clear transient classes, highlight wins, banner.
    // The data-locked flag stays set: we keep the final symbols locked
    // through the entire win-presentation phase so paylines + dim cycles
    // don't accidentally re-roll a cell.  It's cleared at next spinOnce()
    // via clearWinHighlights().
    if (reelsEl) reelsEl.classList.remove('is-speeding');
    // Defensive: nuke any lingering rotation timer (e.g. if a slam fired
    // while reel 4 was mid-rotation but Phase C resolved early).
    for (let r = 0; r < REELS; r++) {
      if (reelRotateTimers[r]) {
        clearInterval(reelRotateTimers[r]);
        reelRotateTimers[r] = null;
      }
    }
    $$('#reels-grid .cell').forEach((c) => {
      c.classList.remove('is-windup', 'is-spinning', 'is-decel', 'is-ghost', 'is-bounce', 'is-anticipate');
      c.style.animationDelay = '';
      c.removeAttribute('data-spin-sym');
      c.style.removeProperty('--rwp-px');
      c.style.removeProperty('--rsp-px');
      c.style.removeProperty('--rbn-px');
    });
    state.slamRequested = false;
    const totalWin = result.lineTotal + result.scatterPay;
    if (totalWin > 0) {
      // The top-of-reels banner is deprecated; capturing mult here lets
      // rollupStatusWin attach a "· N×" suffix to the bottom counter.
      showWinBanner(totalWin, opts.multAnnounce && opts.multAnnounce > 1 ? opts.multAnnounce : null);
      // Win amount is shown via the bottom-center #statusBarValue rollup
      // (see rollupStatusWin), which spinOnce awaits after this returns.
    }
    // Cycle through winning paylines ONE-AT-A-TIME (Wrath-canonical), await
    // so the next SPIN click can't be triggered until the sequence ends.
    // The next click also aborts the sequence via `clearPaylines()`.
    await highlightWins(result);
  }

  function highlightWins(result) {
    // Scatter cells highlight stays persistent through the spin reveal
    // (independent of payline cycling — scatters are not part of the
    // sequence loop).
    if (result.scCount >= 3) {
      for (const c of result.scCells) {
        const cell = cellAt(c.r, c.y);
        if (cell) cell.classList.add('is-scatter-win');
      }
    }
    // Per-line cycling sequence — adds + clears `.is-win` per iteration.
    // Caller can `await` this if it wants the full reveal before the next
    // spin starts (spinOnce does); user can interrupt by clicking SPIN
    // again to clip the sequence.
    return playPaylineSequence(result.lineWins || []);
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ Payline SVG overlay  —  ONE-AT-A-TIME cycling sequence        ║
  // ║                                                                ║
  // ║ Mirrors Wrath presentation.ts executeLineHighlight():          ║
  // ║   for each lineWin:                                            ║
  // ║     clear → highlight THIS line's cells → draw polyline        ║
  // ║     → render payout badge → wait LINE_MS → clear → next        ║
  // ║                                                                ║
  // ║ Skippable: setting `state.skipPaylineSeq = true` (e.g. on next ║
  // ║ SPIN click) breaks the loop and clears everything immediately. ║
  // ╚══════════════════════════════════════════════════════════════╝

  // Timing — matches Wrath WIN_TIER_TIMING medium tier (one set for all
  // tiers in the generic template; finer tiering can be added later).
  const PAYLINE_LINE_MS    = 700;   // hold time per line
  const PAYLINE_LINE_GAP   = 60;    // gap before next line starts
  const PAYLINE_DRAW_MS    = 380;   // stroke draw-in animation duration

  const paylineSvg = $('#paylineOverlay');
  let paylineSeqAborted = false;
  function clearPaylines() {
    paylineSeqAborted = true;
    if (paylineSvg) paylineSvg.innerHTML = '';
    // Drop per-line cell highlights + dim overlay (scatter highlight is
    // cleared separately by clearWinHighlights at spin start).
    $$('#reels-grid .cell').forEach(function (c) {
      c.classList.remove('is-win', 'is-line-active', 'is-dimmed');
    });
    // Remove any floating payout label
    const lbl = document.getElementById('payline-label-floater');
    if (lbl && lbl.parentNode) lbl.parentNode.removeChild(lbl);
  }

  function _paylineFrameCoords() {
    const grid = $('#reels-grid');
    if (!grid || !paylineSvg) return null;
    const gridRect = grid.getBoundingClientRect();
    const svgRect = paylineSvg.getBoundingClientRect();
    return {
      cellW: gridRect.width / REELS,
      cellH: gridRect.height / ROWS,
      offsetX: gridRect.left - svgRect.left,
      offsetY: gridRect.top - svgRect.top,
      w: svgRect.width,
      h: svgRect.height,
    };
  }

  function _renderPaylineLabel(lw, coords) {
    // Floating payout badge — positioned above the geometric center of
    // the winning cells.  Created/recreated on each line so the text
    // pop animation fires fresh.
    const old = document.getElementById('payline-label-floater');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const cells = lw.cells || [];
    if (cells.length === 0) return;
    let cx = 0, cy = 0;
    for (const c of cells) {
      cx += coords.offsetX + c.r * coords.cellW + coords.cellW / 2;
      cy += coords.offsetY + c.y * coords.cellH + coords.cellH / 2;
    }
    cx /= cells.length; cy /= cells.length;
    const lbl = document.createElement('div');
    lbl.id = 'payline-label-floater';
    lbl.className = 'payline-label line-' + (lw.lineIdx % 10);
    lbl.innerHTML =
      '<span class="payline-label__line">LINE ' + (lw.lineIdx + 1) + '</span>' +
      '<span class="payline-label__sep">·</span>' +
      '<span class="payline-label__sym">' + (lw.count || cells.length) + '× ' + (lw.sym || '') + '</span>' +
      '<span class="payline-label__sep">·</span>' +
      '<span class="payline-label__pay">' + fmt(Number(lw.pay) * currentBet()) + '</span>';
    // Inline absolute position so we can drop it directly into the reelFrame.
    lbl.style.position = 'absolute';
    lbl.style.left = cx + 'px';
    lbl.style.top  = (cy - 36) + 'px';
    lbl.style.transform = 'translate(-50%, -50%)';
    const frame = document.querySelector('.reelFrame');
    (frame || document.body).appendChild(lbl);
  }

  async function playPaylineSequence(lineWins) {
    if (!paylineSvg || !lineWins || lineWins.length === 0) return;
    paylineSeqAborted = false;
    const coords = _paylineFrameCoords();
    if (!coords) return;
    paylineSvg.setAttribute('viewBox', '0 0 ' + coords.w + ' ' + coords.h);

    const seqStart = performance.now();
    state.paylineSeqRunning = true;
    state.paylineSeqStartedAt = seqStart;

    for (let i = 0; i < lineWins.length; i++) {
      if (paylineSeqAborted) break;
      const lw = lineWins[i];
      const colorIdx = lw.lineIdx % 10;
      const cells = lw.cells || [];
      if (cells.length < 2) continue;

      // Clear previous polyline + previous cell highlights, then highlight
      // ONLY this line's cells (mirrors Wrath sequential reveal).
      paylineSvg.innerHTML = '';
      $$('#reels-grid .cell.is-win, #reels-grid .cell.is-line-active').forEach(function (c) {
        c.classList.remove('is-win', 'is-line-active');
      });
      // Build a set of "active" cell keys for fast lookup, then in one
      // pass: add `.is-win` + `.is-line-active` to active cells; add
      // `.is-dimmed` to everyone else.  Mirrors Wrath renderer.ts
      // dimNonWinningCells() pattern (45% darken, 200ms cubic ease-in,
      // instant clear between line transitions).
      const activeKeys = new Set();
      for (const c of cells) activeKeys.add(c.r + ':' + c.y);
      $$('#reels-grid .cell').forEach(function (cellEl) {
        const r = Number(cellEl.getAttribute('data-r'));
        const y = Number(cellEl.getAttribute('data-y'));
        const key = r + ':' + y;
        if (activeKeys.has(key)) {
          cellEl.classList.remove('is-dimmed');
          cellEl.classList.add('is-win', 'is-line-active');
        } else {
          cellEl.classList.add('is-dimmed');
        }
      });

      // Build polyline through cell centers, then SVG sets up stroke
      // dashoffset draw-in animation.  Per-line color cycles through
      // the 10-color CSS palette (.line-0 … .line-9).
      const pts = cells.map(function (c) {
        const cx = coords.offsetX + c.r * coords.cellW + coords.cellW / 2;
        const cy = coords.offsetY + c.y * coords.cellH + coords.cellH / 2;
        return cx.toFixed(2) + ',' + cy.toFixed(2);
      }).join(' ');
      const approxLen = Math.round(coords.cellW * (cells.length - 1) * 1.15);
      paylineSvg.innerHTML =
        '<polyline class="payline-path payline-path--active line-' + colorIdx + '" points="' + pts + '" ' +
        'style="--len:' + approxLen + ';animation-duration:' + PAYLINE_DRAW_MS + 'ms;"></polyline>';
      // Pin markers per cell — slight stagger so player's eye reads
      // direction.  We append after the polyline so they paint on top.
      let pinHtml = '';
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        const cx = coords.offsetX + c.r * coords.cellW + coords.cellW / 2;
        const cy = coords.offsetY + c.y * coords.cellH + coords.cellH / 2;
        const pinDelay = PAYLINE_DRAW_MS * 0.5 + k * 45;
        pinHtml +=
          '<circle class="payline-pin line-' + colorIdx + '" cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) +
          '" r="7" style="animation-delay:' + pinDelay + 'ms;"></circle>';
      }
      paylineSvg.insertAdjacentHTML('beforeend', pinHtml);

      _renderPaylineLabel(lw, coords);

      // Hold this line for PAYLINE_LINE_MS, abort early if a new spin starts.
      const holdUntil = performance.now() + PAYLINE_LINE_MS;
      while (performance.now() < holdUntil) {
        if (paylineSeqAborted) break;
        // 60ms slices so we react to abort flag quickly
        await wait(60);
      }
      if (paylineSeqAborted) break;

      // Gap before next line (skip if last)
      if (i < lineWins.length - 1) await wait(PAYLINE_LINE_GAP);
    }

    // End state: clear lines + cell highlights + dim overlay + label
    if (paylineSvg) paylineSvg.innerHTML = '';
    $$('#reels-grid .cell').forEach(function (c) {
      c.classList.remove('is-win', 'is-line-active', 'is-dimmed');
    });
    const old = document.getElementById('payline-label-floater');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    state.paylineSeqRunning = false;
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  8 · WIN BANNER + BIG WIN OVERLAY                             ║
  // ╚══════════════════════════════════════════════════════════════╝

  // Wrath-canonical: the top-of-reels "win-banner" pill is deprecated.
  // Wins now display via #statusBarValue at the BOTTOM of the bar with
  // a 400ms count-up rollup (see rollupStatusWin below).  We keep these
  // stubs so older callers don't crash; they intentionally do nothing.
  function showWinBanner(amount, mult) {
    if (winBannerEl) winBannerEl.setAttribute('hidden', '');
    // The multiplier announcement is still useful inside the rollup label
    // when lightning fires — runtime.js passes the value through.
    state._lastWinMult = mult && mult > 1 ? mult : null;
  }
  function hideWinBanner() { if (winBannerEl) winBannerEl.setAttribute('hidden', ''); }

  // BIG_WIN tiers — exact thresholds + per-tier duration from Wrath bigWinController.ts.
  const BIG_WIN_TIERS = [
    { idx: 1, threshold: 10, label: 'BIG WIN' },
    { idx: 2, threshold: 25, label: 'MEGA WIN' },
    { idx: 3, threshold: 50, label: 'EPIC WIN' },
  ];
  const BIG_WIN_TIER_MS = 4000;

  function tierForXBet(xBet) {
    let tier = 0;
    for (const t of BIG_WIN_TIERS) if (xBet >= t.threshold) tier = t.idx;
    return tier;
  }
  function ensureBigWinOverlay() {
    if (bigWinEl) return bigWinEl;
    const el = document.createElement('div');
    el.className = 'bigwin-overlay';
    el.setAttribute('hidden', '');
    el.innerHTML = `
      <div class="bw-rays" aria-hidden="true"></div>
      <div class="bw-card">
        <div class="bw-tier">BIG WIN</div>
        <div class="bw-amount mono">0.00</div>
        <div class="bw-mult mono">0×</div>
        <button class="bw-skip" type="button">SKIP</button>
      </div>
    `;
    document.body.appendChild(el);
    bigWinEl = el;
    bigWinEl.querySelector('.bw-skip').addEventListener('click', () => { state.skipBigWin = true; });
    return bigWinEl;
  }
  async function playBigWinRollup(amount, bet) {
    const xBet = bet > 0 ? amount / bet : amount;
    const tier = tierForXBet(xBet);
    if (tier === 0) return;
    const overlay = ensureBigWinOverlay();
    const card = overlay.querySelector('.bw-card');
    const tierEl = overlay.querySelector('.bw-tier');
    const amtEl = overlay.querySelector('.bw-amount');
    const multEl = overlay.querySelector('.bw-mult');
    state.skipBigWin = false;
    overlay.removeAttribute('hidden');
    // Mark body so .payline-overlay can hide via CSS (Wrath behavior: win
    // lines vanish behind the Big Win reveal so the count-up has the stage
    // to itself).  Cleared after the reveal completes / is skipped.
    document.body.classList.add('is-bigwin');
    document.getElementById('appRoot')?.classList.add('has-bigwin');
    clearPaylines();
    // Kick off coin shower — tier-scaled particle burst (24 / 48 / 80 coins)
    playCoinShower(tier);
    const stages = BIG_WIN_TIERS.slice(0, tier);
    const totalMs = stages.length * BIG_WIN_TIER_MS;
    const start = performance.now();
    card.classList.remove('is-tier-2', 'is-tier-3');
    tierEl.textContent = stages[0].label;
    amtEl.textContent = '0.00';
    multEl.textContent = `0×`;

    let lastStageIdx = 0;
    return new Promise((resolve) => {
      function frame(now) {
        if (state.skipBigWin) {
          amtEl.textContent = fmt(amount);
          multEl.textContent = `${xBet.toFixed(1)}×`;
          tierEl.textContent = stages[stages.length - 1].label;
          if (stages.length >= 2) card.classList.add('is-tier-2');
          if (stages.length >= 3) card.classList.add('is-tier-3');
          setTimeout(() => { overlay.setAttribute('hidden', ''); document.body.classList.remove('is-bigwin'); document.getElementById('appRoot')?.classList.remove('has-bigwin'); resolve(); }, 600);
          return;
        }
        const elapsed = now - start;
        const fracTotal = clamp(elapsed / totalMs, 0, 1);
        const cur = fracTotal * amount;
        amtEl.textContent = fmt(cur);
        const curXBet = bet > 0 ? cur / bet : cur;
        multEl.textContent = `${curXBet.toFixed(1)}×`;
        const stageIdx = clamp(Math.floor(elapsed / BIG_WIN_TIER_MS), 0, stages.length - 1);
        tierEl.textContent = stages[stageIdx].label;
        card.classList.toggle('is-tier-2', stageIdx >= 1);
        card.classList.toggle('is-tier-3', stageIdx >= 2);
        // Burst extra coins on tier upgrades (MEGA / EPIC entries)
        if (stageIdx > lastStageIdx) {
          playCoinShower(stageIdx + 1);
          lastStageIdx = stageIdx;
        }
        if (elapsed < totalMs) requestAnimationFrame(frame);
        else {
          amtEl.textContent = fmt(amount);
          multEl.textContent = `${xBet.toFixed(1)}×`;
          setTimeout(() => { overlay.setAttribute('hidden', ''); document.body.classList.remove('is-bigwin'); document.getElementById('appRoot')?.classList.remove('has-bigwin'); resolve(); }, 900);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  9 · STATUS BAR rollup + COUNTERS                             ║
  // ╚══════════════════════════════════════════════════════════════╝

  function setStatusText(msg) {
    if (statusValueEl) statusValueEl.setAttribute('hidden', '');
    if (statusTextEl) {
      statusTextEl.textContent = msg;
      statusTextEl.style.display = '';
    }
  }
  // Win rollup at bottom-center status bar.  Mirrors Wrath
  // statusBarController.ts rollupWin():
  //   • 400ms baseline (220ms turbo) count-up from 0 → amount
  //   • Linear-ish progression at ~30fps
  //   • Fade-in animation on appearance (added per Boki's spec — Wrath
  //     does abrupt swap; we keep the rollup but add a smooth fade)
  //   • Holds for FADE_HOLD_MS, then fades out and restores 'PRESS SPIN'
  function rollupStatusWin(amount, durationMs) {
    if (!statusValueEl || !statusTextEl) return Promise.resolve();
    if (amount <= 0) { setStatusText('PRESS SPIN'); return Promise.resolve(); }
    // W222 — tier-based rollup duration.  When caller doesn't specify
    // an explicit duration, scale the count-up time with win magnitude
    // so EPIC wins get a 4.5s ramp (not the 400ms small-win baseline).
    // Mirrors slot-game-template/src/animation/timing.ts.
    if (durationMs == null) {
      durationMs = rollupDurationMs(amount, currentBet(), state.turbo);
    }
    const HOLD_MS = state.turbo ? 600 : 1200;

    // Cancel any previous rollup fade so back-to-back wins don't strand
    // the counter mid-fade.
    if (state._statusFadeTimer) { clearTimeout(state._statusFadeTimer); state._statusFadeTimer = null; }

    statusTextEl.style.display = 'none';
    statusValueEl.removeAttribute('hidden');
    statusValueEl.classList.remove('is-rolling', 'is-fading-out');
    // Force reflow then add fade-in class so the keyframe re-runs.
    void statusValueEl.offsetWidth;
    statusValueEl.classList.add('is-rolling', 'is-fading-in');

    return new Promise((resolve) => {
      const t0 = performance.now();
      const multLabel = (state._lastWinMult && state._lastWinMult > 1) ? ` · ${state._lastWinMult}×` : '';
      function step(now) {
        const t = clamp((now - t0) / durationMs, 0, 1);
        // W222 — use module-level easeOutCubic helper (was inline `1 - (1-t)^3`)
        const eased = easeOutCubic(t);
        statusValueEl.textContent = `WIN: ${fmt(amount * eased)}${multLabel}`;
        if (t < 1) requestAnimationFrame(step);
        else {
          // Snap to exact final value then schedule fade-out after hold.
          statusValueEl.textContent = `WIN: ${fmt(amount)}${multLabel}`;
          state._statusFadeTimer = setTimeout(() => {
            if (!statusValueEl) return;
            statusValueEl.classList.remove('is-fading-in');
            statusValueEl.classList.add('is-fading-out');
            state._statusFadeTimer = setTimeout(() => {
              setStatusText('PRESS SPIN');
              if (statusValueEl) statusValueEl.classList.remove('is-fading-out');
              state._statusFadeTimer = null;
            }, 280);
          }, HOLD_MS);
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function renderHud() {
    if (balEl)        balEl.textContent       = fmt(state.balance);
    if (balLegacyEl)  balLegacyEl.textContent = fmt(state.balance);
    if (topBalanceEl) topBalanceEl.textContent= fmt(state.balance);
    if (menuBalValEl) menuBalValEl.textContent= fmt(state.balance);
    if (currencyEl)   currencyEl.textContent  = CURRENCY;
    if (betDisplayEl) betDisplayEl.textContent= fmt(currentBet());
    if (betLegacyEl)  betLegacyEl.textContent = fmt(currentBet());
    if (spinsEl)      spinsEl.textContent     = String(state.spinsPlayed);
    if (hitsEl)       hitsEl.textContent      = String(state.hits);
    if (hitPctEl)     hitPctEl.textContent    = state.spinsPlayed > 0 ? fmt((state.hits / state.spinsPlayed) * 100, 2) + '%' : '—';
    if (totalWinEl)   totalWinEl.textContent  = fmt(state.totalWon);
    if (rtpEl)        rtpEl.textContent       = state.totalWagered > 0 ? fmt((state.totalWon / state.totalWagered) * 100, 2) + '%' : '—%';
    if (maxWinEl)     maxWinEl.textContent    = fmt(state.maxWin);
    if (titleEl && IR.meta)   titleEl.textContent   = (IR.meta.name || 'Slot Template');
    if (versionEl && IR.meta) versionEl.textContent = 'v' + (IR.meta.version || '0.0');
    // W219 — live net-spend update.  Only re-paints if jurisdiction has
    // netSpendOverlay enabled; the visibility toggle itself is handled
    // by jurisdictionApply() when the preset changes.
    renderNetSpend();
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 9B · JURISDICTION RULES (W219, UKGC/MGA/SE/DE/IT/GENERIC)     ║
  // ╚══════════════════════════════════════════════════════════════╝
  //
  // Per-regulator feature-flag matrix mirrored from
  // slot-game-template/src/config/JurisdictionRules.ts.  Each preset
  // toggles: autoplay, turbo, maxStake, falseWinGuard, netSpendOverlay.
  //
  // Sources (kept inline so the runner blob is self-contained):
  //   • UKGC SI 2025/215 (eff 17 Jan 2025) — no autoplay, no turbo,
  //     min 2.5s cycle, age-tier max stake (£2 / £5), net-spend overlay
  //   • MGA PPD §11 — permissive (autoplay + turbo allowed, no overlay)
  //   • SE SFS 2018:1138 — mandatory session display, 3s min cycle
  //   • DE GlüStV 2021 §22a — 5s cycle, €1 max, mandatory overlay
  //   • GENERIC — no restrictions (dev mode)
  const JURISDICTIONS = {
    GENERIC:    { code:'GENERIC',    autoplayEnabled:true,  turboEnabled:true,  minCycleMs:0,    falseWinGuard:false, maxStakeCents:100000, netSpendOverlay:false, rtpVisible:true,  bonusBuyEnabled:true,  label:'GENERIC' },
    UKGC_18_24: { code:'UKGC',       autoplayEnabled:false, turboEnabled:false, minCycleMs:2500, falseWinGuard:true,  maxStakeCents:200,    netSpendOverlay:true,  rtpVisible:true,  bonusBuyEnabled:false, label:'UKGC' },
    UKGC_25_PLUS:{code:'UKGC',       autoplayEnabled:false, turboEnabled:false, minCycleMs:2500, falseWinGuard:true,  maxStakeCents:500,    netSpendOverlay:true,  rtpVisible:true,  bonusBuyEnabled:false, label:'UKGC' },
    MGA:        { code:'MGA',        autoplayEnabled:true,  turboEnabled:true,  minCycleMs:0,    falseWinGuard:true,  maxStakeCents:50000,  netSpendOverlay:false, rtpVisible:true,  bonusBuyEnabled:true,  label:'MGA' },
    SE:         { code:'SE',         autoplayEnabled:true,  turboEnabled:false, minCycleMs:3000, falseWinGuard:true,  maxStakeCents:1200,   netSpendOverlay:true,  rtpVisible:true,  bonusBuyEnabled:false, label:'SE' },
    DE:         { code:'DE',         autoplayEnabled:false, turboEnabled:false, minCycleMs:5000, falseWinGuard:true,  maxStakeCents:100,    netSpendOverlay:true,  rtpVisible:true,  bonusBuyEnabled:false, label:'DE' },
  };
  let activeJurisdiction = JURISDICTIONS.GENERIC;

  function jurisdictionApply(presetKey) {
    const j = JURISDICTIONS[presetKey] || JURISDICTIONS.GENERIC;
    activeJurisdiction = j;
    const body = document.body;
    body.classList.toggle('j-no-autoplay', !j.autoplayEnabled);
    body.classList.toggle('j-no-turbo', !j.turboEnabled);
    body.classList.toggle('j-no-bonus-buy', !j.bonusBuyEnabled);
    body.classList.toggle('j-false-win-suppressed', j.falseWinGuard);
    body.classList.toggle('j-no-rtp', !j.rtpVisible);    // W221 — hide RTP stat
    // Force-off turbo if jurisdiction disallows it
    if (!j.turboEnabled && state.turbo) {
      state.turbo = false;
      const turboBtn = $('#turbo-btn');
      if (turboBtn) turboBtn.classList.remove('is-active');
    }
    // W221 — clamp current bet to new jurisdiction maxStake
    const maxBet = j.maxStakeCents / 100;
    while (state.betLevelIdx > 0) {
      const bet = Number(BASE_BET) * Number(BET_LEVELS[state.betLevelIdx] || 1);
      if (bet <= maxBet) break;
      state.betLevelIdx--;
    }
    renderHud();
    // Net-spend overlay visibility
    const overlay = $('#net-spend-overlay');
    const tag = $('#net-spend-tag');
    if (overlay) overlay.toggleAttribute('hidden', !j.netSpendOverlay);
    if (tag) tag.textContent = j.label;
    const cur = $('#net-spend-currency');
    if (cur) cur.textContent = CURRENCY;
    renderNetSpend();
    // W221 — reset cycle gate so the FIRST spin after a jurisdiction
    // swap fires immediately (subsequent spins respect the new minCycleMs).
    lastSpinPressMs = 0;
    logActivityIfPresent('jurisdiction → ' + j.label + ' · cycle≥' + j.minCycleMs + 'ms · maxStake=' + j.maxStakeCents);
  }

  function logActivityIfPresent(msg) {
    // logActivity is optional in some Studio variants; guard it.
    if (typeof logActivity === 'function') {
      try { logActivity(msg); } catch (_) {}
    } else if (window && window.console) {
      console.log('[runner]', msg);
    }
  }

  function renderNetSpend() {
    if (!activeJurisdiction.netSpendOverlay) return;
    const v = $('#net-spend-value');
    if (!v) return;
    const net = Math.max(0, state.totalWagered - state.totalWon);
    v.textContent = fmt(net);
    // Warning tiers — color crosses to red as net approaches initial balance.
    const init = 100;       // starting balance (matches state.balance init)
    v.classList.toggle('is-warning', net >= init * 0.5);
    v.classList.toggle('is-critical', net >= init * 0.8);
  }

  // falseWinGuard — wrap win-banner reveal so sub-stake wins are not
  // celebrated.  Pure CSS guard would hide ALL banners; we need the
  // counter to still rollup, just no audio + no banner flash.
  function shouldCelebrateWin(winAmount, bet) {
    if (!activeJurisdiction.falseWinGuard) return true;
    return winAmount > bet;
  }
  // Stake clamp — enforce maxStakeCents (in coin units = cents/100).
  function clampToJurisdictionStake(bet) {
    const max = activeJurisdiction.maxStakeCents / 100;
    return Math.min(bet, max);
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 10 · POWER METER + MULTIPLIER STRIP — auto-adaptive            ║
  // ╚══════════════════════════════════════════════════════════════╝
  //
  // Both HUB widgets are generic placeholders.  They render ONLY when
  // the IR declares the matching feature; otherwise the runner hides
  // them at boot via `applyFeatureVisibility()`.
  //
  //   * Power Meter   — surfaced when `IR.features.power_meter` or any
  //     feature with `kind: "accumulator"` exists.  Fills from base
  //     wins until 100%, then dispatches whatever the IR maps it to
  //     (no built-in trigger — math owns that).
  //
  //   * Multiplier Strip — surfaced when `IR.features.multiplier`
  //     exists.  The DOM strip in the template ships with a default
  //     2×/3×/5×/10×/MISS pattern; the runner does NOT overwrite that
  //     visual — math just animates spin/land states.  A skin can
  //     repopulate items from `F_MUL.distribution` if desired.

  const F_POW = findFeature('power_meter') || findFeature('accumulator');

  function updatePowerMeter(deltaWinXBet) {
    if (!zeusFillEl) return;
    state.zeusFill = clamp(state.zeusFill + (deltaWinXBet || 0), 0, 100);
    zeusFillEl.style.width = state.zeusFill + '%';
    if (zeusMeterEl) {
      zeusMeterEl.classList.toggle('is-charging', state.zeusFill > 25 && state.zeusFill < 100);
      zeusMeterEl.classList.toggle('is-full', state.zeusFill >= 100);
    }
    if (zeusLabelEl) {
      if (state.zeusFill >= 100)      zeusLabelEl.textContent = 'POWER · FULL';
      else if (state.zeusFill >= 50)  zeusLabelEl.textContent = 'POWER · CHARGING';
      else                            zeusLabelEl.textContent = 'POWER · IDLE';
    }
  }
  // Back-compat alias — older spec hooks may still call updateZeusMeter
  const updateZeusMeter = updatePowerMeter;

  function animateMultiplierRoll(multiplier) {
    if (!lightningMeterEl) return Promise.resolve();
    lightningMeterEl.setAttribute('data-state', 'spin');
    return new Promise((resolve) => {
      setTimeout(() => {
        lightningMeterEl.setAttribute('data-state', 'land');
        setTimeout(() => {
          lightningMeterEl.setAttribute('data-state', 'idle');
          resolve();
        }, 600);
      }, 460);
    });
  }
  // Back-compat alias — older code references animateLightningRoll
  const animateLightningRoll = animateMultiplierRoll;

  /**
   * Mount-time feature visibility — looks at the parsed IR and hides
   * any HUB widget the game does not declare.  This is what makes the
   * template adaptive: import a different IR and the chrome reshapes.
   * Called once at boot.
   */
  function applyFeatureVisibility() {
    if (zeusMeterEl) {
      // Hide unless IR declares an accumulator-style feature
      if (!F_POW) zeusMeterEl.style.display = 'none';
    }
    if (lightningMeterEl) {
      // Hide unless IR declares a multiplier (Lightning-style) feature
      if (!F_MUL) lightningMeterEl.style.display = 'none';
    }
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 11 · FEATURE OVERLAY (FS/H&W intro card)                      ║
  // ╚══════════════════════════════════════════════════════════════╝

  function showFeatureOverlay({ kind, title, detail, short, autoMs }) {
    if (!featOverlay) return Promise.resolve();
    return new Promise((resolve) => {
      if (featKindEl)   featKindEl.textContent   = kind || '—';
      if (featTitleEl)  featTitleEl.textContent  = title || '';
      if (featDetailEl) featDetailEl.textContent = detail || '';
      featOverlay.removeAttribute('hidden');
      if (featGoBtn) featGoBtn.textContent = short ? 'CONTINUE' : 'START';

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        featOverlay.setAttribute('hidden', '');
        if (featGoBtn) featGoBtn.removeEventListener('click', finish);
        resolve();
      };
      if (featGoBtn) featGoBtn.addEventListener('click', finish);
      if (short || autoMs) setTimeout(finish, autoMs || 1600);
    });
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 11.5 · FS HUD + MULT LADDER + COIN SHOWER (Batch 3)           ║
  // ╚══════════════════════════════════════════════════════════════╝

  // FS HUD elements are injected lazily into .reelFrame so we can ship the
  // template with no extra DOM in the static HTML.  Same for the mult
  // ladder + coin shower — all art-free, CSS-only visuals.

  let fsHudEl = null;
  let fsLadderEl = null;
  let coinShowerEl = null;

  function ensureFsHud() {
    if (fsHudEl) return fsHudEl;
    const frame = $('.reelFrame') || $('#reels-grid')?.parentElement;
    if (!frame) return null;
    const el = document.createElement('div');
    el.id = 'fs-hud';
    el.className = 'fs-hud';
    el.setAttribute('hidden', '');
    el.innerHTML = `
      <div class="fs-hud-block">
        <span class="fs-hud-lbl">FS</span>
        <b class="mono" id="fs-counter">0 / 0</b>
      </div>
      <div class="fs-hud-divider"></div>
      <div class="fs-hud-block">
        <span class="fs-hud-lbl">MULT</span>
        <b class="mono" id="fs-mult-display">1×</b>
      </div>
      <div class="fs-hud-divider"></div>
      <div class="fs-hud-block">
        <span class="fs-hud-lbl">WIN</span>
        <b class="mono" id="fs-win-total">0.00</b>
      </div>
    `;
    frame.appendChild(el);
    fsHudEl = el;
    return el;
  }

  function ensureFsLadder(maxMult) {
    if (fsLadderEl) return fsLadderEl;
    const frame = $('.reelFrame') || $('#reels-grid')?.parentElement;
    if (!frame) return null;
    const el = document.createElement('div');
    el.id = 'fs-mult-ladder';
    el.className = 'fs-mult-ladder';
    el.setAttribute('hidden', '');
    // Build ladder rungs: every integer step from maxMult down to 1×
    const max = Math.max(2, Math.min(20, Math.floor(maxMult)));
    let html = '';
    for (let m = max; m >= 1; m--) {
      html += `<div class="fs-mult-step" data-mult="${m}">${m}×</div>`;
    }
    el.innerHTML = html;
    frame.appendChild(el);
    fsLadderEl = el;
    return el;
  }

  function showFsHud(maxMult) {
    const hud = ensureFsHud();
    const ladder = ensureFsLadder(maxMult);
    if (hud)    hud.removeAttribute('hidden');
    if (ladder) ladder.removeAttribute('hidden');
  }
  function hideFsHud() {
    if (fsHudEl)    fsHudEl.setAttribute('hidden', '');
    if (fsLadderEl) fsLadderEl.setAttribute('hidden', '');
  }
  function updateFsHud({ done, total, mult, winTotal }) {
    const fsCounter   = $('#fs-counter');
    const fsMultDisp  = $('#fs-mult-display');
    const fsWinTotal  = $('#fs-win-total');
    if (fsCounter)  fsCounter.textContent  = `${done} / ${total}`;
    if (fsMultDisp) fsMultDisp.textContent = `${mult}×`;
    if (fsWinTotal) fsWinTotal.textContent = fmt(winTotal);
    if (fsLadderEl) {
      $$('.fs-mult-step').forEach((step) => {
        const m = Number(step.dataset.mult);
        step.classList.toggle('is-lit',     m <= mult);
        step.classList.toggle('is-current', m === mult);
      });
    }
  }

  function ensureCoinShower() {
    if (coinShowerEl) return coinShowerEl;
    const el = document.createElement('div');
    el.className = 'bw-coin-shower';
    document.body.appendChild(el);
    coinShowerEl = el;
    return el;
  }
  /**
   * Spawn N golden coins falling from above with random horizontal
   * positions + sizes.  Intensity scales with tier (1 = light, 2 = strong,
   * 3 = epic).  Mirrors coin3d.ts intent without actual 3D — pure CSS.
   */
  function playCoinShower(tier) {
    const shower = ensureCoinShower();
    // Clear previous coins (let CSS animation continue, but new burst on top)
    while (shower.firstChild) shower.removeChild(shower.firstChild);
    const counts = { 1: 24, 2: 48, 3: 80 };
    const N = counts[tier] || 24;
    for (let i = 0; i < N; i++) {
      const c = document.createElement('div');
      c.className = 'bw-coin';
      const x = (Math.random() * 100).toFixed(1);
      const size = (0.6 + Math.random() * 1.1).toFixed(2);
      const delay = (Math.random() * (tier === 3 ? 1600 : 800)).toFixed(0);
      c.style.left = x + 'vw';
      c.style.setProperty('--x', '0px');
      c.style.setProperty('--s', size);
      c.style.animationDelay = delay + 'ms';
      c.style.animationDuration = (1800 + Math.random() * 1200).toFixed(0) + 'ms';
      shower.appendChild(c);
    }
    // GC: clear after longest animation completes
    setTimeout(() => {
      while (shower.firstChild) shower.removeChild(shower.firstChild);
    }, 3500);
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 12 · FREE SPINS — full animated sequence                      ║
  // ╚══════════════════════════════════════════════════════════════╝

  async function runFreeSpins(initialScCount, bet) {
    const fsReels = (F_FS && F_FS.reels_override === 'free_spins' && FS_REELS) ? FS_REELS : BASE_REELS;
    let remaining = awardFsSpins(initialScCount);
    const initialAwarded = remaining;
    let total = 0;
    let mult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.start) || 1;
    const incr = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increment) || 0;
    const maxMult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.max) || 10;
    const incrOn = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increments_on) || 'each_winning_fs_spin';
    let totalAwarded = remaining;
    const fsCap = (F_FS.retrigger && F_FS.retrigger.max_total) || Infinity;

    state.featureLabel = `FREE SPINS · ${remaining} spins · ${mult}×`;
    renderHud();
    setStatusText(`FREE SPINS · ${remaining} REMAINING`);
    showFsHud(maxMult);
    updateFsHud({ done: 0, total: totalAwarded, mult, winTotal: 0 });
    // Feature bus: FS entered — FS HUD pill + ladder mount.
    emitFeatureEvent('fs:enter', { triggerScCount: initialScCount, awarded: totalAwarded, mult: mult, max: maxMult });
    await showFeatureOverlay({
      kind: 'FREE SPINS',
      title: `${remaining} Free Spins awarded`,
      detail: `Progressive multiplier ${mult}× → ${maxMult}×`,
    });

    let spinsDone = 0;
    while (remaining > 0) {
      remaining--;
      spinsDone++;
      const grid = drawGrid(state.rng, fsReels);
      const r = evalBase(grid);
      let win = r.baseWin;
      if (win > 0) {
        win *= mult;
        if (incrOn === 'each_winning_fs_spin' && mult < maxMult) {
          mult = Math.min(maxMult, mult + incr);
        }
      }
      if (incrOn === 'each_fs_spin' && mult < maxMult) {
        mult = Math.min(maxMult, mult + incr);
      }
      total += win;
      await animateGrid(grid, r, { multAnnounce: mult });
      state.featureLabel = `FS · ${remaining} left · ${mult}× · ${fmt(total * bet)}`;
      setStatusText(`FS ${remaining} LEFT · ${mult}× · ${fmt(total * bet)}`);
      updateFsHud({ done: spinsDone, total: totalAwarded, mult, winTotal: total * bet });
      // Feature bus: per-spin update for FS HUD components.
      emitFeatureEvent('fs:spin', { index: spinsDone, total: totalAwarded, win: win * bet, mult: mult, winTotal: total * bet });
      renderHud();
      if (r.scCount >= 3 && totalAwarded < fsCap) {
        const add = awardFsRetrigger(r.scCount);
        if (add > 0) {
          remaining += add;
          totalAwarded += add;
          updateFsHud({ done: spinsDone, total: totalAwarded, mult, winTotal: total * bet });
          emitFeatureEvent('fs:retrigger', { added: add, total: totalAwarded });
          await showFeatureOverlay({
            kind: 'RETRIGGER',
            title: `+${add} more Free Spins`,
            detail: `total awarded: ${totalAwarded}`,
            short: true, autoMs: 1400,
          });
        }
      }
      await wait(state.turbo ? 80 : 220);
    }
    state.featureLabel = '';
    setStatusText('FS COMPLETE');
    await showFeatureOverlay({
      kind: 'FREE SPINS COMPLETE',
      title: `Total: ${fmt(total * bet)}`,
      detail: `won across ${totalAwarded} spins · max mult ${mult}×`,
      autoMs: 2200,
    });
    hideFsHud();
    setStatusText('PRESS SPIN');
    renderHud();
    // Feature bus: FS exited — HUD pill + ladder unmount cleanup.
    emitFeatureEvent('fs:exit', { totalWin: total * bet, totalAwarded: totalAwarded, maxMult: mult });
    return total;
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 13 · HOLD & WIN — animated reveal + lock cells + jackpots     ║
  // ╚══════════════════════════════════════════════════════════════╝

  async function runHoldAndWin(initialOrbCount, bet) {
    const respinsInitial = F_HNW.respins_initial || 3;
    const orbLandBase    = F_HNW.orb_land_chance_base || 0.04;
    const orbLandFill    = F_HNW.orb_land_chance_fill_bonus || 0;
    const fullGridBonus  = F_HNW.full_grid_bonus_x || 0;
    const cashDist       = F_HNW.cash_value_distribution || [{ value: 1, weight: 1 }];
    const jackpots       = F_HNW.jackpot_tiers || [];
    const totalCells = REELS * ROWS;
    const unifiedPool = [
      ...cashDist.map((c) => ({ value: c.value, weight: Math.max(0, c.weight), isJp: false })),
      ...jackpots.map((j) => ({ value: j.multiplier, weight: Math.max(0, j.weight), isJp: true, jpName: j.name || `JP-${j.multiplier}` })),
    ];

    const cellOrder = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) cellOrder.push(`${r}:${y}`);
    shuffleInPlace(cellOrder, state.rng);

    let filled = Math.min(initialOrbCount, totalCells);
    let total = 0;
    state.hnwLockedCells = new Map();
    resetHnwSeen();
    for (let i = 0; i < filled; i++) {
      const draw = pickWeightedFull(state.rng, unifiedPool);
      state.hnwLockedCells.set(cellOrder[i], { value: draw.value, isJp: draw.isJp, jpName: draw.jpName });
      total += draw.value;
    }

    state.featureLabel = `HOLD & WIN · ${filled} orbs · ${respinsInitial} respins`;
    renderHud();
    setStatusText(`HOLD & WIN · STARTING`);
    // Feature bus: H&W started — components react (hold-and-win.js shows info + per-cell badges)
    emitFeatureEvent('hnw:enter', { initialOrbs: filled, respins: respinsInitial, totalCells: totalCells });
    // Emit each initial orb so the component can pop badges with values + jp tags
    for (let i = 0; i < filled; i++) {
      const key = cellOrder[i];
      const locked = state.hnwLockedCells.get(key);
      if (locked) {
        const [rr, yy] = key.split(':').map(Number);
        emitFeatureEvent('hnw:orb-landed', { cell: { r: rr, y: yy }, value: locked.value, jpName: locked.jpName });
      }
    }
    await showFeatureOverlay({
      kind: 'HOLD & WIN',
      title: (F_HNW && F_HNW.name) || 'Hold & Win',
      detail: `${filled} starting orbs · ${respinsInitial} respins · max ${WIN_CAP}×`,
    });
    renderHnwBoard();
    await wait(state.turbo ? 200 : 600);

    let respins = respinsInitial;
    while (respins > 0 && filled < totalCells) {
      respins--;
      let landed = 0;
      const free = totalCells - filled;
      const remainingCells = cellOrder.filter((c) => !state.hnwLockedCells.has(c));
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFill * filledFrac;
      for (let c = 0; c < free && c < remainingCells.length; c++) {
        if (state.rng() < p) {
          const draw = pickWeightedFull(state.rng, unifiedPool);
          const cell = remainingCells[landed];
          state.hnwLockedCells.set(cell, { value: draw.value, isJp: draw.isJp, jpName: draw.jpName });
          total += draw.value;
          landed++;
        }
      }
      filled += landed;
      renderHnwBoard();
      // Emit newly landed orbs for the component to badge
      if (landed > 0) {
        // remainingCells[0..landed-1] are the cells that received orbs this respin
        for (let li = 0; li < landed; li++) {
          const key = remainingCells[li];
          const locked = state.hnwLockedCells.get(key);
          if (locked) {
            const [rr, yy] = key.split(':').map(Number);
            emitFeatureEvent('hnw:orb-landed', { cell: { r: rr, y: yy }, value: locked.value, jpName: locked.jpName });
          }
        }
      }
      if (landed > 0 && F_HNW.respin_reset_on_new) respins = respinsInitial;
      state.featureLabel = `H&W · ${respins} respins · ${filled}/${totalCells} · ${fmt(total * bet)}`;
      setStatusText(`H&W ${respins} RESPINS · ${filled}/${totalCells} · ${fmt(total * bet)}`);
      renderHud();
      // Feature bus: respin tick — components update their counter widgets
      emitFeatureEvent('hnw:respin', { filled: filled, totalCells: totalCells, respinsLeft: respins, cumulative: total * bet });
      await wait(state.turbo ? 200 : 720);
    }

    if (filled >= totalCells && fullGridBonus > 0) {
      total += fullGridBonus;
      emitFeatureEvent('hnw:full-grid', { bonus: fullGridBonus });
      await showFeatureOverlay({
        kind: 'FULL GRID',
        title: `+${fullGridBonus}× BONUS!`,
        detail: 'All cells filled — grand prize awarded',
        short: true, autoMs: 2000,
      });
    }
    await showFeatureOverlay({
      kind: 'HOLD & WIN COMPLETE',
      title: `Total: ${fmt(total * bet)}`,
      detail: `${filled} orbs collected`,
      autoMs: 2200,
    });

    state.hnwLockedCells = null;
    state.featureLabel = '';
    setStatusText('PRESS SPIN');
    renderHud();
    // Feature bus: H&W exited — components fade out their badges + info pill
    emitFeatureEvent('hnw:exit', { totalWin: total * bet });
    return total;
  }

  function pickWeightedFull(rng, list) {
    let totalW = 0;
    for (const e of list) totalW += Math.max(0, e.weight);
    let x = rng() * totalW;
    for (const e of list) {
      x -= Math.max(0, e.weight);
      if (x <= 0) return e;
    }
    return list[list.length - 1];
  }

  // Mark cells freshly added since the last render so the .is-orb-land
  // pop animation fires only on the newcomers.  Tracks key set between renders.
  const _hnwSeen = new Set();
  function renderHnwBoard() {
    if (!state.hnwLockedCells || !reelsEl) return;
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        const cell = cellAt(r, y);
        if (!cell) continue;
        const key = `${r}:${y}`;
        const locked = state.hnwLockedCells.get(key);
        if (locked) {
          const isNew = !_hnwSeen.has(key);
          _hnwSeen.add(key);
          const baseCls = locked.isJp ? 'is-hnw-jp' : 'is-hnw-locked';
          cell.className = 'cell ' + baseCls + (isNew ? ' is-orb-land' : '');
          // Tier badge — for jackpots show name (MINI/MINOR/MAJOR/GRAND),
          // for cash orbs show "×N" subtle tag.  Both art-free.
          const tierBadge = locked.isJp
            ? `<span class="hnw-cell-tier">${locked.jpName || 'JP'}</span>`
            : `<span class="hnw-cell-tier">CASH</span>`;
          // Main value — large number/multiplier
          const valueText = locked.isJp
            ? `${locked.value}×`
            : `${locked.value}×`;
          cell.innerHTML = `${tierBadge}<span class="cell-id">${valueText}</span>`;
        } else {
          cell.className = 'cell';
          cell.innerHTML = '<span class="cell-id">·</span>';
        }
      }
    }
  }
  // Clear the seen-set whenever a new H&W run starts (called from runHoldAndWin)
  function resetHnwSeen() { _hnwSeen.clear(); }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 14 · SPIN ORCHESTRATION                                       ║
  // ╚══════════════════════════════════════════════════════════════╝

  async function spinOnce() {
    if (state.spinning) return;
    const bet = currentBet();
    if (state.balance < bet) { flashBalance(); return; }
    state.spinning = true;
    spinBtn?.setAttribute('disabled', '');
    spinBtn?.classList.add('is-spinning');
    setStatusText('SPINNING…');
    clearWinHighlights();
    clearPaylines();
    hideWinBanner();
    // Feature bus: spin started — multiplier strip starts scrolling, etc.
    emitFeatureEvent('spin:start', { bet: bet });

    state.balance -= bet;
    state.totalWagered += bet;
    state.spinsPlayed += 1;
    renderHud();

    const grid = drawGrid(state.rng, BASE_REELS);
    const result = evalBase(grid);
    // Lightning multiplies LINE wins only — scatter pays untouched.
    // Mirrors the headless spinOnceInstant fix.
    let lineWin = result.lineTotal * bet;
    let lightning = 1;
    if ((lineWin > 0 || result.scatterPay > 0) && F_MUL) {
      lightning = rollLightning(state.rng);
      if (lightning > 1) lineWin = lineWin * lightning;
    }
    let spinWin = lineWin + result.scatterPay * bet;
    const lightningPromise = lightning > 1 ? animateLightningRoll(lightning) : Promise.resolve();
    await animateGrid(grid, result, { multAnnounce: lightning });
    await lightningPromise;
    updateZeusMeter(result.baseWin || 0);
    // Feature bus: math evaluated + lightning rolled.  Components like
    // power_meter listen to spin:eval to grow their gauges; multiplier
    // strip listens to spin:lightning to flash the chosen value.
    emitFeatureEvent('spin:eval', { result: result, totalWin: spinWin, bet: bet });
    if (lightning > 1) emitFeatureEvent('spin:lightning', { value: lightning });

    let featureLabel = null;
    if (F_FS && result.scCount >= 3) {
      const fsWin = await runFreeSpins(result.scCount, bet);
      spinWin += fsWin * bet;
      featureLabel = `FS +${fmt(fsWin * bet)}`;
    }
    if (F_HNW && result.bonusCount >= (F_HNW.trigger?.min || 6)) {
      const hnwWin = await runHoldAndWin(result.bonusCount, bet);
      spinWin += hnwWin * bet;
      featureLabel = (featureLabel ? `${featureLabel} · ` : '') + `H&W +${fmt(hnwWin * bet)}`;
    }
    const capAbs = WIN_CAP * bet;
    if (spinWin > capAbs) spinWin = capAbs;

    if (spinWin > 0) state.hits += 1;
    state.lastWin = spinWin;
    state.totalWon += spinWin;
    state.balance += spinWin;
    if (spinWin > state.maxWin) state.maxWin = spinWin;

    appendHistory({ idx: state.spinsPlayed, win: spinWin, feature: featureLabel });
    renderHud();

    if (spinWin > 0) {
      await rollupStatusWin(spinWin, state.turbo ? 220 : 700);
      const xBet = bet > 0 ? spinWin / bet : 0;
      if (xBet >= 10) await playBigWinRollup(spinWin, bet);
    }
    if (!featureLabel) setStatusText('PRESS SPIN');
    setTimeout(hideWinBanner, 1200);
    // Feature bus: render-done — multiplier strip returns to idle, etc.
    emitFeatureEvent('spin:render-done', { totalWin: spinWin });

    state.spinning = false;
    spinBtn?.removeAttribute('disabled');
    spinBtn?.classList.remove('is-spinning');
  }

  function flashBalance() {
    if (!balEl) return;
    balEl.animate(
      [{ color: 'var(--cyan)' }, { color: 'var(--rose)' }, { color: 'var(--cyan)' }],
      { duration: 600 }
    );
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 15 · HISTORY + PAYTABLE                                       ║
  // ╚══════════════════════════════════════════════════════════════╝

  function appendHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > 10) state.history.length = 10;
    if (!historyListEl) return;
    historyListEl.innerHTML = state.history.map((h) => {
      const cls = h.feature ? 'is-feat' : (h.win >= currentBet() * 10 ? 'is-big' : (h.win > 0 ? 'is-win' : ''));
      const right = h.feature ? h.feature : (h.win > 0 ? `+${fmt(h.win)}` : '—');
      return `<li class="${cls}"><span>#${h.idx}</span><span>${right}</span></li>`;
    }).join('');
  }

  function renderPaytable() {
    const body = $('#paytable-body');
    if (!body) return;
    const pt = IR.paytable || {};
    const rows = [];
    rows.push('<table class="pt-table"><thead><tr><th>Symbol</th><th>×3</th><th>×4</th><th>×5</th></tr></thead><tbody>');
    for (const s of IR.symbols || []) {
      const e = pt[s.id];
      if (!e) continue;
      const x3 = Number(e['3'] ?? e.x3 ?? 0);
      const x4 = Number(e['4'] ?? e.x4 ?? 0);
      const x5 = Number(e['5'] ?? e.x5 ?? 0);
      if (x3 + x4 + x5 === 0) continue;
      const tier = displayTierOf(s.id);
      rows.push(`<tr>
        <td><span class="pt-sym tier-${tier}">${s.id}</span>${s.name || s.id}</td>
        <td class="mono">${x3 || '—'}</td>
        <td class="mono">${x4 || '—'}</td>
        <td class="mono">${x5 || '—'}</td>
      </tr>`);
    }
    rows.push('</tbody></table>');
    if (F_FS) rows.push(`<p style="margin-top:14px;font-size:11px;color:var(--text-2)">
      <b style="color:var(--gold)">Free Spins:</b> ${Object.entries(F_FS.trigger?.thresholds || {}).map(([k, v]) => `${k} scatters→${v} spins`).join(' · ')}
      ${F_FS.progressive_multiplier ? `· progressive ${F_FS.progressive_multiplier.start}× → ${F_FS.progressive_multiplier.max}×` : ''}
    </p>`);
    if (F_HNW) rows.push(`<p style="margin-top:8px;font-size:11px;color:var(--text-2)">
      <b style="color:var(--gold)">Hold &amp; Win:</b> ${F_HNW.trigger?.min || 6}+ bonus symbols ·
      ${F_HNW.respins_initial || 3} respins · max win ${WIN_CAP}×
    </p>`);
    if (F_MUL) rows.push(`<p style="margin-top:8px;font-size:11px;color:var(--text-2)">
      <b style="color:var(--gold)">Lightning Multiplier:</b> ${((F_MUL.trigger?.probability || 0) * 100).toFixed(1)}% on winning spins ·
      values ${(F_MUL.distribution || []).map((d) => d.value + '×').join(' / ')}
    </p>`);
    body.innerHTML = rows.join('');
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 16 · AUTOPLAY + AUTOPLAY PANEL                                ║
  // ╚══════════════════════════════════════════════════════════════╝

  // AutoPlay counter badge — small chip on top-right corner of the
  // autoplay button.  Shows remaining spins; "∞" for infinite (-1);
  // hidden when autoplay is idle.  Pulses on every decrement.
  const autoPlayCounterEl = $('#autoPlayCounter');
  function updateAutoPlayCounter(remaining) {
    if (!autoPlayCounterEl) return;
    if (remaining === null || remaining === undefined || remaining === 0) {
      autoPlayCounterEl.setAttribute('hidden', '');
      autoPlayCounterEl.textContent = '';
      return;
    }
    autoPlayCounterEl.removeAttribute('hidden');
    autoPlayCounterEl.textContent = remaining === -1 ? '∞' : String(remaining);
    // Restart pop animation on each update
    autoPlayCounterEl.style.animation = 'none';
    // Force reflow then restore so the keyframe re-runs
    void autoPlayCounterEl.offsetWidth;
    autoPlayCounterEl.style.animation = '';
  }

  async function runAutoplay(count) {
    if (state.autoplay.active) return;
    state.autoplay = Object.assign({}, state.autoplay, { active: true, remaining: count, startBalance: state.balance });
    autoStopBtn?.removeAttribute('hidden');
    autoOpenBtn?.classList.add('is-active');
    autoOpenBtn?.setAttribute('data-active', 'true');
    if (auto10Btn && count <= 10)  auto10Btn.classList.add('is-active');
    if (auto100Btn && count > 10)  auto100Btn.classList.add('is-active');
    updateAutoPlayCounter(state.autoplay.remaining);
    while (state.autoplay.active && (state.autoplay.remaining > 0 || state.autoplay.remaining === -1)) {
      if (state.balance < currentBet()) break;
      await spinOnce();
      const profit = state.balance - state.autoplay.startBalance;
      if (state.autoplay.stopOnWin > 0 && state.lastWin >= state.autoplay.stopOnWin) break;
      if (state.autoplay.stopOnLoss > 0 && (state.autoplay.startBalance - state.balance) >= state.autoplay.stopOnLoss) break;
      if (state.autoplay.stopOnProfit > 0 && profit >= state.autoplay.stopOnProfit) break;
      if (state.autoplay.remaining > 0) state.autoplay.remaining -= 1;
      updateAutoPlayCounter(state.autoplay.remaining);
      await wait(currentProfile().betweenSpinsMs);
    }
    stopAutoplay();
  }
  function stopAutoplay() {
    state.autoplay = Object.assign({}, state.autoplay, { active: false, remaining: 0 });
    autoStopBtn?.setAttribute('hidden', '');
    autoOpenBtn?.classList.remove('is-active');
    autoOpenBtn?.setAttribute('data-active', 'false');
    auto10Btn?.classList.remove('is-active');
    auto100Btn?.classList.remove('is-active');
    updateAutoPlayCounter(null);
  }
  function openAutoplayPanel() {
    if (!autoplayPanelEl) return;
    autoplayPanelEl.removeAttribute('hidden');
    autoplayPanelEl.setAttribute('aria-hidden', 'false');
  }
  function closeAutoplayPanel() {
    if (!autoplayPanelEl) return;
    autoplayPanelEl.setAttribute('hidden', '');
    autoplayPanelEl.setAttribute('aria-hidden', 'true');
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 17 · BET + TURBO + SOUND + INTRO                              ║
  // ╚══════════════════════════════════════════════════════════════╝

  function setBetLevel(delta) {
    state.betLevelIdx = clamp(state.betLevelIdx + delta, 0, BET_LEVELS.length - 1);
    renderHud();
  }
  function toggleTurbo() {
    state.turbo = !state.turbo;
    const turboBtn = $('#turbo-btn');
    if (turboBtn) turboBtn.classList.toggle('is-active', state.turbo);
  }
  function toggleSound() {
    state.soundMuted = !state.soundMuted;
    if (soundBtnEl)   soundBtnEl.setAttribute('data-muted', String(state.soundMuted));
    if (menuSoundBtn) menuSoundBtn.setAttribute('data-muted', String(state.soundMuted));
  }
  function toggleQuickMenu() {
    if (!quickMenuEl) return;
    if (quickMenuEl.hasAttribute('hidden')) quickMenuEl.removeAttribute('hidden');
    else quickMenuEl.setAttribute('hidden', '');
  }
  function showIntroModal() {
    if (!introModalEl) return Promise.resolve();
    // Honor "don't show again" preference if previously stored
    try {
      if (localStorage.getItem('mtl_runner_intro_dismissed') === '1') return Promise.resolve();
    } catch (_) {}
    introModalEl.removeAttribute('hidden');
    introModalEl.setAttribute('aria-hidden', 'false');
    // Inject mythic-gold rays behind the card (Batch 3 polish) — rotating
    // conic gradient that emanates from the centre of the modal.
    if (!introModalEl.querySelector('.introModal__rays')) {
      const rays = document.createElement('div');
      rays.className = 'introModal__rays';
      rays.setAttribute('aria-hidden', 'true');
      introModalEl.insertBefore(rays, introModalEl.firstChild);
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const totalMs = 1400;
      const dontShowEl = $('#introDontShow');
      function dismiss() {
        try {
          if (dontShowEl && dontShowEl.checked) localStorage.setItem('mtl_runner_intro_dismissed', '1');
        } catch (_) {}
        introModalEl.classList.add('is-fading-out');
        setTimeout(() => {
          introModalEl.classList.remove('is-fading-out');
          introModalEl.setAttribute('hidden', '');
          introModalEl.setAttribute('aria-hidden', 'true');
          resolve();
        }, 280);
      }
      function tick(now) {
        const t = clamp((now - t0) / totalMs, 0, 1);
        const pct = Math.round(t * 100);
        if (introProgressFill) introProgressFill.style.width = pct + '%';
        if (introLoadPercent)  introLoadPercent.textContent  = pct + '%';
        if (introStatusText && t > 0.5) introStatusText.textContent = 'Ready · Click to enter';
        if (t < 1) requestAnimationFrame(tick);
        else if (introContinueBtn) {
          introContinueBtn.disabled = false;
          introContinueBtn.addEventListener('click', dismiss, { once: true });
          // Allow Enter / Space to dismiss too — matches Wrath production UX
          document.addEventListener('keydown', function escIntro(e) {
            if (e.code === 'Enter' || e.code === 'Space') {
              document.removeEventListener('keydown', escIntro);
              dismiss();
            }
          });
        }
      }
      requestAnimationFrame(tick);
    });
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 18 · WIRING                                                   ║
  // ╚══════════════════════════════════════════════════════════════╝

  // W221 — minCycleMs cycle-gate enforcement.  UKGC SI 2025/215 + DE
  // GlüStV 2021 §22a + SE SFS 2018:1138 mandate a minimum wall-clock
  // window between SPIN-PRESSED events.  Each press while still inside
  // the prior cycle window is silently rejected (with a brief visual
  // tick on the spin-btn to communicate that the press was registered
  // but throttled).
  let lastSpinPressMs = 0;
  function cycleGatePassed() {
    const min = activeJurisdiction.minCycleMs || 0;
    if (min <= 0) return true;
    const now = performance.now();
    if (now - lastSpinPressMs < min) {
      // Cosmetic feedback: brief outline pulse
      const btn = $('#spin-btn');
      if (btn && !btn.classList.contains('is-throttled')) {
        btn.classList.add('is-throttled');
        setTimeout(() => btn.classList.remove('is-throttled'), 320);
      }
      return false;
    }
    lastSpinPressMs = now;
    return true;
  }

  function bindUI() {
    spinBtn?.addEventListener('click', () => {
      // Wrath behavior: clicking SPIN mid-spin requests SLAM stop — the
      // in-flight animateGrid short-circuits remaining reels through the
      // slam profile (100ms decel, no bounce).  A fresh click while idle
      // launches a new spin.
      if (state.spinning) {
        state.slamRequested = true;
        clearPaylines();
      } else {
        // W221 — jurisdiction cycle gate (UKGC 2.5s / DE 5s / SE 3s).
        // Press is silently rejected if the previous cycle's minimum
        // wall-clock window hasn't elapsed yet.
        if (!cycleGatePassed()) return;
        spinOnce();
      }
    });
    betPlusBtn?.addEventListener('click', () => setBetLevel(+1));
    betMinusBtn?.addEventListener('click', () => setBetLevel(-1));
    auto10Btn?.addEventListener('click', () => runAutoplay(10));
    auto100Btn?.addEventListener('click', () => runAutoplay(100));
    autoStopBtn?.addEventListener('click', stopAutoplay);
    autoOpenBtn?.addEventListener('click', openAutoplayPanel);
    autoplayCloseBtn?.addEventListener('click', closeAutoplayPanel);
    $('#autoPlayPanel .autoPlayPanel__backdrop')?.addEventListener('click', closeAutoplayPanel);

    $$('#autoPlaySpinOptions .autoPlayPanel__spinBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('#autoPlaySpinOptions .autoPlayPanel__spinBtn').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        if (autoplayStartBtn) {
          autoplayStartBtn.disabled = false;
          autoplayStartBtn.setAttribute('data-spins', btn.dataset.spins);
        }
      });
    });
    autoplayStartBtn?.addEventListener('click', () => {
      const n = parseInt(autoplayStartBtn.getAttribute('data-spins') || '10', 10);
      state.autoplay.stopOnFs    = stopOnFsCheck?.checked || false;
      state.autoplay.stopOnBonus = stopOnBonusCheck?.checked || false;
      closeAutoplayPanel();
      runAutoplay(n === -1 ? 999999 : n);
    });

    menuBtnEl?.addEventListener('click', toggleQuickMenu);
    menuPaytableBtn?.addEventListener('click', () => { paytableDrawer?.removeAttribute('hidden'); toggleQuickMenu(); });
    menuSoundBtn?.addEventListener('click', toggleSound);
    soundBtnEl?.addEventListener('click', toggleSound);
    menuRulesBtn?.addEventListener('click', () => {
      showFeatureOverlay({ kind: 'GAME RULES', title: IR.meta?.name || 'Slot Template', detail: IR.meta?.description || '', short: true, autoMs: 6000 });
      toggleQuickMenu();
    });
    menuHelpBtn?.addEventListener('click', () => {
      showFeatureOverlay({ kind: 'HELP', title: 'Controls', detail: 'SPACE = spin · A = auto · S = stop · T = turbo', short: true, autoMs: 5000 });
      toggleQuickMenu();
    });
    menuSettingsBtn?.addEventListener('click', () => {
      showFeatureOverlay({ kind: 'SETTINGS', title: 'Coming soon', detail: 'Volume / animations / language', short: true, autoMs: 3000 });
      toggleQuickMenu();
    });

    paytableToggle?.addEventListener('click', () => { paytableDrawer?.removeAttribute('hidden'); });
    paytableCloseBtn?.addEventListener('click', () => { paytableDrawer?.setAttribute('hidden', ''); });

    // W219 — Jurisdiction selector wiring + initial apply.
    // Default to GENERIC; runtime honors the IR's `jurisdiction` hint
    // if present (e.g. when Studio embeds a jurisdiction-pinned IR),
    // otherwise GENERIC is safe.
    const jSelect = $('#jurisdiction-select');
    let initialJ = (IR.meta && IR.meta.jurisdiction) || 'GENERIC';
    if (!(initialJ in JURISDICTIONS)) initialJ = 'GENERIC';
    if (jSelect) {
      jSelect.value = initialJ;
      jSelect.addEventListener('change', () => jurisdictionApply(jSelect.value));
    }
    jurisdictionApply(initialJ);

    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.spinning) {
          // Space mid-spin = slam, same as SPIN click
          state.slamRequested = true;
          clearPaylines();
        } else {
          spinOnce();
        }
      } else if (e.key === 'a' || e.key === 'A') {
        runAutoplay(10);
      } else if (e.key === 's' || e.key === 'S') {
        stopAutoplay();
      } else if (e.key === 't' || e.key === 'T') {
        toggleTurbo();
      } else if (e.key === 'Escape') {
        closeAutoplayPanel();
        if (quickMenuEl && !quickMenuEl.hasAttribute('hidden')) toggleQuickMenu();
        paytableDrawer?.setAttribute('hidden', '');
      }
    });
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 19 · BOOT — paint initial grid, mount UI                      ║
  // ╚══════════════════════════════════════════════════════════════╝

  setupGrid();
  renderHud();
  renderPaytable();
  bindUI();
  applyFeatureVisibility();

  // ─── Feature plug-in pipeline boot ────────────────────────────────
  // MTLFeatureBuilder + MTLFeatureRegistry are loaded via the inline
  // <script id="mtl-feature-registry"> / <script id="mtl-component-builder">
  // / <script id="mtl-features-bundle"> tags emitted by Studio's
  // buildPlayTemplateBlob.  When they're present, we boot the registry
  // and let it mount any feature components the IR declares.  The shared
  // event bus lives on `window.MTLFeatures.events`.
  const featureBus = (window.MTLFeatures && window.MTLFeatures.events) || null;
  function emitFeatureEvent(name, payload) {
    if (featureBus) {
      try { featureBus.emit(name, payload); } catch (err) { console.warn('[bus emit] ' + name + ' threw:', err); }
    }
  }
  if (window.MTLFeatureBuilder && typeof window.MTLFeatureBuilder.boot === 'function') {
    window.MTLFeatureBuilder.boot(IR, document.body).then(function (res) {
      console.log('[MTLFeatures] booted with kinds:', res.mounted, 'unknown:', res.unknown);
    }).catch(function (err) {
      console.warn('[MTLFeatures] boot failed:', err);
    });
  }
  // Strip Wrath-specific copy from the game title in the intro modal when
  // the IR is generic — show whatever IR.meta.name says (template stays
  // theme-agnostic).
  (function applyMetaToIntro() {
    const introTitle = document.querySelector('.introModal__title');
    if (!introTitle) return;
    const name = (IR.meta && IR.meta.name) || 'Slot Template';
    introTitle.textContent = name;
  })();
  for (let r = 0; r < REELS; r++) {
    for (let y = 0; y < ROWS; y++) {
      paintCell(r, y, pickAnyId());
    }
  }
  if (introModalEl) introModalEl.setAttribute('hidden', '');

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 20 · HEADLESS spin — used for MTL lockstep + RTP tests        ║
  // ╚══════════════════════════════════════════════════════════════╝

  function spinOnceInstant() {
    const bet = currentBet();
    if (state.balance < bet) return { win: 0, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 };
    state.balance -= bet;
    state.totalWagered += bet;
    state.spinsPlayed += 1;
    const grid = drawGrid(state.rng, BASE_REELS);
    const result = evalBase(grid);
    // Lightning multiplies LINE wins only — scatter pays are not multiplied
    // (canonical Wrath behaviour, per paytable.ts / features.ts).  Putting
    // scatter_pay inside the multiply (the old code) inflated the
    // lightning_uplift bucket by ~0.32pp.
    let lineWin = result.lineTotal * bet;
    let lightning = 1;
    if ((lineWin > 0 || result.scatterPay > 0) && F_MUL) {
      // Lightning trigger condition: any winning spin (line OR scatter)
      lightning = rollLightning(state.rng);
      if (lightning > 1) lineWin = lineWin * lightning;
    }
    let spinWin = lineWin + result.scatterPay * bet;
    let fsWin = 0;
    if (F_FS && result.scCount >= 3) {
      fsWin = runFreeSpinsHeadless(result.scCount);
      spinWin += fsWin * bet;
    }
    let hnwWin = 0;
    if (F_HNW && result.bonusCount >= (F_HNW.trigger?.min || 6)) {
      hnwWin = runHoldAndWinHeadless(result.bonusCount);
      spinWin += hnwWin * bet;
    }
    const capAbs = WIN_CAP * bet;
    if (spinWin > capAbs) spinWin = capAbs;
    if (spinWin > 0) state.hits += 1;
    state.totalWon += spinWin;
    state.balance += spinWin;
    if (spinWin > state.maxWin) state.maxWin = spinWin;
    return { win: spinWin, scCount: result.scCount, bonusCount: result.bonusCount, lightning, fsWin, hnwWin };
  }

  function runFreeSpinsHeadless(initialScCount) {
    if (!F_FS) return 0;
    const fsReels = (F_FS.reels_override === 'free_spins' && FS_REELS) ? FS_REELS : BASE_REELS;
    let remaining = awardFsSpins(initialScCount);
    if (remaining <= 0) return 0;
    let total = 0;
    let mult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.start) || 1;
    const incr = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increment) || 0;
    const maxMult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.max) || Infinity;
    const incrOn = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increments_on) || 'each_winning_fs_spin';
    const fsCap = (F_FS.retrigger && F_FS.retrigger.max_total) || Infinity;
    let totalAwarded = remaining;
    while (remaining > 0) {
      remaining--;
      const grid = drawGrid(state.rng, fsReels);
      const r = evalBase(grid);
      let win = r.baseWin;
      if (win > 0) {
        win *= mult;
        if (incrOn === 'each_winning_fs_spin' && mult < maxMult) mult = Math.min(maxMult, mult + incr);
      }
      if (incrOn === 'each_fs_spin' && mult < maxMult) mult = Math.min(maxMult, mult + incr);
      total += win;
      if (r.scCount >= 3 && totalAwarded < fsCap) {
        const add = awardFsRetrigger(r.scCount);
        if (add > 0) { remaining += add; totalAwarded += add; }
      }
    }
    return total;
  }

  const _hnwDiag = { lastInitialOrbs: 0, lastFinalOrbs: 0, lastRespinsUsed: 0, totalRespinOrbsLanded: 0, runs: 0 };
  function runHoldAndWinHeadless(initialOrbCount) {
    if (!F_HNW) return 0;
    const respinsInitial = F_HNW.respins_initial || 3;
    const orbLandBase = F_HNW.orb_land_chance_base || 0.04;
    const orbLandFill = F_HNW.orb_land_chance_fill_bonus || 0;
    const fullGridBonus = F_HNW.full_grid_bonus_x || 0;
    const cashDist = F_HNW.cash_value_distribution || [{ value: 1, weight: 1 }];
    const jackpots = F_HNW.jackpot_tiers || [];
    const unifiedPool = [
      ...cashDist.map((c) => ({ value: c.value, weight: Math.max(0, c.weight) })),
      ...jackpots.map((j) => ({ value: j.multiplier, weight: Math.max(0, j.weight) })),
    ];
    const totalCells = REELS * ROWS;
    let filled = Math.min(initialOrbCount, totalCells);
    let total = 0;
    for (let i = 0; i < filled; i++) total += pickWeighted(state.rng, unifiedPool);
    _hnwDiag.lastInitialOrbs = filled;
    let respins = respinsInitial;
    let respinsUsed = 0;
    let respinOrbsLanded = 0;
    while (respins > 0 && filled < totalCells) {
      respinsUsed++;
      let landed = 0;
      const free = totalCells - filled;
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFill * filledFrac;
      for (let c = 0; c < free; c++) {
        if (state.rng() < p) { total += pickWeighted(state.rng, unifiedPool); landed++; }
      }
      filled += landed;
      respinOrbsLanded += landed;
      if (landed > 0 && F_HNW.respin_reset_on_new) respins = respinsInitial;
      else respins--;
    }
    if (filled >= totalCells && fullGridBonus > 0) total += fullGridBonus;
    _hnwDiag.lastFinalOrbs = filled;
    _hnwDiag.lastRespinsUsed = respinsUsed;
    _hnwDiag.totalRespinOrbsLanded += respinOrbsLanded;
    _hnwDiag.runs++;
    return total;
  }

  window.__SLOT__ = {
    state, IR, spinOnce, spinOnceInstant, runAutoplay, stopAutoplay,
    showIntro: showIntroModal,
    toggleTurbo, toggleSound, toggleQuickMenu,
    _debug: { evalBase, drawGrid, BASE_REELS, FS_REELS, F_FS, F_HNW, F_MUL, SCAT_PREV, hnwDiag: _hnwDiag, SPIN_PROFILE },
  };

  // ╔══════════════════════════════════════════════════════════════╗
  // ║ 21 · MTL — Math Twin Lockstep boot (UNCHANGED CONTRACT)       ║
  // ╚══════════════════════════════════════════════════════════════╝

  (function mtlBoot() {
    const O = window.MTLOracle;
    const Diff = window.MTLDiff;
    const HUD = window.MTLDashboard;
    const Replay = window.MTLReplay;
    if (!O || !HUD) return;
    HUD.mount();
    if (IR && IR.meta && IR.meta.seal) HUD.setSeal(IR.meta.seal);
    else HUD.setUnsealed('not sealed in Studio');

    let wtWorker = null;
    try {
      if (window.__MTL_WT_WORKER_SRC__ && window.__MTL_WT_SRC__) {
        const blob = new Blob([
          window.__MTL_WT_SRC__ + '\n\n',
          window.__MTL_WT_WORKER_SRC__.replace(/importScripts\s*\([^)]+\)\s*;?/g, '// importScripts inlined'),
        ], { type: 'application/javascript' });
        wtWorker = new Worker(URL.createObjectURL(blob));
        wtWorker.addEventListener('message', function (ev) {
          const m = ev.data || {};
          if (m.type === 'report') {
            HUD.setWatchtowerReport(m);
            if (m.status === 'critical' && !halted) {
              freezeUI('watchtower CRITICAL — ' + (m.breaches[0] ? m.breaches[0].metric : 'unknown'));
            }
          } else if (m.type === 'error') {
            console.warn('[MTL Watchtower] error:', m.error);
          }
        });
        wtWorker.postMessage({ type: 'init', validated_metrics: IR.validated_metrics || null });
      } else {
        console.log('[MTL] watchtower disabled — worker source not inlined');
      }
    } catch (err) {
      console.warn('[MTL Watchtower] boot failed:', err);
      wtWorker = null;
    }

    let halted = false;
    const spinBtnEl = $('#spin-btn');

    function freezeUI(reason) {
      halted = true;
      if (spinBtnEl) {
        spinBtnEl.setAttribute('disabled', '');
        spinBtnEl.setAttribute('aria-disabled', 'true');
        spinBtnEl.style.opacity = '0.35';
        spinBtnEl.style.cursor = 'not-allowed';
        spinBtnEl.textContent = 'HALT';
      }
      if (window.__SLOT__) window.__SLOT__.haltedReason = reason;
      setStatusText('HALT · ' + reason);
      console.warn('[MTL] runtime halted —', reason);
    }

    async function preFlightReseal(seedCount) {
      const n = seedCount || 100;
      const t0 = performance.now();
      const snap = { rng: state.rng, balance: state.balance, totalWagered: state.totalWagered, totalWon: state.totalWon, spinsPlayed: state.spinsPlayed, hits: state.hits, maxWin: state.maxWin };
      for (let i = 0; i < n; i++) {
        const seed = i;
        state.rng = makeRng(seed);
        state.balance = 1e9; state.totalWagered = 0; state.totalWon = 0; state.spinsPlayed = 0; state.hits = 0; state.maxWin = 0;
        const r = spinOnceInstant();
        const reduced = { win: r.win, scCount: r.scCount, bonusCount: r.bonusCount, lightning: r.lightning, fsWin: r.fsWin, hnwWin: r.hnwWin };
        const oracle = await O.spin(IR, seed, 1);
        const oracleReduced = { win: oracle.win, scCount: oracle.scCount, bonusCount: oracle.bonusCount, lightning: oracle.lightning, fsWin: oracle.fsWin, hnwWin: oracle.hnwWin };
        const rh = await O.hashOutcome(reduced);
        const oh = await O.hashOutcome(oracleReduced);
        if (rh !== oh) {
          const diff = Diff ? Diff.firstDiff(oracleReduced, reduced) : null;
          console.warn('[MTL pre-flight MISMATCH @ seed ' + seed + ']\n  oracle:', JSON.stringify(oracleReduced), '\n  runner:', JSON.stringify(reduced), '\n  oracle hash:', oh, '\n  runner hash:', rh, '\n  diff:', diff);
          HUD.recordHalt({ seed, diff, oracleResult: oracleReduced, runnerResult: reduced });
          freezeUI('pre-flight mismatch @ seed ' + seed);
          Object.assign(state, snap);
          return false;
        }
      }
      Object.assign(state, snap);
      const dt = (performance.now() - t0).toFixed(1);
      console.log('[MTL] pre-flight reseal OK — ' + n + ' seeds matched in ' + dt + 'ms');
      return true;
    }

    async function lockstepSpinClick() {
      if (halted) return;
      if (state.spinning) return;
      const seed = (Math.floor(state.rng() * 0x100000000) >>> 0) || 1;
      const snap = { rng: state.rng, balance: state.balance, totalWagered: state.totalWagered, totalWon: state.totalWon, spinsPlayed: state.spinsPlayed, hits: state.hits, maxWin: state.maxWin };
      state.rng = makeRng(seed);
      state.balance = 1e9; state.totalWagered = 0; state.totalWon = 0; state.spinsPlayed = 0; state.hits = 0; state.maxWin = 0;
      const headless = spinOnceInstant();
      const reduced = { win: headless.win, scCount: headless.scCount, bonusCount: headless.bonusCount, lightning: headless.lightning, fsWin: headless.fsWin, hnwWin: headless.hnwWin };
      const oracle = await O.spin(IR, seed, 1);
      const oracleReduced = { win: oracle.win, scCount: oracle.scCount, bonusCount: oracle.bonusCount, lightning: oracle.lightning, fsWin: oracle.fsWin, hnwWin: oracle.hnwWin };
      const runnerHash = await O.hashOutcome(reduced);
      const oracleHash = await O.hashOutcome(oracleReduced);
      const match = runnerHash === oracleHash;
      HUD.recordSpin({ seed, oracleHash, runnerHash, match });
      if (!match) {
        const diff = Diff ? Diff.firstDiff(oracleReduced, reduced) : null;
        HUD.recordHalt({ seed, diff, oracleResult: oracleReduced, runnerResult: reduced });
        freezeUI('lockstep mismatch @ seed ' + seed);
        Object.assign(state, snap);
        return;
      }
      const bet = (IR.bet && IR.bet.base_bet) || 1;
      if (wtWorker) {
        try { wtWorker.postMessage({ type: 'spin', win: reduced.win, bet, scCount: reduced.scCount, bonusCount: reduced.bonusCount, lightning: reduced.lightning, fsWin: reduced.fsWin, hnwWin: reduced.hnwWin }); } catch (_) {}
      }
      if (Replay && IR && IR.meta && IR.meta.seal) {
        try {
          await Replay.append({
            irDna: IR.meta.seal.dna || '', seed, bet,
            win: reduced.win, scCount: reduced.scCount, bonusCount: reduced.bonusCount,
            lightning: reduced.lightning, fsWin: reduced.fsWin, hnwWin: reduced.hnwWin,
            outcomeHash: oracleHash,
          });
        } catch (_) {}
      }
      Object.assign(state, snap);
      state.rng = makeRng(seed);
      try { await spinOnce(); } catch (err) { console.error('[MTL] animated spin error:', err); }
    }

    if (spinBtnEl) {
      const fresh = spinBtnEl.cloneNode(true);
      spinBtnEl.parentNode.replaceChild(fresh, spinBtnEl);
      fresh.addEventListener('click', function () { lockstepSpinClick(); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !halted && !state.spinning) {
        e.preventDefault();
        e.stopPropagation();
        lockstepSpinClick();
      }
    }, true);

    setTimeout(function () {
      preFlightReseal(100).catch(function (e) {
        console.error('[MTL] pre-flight failed:', e);
        freezeUI('pre-flight error: ' + e.message);
      });
    }, 250);

    HUD.setReplayHandler(async function () {
      if (!Replay || !IR.meta || !IR.meta.seal) return;
      try {
        const entries = await Replay.list({ irDna: IR.meta.seal.dna, limit: 10 });
        if (!entries.length) { console.log('[MTL Replay] no journaled entries yet'); return; }
        let matched = 0;
        const drifted = [];
        for (let i = 0; i < entries.length; i++) {
          const r = await Replay.replay(IR, entries[i]);
          if (r.match) matched++;
          else drifted.push({ entry: entries[i], replay: r });
        }
        if (drifted.length === 0) console.log('[MTL Replay] ' + matched + '/' + entries.length + ' entries reproduced byte-equal');
        else { console.warn('[MTL Replay] ' + drifted.length + ' DRIFT(S) detected!', drifted); freezeUI('replay drift on ' + drifted.length + ' journaled spin(s)'); }
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:' + (drifted.length ? 'rgba(244,63,94,0.95)' : 'rgba(34,197,94,0.92)') + ';color:#fff;font:13px/1.4 ui-monospace,Menlo,monospace;padding:10px 16px;border-radius:8px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4)';
        t.textContent = drifted.length ? '⚠ Replay drift: ' + drifted.length + ' / ' + entries.length + ' (see console)' : '✓ Replay OK · ' + matched + ' / ' + entries.length + ' byte-equal';
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4500);
      } catch (err) { console.error('[MTL Replay] error:', err); }
    });

    window.__SLOT__.mtl = {
      preFlightReseal, lockstepSpinClick,
      get halted() { return halted; },
      get stats() { return HUD.getStats(); },
      get watchtower() { return HUD.getWatchtowerReport(); },
      requestWatchtowerReport: function () { if (wtWorker) wtWorker.postMessage({ type: 'report' }); },
      replayLastN: async function (n) {
        if (!Replay || !IR.meta || !IR.meta.seal) return null;
        const entries = await Replay.list({ irDna: IR.meta.seal.dna, limit: n || 10 });
        const results = [];
        for (let i = 0; i < entries.length; i++) {
          const r = await Replay.replay(IR, entries[i]);
          results.push({ entry: entries[i], replay: r });
        }
        return results;
      },
    };
  })();
})();
