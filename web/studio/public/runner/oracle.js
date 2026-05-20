/*
 * ════════════════════════════════════════════════════════════════════════════
 *   ORACLE  —  Math Twin Lockstep, Witness #1
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Independent JavaScript reimplementation of the canonical slot spin pipeline.
 * Designed to be byte-equivalent to `runtime.js`'s `spinOnceInstant()` for
 * any given (IR, seed) pair — but written from scratch, with a different
 * internal style, so that translation bugs in either implementation surface
 * as outcome-hash mismatches during Sealing Ceremony / Lockstep.
 *
 * Style contrasts vs runtime.js (intentional, to catch parallel bugs):
 *   • Pure functions; no IIFE closure, no shared `state`.
 *   • Reels stored as expanded-strip arrays (one entry per integer weight),
 *     drawn via single uniform-int pick — runtime.js uses cumulative-weight
 *     binary search.  Both compute the same distribution; different code.
 *   • Line eval scans each payline by collecting symbols up-front, then
 *     resolves wild substitution and run length on the collected vector,
 *     instead of runtime.js's "target + forward scan" trick.
 *   • Features (FS / H&W / Lightning) are pure-return functions taking
 *     a mutable `RngBox` and returning a result, not side-effecting an
 *     outer `state` closure.
 *   • Hash is SHA-256 over a canonical JSON serialization of the full
 *     outcome (grid + lineWins + features), with sorted keys for stability.
 *
 * Public API:
 *   await MTLOracle.spin(ir, seed, bet) → {
 *     win, scCount, bonusCount, lightning, fsWin, hnwWin,
 *     gridHash, outcomeHash
 *   }
 *
 * Determinism guarantees:
 *   • mulberry32 with same seed advancement order as runtime.js
 *   • Reel draw consumes exactly 1 rng() per cell, columns r=0..R-1, rows y=0..Y-1
 *   • Scatter prevention is applied AFTER full grid is drawn (matches runtime.js)
 *   • Feature sub-sims consume rng() in same order as runtime.js
 *
 * If oracle and runtime disagree on any (IR, seed), the seed locates the
 * exact divergence and the structured diff in Lockstep tells you which
 * field of which outcome differs (e.g. paytable.ZEUS.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  //  RNG — xoshiro128**, must be BIT-IDENTICAL to runtime.js makeRng()
  //  W218 (2026-05-20): replaced mulberry32 (which had measured +0.06% H&W
  //  upward bias, 11σ event) with xoshiro128** Number-only impl.
  // ──────────────────────────────────────────────────────────────────────────

  function makeRng(seed) {
    let z = (seed >>> 0) || 0x9E3779B9;
    const sm32 = function () {
      z = (z + 0x9E3779B9) >>> 0;
      let x = z;
      x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B) >>> 0;
      x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35) >>> 0;
      return (x ^ (x >>> 16)) >>> 0;
    };
    let s0 = sm32(), s1 = sm32(), s2 = sm32(), s3 = sm32();
    if ((s0 | s1 | s2 | s3) === 0) s0 = 1;
    return function () {
      const m = Math.imul(s1, 5) >>> 0;
      const r = ((m << 7) | (m >>> 25)) >>> 0;
      const result = Math.imul(r, 9) >>> 0;
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

  // ──────────────────────────────────────────────────────────────────────────
  //  Canonical serialization (sorted-keys JSON, used for hashing)
  // ──────────────────────────────────────────────────────────────────────────

  function canonicalize(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  function canonicalJSON(value) {
    return JSON.stringify(canonicalize(value));
  }

  async function sha256Hex(str) {
    // crypto.subtle is async — used only at outcome-hash time, not in the
    // hot loop, so the overhead is amortized across the whole spin.
    if (root.crypto && root.crypto.subtle) {
      const buf = new TextEncoder().encode(str);
      const hash = await root.crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(hash);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    }
    // Fallback: 32-bit FNV-1a x 2 rounds (still deterministic across browsers).
    // Used only when crypto.subtle is unavailable (very old WebView).
    let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x9e3779b1) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  IR introspection helpers (read-only, no IR mutation)
  // ──────────────────────────────────────────────────────────────────────────

  function topo(ir) {
    return {
      reels: (ir.topology && ir.topology.reels) || 5,
      rows: (ir.topology && ir.topology.rows) || 3,
    };
  }
  function symMap(ir) {
    const m = Object.create(null);
    for (const s of ir.symbols || []) m[s.id] = s;
    return m;
  }
  function findFeature(ir, kind) {
    return ((ir.features || []).find((f) => f.kind === kind)) || null;
  }
  function payAt(ir, symId, count) {
    const pt = ir.paytable || {};
    const e = pt[symId];
    if (!e) return 0;
    return Number(e[String(count)] ?? e['x' + count] ?? 0);
  }
  function findByKind(ir, kind) {
    const s = (ir.symbols || []).find((x) => x.kind === kind);
    return s ? s.id : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Reel draw — alternative algorithm vs runtime.js
  //  We use cumulative-weight + single linear scan (NOT binary search) over
  //  the cumulative array.  Same distribution, different code path → catches
  //  bugs where runtime's binary search would misbehave on edge cases.
  // ──────────────────────────────────────────────────────────────────────────

  function buildCumReels(reelMaps) {
    if (!Array.isArray(reelMaps)) return null;
    return reelMaps.map(function (m) {
      const entries = Object.entries(m || {});
      const cum = [];
      const syms = [];
      let acc = 0;
      for (let i = 0; i < entries.length; i++) {
        const id = entries[i][0];
        const w = Math.max(0.0001, Number(entries[i][1]));
        acc += w;
        cum.push(acc);
        syms.push(id);
      }
      return { cum: cum, syms: syms, total: acc };
    });
  }

  function drawSymbol(rng, reelIdx, reels) {
    const r = reels[reelIdx] || reels[reels.length - 1];
    const x = rng() * r.total;
    // Linear scan (vs runtime.js binary search).  For reels with <100
    // entries this is no slower in practice and uses different code path.
    for (let i = 0; i < r.cum.length; i++) {
      if (x <= r.cum[i]) return r.syms[i];
    }
    return r.syms[r.syms.length - 1];
  }

  function drawGrid(rng, reels, reelCount, rowCount) {
    const grid = [];
    for (let r = 0; r < reelCount; r++) {
      const col = [];
      for (let y = 0; y < rowCount; y++) col.push(drawSymbol(rng, r, reels));
      grid.push(col);
    }
    return grid;
  }

  function applyScatterPrevention(grid, ir, reelCount, rowCount) {
    const sp = (ir.reels && ir.reels.scatter_prevention) || null;
    if (!sp || !sp.enabled) return grid;
    const maxPer = sp.max_scatters_per_reel || 1;
    const replace = sp.replacement_symbol;
    const scId = findByKind(ir, 'scatter');
    if (!scId || !replace) return grid;
    for (let r = 0; r < reelCount; r++) {
      let seen = 0;
      for (let y = 0; y < rowCount; y++) {
        if (grid[r][y] === scId) {
          if (seen >= maxPer) grid[r][y] = replace;
          else seen++;
        }
      }
    }
    return grid;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Base spin evaluation — collect-then-resolve style (vs runtime's forward scan)
  // ──────────────────────────────────────────────────────────────────────────

  function evalBase(grid, ir) {
    const t = topo(ir);
    const syms = symMap(ir);
    const paylines = (ir.evaluation && ir.evaluation.paylines) || [];
    const minMatch = (ir.evaluation && ir.evaluation.min_match) || 3;
    const wildSubEnabled =
      (ir.evaluation && ir.evaluation.wild_substitution && ir.evaluation.wild_substitution.enabled) !== false;
    const scId = findByKind(ir, 'scatter');
    const bnId = findByKind(ir, 'bonus');

    function isWild(id) { return syms[id] && syms[id].kind === 'wild'; }

    // Canonical "best_paying_interpretation" — try both target candidates
    // (first non-wild AND wild) and pick whichever pays more.  Mirrors
    // runtime.js evalBase.
    const wildSym = ((ir.symbols || []).find((x) => x.kind === 'wild') || {}).id;
    const lineWins = [];
    let lineTotal = 0;
    for (let li = 0; li < paylines.length; li++) {
      const line = paylines[li];
      const seq = [];
      for (let c = 0; c < t.reels; c++) seq.push(grid[c][line[c] != null ? line[c] : 0]);

      const candidates = [];
      const first = seq[0];
      if (wildSubEnabled && isWild(first)) {
        for (let c = 1; c < seq.length; c++) {
          if (!isWild(seq[c])) { candidates.push(seq[c]); break; }
        }
      } else if (first) {
        candidates.push(first);
      }
      if (wildSubEnabled && wildSym && !candidates.includes(wildSym)) {
        candidates.push(wildSym);
      }

      let bestPay = 0, bestTarget = null, bestRun = 0;
      for (const target of candidates) {
        let runLen = 0;
        for (let c = 0; c < seq.length; c++) {
          if (seq[c] === target || (wildSubEnabled && isWild(seq[c]))) runLen++;
          else break;
        }
        if (runLen < minMatch) continue;
        const p = payAt(ir, target, Math.min(runLen, 5));
        if (p > bestPay) { bestPay = p; bestTarget = target; bestRun = runLen; }
      }
      if (bestPay > 0 && bestTarget) {
        lineTotal += bestPay;
        lineWins.push({ lineIdx: li, sym: bestTarget, count: bestRun, pay: bestPay });
      }
    }

    // Scatter pay + count
    let scCount = 0, scatterPay = 0;
    if (scId) {
      for (let r = 0; r < t.reels; r++) {
        for (let y = 0; y < t.rows; y++) {
          if (grid[r][y] === scId) scCount++;
        }
      }
      if (scCount >= 3) {
        scatterPay = payAt(ir, scId, Math.min(scCount, 5));
        // Wrath-style fallback: IR may declare scatter pays only on
        // the free_spins feature (paytable has no "S"), in which case
        // the engine must still pay them.  Mirror runtime.js evalBase.
        if (scatterPay === 0) {
          const fFs = findFeature(ir, 'free_spins');
          if (fFs && fFs.scatter_pays) {
            const k = String(Math.min(scCount, 5));
            const v = fFs.scatter_pays[k] ?? fFs.scatter_pays[Math.min(scCount, 5)];
            scatterPay = Number(v) || 0;
          }
        }
      }
    }

    // Bonus count (for H&W trigger)
    let bonusCount = 0;
    if (bnId) {
      for (let r = 0; r < t.reels; r++) {
        for (let y = 0; y < t.rows; y++) {
          if (grid[r][y] === bnId) bonusCount++;
        }
      }
    }

    return {
      lineWins: lineWins,
      lineTotal: lineTotal,
      scatterPay: scatterPay,
      scCount: scCount,
      bonusCount: bonusCount,
      baseWin: lineTotal + scatterPay,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Weighted picker — used by features; identical distribution to runtime.js
  //  pickWeighted but written as imperative for-loop (vs runtime's for-of).
  // ──────────────────────────────────────────────────────────────────────────

  function pickWeighted(rng, list) {
    let total = 0;
    for (let i = 0; i < list.length; i++) total += Math.max(0, list[i].weight);
    let x = rng() * total;
    for (let i = 0; i < list.length; i++) {
      x -= Math.max(0, list[i].weight);
      if (x <= 0) return list[i].value;
    }
    return list[list.length - 1].value;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Free Spins headless
  // ──────────────────────────────────────────────────────────────────────────

  function awardFsSpins(F_FS, scCount) {
    if (!F_FS || !F_FS.trigger || !F_FS.trigger.thresholds) return 0;
    let best = 0;
    const t = F_FS.trigger.thresholds;
    for (const k in t) {
      if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
      const n = parseInt(k, 10);
      if (n <= scCount && t[k] > best) best = t[k];
    }
    return best;
  }
  function awardFsRetrigger(F_FS, scCount) {
    if (!F_FS || !F_FS.retrigger || !F_FS.retrigger.enabled) return 0;
    const tt = F_FS.retrigger.thresholds || (F_FS.trigger && F_FS.trigger.thresholds) || {};
    let best = 0;
    for (const k in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, k)) continue;
      const n = parseInt(k, 10);
      if (n <= scCount && tt[k] > best) best = tt[k];
    }
    return best;
  }

  function runFreeSpinsHeadless(rng, ir, initialScCount, BASE_REELS, FS_REELS) {
    const F_FS = findFeature(ir, 'free_spins');
    if (!F_FS) return 0;
    const fsReels = (F_FS.reels_override === 'free_spins' && FS_REELS) ? FS_REELS : BASE_REELS;
    let remaining = awardFsSpins(F_FS, initialScCount);
    if (remaining <= 0) return 0;
    const t = topo(ir);
    let total = 0;
    let mult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.start) || 1;
    const incr = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increment) || 0;
    const maxMult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.max) || Infinity;
    const incrOn = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increments_on) || 'each_winning_fs_spin';
    const fsCap = (F_FS.retrigger && F_FS.retrigger.max_total) || Infinity;
    let totalAwarded = remaining;
    while (remaining > 0) {
      remaining--;
      let grid = drawGrid(rng, fsReels, t.reels, t.rows);
      grid = applyScatterPrevention(grid, ir, t.reels, t.rows);
      const r = evalBase(grid, ir);
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
      if (r.scCount >= 3 && totalAwarded < fsCap) {
        const add = awardFsRetrigger(F_FS, r.scCount);
        if (add > 0) { remaining += add; totalAwarded += add; }
      }
    }
    return total;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Hold & Win headless
  // ──────────────────────────────────────────────────────────────────────────

  function runHoldAndWinHeadless(rng, ir, initialOrbCount) {
    const F_HNW = findFeature(ir, 'hold_and_win');
    if (!F_HNW) return 0;
    const t = topo(ir);
    const totalCells = t.reels * t.rows;
    const respinsInitial = F_HNW.respins_initial || 3;
    const orbLandBase = F_HNW.orb_land_chance_base || 0.04;
    const orbLandFill = F_HNW.orb_land_chance_fill_bonus || 0;
    const fullGridBonus = F_HNW.full_grid_bonus_x || 0;
    const cashDist = F_HNW.cash_value_distribution || [{ value: 1, weight: 1 }];
    const jackpots = F_HNW.jackpot_tiers || [];
    const unifiedPool = [];
    for (let i = 0; i < cashDist.length; i++) {
      unifiedPool.push({ value: cashDist[i].value, weight: Math.max(0, cashDist[i].weight) });
    }
    for (let i = 0; i < jackpots.length; i++) {
      unifiedPool.push({ value: jackpots[i].multiplier, weight: Math.max(0, jackpots[i].weight) });
    }
    let filled = Math.min(initialOrbCount, totalCells);
    let total = 0;
    for (let i = 0; i < filled; i++) total += pickWeighted(rng, unifiedPool);
    let respins = respinsInitial;
    while (respins > 0 && filled < totalCells) {
      let landed = 0;
      const free = totalCells - filled;
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFill * filledFrac;
      for (let c = 0; c < free; c++) {
        if (rng() < p) {
          total += pickWeighted(rng, unifiedPool);
          landed++;
        }
      }
      filled += landed;
      if (landed > 0 && F_HNW.respin_reset_on_new) respins = respinsInitial;
      else respins--;
    }
    if (filled >= totalCells && fullGridBonus > 0) total += fullGridBonus;
    return total;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Lightning multiplier
  // ──────────────────────────────────────────────────────────────────────────

  function rollLightning(rng, ir) {
    const F = findFeature(ir, 'multiplier');
    if (!F) return 1;
    if (F.scope && F.scope !== 'base_game_only') return 1;
    const prob = (F.trigger && F.trigger.probability) || 0;
    if (rng() >= prob) return 1;
    const dist = F.distribution || [];
    if (!dist.length) return 1;
    return pickWeighted(rng, dist);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public: spin(ir, seed, bet) → { win, scCount, bonusCount, lightning,
  //                                  fsWin, hnwWin, gridHash, outcomeHash }
  // ──────────────────────────────────────────────────────────────────────────

  async function spin(ir, seed, bet) {
    if (bet == null) bet = 1;
    const t = topo(ir);
    const BASE_REELS = buildCumReels((ir.reels && ir.reels.base) || []);
    const FS_REELS = buildCumReels((ir.reels && ir.reels.free_spins) || []);
    const rng = makeRng(seed);

    let grid = drawGrid(rng, BASE_REELS, t.reels, t.rows);
    grid = applyScatterPrevention(grid, ir, t.reels, t.rows);
    const r = evalBase(grid, ir);

    // Lightning multiplies LINE wins only — scatter pays untouched.
    // Mirrors runtime.js spinOnceInstant fix.  Putting scatter_pay inside the
    // multiply over-paid the lightning_uplift bucket by ~0.32pp.
    let lineWin = r.lineTotal * bet;
    let lightning = 1;
    const F_MUL = findFeature(ir, 'multiplier');
    if ((lineWin > 0 || r.scatterPay > 0) && F_MUL) {
      lightning = rollLightning(rng, ir);
      if (lightning > 1) lineWin = lineWin * lightning;
    }
    let win = lineWin + r.scatterPay * bet;
    let fsWin = 0;
    const F_FS = findFeature(ir, 'free_spins');
    if (F_FS && r.scCount >= 3) {
      fsWin = runFreeSpinsHeadless(rng, ir, r.scCount, BASE_REELS, FS_REELS);
      win += fsWin * bet;
    }
    let hnwWin = 0;
    const F_HNW = findFeature(ir, 'hold_and_win');
    if (F_HNW && r.bonusCount >= ((F_HNW.trigger && F_HNW.trigger.min) || 6)) {
      hnwWin = runHoldAndWinHeadless(rng, ir, r.bonusCount);
      win += hnwWin * bet;
    }
    const winCap = (ir.limits && ir.limits.max_win_x) || Infinity;
    const capAbs = winCap * bet;
    if (win > capAbs) win = capAbs;

    // Hashes
    const gridStr = canonicalJSON(grid);
    const outcomeStr = canonicalJSON({
      grid: grid,
      lineWins: r.lineWins,
      lineTotal: r.lineTotal,
      scatterPay: r.scatterPay,
      scCount: r.scCount,
      bonusCount: r.bonusCount,
      lightning: lightning,
      fsWin: fsWin,
      hnwWin: hnwWin,
      win: win,
    });
    const [gridHash, outcomeHash] = await Promise.all([
      sha256Hex(gridStr),
      sha256Hex(outcomeStr),
    ]);

    return {
      win: win,
      scCount: r.scCount,
      bonusCount: r.bonusCount,
      lightning: lightning,
      fsWin: fsWin,
      hnwWin: hnwWin,
      gridHash: gridHash,
      outcomeHash: outcomeHash,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public: hashOutcome(outcome) — used by runtime.js Lockstep to hash
  //  its own outcome with the SAME canonical-JSON algorithm.
  // ──────────────────────────────────────────────────────────────────────────

  async function hashOutcome(outcome) {
    const str = canonicalJSON(outcome);
    return sha256Hex(str);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public: hashIR(ir) — Merkle DNA preview; the full DNA is computed in dna.js
  //  but oracle.js exposes its hash primitive here for cross-module use.
  // ──────────────────────────────────────────────────────────────────────────

  async function hashIR(ir) {
    return sha256Hex(canonicalJSON(ir));
  }

  // Export
  root.MTLOracle = {
    spin: spin,
    hashOutcome: hashOutcome,
    hashIR: hashIR,
    canonicalJSON: canonicalJSON,
    sha256Hex: sha256Hex,
    makeRng: makeRng,
    // Low-level exports for sealing ceremony, also for unit tests
    _internals: {
      buildCumReels: buildCumReels,
      drawGrid: drawGrid,
      applyScatterPrevention: applyScatterPrevention,
      evalBase: evalBase,
      pickWeighted: pickWeighted,
      runFreeSpinsHeadless: runFreeSpinsHeadless,
      runHoldAndWinHeadless: runHoldAndWinHeadless,
      rollLightning: rollLightning,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
