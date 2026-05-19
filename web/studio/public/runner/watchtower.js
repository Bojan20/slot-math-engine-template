/*
 * ════════════════════════════════════════════════════════════════════════════
 *   WATCHTOWER  —  Math Twin Lockstep, Phase B
 *   Statistical sentinel that compares live runner output against
 *   ir.validated_metrics in real time.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pure module — no DOM, no async, no I/O.  Designed to run inside a Web Worker
 * so the live spin loop is never blocked.  Receives spin outcomes one by one,
 * accumulates rolling-window statistics, and emits a status report after each
 * window completes (default every 100 spins).
 *
 * Thresholds are derived analytically from `ir.validated_metrics`:
 *
 *   • RTP                 ±0.5pp absolute (warn) / ±2.0pp (critical)
 *   • Hit rate            ±0.5pp absolute (warn) / ±2.0pp (critical)
 *   • FS hit frequency    Poisson 3σ on expected count (warn) / 5σ (critical)
 *   • H&W hit frequency   Poisson 3σ on expected count (warn) / 5σ (critical)
 *   • Lightning rate      ±1.0pp absolute (warn) / ±3.0pp (critical)
 *   • Max-win frequency   informational — track frequency, no auto-halt
 *
 * Warm-up: thresholds are NOT evaluated until N_WARMUP spins (default 500)
 * are observed.  Below that, statistical noise dominates and false alarms
 * are noise, not signal.
 *
 * Public API (used by watchtower-worker.js):
 *   const wt = MTLWatchtower.create({ validated_metrics, options });
 *   wt.observeSpin({ win, bet, scCount, bonusCount, lightning, fsWin, hnwWin });
 *   wt.report() → { status, metrics, breaches, spinsObserved }
 *
 * Status colors:
 *   "green"    everything inside warn band
 *   "warn"     one metric breached warn band; emit log but don't halt
 *   "critical" one metric breached critical band; runtime should freeze
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    windowSize: 10000,
    reportEvery: 100,
    warmupSpins: 500,
    rtp: { warn: 0.5, critical: 2.0 },           // absolute pp
    hit: { warn: 0.5, critical: 2.0 },           // absolute pp
    lightning: { warn: 1.0, critical: 3.0 },     // absolute pp
    fsHit: { warnSigma: 3, criticalSigma: 5 },   // Poisson
    hnwHit: { warnSigma: 3, criticalSigma: 5 },  // Poisson
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  Rolling buffer — fixed-size ring; O(1) insert, O(1) sum maintenance
  // ──────────────────────────────────────────────────────────────────────────

  function createRing(size) {
    return {
      size: size,
      buf: new Float64Array(size),
      flagsBuf: new Uint8Array(size), // bit0=hit, bit1=FS, bit2=H&W, bit3=Lightning
      writeIdx: 0,
      count: 0,
      sumWin: 0,
      sumBet: 0,
      hits: 0,
      fsTriggers: 0,
      hnwTriggers: 0,
      lightningTriggers: 0,
      maxWin: 0,
      sumBetBuf: new Float64Array(size),
      push: function (win, bet, hit, fs, hnw, light) {
        const i = this.writeIdx;
        if (this.count >= this.size) {
          // evict oldest
          this.sumWin -= this.buf[i];
          this.sumBet -= this.sumBetBuf[i];
          const f = this.flagsBuf[i];
          if (f & 1) this.hits--;
          if (f & 2) this.fsTriggers--;
          if (f & 4) this.hnwTriggers--;
          if (f & 8) this.lightningTriggers--;
        } else {
          this.count++;
        }
        this.buf[i] = win;
        this.sumBetBuf[i] = bet;
        let f = 0;
        if (hit) f |= 1;
        if (fs) f |= 2;
        if (hnw) f |= 4;
        if (light) f |= 8;
        this.flagsBuf[i] = f;
        this.sumWin += win;
        this.sumBet += bet;
        if (hit) this.hits++;
        if (fs) this.fsTriggers++;
        if (hnw) this.hnwTriggers++;
        if (light) this.lightningTriggers++;
        if (win > this.maxWin) this.maxWin = win;
        this.writeIdx = (i + 1) % this.size;
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Threshold evaluators
  // ──────────────────────────────────────────────────────────────────────────

  // RTP / Hit / Lightning: absolute pp distance against a target percentage.
  function evalAbsolutePct(observed, target, warnPp, criticalPp) {
    const d = Math.abs(observed - target);
    if (d > criticalPp) return 'critical';
    if (d > warnPp) return 'warn';
    return 'green';
  }

  // Poisson-style frequency: target = 1-in-N, expected events = spins / N.
  // Compare observed event count against expected ± kσ where σ = sqrt(λ).
  function evalPoissonHit(eventCount, spins, targetOneIn, warnSigma, criticalSigma) {
    if (!targetOneIn || targetOneIn <= 0) return 'green';
    const lambda = spins / targetOneIn;
    if (lambda < 4) return 'green'; // too few expected events — skip
    const sigma = Math.sqrt(lambda);
    const z = Math.abs(eventCount - lambda) / sigma;
    if (z > criticalSigma) return 'critical';
    if (z > warnSigma) return 'warn';
    return 'green';
  }

  function worstStatus(s1, s2) {
    const ord = { green: 0, warn: 1, critical: 2 };
    return ord[s1] >= ord[s2] ? s1 : s2;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public factory
  // ──────────────────────────────────────────────────────────────────────────

  function create(opts) {
    const cfg = {};
    for (const k of Object.keys(DEFAULTS)) cfg[k] = DEFAULTS[k];
    if (opts && opts.options) {
      for (const k of Object.keys(opts.options)) cfg[k] = opts.options[k];
    }
    const vm = (opts && opts.validated_metrics) || null;
    const ring = createRing(cfg.windowSize);

    const targets = vm
      ? {
          rtp: Number(vm.rtp),                                 // already % (e.g. 96.02)
          hit: Number(vm.hit_rate),                            // already % (e.g. 20.69)
          fsOneIn: Number(vm.fs_frequency) || null,            // 1-in-N
          hnwOneIn: Number(vm.hnw_frequency) || null,
          lightning: Number(vm.lightning_rate || vm.multiplier_hit_pct) || null, // %
        }
      : null;

    let spinsObserved = 0;
    let lastReportAt = 0;

    function observeSpin(s) {
      if (!s) return;
      const win = Number(s.win) || 0;
      const bet = Number(s.bet) || 0;
      const hit = win > 0 ? 1 : 0;
      const fs = (s.fsWin && s.fsWin > 0) || (s.scCount >= 3) ? 1 : 0;
      const hnw = (s.hnwWin && s.hnwWin > 0) || (s.bonusCount >= 6) ? 1 : 0;
      const light = (s.lightning && s.lightning > 1) ? 1 : 0;
      ring.push(win, bet, hit, fs, hnw, light);
      spinsObserved++;
    }

    function metrics() {
      const totBet = ring.sumBet || 0;
      const totWin = ring.sumWin || 0;
      const n = ring.count;
      const rtp = totBet > 0 ? (totWin / totBet) * 100 : 0;
      const hitPct = n > 0 ? (ring.hits / n) * 100 : 0;
      const fsOneIn = ring.fsTriggers > 0 ? n / ring.fsTriggers : null;
      const hnwOneIn = ring.hnwTriggers > 0 ? n / ring.hnwTriggers : null;
      const lightPct = n > 0 ? (ring.lightningTriggers / n) * 100 : 0;
      return {
        n: n,
        rtp: rtp,
        hitPct: hitPct,
        fsTriggers: ring.fsTriggers,
        hnwTriggers: ring.hnwTriggers,
        fsOneIn: fsOneIn,
        hnwOneIn: hnwOneIn,
        lightPct: lightPct,
        lightningTriggers: ring.lightningTriggers,
        maxWin: ring.maxWin,
        totalWagered: totBet,
        totalWon: totWin,
      };
    }

    function evaluate() {
      const m = metrics();
      if (m.n < cfg.warmupSpins) {
        return { status: 'warmup', breaches: [], metrics: m };
      }
      if (!targets) {
        // No validated_metrics on IR — we can still measure but can't grade
        return { status: 'green', breaches: [], metrics: m, note: 'no validated_metrics on IR' };
      }
      const breaches = [];
      let status = 'green';

      // RTP
      const rtpStatus = evalAbsolutePct(m.rtp, targets.rtp, cfg.rtp.warn, cfg.rtp.critical);
      if (rtpStatus !== 'green') {
        breaches.push({ metric: 'rtp', observed: m.rtp, target: targets.rtp, deltaPp: m.rtp - targets.rtp, status: rtpStatus });
        status = worstStatus(status, rtpStatus);
      }

      // Hit rate
      const hitStatus = evalAbsolutePct(m.hitPct, targets.hit, cfg.hit.warn, cfg.hit.critical);
      if (hitStatus !== 'green') {
        breaches.push({ metric: 'hit', observed: m.hitPct, target: targets.hit, deltaPp: m.hitPct - targets.hit, status: hitStatus });
        status = worstStatus(status, hitStatus);
      }

      // FS trigger (Poisson)
      if (targets.fsOneIn) {
        const fsStatus = evalPoissonHit(ring.fsTriggers, m.n, targets.fsOneIn, cfg.fsHit.warnSigma, cfg.fsHit.criticalSigma);
        if (fsStatus !== 'green') {
          breaches.push({ metric: 'fs', observed: m.fsOneIn, target: targets.fsOneIn, observedCount: ring.fsTriggers, expected: m.n / targets.fsOneIn, status: fsStatus });
          status = worstStatus(status, fsStatus);
        }
      }

      // H&W trigger (Poisson)
      if (targets.hnwOneIn) {
        const hnwStatus = evalPoissonHit(ring.hnwTriggers, m.n, targets.hnwOneIn, cfg.hnwHit.warnSigma, cfg.hnwHit.criticalSigma);
        if (hnwStatus !== 'green') {
          breaches.push({ metric: 'hnw', observed: m.hnwOneIn, target: targets.hnwOneIn, observedCount: ring.hnwTriggers, expected: m.n / targets.hnwOneIn, status: hnwStatus });
          status = worstStatus(status, hnwStatus);
        }
      }

      // Lightning rate (optional)
      if (targets.lightning != null && !Number.isNaN(targets.lightning)) {
        const lightStatus = evalAbsolutePct(m.lightPct, targets.lightning, cfg.lightning.warn, cfg.lightning.critical);
        if (lightStatus !== 'green') {
          breaches.push({ metric: 'lightning', observed: m.lightPct, target: targets.lightning, deltaPp: m.lightPct - targets.lightning, status: lightStatus });
          status = worstStatus(status, lightStatus);
        }
      }
      return { status: status, breaches: breaches, metrics: m };
    }

    function report() {
      const r = evaluate();
      r.spinsObserved = spinsObserved;
      r.windowSize = cfg.windowSize;
      return r;
    }

    function shouldReport() {
      if (spinsObserved - lastReportAt >= cfg.reportEvery) {
        lastReportAt = spinsObserved;
        return true;
      }
      return false;
    }

    return {
      observeSpin: observeSpin,
      metrics: metrics,
      evaluate: evaluate,
      report: report,
      shouldReport: shouldReport,
      _cfg: cfg,
      _ring: ring,
    };
  }

  // Lightweight pure helpers exposed for tests
  const _internals = {
    evalAbsolutePct: evalAbsolutePct,
    evalPoissonHit: evalPoissonHit,
    worstStatus: worstStatus,
    createRing: createRing,
  };

  const api = { create: create, DEFAULTS: DEFAULTS, _internals: _internals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MTLWatchtower = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
