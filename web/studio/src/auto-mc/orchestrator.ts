// Auto-MC orchestrator — runs in the main thread.  Spawns a WebWorker
// when available, falls back to inline runner when not (test runners,
// older browsers).  Caches results in IndexedDB by IR root hash so
// re-imports skip the simulation entirely.

import type { SlotGameIR } from '@engine/ir/types.js';
import { runAutoMc } from './runner.js';
import type {
  AutoMcRunRequest,
  AutoMcProgressMessage,
  AutoMcResultMessage,
  AutoMcResponse,
} from './types.js';

// ─── Cache (IndexedDB) ──────────────────────────────────────────────────────

const DB_NAME = 'studio-automc';
const DB_VERSION = 1;
const STORE = 'results';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

/** SHA-like deterministic hash from an IR's structural fields — used as
 *  cache key.  We canonicalise the IR into a stable JSON string then take
 *  a simple FNV-1a 32-bit hash (sufficient for cache de-duplication). */
async function hashIR(ir: SlotGameIR): Promise<string> {
  const canonical = JSON.stringify({
    schema_version: ir.schema_version,
    meta_id: ir.meta?.id,
    meta_version: ir.meta?.version,
    topology: ir.topology,
    symbols: ir.symbols,
    reels: ir.reels,
    evaluation: ir.evaluation,
    paytable: ir.paytable,
    features: ir.features,
    limits: ir.limits,
  });
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const enc = new TextEncoder().encode(canonical);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).slice(0, 16)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { /* fall through */ }
  }
  // Fallback FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface CacheEntry {
  irHash: string;
  spins: number;
  seed: number;
  validatedMetrics: AutoMcResultMessage['validatedMetrics'];
  durationMs: number;
  cachedAt: number;
}

async function cacheGet(irHash: string, spins: number, seed: number): Promise<CacheEntry | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(`${irHash}|${spins}|${seed}`);
      req.onsuccess = () => resolve((req.result as CacheEntry) || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function cachePut(entry: CacheEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry, `${entry.irHash}|${entry.spins}|${entry.seed}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

export async function cacheClear(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AutoMcOptions {
  spins?: number;
  seed?: number;
  reservoirSize?: number;
  timeoutMs?: number;
  /** Skip cache lookup + store. */
  noCache?: boolean;
  onProgress?: (p: AutoMcProgressMessage) => void;
  signal?: AbortSignal;
}

export interface AutoMcHandle {
  /** Promise resolves to the final result (or null if cancelled before any spin). */
  result: Promise<AutoMcResultMessage | null>;
  /** Imperative cancel — alternative to AbortSignal. */
  cancel(): void;
  /** Unique id assigned to this run (echoed in progress messages). */
  runId: string;
  /** Whether the result came from the IndexedDB cache (instant return). */
  fromCache: boolean;
}

let runCounter = 0;
function makeRunId(): string {
  runCounter++;
  return `auto-mc-${Date.now().toString(36)}-${runCounter.toString(36)}`;
}

/** Detect if we can spawn an ES-module Worker.  Disabled in jsdom / non-DOM
 *  environments and when the constructor throws (some sandboxes). */
function workersAvailable(): boolean {
  if (typeof Worker === 'undefined') return false;
  return true;
}

export function runAutoMcOrchestrated(
  ir: SlotGameIR,
  opts: AutoMcOptions = {},
): AutoMcHandle {
  const runId = makeRunId();
  const spins = Math.max(1, opts.spins ?? 1_000_000);
  const seed = opts.seed ?? (ir.rng?.default_seed ?? 12345);
  const reservoirSize = opts.reservoirSize ?? 10_000;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let cancelled = false;
  let workerRef: Worker | null = null;
  const cancel = (): void => {
    cancelled = true;
    if (workerRef) {
      try { workerRef.postMessage({ kind: 'cancel', runId }); } catch (_) {}
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) cancelled = true;
    else opts.signal.addEventListener('abort', cancel, { once: true });
  }

  const result: Promise<AutoMcResultMessage | null> = (async () => {
    // Cache lookup
    let irHash = '';
    if (!opts.noCache) {
      try {
        irHash = await hashIR(ir);
        const cached = await cacheGet(irHash, spins, seed);
        if (cached) {
          return {
            kind: 'result',
            runId,
            status: 'complete',
            validatedMetrics: {
              ...cached.validatedMetrics,
              source: cached.validatedMetrics.source + ' · cached',
            },
            durationMs: cached.durationMs,
            spinsPerSec: cached.durationMs > 0
              ? Math.round(cached.validatedMetrics.total_spins / (cached.durationMs / 1000))
              : 0,
          } as AutoMcResultMessage;
        }
      } catch (_) { /* cache miss / disabled */ }
    }

    if (cancelled) return null;

    const req: AutoMcRunRequest = {
      kind: 'run',
      ir,
      spins,
      seed,
      reservoirSize,
      timeoutMs,
      runId,
    };

    let res: AutoMcResultMessage;
    if (workersAvailable()) {
      try {
        res = await runInWorker(req, opts.onProgress, () => cancelled, (w) => { workerRef = w; });
      } catch (_) {
        // Worker spawn failed — fall back to inline
        res = await runAutoMc(req, {
          onProgress: (sd, ts, rtp, el) => {
            opts.onProgress?.({ kind: 'progress', runId, spinsDone: sd, totalSpins: ts, runningRtp: rtp, elapsedMs: el });
          },
          shouldCancel: () => cancelled,
        });
      }
    } else {
      res = await runAutoMc(req, {
        onProgress: (sd, ts, rtp, el) => {
          opts.onProgress?.({ kind: 'progress', runId, spinsDone: sd, totalSpins: ts, runningRtp: rtp, elapsedMs: el });
        },
        shouldCancel: () => cancelled,
      });
    }

    // Cache complete runs only
    if (!opts.noCache && res.status === 'complete') {
      try {
        await cachePut({
          irHash: irHash || (await hashIR(ir)),
          spins,
          seed,
          validatedMetrics: res.validatedMetrics,
          durationMs: res.durationMs,
          cachedAt: Date.now(),
        });
      } catch (_) {}
    }

    return res;
  })();

  return { result, cancel, runId, fromCache: false };
}

function runInWorker(
  req: AutoMcRunRequest,
  onProgress: ((p: AutoMcProgressMessage) => void) | undefined,
  isCancelled: () => boolean,
  setWorker: (w: Worker) => void,
): Promise<AutoMcResultMessage> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    setWorker(worker);
    const timeoutHandle = setTimeout(() => {
      try { worker.postMessage({ kind: 'cancel', runId: req.runId }); } catch (_) {}
    }, req.timeoutMs + 2000); // grace period over the runner's own timeout

    worker.onmessage = (ev: MessageEvent<AutoMcResponse>) => {
      const msg = ev.data;
      if (!msg || msg.runId !== req.runId) return;
      if (msg.kind === 'progress') {
        onProgress?.(msg);
      } else if (msg.kind === 'result') {
        clearTimeout(timeoutHandle);
        worker.terminate();
        resolve(msg);
      } else if (msg.kind === 'error') {
        clearTimeout(timeoutHandle);
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev) => {
      clearTimeout(timeoutHandle);
      worker.terminate();
      reject(new Error(`worker error: ${ev.message || 'unknown'}`));
    };

    if (isCancelled()) {
      try { worker.postMessage({ kind: 'cancel', runId: req.runId }); } catch (_) {}
    }
    worker.postMessage(req);
  });
}
