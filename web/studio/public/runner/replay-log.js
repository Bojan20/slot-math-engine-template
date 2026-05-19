/*
 * ════════════════════════════════════════════════════════════════════════════
 *   REPLAY LOG  —  Math Twin Lockstep, Phase B
 *   Deterministic spin journal backed by IndexedDB.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Every Lockstep-verified spin is journaled: seed, bet, win, outcome hash,
 * scCount, bonusCount, lightning, fsWin, hnwWin, timestamp.  Any spin can
 * later be replayed via oracle.spin(ir, seed, bet) — the output MUST match
 * the journaled hash; otherwise the IR has drifted.
 *
 * Capacity: rolls at 100,000 entries (oldest evicted).  Per-IR scoping via
 * an `irDna` index so multiple IRs can coexist.
 *
 * Public API:
 *   await MTLReplay.open()                                  → DB handle (idempotent)
 *   await MTLReplay.append({ irDna, seed, bet, win, ... })  → id
 *   await MTLReplay.list({ irDna, limit })                  → newest first
 *   await MTLReplay.count(irDna?)                           → number
 *   await MTLReplay.replay(ir, entry)                       → { match, expected, observed }
 *   await MTLReplay.clear(irDna?)                           → drop entries
 *   await MTLReplay.exportNDJSON(irDna?)                    → string
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  const DB_NAME = 'mtl-replay';
  const DB_VERSION = 1;
  const STORE = 'spins';
  const MAX_ENTRIES = 100000;

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (typeof root.indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available — replay log disabled'));
        return;
      }
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('byDna', 'irDna', { unique: false });
          store.createIndex('byTs', 'ts', { unique: false });
          store.createIndex('byDnaTs', ['irDna', 'ts'], { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IDB open failed')); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return open().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  function p(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  async function append(entry) {
    const e = Object.assign({}, entry || {});
    e.ts = e.ts || Date.now();
    const store = await tx('readwrite');
    const id = await p(store.add(e));
    // Capacity guard — best-effort, runs every Nth append to avoid hot-path cost
    if (Math.random() < 0.01) await _trimToCapacity();
    return id;
  }

  async function _trimToCapacity() {
    try {
      const store = await tx('readwrite');
      const total = await p(store.count());
      if (total <= MAX_ENTRIES) return;
      const toDrop = total - MAX_ENTRIES;
      const cursorReq = store.openCursor();
      let dropped = 0;
      return new Promise(function (resolve, reject) {
        cursorReq.onsuccess = function () {
          const c = cursorReq.result;
          if (!c || dropped >= toDrop) { resolve(dropped); return; }
          c.delete();
          dropped++;
          c.continue();
        };
        cursorReq.onerror = function () { reject(cursorReq.error); };
      });
    } catch (_) { /* IDB transient errors are non-fatal for trimming */ }
  }

  async function list(opts) {
    const limit = (opts && opts.limit) || 50;
    const irDna = opts && opts.irDna;
    const store = await tx('readonly');
    const out = [];
    return new Promise(function (resolve, reject) {
      let cursorReq;
      if (irDna) {
        cursorReq = store.index('byDnaTs').openCursor(
          IDBKeyRange.bound([irDna, 0], [irDna, Number.MAX_SAFE_INTEGER]),
          'prev',
        );
      } else {
        cursorReq = store.index('byTs').openCursor(null, 'prev');
      }
      cursorReq.onsuccess = function () {
        const c = cursorReq.result;
        if (!c || out.length >= limit) { resolve(out); return; }
        out.push(c.value);
        c.continue();
      };
      cursorReq.onerror = function () { reject(cursorReq.error); };
    });
  }

  async function count(irDna) {
    const store = await tx('readonly');
    if (irDna) return p(store.index('byDna').count(IDBKeyRange.only(irDna)));
    return p(store.count());
  }

  async function get(id) {
    const store = await tx('readonly');
    return p(store.get(id));
  }

  async function clear(irDna) {
    if (!irDna) {
      const store = await tx('readwrite');
      return p(store.clear());
    }
    // Delete only entries with matching DNA
    const store = await tx('readwrite');
    return new Promise(function (resolve, reject) {
      const idx = store.index('byDna');
      const req = idx.openCursor(IDBKeyRange.only(irDna));
      let removed = 0;
      req.onsuccess = function () {
        const c = req.result;
        if (!c) { resolve(removed); return; }
        c.delete();
        removed++;
        c.continue();
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  // Replay one journaled entry against the canonical oracle.  Returns
  // { match, expected, observed, oracle } — match=true if the oracle's
  // freshly-recomputed outcome hash equals the journaled outcomeHash.
  // If they differ, the IR or the oracle has been tampered with.
  async function replay(ir, entry) {
    if (!root.MTLOracle) throw new Error('MTLOracle required for replay');
    const o = await root.MTLOracle.spin(ir, entry.seed, entry.bet || 1);
    const reduced = { win: o.win, scCount: o.scCount, bonusCount: o.bonusCount, lightning: o.lightning, fsWin: o.fsWin, hnwWin: o.hnwWin };
    const observed = await root.MTLOracle.hashOutcome(reduced);
    return {
      match: observed === entry.outcomeHash,
      expected: entry.outcomeHash,
      observed: observed,
      oracle: reduced,
    };
  }

  async function exportNDJSON(irDna) {
    const entries = await list({ irDna: irDna, limit: 100000 });
    return entries.map(function (e) { return JSON.stringify(e); }).join('\n');
  }

  root.MTLReplay = {
    open: open,
    append: append,
    list: list,
    count: count,
    get: get,
    clear: clear,
    replay: replay,
    exportNDJSON: exportNDJSON,
    MAX_ENTRIES: MAX_ENTRIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
