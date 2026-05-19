/*
 * SLOT TEMPLATE RUNTIME
 * ──────────────────────
 * Standalone playable slot game.  Reads window.__IR__ (embedded by
 * Studio's "Play Template" build step) and runs:
 *
 *   • PCG-style RNG seeded from ir.rng.default_seed (or random)
 *   • Weighted reel draw across N reels × M rows
 *   • Line evaluation with wild substitution + scatter pays
 *   • Free Spins feature   (retrigger + progressive multiplier + FS reels)
 *   • Hold & Win feature   (orb landing + jackpot tiers + full-grid bonus)
 *   • Lightning Multiplier (winning_spin × value distribution)
 *   • Win cap (limits.max_win_x)
 *   • Animated reel spin (CSS keyframes during 600ms reel-stop sequence)
 *   • Win highlights on payline cells + scatter cells
 *   • Balance / bet selector / autoplay (×10, ×100, stop)
 *   • Live RTP / hit% / max-win stats
 *   • History rail (last 10 spins)
 *   • Paytable drawer (collapsible)
 *
 * NO art, NO audio — colored tier boxes only.  Boki ships the math, the
 * art pipeline is a separate (later) concern.
 */

(function () {
  'use strict';

  // ─── Boot ──────────────────────────────────────────────────────────

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

  // ─── Helpers ───────────────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmt = (n, d = 2) => Number(n).toFixed(d);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // mulberry32 — small, deterministic, sufficient for runner.  Same
  // generator the Studio auto-MC uses, so replay-from-seed parity holds.
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── IR derivations ────────────────────────────────────────────────

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
  const F_FS = findFeature('free_spins');
  const F_HNW = findFeature('hold_and_win');
  const F_MUL = findFeature('multiplier'); // Lightning-style

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
  // Split kind=hp into HP/MP by paytable rank (top half = HP, bottom = MP)
  // so the display tier colors match the Studio convention.
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

  // Pre-build reel draw tables (cumulative weights)
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
  const FS_REELS = buildReels((IR.reels && IR.reels.free_spins) || []);

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
  // Scatter prevention — Wrath-style "max N scatters per reel".  When
  // IR declares `reels.scatter_prevention`, any scatter beyond the
  // limit on the same column is replaced with the configured fallback
  // symbol (defaults to the most common LP).  This is critical for the
  // FS trigger frequency to match the validated MC numbers.
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

  function isWild(id)   { return SYM_BY_ID[id] && SYM_BY_ID[id].kind === 'wild'; }
  function isScat(id)   { return SYM_BY_ID[id] && SYM_BY_ID[id].kind === 'scatter'; }
  function isBonus(id)  { return SYM_BY_ID[id] && SYM_BY_ID[id].kind === 'bonus'; }
  function scatterId()  { const s = (IR.symbols || []).find((x) => x.kind === 'scatter'); return s ? s.id : null; }
  function bonusId()    { const s = (IR.symbols || []).find((x) => x.kind === 'bonus');   return s ? s.id : null; }
  function payAt(symId, count) {
    const pt = IR.paytable || {};
    const e = pt[symId];
    if (!e) return 0;
    return Number(e[String(count)] ?? e['x' + count] ?? 0);
  }

  // ─── Base spin evaluation ──────────────────────────────────────────

  function evalBase(grid) {
    const lineWins = [];
    let lineTotal = 0;
    for (let li = 0; li < PAYLINES.length; li++) {
      const line = PAYLINES[li];
      let target = grid[0][line[0] ?? 0];
      // Wild substitution: find first non-wild target
      if (WILD_SUB && isWild(target)) {
        for (let c = 1; c < REELS; c++) {
          const s = grid[c][line[c] ?? 0];
          if (!isWild(s)) { target = s; break; }
        }
      }
      let runLen = 0;
      for (let c = 0; c < REELS; c++) {
        const s = grid[c][line[c] ?? 0];
        if (s === target || (WILD_SUB && isWild(s))) runLen++;
        else break;
      }
      if (runLen >= MIN_MATCH) {
        const p = payAt(target, runLen);
        if (p > 0) {
          lineTotal += p;
          const cells = [];
          for (let c = 0; c < runLen; c++) cells.push({ r: c, y: line[c] ?? 0 });
          lineWins.push({ lineIdx: li, sym: target, count: runLen, pay: p, cells });
        }
      }
    }
    // Scatter pay (any-position)
    const scId = scatterId();
    let scCount = 0, scatterPay = 0;
    const scCells = [];
    if (scId) {
      for (let r = 0; r < REELS; r++)
        for (let y = 0; y < ROWS; y++)
          if (grid[r][y] === scId) { scCount++; scCells.push({ r, y }); }
      if (scCount >= 3) scatterPay = payAt(scId, Math.min(scCount, 5));
    }
    // Bonus count (for H&W trigger)
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

  // ─── Free Spins simulation (auto-played sequence) ──────────────────

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

  async function runFreeSpins(initialScCount) {
    const fsReels = (F_FS && F_FS.reels_override === 'free_spins' && FS_REELS) ? FS_REELS : BASE_REELS;
    let remaining = awardFsSpins(initialScCount);
    let total = 0;
    let mult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.start) || 1;
    const incr = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increment) || 0;
    const maxMult = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.max) || Infinity;
    const incrOn = (F_FS.progressive_multiplier && F_FS.progressive_multiplier.increments_on) || 'each_winning_fs_spin';
    let totalAwarded = remaining;
    const fsCap = (F_FS.retrigger && F_FS.retrigger.max_total) || Infinity;

    state.featureLabel = `Free Spins · ${remaining} spins · mult ${mult}×`;
    renderHud();
    await showFeatureOverlay({
      kind: 'FREE SPINS',
      title: `${remaining} Free Spins awarded`,
      detail: `Progressive multiplier 1× → ${maxMult}×`,
    });

    while (remaining > 0) {
      remaining--;
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

      // Animate this FS spin
      await animateGrid(grid, r, { context: 'fs', multAnnounce: mult });
      state.featureLabel = `Free Spins · ${remaining} left · mult ${mult}×`;
      renderHud();

      // Retrigger
      if (r.scCount >= 3 && totalAwarded < fsCap) {
        const add = awardFsRetrigger(r.scCount);
        if (add > 0) {
          remaining += add;
          totalAwarded += add;
          await showFeatureOverlay({
            kind: 'RETRIGGER',
            title: `+${add} more Free Spins`,
            detail: `total awarded: ${totalAwarded}`,
            short: true,
          });
        }
      }
    }
    state.featureLabel = '';
    renderHud();
    return total;
  }

  // ─── Hold & Win simulation (orb cascade + jackpots) ────────────────

  async function runHoldAndWin(initialOrbCount) {
    const respinsInitial = F_HNW.respins_initial || 3;
    const orbLandBase = F_HNW.orb_land_chance_base || 0.04;
    const orbLandFill = F_HNW.orb_land_chance_fill_bonus || 0;
    const fullGridBonus = F_HNW.full_grid_bonus_x || 0;
    const cashDist = F_HNW.cash_value_distribution || [{ value: 1, weight: 1 }];
    const jackpots = F_HNW.jackpot_tiers || [];
    const totalCells = REELS * ROWS;
    // Wrath canonical: cash + jackpot are ONE weighted pool (see headless
    // version for full derivation).  P(jackpot) = ΣjpW / (ΣcashW + ΣjpW).
    const unifiedPool = [
      ...cashDist.map((c) => ({ value: c.value, weight: Math.max(0, c.weight) })),
      ...jackpots.map((j) => ({ value: j.multiplier, weight: Math.max(0, j.weight) })),
    ];

    let filled = Math.min(initialOrbCount, totalCells);
    let totalCash = 0;
    for (let i = 0; i < filled; i++) totalCash += pickWeighted(state.rng, unifiedPool);

    let respins = respinsInitial;
    let jackpotMult = 0;

    await showFeatureOverlay({
      kind: 'HOLD & WIN',
      title: 'Zeus\'s Storm',
      detail: `${filled} starting orbs · ${respins} respins`,
    });

    // Cell layout: orb tracks indices 0..(totalCells-1) — we just count fills.
    // The board reuses the reels-grid: cells become orb-locked when filled.
    state.hnwLockedCells = new Set(); // visual marker
    // Mark random starting cells as locked for the animation
    const cellOrder = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) cellOrder.push(`${r}:${y}`);
    shuffleInPlace(cellOrder, state.rng);
    for (let i = 0; i < filled; i++) state.hnwLockedCells.add(cellOrder[i]);
    renderHnwBoard();

    while (respins > 0 && filled < totalCells) {
      let landed = 0;
      const free = totalCells - filled;
      const newOrbs = [];
      const remainingCells = cellOrder.filter((c) => !state.hnwLockedCells.has(c));
      // Per-respin landing probability — computed once from current filled
      // count, tested independently against every empty cell.
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFill * filledFrac;
      // Jackpot probability inside the unified pool, used for animation tag.
      const jpTotalW = jackpots.reduce((a, j) => a + Math.max(0, j.weight), 0);
      const poolTotalW = unifiedPool.reduce((a, e) => a + e.weight, 0);
      for (let c = 0; c < free; c++) {
        if (state.rng() < p) {
          const v = pickWeighted(state.rng, unifiedPool);
          // For UI tag only: split the displayed orb between jackpot-tier
          // and cash buckets based on which sub-pool the value came from.
          // This is purely cosmetic; the math is one draw from the unified
          // pool.  We tag as jackpot when the value matches one of the
          // jackpot multipliers (multipliers don't overlap cash values in
          // Wrath: 25/75/200/500 vs 1/2/3/5/8/10/15).
          const isJp = jackpots.some((j) => j.multiplier === v);
          let jp = 0;
          if (isJp) { jp = v; jackpotMult += v; } else { totalCash += v; }
          const cell = remainingCells[landed % remainingCells.length] || remainingCells[0];
          if (cell) state.hnwLockedCells.add(cell);
          newOrbs.push({ cell, value: v, jp });
          landed++;
        }
      }
      // Suppress unused-var lint when poolTotalW/jpTotalW aren't referenced
      // outside the loop body.
      void poolTotalW; void jpTotalW;
      filled += landed;
      renderHnwBoard();
      state.featureLabel = `Hold & Win · ${respins} respins · ${filled}/${totalCells} cells · €${fmt(totalCash + jackpotMult)}`;
      renderHud();
      await wait(550);
      if (landed > 0 && F_HNW.respin_reset_on_new) respins = respinsInitial;
      else respins--;
    }
    state.hnwLockedCells = null;

    let total = totalCash + jackpotMult;
    if (filled >= totalCells && fullGridBonus > 0) total += fullGridBonus;
    state.featureLabel = '';
    renderHud();
    return total;
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
  function pickJackpot(rng, list) {
    let total = 0;
    for (const e of list) total += Math.max(0, e.weight);
    let x = rng() * total;
    for (const e of list) {
      x -= Math.max(0, e.weight);
      if (x <= 0) return e.multiplier;
    }
    return list[list.length - 1].multiplier;
  }
  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ─── Lightning Multiplier ──────────────────────────────────────────

  function rollLightning() {
    if (!F_MUL) return 1;
    if (F_MUL.scope && F_MUL.scope !== 'base_game_only') return 1;
    const prob = (F_MUL.trigger && F_MUL.trigger.probability) || 0;
    if (state.rng() >= prob) return 1;
    const dist = F_MUL.distribution || [];
    if (!dist.length) return 1;
    return pickWeighted(state.rng, dist);
  }

  // ─── State ─────────────────────────────────────────────────────────

  const state = {
    rng: makeRng((IR.rng && IR.rng.default_seed) || Math.floor(Math.random() * 1e9)),
    balance: 100.0,
    betLevelIdx: 0,
    spinsPlayed: 0,
    hits: 0,
    totalWagered: 0,
    totalWon: 0,
    maxWin: 0,
    history: [],
    spinning: false,
    autoplay: { active: false, remaining: 0 },
    featureLabel: '',
    hnwLockedCells: null,
  };

  // ─── Render helpers ────────────────────────────────────────────────

  const reelsEl = $('#reels-grid');
  const balanceEl = $('#balance');
  const betAmountEl = $('#bet-amount');
  const spinsEl = $('#stat-spins');
  const hitsEl = $('#stat-hits');
  const hitPctEl = $('#stat-hit-pct');
  const totalWinEl = $('#stat-total-win');
  const rtpEl = $('#stat-rtp');
  const maxWinEl = $('#stat-max-win');
  const historyListEl = $('#history-list');
  const winBannerEl = $('#win-banner');
  const winBannerAmt = $('#win-banner-amount');
  const winBannerMult = $('#win-banner-mult');
  const titleEl = $('#game-title');
  const versionEl = $('#game-version');
  const spinBtn = $('#spin-btn');
  const auto10 = $('#auto-10');
  const auto100 = $('#auto-100');
  const autoStop = $('#auto-stop');
  const featOverlay = $('#feature-overlay');
  const featKindEl = $('#fo-kind');
  const featTitleEl = $('#fo-title');
  const featDetailEl = $('#fo-detail');
  const featGoBtn = $('#fo-go');

  function setupGrid() {
    reelsEl.style.gridTemplateColumns = `repeat(${REELS}, minmax(80px, 100px))`;
    reelsEl.style.gridTemplateRows = `repeat(${ROWS}, minmax(80px, 100px))`;
    reelsEl.innerHTML = '';
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.y = String(y);
        reelsEl.appendChild(cell);
      }
    }
  }
  function cellAt(r, y) {
    return reelsEl.querySelector(`.cell[data-r="${r}"][data-y="${y}"]`);
  }
  function paintCell(r, y, symId, opts) {
    const cell = cellAt(r, y);
    if (!cell) return;
    cell.className = 'cell tier-' + displayTierOf(symId);
    if (opts && opts.spinning) cell.classList.add('is-spinning');
    if (opts && opts.win) cell.classList.add('is-win');
    if (opts && opts.scatter) cell.classList.add('is-scatter-win');
    if (opts && opts.hnwLocked) cell.classList.add('tier-MULT');
    const sym = SYM_BY_ID[symId];
    cell.innerHTML = `<span class="cell-id">${symId || '?'}</span>${sym && sym.name && sym.name !== symId ? `<span class="cell-name">${sym.name}</span>` : ''}`;
  }
  function paintGrid(grid, opts) {
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        paintCell(r, y, grid[r][y], opts);
      }
    }
  }
  function clearWinHighlights() {
    $$('#reels-grid .cell.is-win, #reels-grid .cell.is-scatter-win').forEach((c) => {
      c.classList.remove('is-win', 'is-scatter-win');
    });
  }
  function highlightWins(result) {
    for (const lw of result.lineWins) {
      for (const c of lw.cells) {
        const cell = cellAt(c.r, c.y);
        if (cell) cell.classList.add('is-win');
      }
    }
    for (const c of result.scCells) {
      if (result.scCount >= 3) {
        const cell = cellAt(c.r, c.y);
        if (cell) cell.classList.add('is-scatter-win');
      }
    }
  }
  function showWinBanner(amount, mult) {
    if (amount <= 0) { winBannerEl.setAttribute('hidden', ''); return; }
    winBannerEl.removeAttribute('hidden');
    winBannerEl.classList.remove('is-banner-pop');
    void winBannerEl.offsetWidth; // restart animation
    winBannerAmt.textContent = fmt(amount);
    if (mult && mult > 1) winBannerMult.textContent = `${mult}×`;
    else winBannerMult.textContent = '';
  }
  function hideWinBanner() { winBannerEl.setAttribute('hidden', ''); }

  function renderHud() {
    balanceEl.textContent = fmt(state.balance);
    $('#currency').textContent = CURRENCY;
    betAmountEl.textContent = fmt(currentBet());
    spinsEl.textContent = String(state.spinsPlayed);
    hitsEl.textContent = String(state.hits);
    hitPctEl.textContent = state.spinsPlayed > 0 ? fmt((state.hits / state.spinsPlayed) * 100, 2) + '%' : '—';
    totalWinEl.textContent = fmt(state.totalWon);
    rtpEl.textContent = state.totalWagered > 0 ? fmt((state.totalWon / state.totalWagered) * 100, 2) + '%' : '—%';
    maxWinEl.textContent = fmt(state.maxWin);
    if (titleEl && IR.meta) {
      titleEl.textContent = (IR.meta.name || 'Slot Template') + (state.featureLabel ? ` · ${state.featureLabel}` : '');
    }
    if (versionEl && IR.meta) versionEl.textContent = 'v' + (IR.meta.version || '0.0');
  }

  function renderHnwBoard() {
    if (!state.hnwLockedCells) return;
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        const cell = cellAt(r, y);
        if (!cell) continue;
        if (state.hnwLockedCells.has(`${r}:${y}`)) {
          cell.className = 'cell tier-MULT';
          cell.innerHTML = `<span class="cell-id">◆</span>`;
        } else {
          cell.className = 'cell';
          cell.innerHTML = '';
        }
      }
    }
  }

  function appendHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > 10) state.history.length = 10;
    historyListEl.innerHTML = state.history.map((h) => {
      const cls = h.feature ? 'is-feat' : (h.win >= 10 ? 'is-big' : (h.win > 0 ? 'is-win' : ''));
      const right = h.feature ? h.feature : (h.win > 0 ? `+${fmt(h.win)}` : '—');
      return `<li class="${cls}"><span>#${h.idx}</span><span>${right}</span></li>`;
    }).join('');
  }

  function currentBet() {
    const mult = BET_LEVELS[state.betLevelIdx] || 1;
    return Number(BASE_BET) * Number(mult);
  }

  function showFeatureOverlay({ kind, title, detail, short }) {
    return new Promise((resolve) => {
      featKindEl.textContent = kind;
      featTitleEl.textContent = title;
      featDetailEl.textContent = detail || '';
      featOverlay.removeAttribute('hidden');
      featGoBtn.textContent = short ? 'CONTINUE' : 'START';
      const onClick = () => {
        featGoBtn.removeEventListener('click', onClick);
        featOverlay.setAttribute('hidden', '');
        resolve();
      };
      featGoBtn.addEventListener('click', onClick);
      // Auto-resolve after 1.6s for short toasts (retrigger, etc.)
      if (short) setTimeout(() => { if (!featOverlay.hasAttribute('hidden')) onClick(); }, 1600);
    });
  }

  // ─── Spin animation ────────────────────────────────────────────────

  async function animateGrid(finalGrid, result, opts) {
    opts = opts || {};
    // Each reel spins with staggered stop times (left to right)
    const SPIN_BASE = 280;
    const SPIN_STEP = 140;
    const reelStopDelays = [];
    for (let r = 0; r < REELS; r++) reelStopDelays.push(SPIN_BASE + r * SPIN_STEP);

    // Phase 1: set all cells to spinning + random in-flight glyphs
    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        const placeholderId = pickAnyId();
        paintCell(r, y, placeholderId, { spinning: true });
      }
    }
    // Phase 2: stop each reel sequentially with the FINAL grid value
    const stops = [];
    for (let r = 0; r < REELS; r++) {
      stops.push(new Promise((resolve) => {
        setTimeout(() => {
          for (let y = 0; y < ROWS; y++) paintCell(r, y, finalGrid[r][y]);
          resolve();
        }, reelStopDelays[r]);
      }));
    }
    await Promise.all(stops);

    // Phase 3: highlight wins + show banner
    highlightWins(result);
    const totalWin = result.lineTotal + result.scatterPay;
    if (totalWin > 0) {
      showWinBanner(totalWin, opts.multAnnounce && opts.multAnnounce > 1 ? opts.multAnnounce : null);
      // Brief pause so the user reads the win
      await wait(600);
    }
  }

  function pickAnyId() {
    const syms = IR.symbols || [];
    if (!syms.length) return '?';
    return syms[Math.floor(Math.random() * syms.length)].id;
  }

  // ─── Spin orchestration ────────────────────────────────────────────

  async function spinOnce() {
    if (state.spinning) return;
    const bet = currentBet();
    if (state.balance < bet) {
      flashBalance();
      return;
    }
    state.spinning = true;
    spinBtn.setAttribute('disabled', '');
    clearWinHighlights();
    hideWinBanner();

    state.balance -= bet;
    state.totalWagered += bet;
    state.spinsPlayed += 1;
    renderHud();

    const grid = drawGrid(state.rng, BASE_REELS);
    const result = evalBase(grid);

    let spinWin = result.baseWin * bet;

    // Lightning multiplier on winning base spins
    let lightning = 1;
    if (spinWin > 0 && F_MUL) {
      lightning = rollLightning();
      if (lightning > 1) {
        spinWin = spinWin * lightning;
      }
    }
    await animateGrid(grid, result, { multAnnounce: lightning });

    let featureLabel = null;

    // Free Spins trigger
    if (F_FS && result.scCount >= 3) {
      const fsWin = await runFreeSpins(result.scCount);
      spinWin += fsWin * bet;
      featureLabel = `FS +${fmt(fsWin * bet)}`;
    }
    // Hold & Win trigger
    if (F_HNW && result.bonusCount >= (F_HNW.trigger?.min || 6)) {
      const hnwWin = await runHoldAndWin(result.bonusCount);
      spinWin += hnwWin * bet;
      featureLabel = (featureLabel ? `${featureLabel} · ` : '') + `H&W +${fmt(hnwWin * bet)}`;
    }

    // Apply win cap (in bet units)
    const capAbs = WIN_CAP * bet;
    if (spinWin > capAbs) spinWin = capAbs;

    if (spinWin > 0) state.hits += 1;
    state.totalWon += spinWin;
    state.balance += spinWin;
    if (spinWin > state.maxWin) state.maxWin = spinWin;

    appendHistory({
      idx: state.spinsPlayed,
      win: spinWin,
      feature: featureLabel,
    });

    renderHud();
    if (spinWin > 0 && !featureLabel) {
      // Win banner shown during animateGrid; just keep it for a moment.
      setTimeout(hideWinBanner, 1400);
    } else if (featureLabel) {
      showWinBanner(spinWin);
      setTimeout(hideWinBanner, 2200);
    }

    state.spinning = false;
    spinBtn.removeAttribute('disabled');
  }

  function flashBalance() {
    balanceEl.animate(
      [{ color: 'var(--cyan)' }, { color: 'var(--rose)' }, { color: 'var(--cyan)' }],
      { duration: 600 }
    );
  }

  // ─── Autoplay ──────────────────────────────────────────────────────

  async function runAutoplay(count) {
    if (state.autoplay.active) return;
    state.autoplay = { active: true, remaining: count };
    autoStop.removeAttribute('hidden');
    auto10.classList.add('is-active');
    while (state.autoplay.active && state.autoplay.remaining > 0) {
      if (state.balance < currentBet()) break;
      await spinOnce();
      state.autoplay.remaining -= 1;
      await wait(220);
    }
    stopAutoplay();
  }
  function stopAutoplay() {
    state.autoplay = { active: false, remaining: 0 };
    autoStop.setAttribute('hidden', '');
    auto10.classList.remove('is-active');
    auto100.classList.remove('is-active');
  }

  // ─── Bet selector ──────────────────────────────────────────────────

  function setBetLevel(delta) {
    state.betLevelIdx = clamp(state.betLevelIdx + delta, 0, BET_LEVELS.length - 1);
    renderHud();
  }

  // ─── Paytable drawer ───────────────────────────────────────────────

  function renderPaytable() {
    const body = $('#paytable-body');
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
        <td><span class="pt-sym tier-${tier}" style="background:var(--bg-3)">${s.id}</span> ${s.name || s.id}</td>
        <td class="mono">${x3 || '—'}</td>
        <td class="mono">${x4 || '—'}</td>
        <td class="mono">${x5 || '—'}</td>
      </tr>`);
    }
    rows.push('</tbody></table>');
    if (F_FS) {
      rows.push(`<p style="margin-top:12px;font-size:11px;color:var(--text-2)">
        Free Spins: ${Object.entries(F_FS.trigger?.thresholds || {}).map(([k, v]) => `${k}→${v}`).join(' · ')}
        ${F_FS.progressive_multiplier ? `· progressive ${F_FS.progressive_multiplier.start}→${F_FS.progressive_multiplier.max}×` : ''}
      </p>`);
    }
    if (F_HNW) {
      rows.push(`<p style="margin-top:6px;font-size:11px;color:var(--text-2)">
        Hold &amp; Win: ${F_HNW.trigger?.min || 6}+ bonus symbols ·
        ${F_HNW.respins_initial || 3} respins · max win ${WIN_CAP}×
      </p>`);
    }
    if (F_MUL) {
      rows.push(`<p style="margin-top:6px;font-size:11px;color:var(--text-2)">
        Lightning Multiplier: ${((F_MUL.trigger?.probability || 0) * 100).toFixed(1)}% on winning spins ·
        values ${(F_MUL.distribution || []).map((d) => d.value + '×').join(' / ')}
      </p>`);
    }
    body.innerHTML = rows.join('');
  }

  // ─── Wiring ────────────────────────────────────────────────────────

  function bindUI() {
    spinBtn.addEventListener('click', () => { if (!state.spinning) spinOnce(); });
    auto10.addEventListener('click', () => runAutoplay(10));
    auto100.addEventListener('click', () => runAutoplay(100));
    autoStop.addEventListener('click', stopAutoplay);
    $('#bet-up').addEventListener('click', () => setBetLevel(+1));
    $('#bet-down').addEventListener('click', () => setBetLevel(-1));
    $('#paytable-toggle').addEventListener('click', () => {
      $('#paytable-drawer').removeAttribute('hidden');
    });
    $('#pd-close').addEventListener('click', () => {
      $('#paytable-drawer').setAttribute('hidden', '');
    });
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); if (!state.spinning) spinOnce(); }
      else if (e.key === 'a' || e.key === 'A') runAutoplay(10);
      else if (e.key === 's' || e.key === 'S') stopAutoplay();
    });
  }

  // ─── Boot ──────────────────────────────────────────────────────────

  setupGrid();
  // Paint cells with a neutral "ready" state — empty grid with no glyphs
  for (let r = 0; r < REELS; r++)
    for (let y = 0; y < ROWS; y++) {
      const cell = cellAt(r, y);
      if (cell) cell.className = 'cell';
    }
  renderHud();
  renderPaytable();
  bindUI();

  // ─── Headless instant spin (for verification / RTP tests) ─────────
  // Pure math, no DOM animation, no feature overlays.  Mirrors the
  // full spin pipeline (base eval + Lightning + FS + H&W + win cap)
  // but resolves synchronously so a Playwright test can run N
  // thousand spins in a few seconds.
  function spinOnceInstant() {
    const bet = currentBet();
    if (state.balance < bet) return { win: 0, scCount: 0, bonusCount: 0, lightning: 1, fsWin: 0, hnwWin: 0 };
    state.balance -= bet;
    state.totalWagered += bet;
    state.spinsPlayed += 1;
    const grid = drawGrid(state.rng, BASE_REELS);
    const result = evalBase(grid);
    let spinWin = result.baseWin * bet;
    let lightning = 1;
    if (spinWin > 0 && F_MUL) {
      lightning = rollLightning();
      if (lightning > 1) spinWin = spinWin * lightning;
    }
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

  // Headless versions of the feature sims — same math, no UI side effects.
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

  // Diagnostics for math verification — last H&W run details.
  const _hnwDiag = { lastInitialOrbs: 0, lastFinalOrbs: 0, lastRespinsUsed: 0, totalRespinOrbsLanded: 0, runs: 0 };
  function runHoldAndWinHeadless(initialOrbCount) {
    if (!F_HNW) return 0;
    const respinsInitial = F_HNW.respins_initial || 3;
    const orbLandBase = F_HNW.orb_land_chance_base || 0.04;
    const orbLandFill = F_HNW.orb_land_chance_fill_bonus || 0;
    const fullGridBonus = F_HNW.full_grid_bonus_x || 0;
    const cashDist = F_HNW.cash_value_distribution || [{ value: 1, weight: 1 }];
    const jackpots = F_HNW.jackpot_tiers || [];
    // Wrath canonical H&W (validated 500M-spin MC): cash values and jackpot
    // tiers share a SINGLE weighted distribution.  Each orb (initial trigger
    // orb AND respin-landed orb) draws once from this combined pool.
    //   cash weights: 404+250+150+90+45+25+14 = 978
    //   jackpot weights: 10+8+5+2 = 25
    //   total = 1003, so P(jackpot) = 25/1003 ≈ 2.494%
    // Jackpot value is its `multiplier` field (added as bet-units like cash).
    const unifiedPool = [
      ...cashDist.map((c) => ({ value: c.value, weight: Math.max(0, c.weight) })),
      ...jackpots.map((j) => ({ value: j.multiplier, weight: Math.max(0, j.weight) })),
    ];
    const totalCells = REELS * ROWS;
    let filled = Math.min(initialOrbCount, totalCells);
    let total = 0;
    // Initial trigger orbs draw from the unified pool — they CAN hit jackpots
    // (this is what the validated MC does; previously runner gave them
    // cash-only which artificially suppressed H&W RTP by ~12pp).
    for (let i = 0; i < filled; i++) total += pickWeighted(state.rng, unifiedPool);
    _hnwDiag.lastInitialOrbs = filled;
    let respins = respinsInitial;
    let respinsUsed = 0;
    let respinOrbsLanded = 0;
    while (respins > 0 && filled < totalCells) {
      respinsUsed++;
      let landed = 0;
      const free = totalCells - filled;
      // Per-respin landing probability is constant for this respin (computed
      // once from current filled count) and tested independently against
      // every empty cell.
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFill * filledFrac;
      for (let c = 0; c < free; c++) {
        if (state.rng() < p) {
          total += pickWeighted(state.rng, unifiedPool);
          landed++;
        }
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

  // Expose for tests / debug.  `spinOnceInstant` is what verification
  // harnesses use to run 10K+ spins in a few seconds.
  window.__SLOT__ = { state, IR, spinOnce, spinOnceInstant, runAutoplay, stopAutoplay, _debug: { evalBase, drawGrid, BASE_REELS, FS_REELS, F_FS, F_HNW, F_MUL, SCAT_PREV, hnwDiag: _hnwDiag } };
})();
