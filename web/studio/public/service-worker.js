// Slot Math Studio — service worker TOMBSTONE.
//
// The studio previously shipped a Workbox-style PWA service worker that
// aggressively cached the shell (index.html + app.js + styles.css).
// In practice this caused recurring "stale bundle" bugs: users would
// see OLD app.js after we shipped fixes (close-button broken, tab
// switches broken, etc.) because the SW served the cached copy and
// the in-page killer in app.js could only run *after* fresh source.
//
// This file is now a TOMBSTONE — any browser that still loads the
// previous URL immediately unregisters itself + nukes every CacheStorage
// entry.  Combined with the inline <script> in index.html (which kills
// the SW BEFORE app.js is fetched), this guarantees that no user can
// be stuck on a stale bundle ever again.
//
// We keep the file at the same path so the old SW can find it; if we
// deleted it outright the browser would just keep the previous worker
// alive forever.
/* eslint-env serviceworker */

self.addEventListener('install', function (event) {
  // Activate the new (empty) worker immediately so we can self-destruct.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      // Wipe every CacheStorage entry the old worker created.
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (_) {}
    try {
      // Detach from all clients so the next fetch bypasses us.
      await self.registration.unregister();
    } catch (_) {}
    try {
      // Force a reload on every controlled client so they pick up
      // fresh source straight from the network.
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) {
        try { c.navigate(c.url); } catch (_) {}
      });
    } catch (_) {}
  })());
});

// Pass-through fetch — we no longer intercept anything.  This is here
// only to keep the worker valid during the brief activate-then-unregister
// window; once unregister() resolves the browser will not call us again.
self.addEventListener('fetch', function (/* event */) { /* no-op */ });
