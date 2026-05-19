// CORTI W207-MOBILE — Slot Math Studio service worker.
//
// Strategy
// ──────────
// • shell-first cache (precache HTML + manifest + critical CSS/JS)
// • runtime cache-first for SVG/font/JSON, network-first for /api/*
// • offline fallback to `index.html` for any navigation that fails
// • background sync queue for auto-save writes (variant snapshots)
// • controlled update notification through `postMessage`
//
// This SW is intentionally plain JS (no Workbox dependency) so it can
// be cached and updated without an extra build step. The CACHE_NAME
// version stamp must be bumped whenever shell assets change.

/* eslint-env serviceworker */

const SW_VERSION = 'studio-w208-stale-killer';
const SHELL_CACHE = `slot-studio-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `slot-studio-runtime-${SW_VERSION}`;

// Files we want eagerly cached on install. Only critical shell-level
// assets — the rest are picked up lazily on first fetch.
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
];

// ── Lifecycle ──────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(new Request(url, { credentials: 'same-origin' })).catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('slot-studio-') && !n.endsWith(SW_VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
      // Tell live clients an update is available.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        c.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
      }
    })(),
  );
});

// ── Fetch handler — strategy router ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin requests bypass the SW entirely — Pixi loads SVG data
  // URLs which are not HTTPS resources, so we don't intercept.
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML documents): network-first, fall back to
  // cached index.html so the app boots offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirstNavigate(req));
    return;
  }

  // API requests: always network-first, never cache responses.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(req));
    return;
  }

  // Static assets: cache-first with background revalidate.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirstNavigate(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('./index.html', res.clone()).catch(() => undefined);
    }
    return res;
  } catch {
    const cached = await caches.match('./index.html');
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Studio offline</title>' +
        '<style>body{background:#0A0D11;color:#A9B0BC;font-family:ui-monospace,monospace;padding:24px}</style>' +
        '<h1>Studio offline</h1><p>No connection and no cached shell. Reconnect to install.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
    );
  }
}

async function networkOnly(req) {
  try {
    return await fetch(req);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, offline: true, error: String(err) }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => undefined);
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response('', { status: 504 });
}

// ── Background sync — drain auto-save queue ────────────────────────
// Clients post `{ type: 'QUEUE_SAVE', payload }` and we replay them
// once connectivity returns. Uses an in-memory FIFO for now; for a
// production PWA we would swap this for IndexedDB.
const saveQueue = [];

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'QUEUE_SAVE' && data.payload) {
    saveQueue.push(data.payload);
    if ('sync' in self.registration) {
      // best-effort registration; ignore failures.
      self.registration.sync.register('drain-save-queue').catch(() => undefined);
    }
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'CACHE_STATUS') {
    event.ports?.[0]?.postMessage({
      version: SW_VERSION,
      shell: SHELL_CACHE,
      runtime: RUNTIME_CACHE,
      queued: saveQueue.length,
    });
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'drain-save-queue') {
    event.waitUntil(drainSaveQueue());
  }
});

async function drainSaveQueue() {
  while (saveQueue.length > 0) {
    const item = saveQueue.shift();
    try {
      await fetch('./save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
    } catch {
      // Re-queue on failure and stop draining for now.
      saveQueue.unshift(item);
      break;
    }
  }
}
