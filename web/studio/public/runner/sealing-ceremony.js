/*
 * ════════════════════════════════════════════════════════════════════════════
 *   SEALING CEREMONY  —  Math Twin Lockstep, Phase A
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Given an IR, runs N deterministic seeds through both:
 *   • MTLOracle.spin(ir, seed, 1)  — Witness #1 (oracle.js, independent JS port)
 *   • runner.spinOnceInstant()      — Witness #2 (runtime.js, the live engine)
 *
 * Compares outcome hashes pair-wise.  If all match: a Seal is computed as
 * SHA-256 of the concatenated hash chain plus the IR's Merkle DNA root.  The
 * Seal is the IR's identity proof — change one symbol weight by 1 and the
 * Seal won't match.
 *
 * Until a valid Seal exists in `ir.meta.seal`, the Play Template button is
 * locked.  Once sealed, every live spin double-checks via Lockstep, and the
 * Seal can be re-verified at any time by re-running this ceremony.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IMPORTANT — runtime.js dependency
 * ──────────────────────────────────────────────────────────────────────────
 * For Witness #2 we need to invoke runtime.js's `spinOnceInstant()` in a
 * controlled fashion.  Sealing runs in Studio (NOT in the Play Template tab),
 * so we boot a hidden iframe pointing at the Play Template runner stub with
 * the IR injected, wait for `window.__SLOT__` to be exposed, then call
 * `spinOnceInstant()` N times.  This is the cleanest way to run runtime.js
 * with its full closure intact without duplicating its code here.
 *
 * Public API:
 *   await MTLSeal.sealIR(ir, {
 *     seedCount = 1000,   // 10k for production, 1k for fast import
 *     onProgress,         // (pct, seed) => void
 *   }) → {
 *     ok: boolean,
 *     seal?: string,            // SHA-256 hex when ok
 *     dna: string,              // Merkle DNA root
 *     firstMismatch?: {         // when ok=false
 *       seed: number,
 *       oracle: object,
 *       runner: object,
 *     },
 *     stats: { seedCount, durationMs, hashesPerSec }
 *   }
 *
 *   MTLSeal.isSealed(ir) → boolean
 *   MTLSeal.expectedSealForCurrentDNA(ir) → Promise<string|null>
 *
 * NOTE: For Phase A we run a simplified "oracle-only" ceremony when no
 * iframe runtime is available (e.g. headless Node, unit tests).  That mode
 * proves oracle.js is deterministic across reboot and produces a DNA-linked
 * seal — but cannot catch oracle-vs-runtime translation drift.  Always
 * prefer the dual-witness mode when running in the browser.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  const O = root.MTLOracle;
  const D = root.MTLDNA;
  if (!O || !D) {
    console.error('[MTLSeal] requires oracle.js + dna.js loaded first');
    return;
  }

  const SEAL_VERSION = '1';   // bump if ceremony algorithm changes
  const SEED_BASE = 0;        // ceremony uses seeds 0..N-1, deterministic & rerunnable

  // ──────────────────────────────────────────────────────────────────────────
  //  Hidden iframe runtime adapter
  // ──────────────────────────────────────────────────────────────────────────

  async function bootRuntimeIframe(ir, timeoutMs) {
    if (timeoutMs == null) timeoutMs = 20000;
    // Fetch the FULL template.html + runtime.js source so the runtime has
    // every DOM element it expects when bindUI() runs AND so that the script
    // is inlined into the blob (relative <script src=…> doesn't resolve from
    // blob:// URLs, so we can't fetch it from inside the iframe).
    let templateHtml = '';
    let runtimeSource = '';
    try {
      const [tpl, rt] = await Promise.all([
        fetch('/runner/template.html').then(function (r) { return r.text(); }),
        fetch('/runner/runtime.js').then(function (r) { return r.text(); }),
      ]);
      templateHtml = tpl;
      runtimeSource = rt;
    } catch (err) {
      throw new Error('cannot fetch runner source files: ' + err.message);
    }
    return new Promise(function (resolve, reject) {
      let iframe = null;
      let timer = null;
      function cleanup() {
        if (timer) clearTimeout(timer);
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      try {
        const irJson = JSON.stringify(ir).replace(/<\/script>/gi, '<\\/script>');
        // Splice the IR + runtime.js into the real template.  No MTL modules
        // in this iframe — sealing uses just the runtime's spinOnceInstant.
        const html = templateHtml
          .replace('/* RUNNER-CSS */', '')
          .replace(/(<script id="inline-ir"[^>]*>)\{\}(<\/script>)/, function (m, open, close) { return open + irJson + close; })
          .replace('/* MTL-ORACLE-JS */', '')
          .replace('/* MTL-DNA-JS */', '')
          .replace('/* MTL-DIFF-JS */', '')
          .replace('/* MTL-DASHBOARD-JS */', '')
          // Inline runtime.js — blob:// URLs can't resolve relative <script src=…>,
          // and the runtime needs to be guaranteed-loaded before our poll fires.
          // Use a replacer FUNCTION so `$` characters in runtime.js (jQuery-style
          // `$()` selectors) are not interpreted as String.replace backrefs.
          .replace('/* RUNNER-JS */', function () { return runtimeSource; });
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;visibility:hidden';
        iframe.src = url;
        iframe.onload = function () {
          // The runtime is loaded via injected <script> tag and is async —
          // poll for __SLOT__ readiness instead of using a fixed delay.
          let elapsed = 0;
          const step = 100;
          const poll = setInterval(function () {
            const w = iframe.contentWindow;
            if (w && w.__SLOT__ && typeof w.__SLOT__.spinOnceInstant === 'function') {
              clearInterval(poll);
              resolve({
                iframe: iframe,
                slot: w.__SLOT__,
                makeRng: function (seed) {
                  let a = (seed >>> 0) || 1;
                  return function () {
                    a = (a + 0x6D2B79F5) >>> 0;
                    let t = a;
                    t = Math.imul(t ^ (t >>> 15), t | 1);
                    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                  };
                },
                cleanup: cleanup,
              });
              return;
            }
            elapsed += step;
            if (elapsed >= timeoutMs - 200) {
              clearInterval(poll);
              cleanup();
              reject(new Error('runtime iframe ready but __SLOT__.spinOnceInstant not exposed within ' + timeoutMs + 'ms'));
            }
          }, step);
        };
        iframe.onerror = function () {
          cleanup();
          reject(new Error('iframe failed to load runtime.js'));
        };
        timer = setTimeout(function () {
          cleanup();
          reject(new Error('runtime iframe boot timeout (' + timeoutMs + 'ms)'));
        }, timeoutMs);
        document.body.appendChild(iframe);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  // Convert a runtime.js spinOnceInstant() result + grid snapshot into the
  // same shape oracle.spin() returns, so hashes are directly comparable.
  // Runtime exposes _debug.{drawGrid, evalBase, BASE_REELS, FS_REELS} so we
  // can re-derive the same inner data oracle hashes.
  async function runtimeSpinHash(runtimeBootResult, ir, seed) {
    const slot = runtimeBootResult.slot;
    const debug = slot._debug;
    if (!debug || !debug.drawGrid || !debug.evalBase) {
      throw new Error('runtime.js _debug surface missing — sealing requires Phase A runtime');
    }
    // Replace the runtime's RNG with our deterministic mulberry32@seed.
    slot.state.rng = runtimeBootResult.makeRng(seed);
    // Reset money state so cap math is comparable (bet=1, ample balance)
    slot.state.balance = 1e9;
    slot.state.totalWagered = 0;
    slot.state.totalWon = 0;
    slot.state.maxWin = 0;
    // Force bet level to 1x base (oracle assumes bet=1 too)
    slot.state.betLevelIdx = 0;
    // Now call spinOnceInstant — it advances RNG identically to a real spin
    const result = slot.spinOnceInstant();
    // Reconstructing the spin's grid AFTER the fact is impossible (runtime
    // didn't expose it); so we hash on the post-spin observable outcome.
    // For lockstep we therefore compare a REDUCED outcome: win, scCount,
    // bonusCount, lightning, fsWin, hnwWin.  This is enough to catch any
    // math drift while skipping render-only state.
    const reduced = {
      win: result.win,
      scCount: result.scCount,
      bonusCount: result.bonusCount,
      lightning: result.lightning,
      fsWin: result.fsWin,
      hnwWin: result.hnwWin,
    };
    return {
      result: reduced,
      hash: await O.hashOutcome(reduced),
    };
  }

  async function oracleSpinHash(ir, seed) {
    const r = await O.spin(ir, seed, 1);
    const reduced = {
      win: r.win,
      scCount: r.scCount,
      bonusCount: r.bonusCount,
      lightning: r.lightning,
      fsWin: r.fsWin,
      hnwWin: r.hnwWin,
    };
    return {
      result: reduced,
      hash: await O.hashOutcome(reduced),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Ceremony main
  // ──────────────────────────────────────────────────────────────────────────

  async function sealIR(ir, opts) {
    if (!opts) opts = {};
    const seedCount = opts.seedCount || 1000;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const useRuntime = opts.useRuntime !== false;   // default true; tests can disable

    const t0 = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    const dna = await D.compute(ir);

    let runtimeBoot = null;
    if (useRuntime && typeof document !== 'undefined') {
      try {
        runtimeBoot = await bootRuntimeIframe(ir);
      } catch (err) {
        console.warn('[MTLSeal] runtime iframe boot failed, falling back to oracle-only seal:', err.message);
        runtimeBoot = null;
      }
    }

    const hashChain = [];
    let firstMismatch = null;

    for (let i = 0; i < seedCount; i++) {
      const seed = SEED_BASE + i;
      // eslint-disable-next-line no-await-in-loop
      const oracleR = await oracleSpinHash(ir, seed);
      let runnerR = null;
      if (runtimeBoot) {
        // eslint-disable-next-line no-await-in-loop
        runnerR = await runtimeSpinHash(runtimeBoot, ir, seed);
        if (runnerR.hash !== oracleR.hash) {
          firstMismatch = {
            seed: seed,
            oracle: oracleR.result,
            runner: runnerR.result,
            oracleHash: oracleR.hash,
            runnerHash: runnerR.hash,
          };
          break;
        }
      }
      hashChain.push(oracleR.hash);
      if (onProgress && (i % 50 === 0 || i === seedCount - 1)) {
        onProgress((i + 1) / seedCount, seed);
      }
    }

    if (runtimeBoot) runtimeBoot.cleanup();

    const t1 = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    const durationMs = t1 - t0;
    const stats = {
      seedCount: seedCount,
      hashChainLen: hashChain.length,
      durationMs: Math.round(durationMs),
      hashesPerSec: Math.round((hashChain.length / Math.max(1, durationMs)) * 1000),
      witnesses: runtimeBoot ? 2 : 1,
    };

    if (firstMismatch) {
      return {
        ok: false,
        dna: dna.root,
        firstMismatch: firstMismatch,
        stats: stats,
      };
    }

    const concat = SEAL_VERSION + ':' + dna.root + ':' + hashChain.join('');
    const sealHash = await O.sha256Hex(concat);
    return {
      ok: true,
      seal: sealHash,
      dna: dna.root,
      stats: stats,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Seal storage helpers
  // ──────────────────────────────────────────────────────────────────────────

  function sealStorageKey(dnaRoot) {
    return 'mtl_seal:' + dnaRoot;
  }

  function storeSeal(ir, sealResult) {
    if (!sealResult || !sealResult.ok) return false;
    try {
      ir.meta = ir.meta || {};
      ir.meta.seal = {
        version: SEAL_VERSION,
        value: sealResult.seal,
        dna: sealResult.dna,
        sealed_at: new Date().toISOString(),
        seed_count: sealResult.stats.seedCount,
        witnesses: sealResult.stats.witnesses,
      };
      if (typeof root.localStorage !== 'undefined') {
        root.localStorage.setItem(sealStorageKey(sealResult.dna), JSON.stringify(ir.meta.seal));
      }
      return true;
    } catch (err) {
      console.warn('[MTLSeal] failed to store seal:', err.message);
      return false;
    }
  }

  async function isSealed(ir) {
    if (!ir || !ir.meta || !ir.meta.seal) return false;
    const seal = ir.meta.seal;
    if (seal.version !== SEAL_VERSION) return false;
    const dna = await D.compute(ir);
    return seal.dna === dna.root;
  }

  async function loadStoredSeal(ir) {
    if (typeof root.localStorage === 'undefined') return null;
    const dna = await D.compute(ir);
    try {
      const raw = root.localStorage.getItem(sealStorageKey(dna.root));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.version !== SEAL_VERSION) return null;
      if (parsed.dna !== dna.root) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  // Hydrate a freshly-imported IR with a stored seal if its DNA matches one
  // we've sealed before.  Avoids re-running the ceremony on every reload.
  async function hydrateSealFromStorage(ir) {
    if (await isSealed(ir)) return true;  // already on the IR
    const stored = await loadStoredSeal(ir);
    if (!stored) return false;
    ir.meta = ir.meta || {};
    ir.meta.seal = stored;
    return true;
  }

  root.MTLSeal = {
    sealIR: sealIR,
    storeSeal: storeSeal,
    isSealed: isSealed,
    loadStoredSeal: loadStoredSeal,
    hydrateSealFromStorage: hydrateSealFromStorage,
    SEAL_VERSION: SEAL_VERSION,
  };
})(typeof window !== 'undefined' ? window : globalThis);
