# Feature → UI Map (MTL Phase E)

The slot template auto-builds its UI from `IR.features[]`.  Each declared
feature kind triggers a component to mount; declared-but-unknown kinds log
a warning and the math still runs (UI silent).

This document is the **single source of truth** for the contract between
IR authors (math designers) and the runner.  If you declare a feature that
isn't listed here, register it first in
`web/studio/public/runner/feature-registry.js`.

## How it works (boot order)

1. `runtime.js` loads the IR from `<script id="inline-ir">`.
2. `feature-registry.js` exposes `MTLFeatureRegistry.find(kind)`.
3. `component-builder.js` exposes `MTLFeatureBuilder.boot(ir, hostRoot)`.
4. At end of runtime boot, `MTLFeatureBuilder.boot(IR, document.body)`:
   - validates internal conflicts (`cluster_pays` ↔ `ways`),
   - orders features by registry `priority` (lower = earlier),
   - for each known kind, dynamically loads the component file from
     `/runner/features/<file>.js` (or uses the pre-inlined bundle when the
     Studio's `buildPlayTemplateBlob` embedded it),
   - calls `manifest.mount({ irFeature, ir, host, bus })`,
   - injects `manifest.styles` once per kind into `<style id="mtl-features-styles">`,
   - returns `{ mounted: [...], unknown: [...], conflicts: [...] }` for logging.
5. `runtime.js` emits events on `MTLFeatures.events` during the spin
   pipeline; components subscribed via `bus.on(event, cb)` react.

## Registered kinds

| `kind`              | Module file                      | Mount slot                  | Priority | Notes                                                                 |
|---------------------|----------------------------------|-----------------------------|---------:|-----------------------------------------------------------------------|
| `multiplier`        | `multiplier.js`                  | `#mtl-features-top`         |       30 | Generic strip 2×/3×/5×/10× + MISS; values from IR.distribution.       |
| `power_meter`       | `power-meter.js`                 | `#mtl-features-top`         |       20 | Horizontal fill bar, configurable tiers + source.                      |
| `accumulator`       | `power-meter.js`                 | `#mtl-features-top`         |       20 | Alias for `power_meter`.                                              |
| `free_spins`        | `free-spins.js`                  | `#mtl-features-overlay`     |       40 | FS HUD pill above reels + optional progressive multiplier ladder.     |
| `hold_and_win`      | `hold-and-win.js`                | `#mtl-features-cells`       |       50 | Per-cell locked-orb badges + jackpot reveal + full-grid bonus.        |
| `link_and_win`      | `hold-and-win.js`                | `#mtl-features-cells`       |       50 | Alias for `hold_and_win` (Pragmatic Money Train family).              |
| `expanding_wild`    | `expanding-wild.js` *(planned)*  | `#mtl-features-cells`       |       60 | Wild expands to fill its reel.                                        |
| `walking_wild`      | `walking-wild.js` *(planned)*    | `#mtl-features-cells`       |       60 | Wild moves one reel per respin/spin.                                  |
| `sticky_wild`       | `sticky-wild.js` *(planned)*     | `#mtl-features-cells`       |       60 | Wilds stay locked across N spins.                                     |
| `mystery_symbol`    | `mystery-symbol.js` *(planned)*  | `#mtl-features-cells`       |       70 | Placeholder symbol reveals after spin stop.                           |
| `cascade`           | `cascade.js` *(planned)*         | `#mtl-features-overlay`     |       35 | Winning symbols vanish, remaining drop, new fall in.                  |
| `tumble`            | `cascade.js` *(planned)*         | `#mtl-features-overlay`     |       35 | Alias for `cascade`.                                                  |
| `buy_feature`       | `buy-feature.js` *(planned)*     | `#mtl-features-bottom`      |       80 | BUY FEATURE button reading per-feature buy multipliers from IR.       |
| `bonus_buy`         | `buy-feature.js` *(planned)*     | `#mtl-features-bottom`      |       80 | Alias for `buy_feature`.                                              |
| `bonus_pick`        | `bonus-pick.js` *(planned)*      | `#mtl-features-overlay`     |       55 | Pick-N-of-M bonus with reveal + collect/lose terminator.              |
| `wheel_bonus`       | `bonus-pick.js` *(planned)*      | `#mtl-features-overlay`     |       55 | Wheel-of-fortune handled by `bonus-pick.js`.                          |
| `cluster_pays`      | `cluster-pays.js` *(planned)*    | `#mtl-features-overlay`     |       25 | Cluster outline overlay; conflicts with `ways`.                       |
| `ways`              | `ways.js` *(planned)*            | `#mtl-features-overlay`     |       25 | Ways count badge + left-to-right cells highlight; conflicts with `cluster_pays`. |

## Event bus contract

Components subscribe to events on `window.MTLFeatures.events`.

| Event              | Payload                                                                  | Fired by                                  |
|--------------------|--------------------------------------------------------------------------|-------------------------------------------|
| `booted`           | `{ ir, mountedKinds }`                                                   | builder after all components mount        |
| `spin:start`       | `{ bet, isFs?, isHnw? }`                                                 | runtime, at SPIN click                    |
| `spin:eval`        | `{ result, totalWin, bet }`                                              | runtime, after base eval                  |
| `spin:lightning`   | `{ value }`                                                              | runtime, when multiplier > 1              |
| `spin:render-done` | `{ totalWin }`                                                           | runtime, after render+animation           |
| `fs:enter`         | `{ triggerScCount, awarded, mult, max }`                                 | runtime, FS start                         |
| `fs:spin`          | `{ index, total, win, mult, winTotal }`                                  | runtime, each FS spin                     |
| `fs:retrigger`     | `{ added, total }`                                                       | runtime, FS retrigger                     |
| `fs:exit`          | `{ totalWin, totalAwarded, maxMult }`                                    | runtime, FS end                           |
| `hnw:enter`        | `{ initialOrbs, respins, totalCells }`                                   | runtime, H&W start                        |
| `hnw:respin`       | `{ filled, totalCells, respinsLeft, cumulative }`                        | runtime, each H&W respin                  |
| `hnw:orb-landed`   | `{ cell: {r, y}, value, jpName? }`                                       | runtime, each orb lands                   |
| `hnw:full-grid`    | `{ bonus }`                                                              | runtime, all cells filled                 |
| `hnw:exit`         | `{ totalWin }`                                                           | runtime, H&W end                          |
| `bigwin`           | `{ tier, multiple, amount }` *(reserved)*                                | runtime, big-win threshold crossed        |

## Adding a new feature kind

1. Pick a `kind` slug (snake_case, single noun phrase).
2. Add a registry entry in `feature-registry.js`:
   ```js
   {
     kind: 'my_new_thing',
     module: 'my-new-thing.js',
     mountSlot: '#mtl-features-overlay',  // pick the right slot
     priority: 50,
     description: 'one-line of what this is',
   }
   ```
3. Create `features/my-new-thing.js`:
   ```js
   (function () {
     const STYLES = `.ft-mnt { ... }`;
     function mount(meta) {
       const node = document.createElement('div');
       node.className = 'ft-mnt';
       meta.host.appendChild(node);
       const off = meta.bus.on('spin:eval', function (p) { /* react */ });
       return { unmount: function () { off(); if (node.parentNode) node.parentNode.removeChild(node); } };
     }
     if (window.MTLFeatures && window.MTLFeatures.register) {
       window.MTLFeatures.register({ _fileKey: 'my-new-thing', kind: 'my_new_thing', styles: STYLES, mount });
     }
   })();
   ```
4. Add the fetch to `buildPlayTemplateBlob` so it's inlined in the runner blob.
5. Add a Playwright test in `qa-mtl-feature-driven.spec.ts` for the new kind.

## Slot reference

| Slot id                  | Where it sits in the page                                            |
|--------------------------|----------------------------------------------------------------------|
| `#mtl-features-top-l`    | Top HUB, left of game logo                                           |
| `#mtl-features-top`      | Top HUB, right of game logo (next to balance)                        |
| `#mtl-features-side-l`   | Inside the left aside (vertical widgets)                             |
| `#mtl-features-side-r`   | Inside the right aside (FS multiplier ladder)                        |
| `#mtl-features-overlay`  | Inside `.reelFrame` (FS HUD, cascade FX, bonus-pick modal)           |
| `#mtl-features-cells`    | Inside `.reelFrame` (per-cell badges — H&W, expanding wild, etc.)    |
| `#mtl-features-bottom`   | Inside `.bottomBar` (buy-feature button, bonus-pick CTA)             |

Auto-created if missing (component-builder appends a thin `<div>` to body).
Production HTML in `template.html` defines all 7 anchors so layout stays predictable.
