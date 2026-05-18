// MC WebWorker — keeps the main thread snappy for 1M+ spins.
// Imports the shared MC runner from certify.ts via ES module.

import { runMcInline, type MCRunOptions, type MCResult } from './certify.js';

interface WorkerSelf {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(msg: unknown): void;
}
const w = self as unknown as WorkerSelf;

w.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { kind: string } & MCRunOptions;
  if (msg.kind !== 'run') return;
  const result: MCResult = runMcInline({
    ...msg,
    onProgress: (frac, mean) => {
      w.postMessage({ kind: 'progress', frac, mean });
    },
  });
  w.postMessage({ kind: 'done', result });
};
