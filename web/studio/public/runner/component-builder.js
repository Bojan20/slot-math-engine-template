/*
 * ════════════════════════════════════════════════════════════════════════════
 *   COMPONENT BUILDER  —  boot-time slot UI compiler
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Reads IR.features at boot, looks each kind up in MTLFeatureRegistry,
 * dynamically loads the matching feature module, calls its mount({...})
 * with the chosen DOM slot + the IR + a shared hook bus.  The runner
 * fires events on the bus during the spin pipeline; components react by
 * updating their own DOM and/or animating.
 *
 * Components NEVER touch each other's DOM and NEVER patch runtime.js
 * directly — the only public contract is `events.emit(name, payload)`
 * fired by runtime + `events.on(name, cb)` subscribed by components.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Event names runtime emits
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   booted               { ir, mountedKinds }
 *   spin:start           { bet, isFs, isHnw }
 *   spin:reels-stopped   { grid }
 *   spin:eval            { result, totalWin }
 *   spin:lightning       { value }
 *   spin:render-done     { totalWin }
 *
 *   fs:enter             { triggerScCount, awarded, mult, max }
 *   fs:spin              { index, total, win, mult }
 *   fs:retrigger         { added, total }
 *   fs:exit              { totalWin }
 *
 *   hnw:enter            { initialOrbs, respins }
 *   hnw:respin           { filled, totalCells, respinsLeft, cumulative }
 *   hnw:orb-landed       { cell, value, jpName? }
 *   hnw:full-grid        { bonus }
 *   hnw:exit             { totalWin }
 *
 *   bigwin               { tier, multiple, amount }
 *
 * Components register listeners via `bus.on('spin:eval', cb)`.  cb gets
 * the payload object plus a meta object `{ ir, host, irFeature }`.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   await MTLFeatureBuilder.boot(ir, hostRoot)
 *       → { mounted: [...], unknown: [...], conflicts: [...] }
 *   MTLFeatureBuilder.events                  // shared bus, also at MTLFeatures
 *   MTLFeatureBuilder.unmountAll()            // tear down all components
 *   MTLFeatureBuilder.mountedKinds()          // current kinds active
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  //  Tiny pub-sub bus (event names: dotted/colon-separated strings)
  // ──────────────────────────────────────────────────────────────────────────

  function makeBus() {
    const subs = new Map();
    return {
      on: function (event, cb) {
        if (!subs.has(event)) subs.set(event, new Set());
        subs.get(event).add(cb);
        return function off() {
          const s = subs.get(event);
          if (s) s.delete(cb);
        };
      },
      off: function (event, cb) {
        const s = subs.get(event);
        if (s) s.delete(cb);
      },
      emit: function (event, payload) {
        const s = subs.get(event);
        if (!s || s.size === 0) return;
        // Snapshot to allow listeners to unsubscribe during emit
        const arr = Array.from(s);
        for (let i = 0; i < arr.length; i++) {
          try { arr[i](payload); }
          catch (err) { console.warn('[MTLFeatures] listener for ' + event + ' threw:', err); }
        }
      },
      // For debugging — never used by components
      _eventNames: function () { return Array.from(subs.keys()); },
    };
  }

  const bus = makeBus();

  // ──────────────────────────────────────────────────────────────────────────
  //  Component lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  const mounted = [];   // { entry, irFeature, instance }
  let scopedStylesEl = null;

  function injectScopedStyle(componentKind, css) {
    if (!css || typeof css !== 'string') return;
    if (!scopedStylesEl) {
      scopedStylesEl = document.createElement('style');
      scopedStylesEl.id = 'mtl-features-styles';
      document.head.appendChild(scopedStylesEl);
    }
    scopedStylesEl.appendChild(document.createTextNode(
      '/* component: ' + componentKind + ' */\n' + css + '\n'
    ));
  }

  function ensureSlot(selector) {
    let el = document.querySelector(selector);
    if (el) return el;
    // Auto-create missing slot as a thin div on body — host can re-parent.
    el = document.createElement('div');
    el.id = selector.replace(/^#/, '');
    el.className = 'mtl-feature-slot';
    document.body.appendChild(el);
    return el;
  }

  async function loadModule(file) {
    // Modules are inlined into the runner blob via Studio's
    // buildPlayTemplateBlob OR served from /runner/features/ in dev mode.
    // Components self-register via window.MTLFeatures.register(manifest).
    // To support both modes uniformly, we look up the module on the
    // global registry first; if missing in blob mode, we dynamic-import
    // the .js file as a classic script.
    const key = file.replace(/\.js$/, '');
    if (root.MTLFeatures && root.MTLFeatures._modules && root.MTLFeatures._modules[key]) {
      return root.MTLFeatures._modules[key];
    }
    try {
      const url = '/runner/features/' + file;
      await new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        s.src = url;
        s.async = false;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('failed to load ' + url)); };
        document.head.appendChild(s);
      });
      if (root.MTLFeatures && root.MTLFeatures._modules && root.MTLFeatures._modules[key]) {
        return root.MTLFeatures._modules[key];
      }
      return null;
    } catch (err) {
      console.warn('[MTLFeatures] could not load module ' + file + ':', err.message);
      return null;
    }
  }

  async function boot(ir, hostRoot) {
    const registry = root.MTLFeatureRegistry;
    if (!registry) {
      console.warn('[MTLFeatures] no registry — boot aborted');
      return { mounted: [], unknown: [], conflicts: [] };
    }
    const irFeatures = (ir && ir.features) || [];
    const conflicts = registry.validateConflicts(irFeatures);
    if (conflicts.length) {
      console.warn('[MTLFeatures] conflicting features declared in IR:', conflicts);
    }
    const planRes = registry.plan(irFeatures);

    const mountedKinds = [];
    for (const item of planRes.ordered) {
      const entry = item.entry;
      const irFeature = item.irFeature;
      try {
        // eslint-disable-next-line no-await-in-loop
        const manifest = await loadModule(entry.module);
        if (!manifest || typeof manifest.mount !== 'function') {
          console.warn('[MTLFeatures] module ' + entry.module + ' did not register a valid manifest');
          continue;
        }
        if (manifest.styles) injectScopedStyle(entry.kind, manifest.styles);
        const host = ensureSlot(entry.mountSlot);
        const instance = manifest.mount({
          irFeature: irFeature,
          ir: ir,
          host: host,
          bus: bus,
        });
        mounted.push({ entry: entry, irFeature: irFeature, instance: instance, manifest: manifest });
        mountedKinds.push(entry.kind);
      } catch (err) {
        console.warn('[MTLFeatures] mount failed for kind=' + entry.kind + ':', err);
      }
    }

    bus.emit('booted', { ir: ir, mountedKinds: mountedKinds });
    return { mounted: mountedKinds, unknown: planRes.unknown, conflicts: conflicts };
  }

  function unmountAll() {
    while (mounted.length) {
      const m = mounted.pop();
      try {
        if (m.instance && typeof m.instance.unmount === 'function') m.instance.unmount();
      } catch (err) {
        console.warn('[MTLFeatures] unmount error:', err);
      }
    }
  }

  function mountedKinds() { return mounted.map(function (m) { return m.entry.kind; }); }

  // ──────────────────────────────────────────────────────────────────────────
  //  Public registration API (used by feature modules)
  // ──────────────────────────────────────────────────────────────────────────

  if (!root.MTLFeatures) {
    root.MTLFeatures = {};
  }
  root.MTLFeatures._modules = root.MTLFeatures._modules || {};
  root.MTLFeatures.events = bus;
  root.MTLFeatures.register = function (manifest) {
    if (!manifest || typeof manifest.kind !== 'string') {
      console.warn('[MTLFeatures.register] missing manifest.kind');
      return;
    }
    // Key by FILE basename (matches module: field in registry) — supports
    // a single module registering multiple kinds if it exposes aliases.
    const fileKey = manifest._fileKey || manifest.kind.replace(/_/g, '-');
    root.MTLFeatures._modules[fileKey] = manifest;
    // Also key by kind for convenience
    root.MTLFeatures._modules[manifest.kind] = manifest;
  };

  root.MTLFeatureBuilder = {
    boot: boot,
    events: bus,
    unmountAll: unmountAll,
    mountedKinds: mountedKinds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
