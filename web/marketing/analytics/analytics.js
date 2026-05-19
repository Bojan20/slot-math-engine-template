/*
 * W215 Faza 800.2 Agent C — privacy-first marketing event tracker.
 *
 * Vanilla browser ESM module. No external deps, no cookies, no
 * localStorage persistence of personally identifying data. Session ID
 * is a SHA-1-style truncated digest of (page-load timestamp +
 * navigator.userAgent + screen geometry) computed via a tiny in-tree
 * hash. Each session only lives in memory for the lifetime of the tab.
 *
 * Honoured signals (all events suppressed when any is true):
 *   * navigator.doNotTrack === '1'
 *   * window.doNotTrack    === '1'
 *   * sessionStorage flag  smeAnalyticsOptOut === 'true'
 *
 * Auto-batches every 5 s OR every 10 events (whichever comes first)
 * and POSTs JSON {sessionId, events:[…]} to /api/marketing/event.
 * Beacon-falls-back via navigator.sendBeacon on page hide so the last
 * batch is never lost.
 *
 * Tracked event types (string discriminator on event.type):
 *   - pageview
 *   - scroll-depth-25  scroll-depth-50  scroll-depth-75  scroll-depth-100
 *   - cta-click          (props: {destination, label})
 *   - form-start         (props: {formId})
 *   - form-submit        (props: {formId, outcome})
 *   - video-play         (props: {videoId})
 *   - video-complete     (props: {videoId, durationMs})
 *
 * Public surface (window.smeAnalytics):
 *   track(type, props?)     enqueue a custom event
 *   flush()                 force-send the current batch
 *   sessionId()             returns the hashed session id
 *   isEnabled()             false when DNT or opt-out flag is set
 *
 * Designed to also be importable from tests via the named ESM exports.
 */

const ENDPOINT = '/api/marketing/event';
const BATCH_MAX = 10;
const FLUSH_INTERVAL_MS = 5_000;

/** Tiny FNV-1a 32-bit + extension for a stable 128-bit hex digest. */
export function hashDigest(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  let h3 = 0xcafebabe;
  let h4 = 0xfeedface;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x01000193);
    h3 = Math.imul(h3 ^ ((c << 1) | (i & 7)), 0x01000193);
    h4 = Math.imul(h4 ^ ((c * 31 + i * 17) >>> 0), 0x01000193);
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

export function computeSessionId(env = {}) {
  const ts = env.loadTs ?? (typeof performance !== 'undefined' ? performance.timeOrigin : Date.now());
  const ua = env.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : 'node');
  const sg = env.screen ?? (typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0');
  return hashDigest(`${Math.floor(ts)}::${ua}::${sg}`);
}

export function isDntEnabled(env = {}) {
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const win = env.window ?? (typeof window !== 'undefined' ? window : null);
  const ss = env.sessionStorage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (nav && (nav.doNotTrack === '1' || nav.doNotTrack === 'yes')) return true;
  if (win && win.doNotTrack === '1') return true;
  if (ss) {
    try {
      if (ss.getItem('smeAnalyticsOptOut') === 'true') return true;
    } catch { /* ignore */ }
  }
  return false;
}

/** Pure validation; does not throw. */
export function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return false;
  if (typeof evt.type !== 'string' || evt.type.length === 0) return false;
  if (evt.type.length > 64) return false;
  if (evt.props && typeof evt.props !== 'object') return false;
  return true;
}

export class AnalyticsClient {
  constructor(opts = {}) {
    this.endpoint = opts.endpoint ?? ENDPOINT;
    this.batchMax = opts.batchMax ?? BATCH_MAX;
    this.flushIntervalMs = opts.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.fetchFn = opts.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.now = opts.now ?? (() => Date.now());
    this.sessionId = opts.sessionId ?? computeSessionId(opts.env ?? {});
    this.enabled = !isDntEnabled(opts.env ?? {});
    this.queue = [];
    this.timer = null;
    this.scrollMarks = new Set();
    this.formsStarted = new Set();
  }

  isEnabled() { return this.enabled; }

  setEnabled(v) { this.enabled = !!v; }

  /** Enqueue a custom event. Returns true when accepted, false when dropped. */
  track(type, props) {
    if (!this.enabled) return false;
    const evt = { type, ts: this.now(), props: props ?? {} };
    if (!validateEvent(evt)) return false;
    this.queue.push(evt);
    if (this.queue.length >= this.batchMax) {
      this.flush();
    } else if (!this.timer && typeof setTimeout !== 'undefined') {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
    return true;
  }

  /** Drain the queue into a POST request. Returns the batch sent. */
  async flush() {
    if (this.timer && typeof clearTimeout !== 'undefined') {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return [];
    const batch = this.queue.splice(0, this.queue.length);
    const body = JSON.stringify({ sessionId: this.sessionId, events: batch });
    if (!this.fetchFn) return batch;
    try {
      await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      // Re-enqueue on transient failure (cap at 5 retries via length guard).
      if (this.queue.length < this.batchMax * 5) this.queue.push(...batch);
    }
    return batch;
  }

  /** Wire up DOM listeners. Safe to call once per page-load. */
  attach(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    if (!doc || !win || !this.enabled) return;
    this.track('pageview', { path: win.location.pathname, referrer: doc.referrer });
    const onScroll = () => {
      const sc = win.scrollY ?? doc.documentElement.scrollTop ?? 0;
      const hh = doc.documentElement.scrollHeight - win.innerHeight;
      if (hh <= 0) return;
      const pct = Math.floor((sc / hh) * 100);
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !this.scrollMarks.has(m)) {
          this.scrollMarks.add(m);
          this.track(`scroll-depth-${m}`);
        }
      }
    };
    win.addEventListener('scroll', onScroll, { passive: true });
    doc.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const a = t.closest('a[data-cta], a.btn-primary');
      if (a) {
        this.track('cta-click', {
          destination: a.getAttribute('href') ?? '',
          label: (a.textContent ?? '').trim().slice(0, 80),
        });
      }
    });
    doc.addEventListener('focusin', (e) => {
      const f = e.target?.closest?.('form[data-track]');
      if (f && !this.formsStarted.has(f.id)) {
        this.formsStarted.add(f.id);
        this.track('form-start', { formId: f.id || 'unknown' });
      }
    });
    doc.addEventListener('submit', (e) => {
      const f = e.target;
      if (f?.matches?.('form[data-track]')) {
        this.track('form-submit', { formId: f.id || 'unknown', outcome: 'attempted' });
      }
    });
    doc.querySelectorAll('video[data-track]').forEach((v) => {
      v.addEventListener('play', () => this.track('video-play', { videoId: v.id || 'v' }));
      v.addEventListener('ended', () => this.track('video-complete', {
        videoId: v.id || 'v',
        durationMs: Math.round((v.duration || 0) * 1000),
      }));
    });
    win.addEventListener('pagehide', () => {
      if (this.queue.length === 0) return;
      const batch = this.queue.splice(0, this.queue.length);
      const body = JSON.stringify({ sessionId: this.sessionId, events: batch });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        try { navigator.sendBeacon(this.endpoint, body); } catch { /* ignore */ }
      } else if (this.fetchFn) {
        this.fetchFn(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    });
  }
}

/** Singleton auto-installer for non-module <script> usage. */
export function install() {
  if (typeof window === 'undefined') return null;
  if (window.smeAnalytics) return window.smeAnalytics;
  const c = new AnalyticsClient();
  window.smeAnalytics = c;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => c.attach());
    } else {
      c.attach();
    }
  }
  return c;
}

if (typeof window !== 'undefined' && window.__SME_ANALYTICS_AUTO__ !== false) {
  install();
}
