# Android · Capacitor wrapper skeleton

Placeholder Android Studio project files so the repo documents the
target SDK / permissions / plugin set before running
`npx cap add android`.

Files of interest:

- `app/build.gradle` — compileSdk 34, minSdk 24, dependency list.
- `app/src/main/AndroidManifest.xml` — permissions (vibrate / camera /
  media) plus deep-link + share-target intent filters.
- `app/src/main/java/com/vanvinkl/slotstudio/MainActivity.java` —
  Capacitor `BridgeActivity` subclass.
- `app/src/main/res/values/strings.xml` — display name + URL scheme.

### Build pipeline

```bash
cd ../..              # repo root
npm run studio:build  # produce web/studio/dist
cd mobile
npx cap sync android
npx cap open android  # opens Android Studio → Build → APK / AAB
```

The release build requires a signing keystore (kept outside the
repo). Use `gradlew assembleRelease` for an unsigned APK if you only
want to smoke-test the wrapper.
