// Auto-MC WebWorker entry — receives a run request, drives the runner,
// and posts {progress / result / error} messages back to the orchestrator.
//
// Vite spawns this with `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
// The runner is shared so unit tests can call it directly without spawning
// a worker.

import { runAutoMc } from './runner.js';
import type {
  AutoMcRequest,
  AutoMcRunRequest,
  AutoMcResponse,
} from './types.js';

interface WorkerSelf {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(msg: unknown): void;
}
const w = self as unknown as WorkerSelf;

let activeRunId: string | null = null;
let cancelRequested = false;

function post(msg: AutoMcResponse): void {
  try { w.postMessage(msg); } catch (_) { /* worker closed */ }
}

w.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as AutoMcRequest;
  if (!msg || typeof msg !== 'object') return;

  if (msg.kind === 'cancel') {
    if (msg.runId === activeRunId) cancelRequested = true;
    return;
  }

  if (msg.kind === 'run') {
    void startRun(msg);
  }
};

async function startRun(req: AutoMcRunRequest): Promise<void> {
  activeRunId = req.runId;
  cancelRequested = false;
  try {
    const result = await runAutoMc(req, {
      onProgress: (spinsDone, totalSpins, runningRtp, elapsedMs) => {
        if (req.runId !== activeRunId) return; // stale
        post({
          kind: 'progress',
          runId: req.runId,
          spinsDone,
          totalSpins,
          runningRtp,
          elapsedMs,
        });
      },
      shouldCancel: () => cancelRequested,
    });
    if (req.runId !== activeRunId) return; // user moved on
    post(result);
  } catch (err) {
    post({
      kind: 'error',
      runId: req.runId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    if (req.runId === activeRunId) activeRunId = null;
  }
}
