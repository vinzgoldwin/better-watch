# Better Watch for Android

Native Kotlin/Jetpack Compose interface with Media3 ExoPlayer. No browser or WebView. Uses the same server library, profile, previews, and playback endpoints as Mac and iPad. See the [cross-platform map](../../CROSS_PLATFORM.md).

During playback, tap the video to show controls. Double-tap the left or right half to seek backward or forward five seconds. Play/pause and five-second buttons sit below the timeline; the info button opens the description, or indicates when the film has none.

## Build and install

Build and test on M1 Asahi. The local toolchain is in `~/.local/share/better-watch-android`: ARM64 JDK 17, SDK 36, Gradle 8.13, native ADB, and an ARM64 AAPT2 override. The Mac is only needed for Apple apps.

```sh
cd mobile/android
source ./asahi-env.sh
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

For manual installation, copy the APK to the phone, open it, and allow installation from that file source when Android asks. Keep the same signing key when producing updates so installed data is retained. The original signing key has been copied to `~/.android/debug.keystore` on Asahi, so local builds update the existing installation without erasing data. Keep this file private and backed up; it is not in Git.

Install/open Tailscale on the phone and connect to the same tailnet as the server. The app defaults to `https://m1-asahi.taila125ad.ts.net:8449`; the sidebar’s Server screen can change this. The Mac can be off while watching. Shared server changes apply immediately; native UI changes require installing a rebuilt APK.

## End-to-end tests

Start `PATH="$HOME/.local/share/better-watch-media/bin:$PATH" node scripts/mobile-fixture.js` from the repository root. Tests use the USB-connected phone, `adb reverse`, and a separate test profile. They cover Quick Look, synced favorites, filtering, direct/HLS playback, audio selection, seeking, resume, and opening the movie description during playback across rotation.

For the USB-connected phone, build both APKs and run tests on Asahi:

```sh
source ./asahi-env.sh
./gradlew assembleDebug assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb reverse tcp:3399 tcp:3399
adb shell am instrument -w -r -e server http://127.0.0.1:3399 \
  local.kego.betterwatch.test/androidx.test.runner.AndroidJUnitRunner
```

The instrumented tests replace the app’s server preference with the fixture address. Use Server settings to reconnect to the real server after testing. Remove the test package with `adb uninstall local.kego.betterwatch.test` and the forward with `adb reverse --remove tcp:3399`. Test screenshots are saved in the app’s external files directory and can be pulled with `adb`.

For an explicit live Tailscale playback check, run the `local.kego.betterwatch.LiveLibraryTest` class with `-e live true`. It sets the real server address, plays briefly, and restores the tested film's prior resume position. The live test is skipped by default.

## Asahi toolchain

`asahi-env.sh` selects a dedicated Gradle home whose local `gradle.properties` points to the ARM64 resource compiler. Google’s Linux AAPT2 binary targets x86-64; this host uses [Commit451’s AOSP ARM64 build](https://github.com/Commit451/android-arm-build-tools), pinned to `platform-tools-36.0.0` and verified against its published SHA256SUMS. JDK is Temurin 17; SDK platform 36 and build tools 35 come from Google. ADB comes from Fedora’s ARM64 android-tools package.

Use the physical phone for end-to-end tests on Asahi. The previous Mac emulator’s configuration, APKs, and test reports are archived in `~/.local/share/better-watch-android/archive/`. Its virtual device and system image are not needed for the USB workflow.
