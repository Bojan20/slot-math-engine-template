// Auto-MC runner — self-contained Monte Carlo for the canonical IR-1.0.0
// shape used by Slot Math Studio.  No dependency on the heavyweight engine
// dep tree (behaviors / cascade / waysEvaluator etc.) — that engine
// remains the reference implementation for full-feature acceptance, but
// the Studio's in-browser preview ships a focused MC that covers the
// patterns Studio actually authors:
//
//   • Lines paytable                          (any 5×3 or M×N rectangular)
//   • Wild substitution (left-to-right)       (per IR.evaluation.wild_substitution)
//   • Scatter pays                            (any-position count)
//   • Free Spins feature                      (scatter-count threshold → N spins,
//                                              optional retrigger, optional
//                                              progressive multiplier 1×→max,
//                                              optional FS-specific reel set)
//   • Hold & Win feature                      (bonus-count threshold → respin
//                                              cascade with orb-land probability,
//                                              cash-value weights, jackpot tiers,
//                                              full-grid award)
//   • Lightning Multiplier on winning spins   (single trigger probability ×
//                                              weighted multiplier distribution)
//
// Anything outside this list is no-op'd safely.  The orchestrator marks the
// result `status: 'partial'` whenever the IR contains a feature the runner
// can't simulate so the UI can warn the user.

import type { SlotGameIR } from '@engine/ir/types.js';
import type {
  AutoMcRunRequest,
  AutoMcResultMessage,
} from './types.js';

// ─── Stats helpers ──────────────────────────────────────────────────────────

class Welford {
  n = 0;
  mean = 0;
  m2 = 0;
  push(x: number): void {
    this.n++;
    const delta = x - this.mean;
    this.mean += delta / this.n;
    this.m2 += delta * (x - this.mean);
  }
  std(): number {
    return this.n > 1 ? Math.sqrt(this.m2 / (this.n - 1)) : 0;
  }
}

class Reservoir {
  private buf: number[] = [];
  private n = 0;
  constructor(public readonly cap: number) {}
  push(x: number): void {
    this.n++;
    if (this.buf.length < this.cap) { this.buf.push(x); return; }
    const j = Math.floor(Math.random() * this.n);
    if (j < this.cap) this.buf[j] = x;
  }
  quantile(p: number): number {
    if (this.buf.length === 0) return 0;
    const sorted = [...this.buf].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  }
}

// ─── RNG (mulberry32 — matches certify.ts and is deterministic per seed) ────

function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Reel draw tables ───────────────────────────────────────────────────────

interface ReelDraw {
  /** Cumulative weight upper bounds, parallel to `syms`. */
  cum: Float64Array;
  syms: string[];
  total: number;
}

function buildReelDraws(reelStrips: Array<Record<string, number>>): ReelDraw[] {
  return reelStrips.map((m) => {
    const syms: string[] = [];
    const cumArr: number[] = [];
    let cum = 0;
    for (const [sym, w] of Object.entries(m)) {
      const ww = Math.max(0.0001, w);
      cum += ww;
      syms.push(sym);
      cumArr.push(cum);
    }
    return { cum: Float64Array.from(cumArr), syms, total: cum };
  });
}

function drawSymbol(rng: () => number, table: ReelDraw): string {
  const x = rng() * table.total;
  // Binary search since cum is sorted.
  let lo = 0, hi = table.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x <= table.cum[mid]) hi = mid;
    else lo = mid + 1;
  }
  return table.syms[lo];
}

// ─── IR feature lookups ─────────────────────────────────────────────────────

type AnyFeature = {
  kind?: string;
  name?: string;
  trigger?: {
    by?: string;
    thresholds?: Record<string, number>;
    min?: number;
    probability?: number;
  };
  scatter_pays?: Record<string, number>;
  progressive_multiplier?: {
    start: number; increment: number; max: number;
    increments_on?: string;
  };
  retrigger?: { enabled?: boolean; thresholds?: Record<string, number>; max_total?: number };
  reels_override?: string;
  // hold-and-win
  respins_initial?: number;
  respin_reset_on_new?: boolean;
  orb_land_chance_base?: number;
  orb_land_chance_fill_bonus?: number;
  full_grid_bonus_x?: number;
  cash_value_distribution?: Array<{ value: number; weight: number }>;
  jackpot_tiers?: Array<{ id: string; multiplier: number; weight: number }>;
  // multiplier (Lightning-style)
  distribution?: Array<{ value: number; weight: number }>;
  scope?: string;
};

function findFeature(ir: SlotGameIR, kind: string): AnyFeature | null {
  const arr = (ir as { features?: AnyFeature[] }).features || [];
  for (const f of arr) if (f.kind === kind) return f;
  return null;
}

function pickWeighted<T extends { value: number; weight: number }>(
  rng: () => number, list: T[],
): number {
  let total = 0;
  for (const e of list) total += Math.max(0, e.weight);
  if (total <= 0) return list[0]?.value ?? 0;
  let x = rng() * total;
  for (const e of list) {
    x -= Math.max(0, e.weight);
    if (x <= 0) return e.value;
  }
  return list[list.length - 1].value;
}

function pickWeightedJackpot(
  rng: () => number, list: Array<{ multiplier: number; weight: number }>,
): number {
  let total = 0;
  for (const e of list) total += Math.max(0, e.weight);
  if (total <= 0) return 0;
  let x = rng() * total;
  for (const e of list) {
    x -= Math.max(0, e.weight);
    if (x <= 0) return e.multiplier;
  }
  return list[list.length - 1].multiplier;
}

// ─── Single spin (base game) ────────────────────────────────────────────────

interface SpinResult {
  grid: string[][];
  baseWin: number;
  scatterCount: number;
  bonusCount: number;
  lineWin: number;
  scatterPay: number;
}

function isWild(ir: SlotGameIR, sym: string): boolean {
  return ir.symbols.find((s) => s.id === sym)?.kind === 'wild';
}

function findScatterId(ir: SlotGameIR): string | null {
  return ir.symbols.find((s) => s.kind === 'scatter')?.id ?? null;
}

function findBonusId(ir: SlotGameIR): string | null {
  return ir.symbols.find((s) => s.kind === 'bonus')?.id ?? null;
}

function drawGrid(
  rng: () => number,
  draws: ReelDraw[],
  reels: number,
  rows: number,
): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < reels; r++) {
    const col: string[] = [];
    const table = draws[r] ?? draws[draws.length - 1];
    for (let y = 0; y < rows; y++) col.push(drawSymbol(rng, table));
    grid.push(col);
  }
  return grid;
}

function evalBase(
  ir: SlotGameIR,
  grid: string[][],
  reels: number,
  rows: number,
): SpinResult {
  const paylines = ir.evaluation.kind === 'lines' ? ir.evaluation.paylines : [];
  const minMatch = ir.evaluation.kind === 'lines' ? ir.evaluation.min_match : 3;
  const wildSubEnabled = (ir as { evaluation: { wild_substitution?: { enabled?: boolean } } })
    .evaluation.wild_substitution?.enabled ?? true;

  let lineWin = 0;
  for (const line of paylines) {
    // First non-wild target
    let target = grid[0][line[0] ?? 0];
    if (wildSubEnabled && isWild(ir, target)) {
      for (let c = 1; c < reels; c++) {
        const s = grid[c][line[c] ?? 0];
        if (!isWild(ir, s)) { target = s; break; }
      }
    }
    let runLen = 0;
    for (let c = 0; c < reels; c++) {
      const s = grid[c][line[c] ?? 0];
      if (s === target || (wildSubEnabled && isWild(ir, s))) runLen++;
      else break;
    }
    if (runLen >= minMatch) {
      const pays = ir.paytable[target] || {};
      lineWin += Number((pays as Record<string, number>)[String(runLen)] ?? 0);
    }
  }

  // Scatter pay (any-position count)
  const scId = findScatterId(ir);
  let scatterCount = 0, scatterPay = 0;
  if (scId) {
    for (let r = 0; r < reels; r++)
      for (let y = 0; y < rows; y++)
        if (grid[r][y] === scId) scatterCount++;
    if (scatterCount >= 3) {
      const sp = ir.paytable[scId] || {};
      scatterPay = Number((sp as Record<string, number>)[String(Math.min(scatterCount, 5))] ?? 0);
    }
  }

  // Bonus count (anywhere — used by hold-and-win trigger)
  const bnId = findBonusId(ir);
  let bonusCount = 0;
  if (bnId) {
    for (let r = 0; r < reels; r++)
      for (let y = 0; y < rows; y++)
        if (grid[r][y] === bnId) bonusCount++;
  }

  return { grid, baseWin: lineWin + scatterPay, scatterCount, bonusCount, lineWin, scatterPay };
}

// ─── Feature sims ───────────────────────────────────────────────────────────

function awardFsSpins(feat: AnyFeature, scCount: number): number {
  const thresholds = feat.trigger?.thresholds || {};
  const exact = thresholds[String(scCount)];
  if (typeof exact === 'number') return exact;
  // Fallback: pick the highest threshold ≤ scatter count
  let best = 0;
  for (const [k, v] of Object.entries(thresholds)) {
    const n = parseInt(k, 10);
    if (n <= scCount && v > best) best = v;
  }
  return best;
}

function awardRetriggerSpins(feat: AnyFeature, scCount: number): number {
  const rt = feat.retrigger;
  if (!rt || !rt.enabled) return 0;
  const thresholds = rt.thresholds || feat.trigger?.thresholds || {};
  let best = 0;
  for (const [k, v] of Object.entries(thresholds)) {
    const n = parseInt(k, 10);
    if (n <= scCount && v > best) best = v;
  }
  return best;
}

function simFreeSpins(
  ir: SlotGameIR,
  feat: AnyFeature,
  rng: () => number,
  draws: ReelDraw[],
  fsDraws: ReelDraw[] | null,
  reels: number,
  rows: number,
  initialScatterCount: number,
): number {
  let spinsRemaining = awardFsSpins(feat, initialScatterCount);
  if (spinsRemaining <= 0) return 0;
  let total = 0;
  let mult = feat.progressive_multiplier?.start ?? 1;
  const incr = feat.progressive_multiplier?.increment ?? 0;
  const maxMult = feat.progressive_multiplier?.max ?? Number.POSITIVE_INFINITY;
  const incrementsOn = feat.progressive_multiplier?.increments_on ?? 'each_winning_fs_spin';
  const fsCap = feat.retrigger?.max_total ?? Infinity;
  const useFsDraws = fsDraws && feat.reels_override === 'free_spins';
  const drawsUsed = useFsDraws ? fsDraws : draws;

  let totalAwarded = spinsRemaining;
  while (spinsRemaining > 0) {
    spinsRemaining--;
    const grid = drawGrid(rng, drawsUsed, reels, rows);
    const r = evalBase(ir, grid, reels, rows);
    let win = r.baseWin;
    if (win > 0) {
      win *= mult;
      if (incrementsOn === 'each_winning_fs_spin' && mult < maxMult) {
        mult = Math.min(maxMult, mult + incr);
      }
    }
    if (incrementsOn === 'each_fs_spin' && mult < maxMult) {
      mult = Math.min(maxMult, mult + incr);
    }
    total += win;
    // Retrigger
    if (r.scatterCount >= 3 && totalAwarded < fsCap) {
      const add = awardRetriggerSpins(feat, r.scatterCount);
      spinsRemaining += add;
      totalAwarded += add;
    }
  }
  return total;
}

function simHoldAndWin(
  feat: AnyFeature,
  rng: () => number,
  reels: number,
  rows: number,
  initialOrbCount: number,
): number {
  const respinsInitial = feat.respins_initial ?? 3;
  const orbLandBase = feat.orb_land_chance_base ?? 0.04;
  const orbLandFillBonus = feat.orb_land_chance_fill_bonus ?? 0.0;
  const fullGridBonus = feat.full_grid_bonus_x ?? 0;
  const cashDist = feat.cash_value_distribution || [{ value: 1, weight: 1 }];
  const jackpots = feat.jackpot_tiers || [];

  const totalCells = reels * rows;
  // Seed with the initial bonus orbs (each takes a cell)
  let filled = Math.min(initialOrbCount, totalCells);
  // Score them — initial orbs get a cash value each
  let totalCashValue = 0;
  for (let i = 0; i < filled; i++) totalCashValue += pickWeighted(rng, cashDist);

  let respins = respinsInitial;
  let totalJackpotMult = 0;

  while (respins > 0 && filled < totalCells) {
    let landed = 0;
    const free = totalCells - filled;
    // Each unfilled cell rolls for a new orb landing
    for (let c = 0; c < free; c++) {
      const filledFrac = filled / totalCells;
      const p = orbLandBase + orbLandFillBonus * filledFrac;
      if (rng() < p) {
        // Orb landed — assign cash value OR jackpot tier (typical ratio:
        // jackpots are rare among the cash distribution; here we sample
        // cash dist and roll for jackpot tier separately at a low rate).
        const isJackpot = jackpots.length > 0 && rng() < 0.02;
        if (isJackpot) {
          totalJackpotMult += pickWeightedJackpot(rng, jackpots);
        } else {
          totalCashValue += pickWeighted(rng, cashDist);
        }
        landed++;
      }
    }
    filled += landed;
    if (landed > 0 && feat.respin_reset_on_new) {
      respins = respinsInitial;
    } else {
      respins--;
    }
  }
  // Full-grid bonus
  let payout = totalCashValue + totalJackpotMult;
  if (filled >= totalCells && fullGridBonus > 0) payout += fullGridBonus;
  return payout;
}

function simLightning(feat: AnyFeature, rng: () => number): number {
  const prob = feat.trigger?.probability ?? 0;
  if (rng() >= prob) return 0;
  const dist = feat.distribution || [];
  if (dist.length === 0) return 1;
  return pickWeighted(rng, dist);
}

// ─── Main runner ────────────────────────────────────────────────────────────

export interface AutoMcRunnerCallbacks {
  onProgress?: (
    spinsDone: number,
    totalSpins: number,
    runningRtp: number,
    elapsedMs: number,
  ) => void;
  shouldCancel?: () => boolean;
}

export async function runAutoMc(
  req: AutoMcRunRequest,
  cb: AutoMcRunnerCallbacks = {},
): Promise<AutoMcResultMessage> {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ir = req.ir as SlotGameIR;
  const rng = makeRng(req.seed);
  const reels = ir.topology.kind === 'rectangular' ? ir.topology.reels : 5;
  const rows  = ir.topology.kind === 'rectangular' ? ir.topology.rows  : 3;
  const baseDraws = buildReelDraws(ir.reels.base as Array<Record<string, number>>);
  const fsDraws = (ir.reels as { free_spins?: Array<Record<string, number>> }).free_spins
    ? buildReelDraws((ir.reels as { free_spins: Array<Record<string, number>> }).free_spins)
    : null;

  const fsFeat = findFeature(ir, 'free_spins');
  const hnwFeat = findFeature(ir, 'hold_and_win');
  const mulFeat = findFeature(ir, 'multiplier'); // Lightning-style

  const winCap = (ir.limits as { max_win_x?: number }).max_win_x ?? Number.POSITIVE_INFINITY;

  const wins = new Welford();
  const reservoir = new Reservoir(req.reservoirSize);
  let maxWin = 0;
  let cancelled = false;
  let timedOut = false;
  const deadline = req.timeoutMs > 0 ? t0 + req.timeoutMs : Infinity;

  // RTP-attribution buckets
  let baseWonAccum = 0;
  let scatterWonAccum = 0;
  let fsWonAccum = 0;
  let hnwWonAccum = 0;
  let lightningUpliftAccum = 0;

  // Feature trigger counters
  let fsTriggers = 0, hnwTriggers = 0, lightningTriggers = 0;

  // Cancellation / progress poll interval — also where we yield to the
  // event loop so the main thread (when no Worker is available) stays
  // responsive and the cancel button can fire.
  const progressEvery = Math.max(1000, Math.floor(req.spins / 100));
  let hits = 0;
  let i = 0;
  for (i = 0; i < req.spins; i++) {
    // Cancellation / timeout (cheap — checked once per spin)
    if (cb.shouldCancel && cb.shouldCancel()) { cancelled = true; break; }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now >= deadline) { timedOut = true; break; }

    const grid = drawGrid(rng, baseDraws, reels, rows);
    const r = evalBase(ir, grid, reels, rows);
    let spinWin = r.baseWin;
    baseWonAccum += r.lineWin;
    scatterWonAccum += r.scatterPay;

    // Lightning multiplier on winning base spins
    if (mulFeat && mulFeat.scope === 'base_game_only' && spinWin > 0) {
      const m = simLightning(mulFeat, rng);
      if (m > 0) {
        const uplift = spinWin * (m - 1);
        spinWin += uplift;
        lightningUpliftAccum += uplift;
        lightningTriggers++;
      }
    }

    // Free Spins trigger (scatter-based)
    if (fsFeat && r.scatterCount >= 3) {
      fsTriggers++;
      const fsWin = simFreeSpins(ir, fsFeat, rng, baseDraws, fsDraws, reels, rows, r.scatterCount);
      spinWin += fsWin;
      fsWonAccum += fsWin;
    }

    // Hold & Win trigger (bonus-based)
    const hnwMin = hnwFeat?.trigger?.min ?? 6;
    if (hnwFeat && r.bonusCount >= hnwMin) {
      hnwTriggers++;
      const hnwWin = simHoldAndWin(hnwFeat, rng, reels, rows, r.bonusCount);
      spinWin += hnwWin;
      hnwWonAccum += hnwWin;
    }

    if (spinWin > winCap) spinWin = winCap;
    if (spinWin > maxWin) maxWin = spinWin;
    if (spinWin > 0) hits++;

    wins.push(spinWin);
    reservoir.push(spinWin);

    if (i % progressEvery === 0 || i === req.spins - 1) {
      if (cb.onProgress) {
        const rtpSoFar = wins.mean;
        const elapsed = now - t0;
        try { cb.onProgress(i + 1, req.spins, rtpSoFar, elapsed); } catch (_) {}
      }
      // Yield to event loop so cancel events / progress messages flush.
      // Skipped on the final iteration to keep wall-clock tight.
      if (i < req.spins - 1) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  }

  const actualSpins = wins.n;
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const durationMs = t1 - t0;
  const status: AutoMcResultMessage['status'] =
    cancelled ? 'cancelled'
    : timedOut ? 'timeout'
    : actualSpins < req.spins ? 'partial'
    : 'complete';

  const rtpPct = wins.mean * 100;
  const hitPct = actualSpins > 0 ? (hits / actualSpins) * 100 : 0;

  const sigma = wins.std();
  const stdErr = sigma / Math.sqrt(Math.max(1, actualSpins));
  const ci95 = 1.96 * stdErr;
  const totalBet = actualSpins; // 1 unit per spin

  const validatedMetrics: AutoMcResultMessage['validatedMetrics'] = {
    source: `auto-MC · ${actualSpins.toLocaleString()} spins · ${status}`,
    total_spins: actualSpins,
    rtp: +rtpPct.toFixed(4),
    hit_rate: +hitPct.toFixed(4),
    volatility_index: +sigma.toFixed(4),
    fs_frequency:      fsTriggers       > 0 ? +(actualSpins / fsTriggers).toFixed(2)        : null,
    hnw_frequency:     hnwTriggers      > 0 ? +(actualSpins / hnwTriggers).toFixed(2)       : null,
    cascade_frequency: null,
    pick_frequency:    null,
    wheel_frequency:   null,
    respin_frequency:  null,
    max_win_observed_x: +maxWin.toFixed(4),
    win_percentiles: {
      p50:    +reservoir.quantile(50).toFixed(4),
      p75:    +reservoir.quantile(75).toFixed(4),
      p90:    +reservoir.quantile(90).toFixed(4),
      p95:    +reservoir.quantile(95).toFixed(4),
      p99:    +reservoir.quantile(99).toFixed(4),
      p99_9:  +reservoir.quantile(99.9).toFixed(4),
      p99_99: +reservoir.quantile(99.99).toFixed(4),
    },
    rtp_breakdown: {
      base_line_wins:     totalBet > 0 ? +(baseWonAccum / totalBet * 100).toFixed(4) : 0,
      scatter_pays:       totalBet > 0 ? +(scatterWonAccum / totalBet * 100).toFixed(4) : 0,
      lightning_uplift:   totalBet > 0 ? +(lightningUpliftAccum / totalBet * 100).toFixed(4) : 0,
      free_spins:         totalBet > 0 ? +(fsWonAccum / totalBet * 100).toFixed(4) : 0,
      hold_and_win:       totalBet > 0 ? +(hnwWonAccum / totalBet * 100).toFixed(4) : 0,
    },
    confidence: {
      mean_rtp:   +rtpPct.toFixed(4),
      std_dev:    +sigma.toFixed(4),
      std_error:  +stdErr.toFixed(6),
      ci_95_low:  +(rtpPct - ci95 * 100).toFixed(4),
      ci_95_high: +(rtpPct + ci95 * 100).toFixed(4),
    },
  };

  return {
    kind: 'result',
    runId: req.runId,
    status,
    validatedMetrics,
    durationMs: +durationMs.toFixed(1),
    spinsPerSec: durationMs > 0 ? +(actualSpins / (durationMs / 1000)).toFixed(0) : 0,
  };
}
