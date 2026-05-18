# Slot Math Studio — Native Mobile Wrappers (Capacitor)

This directory hosts the **placeholder** Capacitor configuration and
skeleton native projects for shipping the studio as an iOS / Android
app. The actual JS payload is `../web/studio/` (built via
`npm run studio:build`); these wrappers simply embed that build in a
WKWebView (iOS) / Android WebView and surface a handful of native
APIs (haptics, share, splash, filesystem) to the web layer.

## Layout

```
mobile/
├── capacitor.config.json   # Single source of truth for build + plugins
├── package.json            # Capacitor + plugin dependencies
├── ios/                    # Xcode project skeleton
│   └── App/
│       └── App/
│           ├── Info.plist          # App metadata + perms
│           ├── AppDelegate.swift   # Capacitor bridge bootstrap
│           └── Assets.xcassets/    # App icons (not checked in)
└── android/                # Android Studio project skeleton
    └── app/
        ├── build.gradle              # Gradle module config
        └── src/main/
            ├── AndroidManifest.xml   # App manifest + perms
            ├── java/com/vanvinkl/slotstudio/
            │   └── MainActivity.java # Capacitor bridge bootstrap
            └── res/values/strings.xml
```

## First-time setup

```bash
# 1. Build the studio web bundle (this is what the wrappers ship).
cd ..
npm run studio:build

# 2. Install Capacitor and platform deps.
cd mobile
npm install
npx cap init "Slot Math Studio" com.vanvinkl.slotstudio --web-dir=../web/studio/dist

# 3. Add platforms (one-time).
npx cap add ios
npx cap add android

# 4. Sync web assets into the native shells.
npx cap sync
```

## Build / open

| Platform | Command | Output |
| -------- | ------- | ------ |
| iOS      | `npx cap open ios` | Opens Xcode → `Product → Archive` |
| Android  | `npx cap open android` | Opens Android Studio → `Build → APK / AAB` |

The studio's `manifest.webmanifest` + service worker continue to work
inside the WebView, so installs done from the browser remain
distinct from the App Store / Play Store builds (you can ship both).

## Native ↔ Web bridge

When Capacitor is installed at runtime, `window.Capacitor` is set. The
PWA bridge in `web/studio/src/pwa.ts` already detects standalone
display mode; for richer integrations (haptics, share, filesystem)
you can call `Capacitor.Plugins.Haptics.impact({ style: 'medium' })`
straight from the studio code — there is no need to fork the JS.

## npm scripts (root)

The following helpers are exposed from the repository root so the
build pipeline can call them without changing directories:

```bash
npm run mobile:sync     # Rebuild web + npx cap sync
npm run mobile:ios      # Open iOS shell in Xcode
npm run mobile:android  # Open Android shell in Android Studio
```

> **Note** — the actual Capacitor CLI is not vendored into the repo
> (it depends on Xcode / Android Studio toolchains). The npm scripts
> are placeholders that assume `mobile/` has been `npm install`-ed
> first. The CI gate only validates that `capacitor.config.json` is
> valid JSON and that the skeleton manifests / plist parse.

## Compile path

Building a real archive requires:

1. **iOS** — macOS 13+, Xcode 15+, an Apple Developer account, the
   `App.xcworkspace` (created by `npx cap add ios`), and a provisioning
   profile for `com.vanvinkl.slotstudio`.
2. **Android** — Android Studio Hedgehog+, JDK 17, Gradle 8.2+,
   `android-sdk-platform-34`, and a signing keystore.

These tools are **not** bundled with the repo. The README, configs,
and skeleton files in this directory are sufficient for a developer
to run `npx cap sync && npx cap open <platform>` and pick up from
there.
