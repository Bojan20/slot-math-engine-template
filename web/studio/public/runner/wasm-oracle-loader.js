/*
 * ════════════════════════════════════════════════════════════════════════════
 *   WASM ORACLE LOADER  —  Math Twin Lockstep, Witness #3 bootstrap
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Bridges the wasm-pack-generated ES module
 * (`/runner/wasm-oracle/mtl_wasm_oracle.js`) into a plain global
 * `window.MTLWasmOracle` API that mirrors the shape of `MTLOracle`
 * (the JS oracle) so the Sealing Ceremony can treat all three witnesses
 * uniformly.
 *
 * Public API (after `await window.MTLWasmOracle.ready`):
 *   MTLWasmOracle.spin(ir, seed, bet) → {
 *     win, scCount, bonusCount, lightning, fsWin, hnwWin, outcomeHash
 *   }
 *   MTLWasmOracle.hashOutcome(reduced) → Promise<sha256 hex>
 *   MTLWasmOracle.version() → string
 *   MTLWasmOracle.rngHead(seed, n) → Float64Array
 *   MTLWasmOracle.ready → Promise (resolves when WASM is loaded)
 *
 * Loading strategy
 * ────────────────
 * The wasm-pack output is an ES module that uses `import.meta.url` for the
 * `.wasm` location.  We dynamic-import() it from this UMD-style script so
 * the rest of the runner (which is a classic <script>) can use it without
 * having to convert.  `await import(url)` works in all modern browsers.
 *
 * IMPORTANT: this file is loaded by Studio's index.html as a CLASSIC script
 * (not type=module) because the runner blob inlines its modules as text and
 * runs them in a single sync context.  The dynamic import is the only async
 * surface; everything else stays synchronous-friendly.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  let modulePromise = null;
  let mod = null;
  let loadError = null;

  function getModulePath() {
    // The wasm-pack output lives at /runner/wasm-oracle/mtl_wasm_oracle.js.
    // Absolute path so it resolves identically regardless of which document
    // loaded the loader script (Studio at /, runner blob at blob:…).  Inside
    // the Play Template blob:// runner this path 404s and we degrade
    // gracefully; sealing-ceremony.js doesn't run there anyway.
    return '/runner/wasm-oracle/mtl_wasm_oracle.js';
  }

  async function load() {
    if (modulePromise) return modulePromise;
    modulePromise = (async () => {
      try {
        const url = getModulePath();
        // Dynamic ESM import — `init` (default export) initializes the
        // wasm runtime, attaching exports to the module namespace.
        const m = await import(/* @vite-ignore */ url);
        await m.default();
        mod = m;
        return m;
      } catch (err) {
        loadError = err;
        console.warn('[MTLWasmOracle] WASM load failed:', err && err.message ? err.message : err);
        throw err;
      }
    })();
    return modulePromise;
  }

  // SHA-256 over the canonical JSON of a reduced outcome — same algorithm
  // oracle.js uses so all three witnesses hash to the same value when they
  // agree on the math.
  function canonicalize(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalize);
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
    return out;
  }
  function canonicalJSON(value) { return JSON.stringify(canonicalize(value)); }
  async function sha256Hex(str) {
    if (root.crypto && root.crypto.subtle) {
      const buf = new TextEncoder().encode(str);
      const h = await root.crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(h);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    }
    // FNV fallback for very old browsers (Sealing won't fire here in practice)
    let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x9e3779b1) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function spin(ir, seed, bet) {
    if (!mod) await load();
    if (!mod) throw new Error('WASM oracle not available');
    const irJson = typeof ir === 'string' ? ir : JSON.stringify(ir);
    // The WASM entry expects u32 seed and f64 bet.  Coerce so big seeds
    // (>2^31) and small bets (<1) round-trip cleanly.
    // W218: pass seed=0 unchanged.  Rust impl handles seed=0 fallback
    // (z = 0x9E3779B9) to match JS oracle.js xoshiro128** init.  The old
    // `|| 1` mulberry32 fallback would route seed=0 into seed=1 stream.
    const seedU32 = (seed >>> 0);
    const betF = bet == null ? 1 : Number(bet);
    const out = mod.spinWasm(irJson, seedU32, betF);
    // serde-wasm-bindgen returns the Outcome with camelCase fields directly.
    const reduced = {
      win: Number(out.win),
      scCount: Number(out.scCount),
      bonusCount: Number(out.bonusCount),
      lightning: Number(out.lightning),
      fsWin: Number(out.fsWin),
      hnwWin: Number(out.hnwWin),
    };
    const outcomeHash = await sha256Hex(canonicalJSON(reduced));
    return Object.assign({}, reduced, { outcomeHash });
  }

  async function hashOutcome(reduced) {
    return sha256Hex(canonicalJSON(reduced));
  }

  function version() { return mod && mod.oracleVersion ? mod.oracleVersion() : 'unloaded'; }
  async function rngHead(seed, n) {
    if (!mod) await load();
    // W218: pass seed=0 unchanged — Rust handles seed=0 fallback identically to JS.
    return mod.rngHead((seed >>> 0), n);
  }

  // Kick off load eagerly so the Sealing Ceremony doesn't wait on the
  // first .spin() call — but tolerate failure (the JS oracle stays the
  // primary witness and ceremony still validates oracle ↔ runtime even
  // when WASM is unavailable).
  const ready = load().catch(() => null);

  root.MTLWasmOracle = {
    ready: ready,
    spin: spin,
    hashOutcome: hashOutcome,
    version: version,
    rngHead: rngHead,
    canonicalJSON: canonicalJSON,
    sha256Hex: sha256Hex,
    get loadError() { return loadError; },
    get isReady() { return !!mod; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
