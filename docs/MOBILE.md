# MOBILE.md — Slot Math Studio on phones, tablets, and native shells

> CORTI W207-MOBILE · 2026-05-18 · Boki — converts the existing
> desktop-only studio (1024px guard) into a real PWA + Capacitor
> native experience.

## TL;DR

| Surface | What ships | How to launch |
| ------- | ---------- | ------------- |
| **PWA / mobile browser** | Installable web app w/ offline shell + share target | open in Safari / Chrome / Edge → "Add to Home Screen" |
| **iOS native** | Capacitor wrapper, WKWebView, App Store distribution | `npm run mobile:sync && npm run mobile:ios` |
| **Android native** | Capacitor wrapper, Android WebView, Play Store distribution | `npm run mobile:sync && npm run mobile:android` |

The web payload is exactly the same in all three modes — `web/studio/`
ships as the single source of truth. Native wrappers only add
permission scaffolding, splash screens, and a handful of native APIs
(haptics, share, filesystem).

## Architecture

```
            ┌──────────────────────────────────────────┐
            │            web/studio/  (Vite)           │
            │  ─────────────────────────────────────   │
            │  index.html  ← <link rel="manifest">     │
            │  service-worker.js                       │
            │  src/pwa.ts   (install + share + SW reg) │
            │  src/touch-renderer.ts (pointer events)  │
            │  src/main.ts  ← wires PWA bridge         │
            └──────────────────────────────────────────┘
                          ▲
              shared bundle (web/studio/dist)
                          ▼
    ┌─────────────────────────────────────────────────┐
    │            mobile/  (Capacitor wrappers)        │
    │  capacitor.config.json                          │
    │  ios/App/App/Info.plist + AppDelegate.swift     │
    │  android/app/build.gradle + AndroidManifest     │
    └─────────────────────────────────────────────────┘
```

## 1. PWA layer

### 1.1 Service worker (`web/studio/service-worker.js`)

| Strategy | Routes | Notes |
| -------- | ------ | ----- |
| **Network-first navigate** | HTML documents | Falls back to cached `index.html` for offline boot |
| **Cache-first / SWR**      | CSS / JS / SVG / fonts | Refresh in background, hot-swap on next load |
| **Network-only**           | `/api/*` | Never cache backend responses |
| **Offline JSON shim**      | `/api/*` failures | Returns `{ok: false, offline: true}` |
| **Background sync**        | `QUEUE_SAVE` messages | Drains via `sync` event when connectivity returns |

Cache names are versioned (`slot-studio-shell-w207-1` /
`slot-studio-runtime-w207-1`). Bump `SW_VERSION` on every shell change
so old clients get a clean cache on activation.

### 1.2 Web App Manifest (`web/studio/manifest.webmanifest`)

- `display: standalone` + `display_override` for Window-Controls-Overlay
- 5 icons (192 / 256 / 384 / 512 + maskable 512)
- Theme color cyan (`#22D3EE`), background onyx (`#0A0D11`)
- 3 launch shortcuts: New Game · Run MC · Export
- Share target: receives GDD files via the OS share sheet
- Custom URL handler: `web+slotir://…`

### 1.3 PWA bootstrap (`web/studio/src/pwa.ts`)

`installPwa()` registers the SW, captures `beforeinstallprompt`, and
exposes `window.__studio_pwa__` with:

```ts
interface PwaBridge {
  controlled: boolean;       // SW is in control
  installAvailable: boolean; // ready for promptInstall()
  isStandalone: boolean;     // running as installed PWA
  reducedData: boolean;      // Save-Data or 2G
  promptInstall(): Promise<'accepted' | 'dismissed' | null>;
  share(payload): Promise<boolean>;
  pickFile(accept?, capture?): Promise<File | null>;
  queueSave(payload): boolean;
  onUpdate(listener);
  onControllerChange(listener);
}
```

## 2. Touch renderer (`web/studio/src/touch-renderer.ts`)

Pure-logic shim that the Pixi PLAY tab can layer on top of its canvas:

- **Pinch-to-zoom** — two-pointer scale tracking with epsilon clamp.
- **Swipe-to-spin** — single-pointer flick (40px / 600ms thresholds)
  classified by axis dominance → `down` / `up` / `left` / `right`.
- **Long-press** — 500ms hold without drift → contextual menu hook.
- **Tap** — small displacement, sub-500ms duration.
- **Haptic feedback** — `navigator.vibrate(25 | 60 | 120)` on
  spin / win / menu.
- **Touch-aware win lines** — `winLineWidth(devicePixelRatio)` returns
  a fatter, retina-correct stroke for touch screens (clamped to 8px).

API:

```ts
const touch = createTouchRenderer();
const detach = touch.attach(pixiHostEl, {
  onSpin: () => playBridge.spin(),
  onZoom: (scale, center) => pinchZoom(scale, center),
  onContextMenu: (point) => openMenu(point),
  onTap: (point) => focusReel(point),
});
```

## 3. Responsive layout

Breakpoints (additive media queries — desktop layout is unchanged):

| Range | Adaptation |
| ----- | ---------- |
| **≤ 1023px** | Shell stacks vertically · tab strip scrolls horizontally · right rail becomes a sliding bottom sheet · symbol grid → 2 col phone / 3 col tablet · main padding-bottom 64px to clear sticky bottom bar · pitch deck → vertical scroll |
| **≤ 767px** | Persona badge / tab meta hidden · 13px base font · 40px min-height on all interactive elements |
| **`pointer: coarse`** | 40px min-height enforced globally regardless of viewport width |
| **`prefers-reduced-data`** | All transitions/animations duration → 0s |

Mobile guard: the W200 `<1024px` banner is **suppressed** when
`body.w207-mobile-ready` is set (the PWA bridge applies this class
after a successful boot). The banner remains as a graceful fallback
for unsupported browsers.

Same media-query patterns ported to `web/operator/styles.css` and
`web/regulator/styles.css` (single-column card grids, horizontally
scrolling tables, full-width toasts).

## 4. Native wrappers

See `mobile/README.md` for the full setup. Quickstart:

```bash
npm run studio:build       # vite build → web/studio/dist
npm run mobile:install     # cd mobile && npm install
npm run mobile:sync        # npx cap sync (after first cap add)
npm run mobile:ios         # opens Xcode
npm run mobile:android     # opens Android Studio
```

The CI gate only verifies that `capacitor.config.json` parses as valid
JSON and the placeholder manifests are well-formed; it does **not**
attempt to compile the native projects (no Xcode / Android SDK on CI).

### Native plugins exposed to JS

| Plugin | Capability used by studio |
| ------ | ------------------------- |
| `@capacitor/haptics` | Spin/win/menu vibration (already gated by `navigator.vibrate`) |
| `@capacitor/share` | Web-Share API target (file upload to support) |
| `@capacitor/splash-screen` | 1.2s onyx splash with cyan spinner |
| `@capacitor/status-bar` | Dark / black-translucent status bar |
| `@capacitor/keyboard` | Resize webview when the keyboard pops |
| `@capacitor/filesystem` | Save/restore IR JSON to app sandbox |

## 5. Test coverage

`web/studio/tests/mobile.test.ts` provides 12+ specs:

- Manifest validity (JSON parse + required fields)
- SW registration (mock navigator.serviceWorker)
- Touch event handler attachment / removal
- Pinch-to-zoom scale calculation
- Swipe gesture classification (4 directions + tap + longpress)
- Reduced-data detection (Save-Data + 2G fallback)
- Bottom-sheet open/close (matchMedia mock)
- Share API + clipboard fallback
- File picker promise resolution
- Capacitor config schema validity
- Standalone detection

## 6. Compile path (Capacitor → native binary)

> **NOT** part of CI — these steps require local macOS/Linux + the
> respective IDE toolchains.

### iOS (App Store)

1. `npm run studio:build`
2. `cd mobile && npm install`
3. `npx cap add ios` (first time only)
4. `npx cap sync ios`
5. `npx cap open ios` → opens `App.xcworkspace`
6. In Xcode: select team, archive (Product → Archive)
7. Upload via Xcode Organizer → App Store Connect.

### Android (Play Store)

1. `npm run studio:build`
2. `cd mobile && npm install`
3. `npx cap add android` (first time only)
4. `npx cap sync android`
5. `npx cap open android` → opens Android Studio
6. `Build → Generate Signed Bundle / APK` (requires keystore)
7. Upload `.aab` to Play Console.

### Internal distribution (TestFlight / Internal track)

Same steps as above but archive without uploading; ship the `.ipa` /
`.aab` to QA via the respective beta-distribution channel.

## 7. Roadmap (post-W207)

- W208-OFFLINE: full IndexedDB persistence + 100% offline IR build
- W209-PUSH: web-push notifications (cert-completed, MC-finished)
- W210-CABINET: arcade cabinet skin (landscape lock + on-screen keypad)
- W211-WATCH: Apple Watch / WearOS complications for cert status
