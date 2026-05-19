/*
 * ════════════════════════════════════════════════════════════════════════════
 *   WATCHTOWER WORKER  —  thin Web Worker wrapper around watchtower.js
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The runtime posts each spin's outcome to this worker via postMessage; the
 * worker accumulates rolling statistics in a `MTLWatchtower` instance and
 * periodically posts a report back.  Running in a worker keeps the main
 * thread fully free for animations + click handling — even at 10k spins
 * per second the live UI never stalls.
 *
 * Inbound messages:
 *   { type: 'init', validated_metrics, options? }
 *   { type: 'spin', win, bet, scCount, bonusCount, lightning, fsWin, hnwWin }
 *   { type: 'report' }                         — request immediate report
 *   { type: 'reset' }                          — wipe ring buffer
 *
 * Outbound messages:
 *   { type: 'report', status, breaches, metrics, spinsObserved }
 *
 * The runtime listens for reports and surfaces them to the MTL Dashboard
 * (color pill + breach lines).  On status='critical' the runtime can freeze
 * the SPIN button.
 * ════════════════════════════════════════════════════════════════════════════
 */

importScripts('/runner/watchtower.js');

let wt = null;

self.addEventListener('message', function (e) {
  const msg = e.data || {};
  if (!msg.type) return;
  try {
    if (msg.type === 'init') {
      wt = self.MTLWatchtower.create({
        validated_metrics: msg.validated_metrics,
        options: msg.options || {},
      });
      self.postMessage({ type: 'ready' });
      return;
    }
    if (!wt) {
      self.postMessage({ type: 'error', error: 'worker not initialized — send {type:init} first' });
      return;
    }
    if (msg.type === 'spin') {
      wt.observeSpin(msg);
      if (wt.shouldReport()) {
        self.postMessage(Object.assign({ type: 'report' }, wt.report()));
      }
      return;
    }
    if (msg.type === 'report') {
      self.postMessage(Object.assign({ type: 'report' }, wt.report()));
      return;
    }
    if (msg.type === 'reset') {
      const oldVm = wt && wt._cfg ? null : null;
      wt = self.MTLWatchtower.create({ validated_metrics: msg.validated_metrics });
      self.postMessage({ type: 'reset-ok' });
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err && err.message ? err.message : err) });
  }
});
