# TV verification: 2026-09-22

Built on M1 Asahi. Native Google TV / Android TV interface, approved layout A, in the existing Android APK. Version 1.1, build 4, Android 9+.

**Physical TV E2E is not complete.** The user confirmed Google TV / Android TV but could not provide debugging access yet and requested the best available local verification. No Android device was connected to ADB. No app installation or video playback on the TCL is claimed.

## Completed

Command from `apps/android`, with `asahi-env.sh` sourced and the isolated `scripts/mobile-fixture.js` running:

```sh
./gradlew testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
```

Final run: successful, 13 seconds. Nine local tests passed, zero failures or skips:

| Suite | Passed | Verified behavior |
| --- | ---: | --- |
| TvNavigationTest | 5 | D-pad browsing, film details, a real fixture favorite write, focus restoration, grid and sidebar scrolling, Back exit, search and empty results, sorting, categories, actual player Info and audio/subtitle panels. |
| TvControlsTest | 3 | Play/pause actions, exact five-second timeline steps, missing-description fallback, long-description scrolling and remote close. |
| PhoneLibraryTest | 1 | The phone's search and empty states after extracting filtering into the shared source. |

These tests run actual Android Compose code under Robolectric, using legacy graphics on Linux ARM64. The navigation suite loads the real synthetic library and writes to its separate profile over HTTP. It also constructs the real PlaybackSession/PlayerView and opens player panels. Robolectric does not decode video; that test is intentionally limited to metadata, UI, and focus. Legacy graphics do not certify the rendered appearance, font metrics, Android keyboard, or physical TV behavior.

Both APKs built. Android lint completed with **zero errors and 24 warnings**, including dependency-update suggestions, existing manifest/icon conventions, TV landscape orientation, and KTX suggestions. The signed app passed `apksigner verify` using APK Signature Scheme v2. The packaged manifest was inspected for TvActivity, the Leanback launcher, the banner, optional touchscreen support, version, and label.

The TV banner was visually inspected. The approved HTML mockups were previously inspected in Chromium; those browser checks are not native app screenshots or native E2E.

## Artifacts

- Installable APK: `/home/kevin/.local/share/better-watch-builds/Better-Watch-TV.apk` (69,829,881 bytes).
- SHA-256: `58cd523d55c94620ba37b54b152b4f29e40263aecac4245f404de5352fbe57ce`.
- Device-test APK: `app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`.
- Build log, JUnit XML, lint report, compiled manifest, signature result, and APK checksum: `/home/kevin/.local/share/better-watch-android/archive/tv-2026-09-22/`.

The APK uses the existing Android application ID and signing key. The same binary includes the phone and TV interfaces. No Android app files or tools were copied to the Mac. The cross-platform documentation, AGENTS map, and shared Apple/Android test-fixture cleanup fix were synchronized after checking its existing changes.

The shared fixture previously waited for a second child exit event after terminating the server by signal, leaving generated media behind. Its cleanup now recognizes `signalCode` as an exited child. A separate startup/SIGTERM check passed and verified that the temporary media/profile directory was removed. The fixture is stopped; the production server was not restarted.

## Remaining device verification

`TvDeviceTest` compiles but has **not run**. Follow [README.md](README.md#physical-device-e2e) once an authorized TV is connected. It covers real Android key injection, direct and HLS playback, the first rendered video frame, advancing time, auto-hidden controls, five-second seeking, descriptions, audio/subtitle panels, and saved-position reopening. Test screenshots must also be inspected for layout, legibility, focus visibility, and actual video output.

The TV's system keyboard, hardware remote buttons, suspend/resume behavior, decoder, and actual Tailscale connection remain unverified. A final real-server playback check on the TCL is still needed. Personal-library marks were not used for local tests.
