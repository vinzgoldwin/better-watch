# Native app verification

Verified on 2026-09-19. The canonical source and platform links are in [CROSS_PLATFORM.md](../CROSS_PLATFORM.md).

| Environment | Completed checks |
| --- | --- |
| Node server on M1 Asahi | 31 focused checks passed, including shared profile updates, media compatibility, subtitle conversion, HTTP ranges, and HLS segment decoding/seek boundaries. |
| Native Mac | 10 Swift tests passed. Filtering 10,000 films took 42 ms in the test run. |
| iPad simulator, iPadOS 26.5 | Quick Look, favorites, search, HLS playback, seek/resume, rotation, and description while playback continues passed. |
| Physical iPad Air 5, iPadOS 26.5 | Real-library playback over Tailscale and rotation passed. Better Watch name and Mac icon installed. The later description update built and signed successfully, but installation is pending USB reconnection to the main Mac. |
| Android API 36 emulator on Mac | Preview, favorites/profile sync, search, direct/HLS playback, audio selection, seek/resume, and rotation passed. |
| Physical Samsung S25 Ultra, Android 16, USB to Asahi | The same three core UI tests passed. The additional description/playback/rotation test passed. The latest app then passed real-library playback over Tailscale with the USB network forward removed. |

Synthetic UI tests used an isolated generated movie library and profile. [scripts/mobile-fixture.js](../scripts/mobile-fixture.js) reproduces that setup. Live checks restored the tested film's previous resume position. Android was returned to the real server, and the Android test package and USB network forward were removed afterward.

The description test initially encountered a transient missing Compose root during activity startup. Its wait now permits the root to appear within the existing timeout; the focused test passed afterward. This was a test synchronization change, not a playback workaround.

Native UI changes require rebuilt apps to be installed. Server features and personal library state are shared, but SwiftUI and Compose interfaces remain separate implementations.

## Android build host migration

Android now builds and tests on M1 Asahi. A fresh local `assembleDebug assembleDebugAndroidTest` succeeded in 2m 5s. The locally generated APK has the same signing certificate as the previous Mac build and installed over the existing phone app successfully.

The initial post-migration UI rerun was blocked by the phone's lock screen and stopped. After the phone was unlocked, the locally built app with the approved folded-ribbon icon passed all four physical-device UI tests in 14.339s, including description playback and rotation.

The Android source, test APKs, signing key, toolchain, and archived Mac reports are on Asahi. Better Watch's Android checkout, virtual device, emulator/system image, added SDK tools, Gradle 8.13 cache, and temporary build logs were removed from the Mac. Pre-existing tools and the unrelated SimplifiedFit virtual device were preserved. Follow [the Android README](android/README.md) for the local workflow.

## Folded Play Ribbon icon

The approved transparent artwork is now the shared source for all three icons. Mac ICNS decoding, Mac app signing, iPad device build/signing, and Android adaptive resource compilation passed. Mac build 5 and Android version code 2 are installed. iPad build 3 is signed and ready, including the description button, but the physical iPad remains disconnected.

The four synthetic Android UI tests passed on the updated app. An additional live-library check initially hit the same transient Compose startup race; its initial wait was corrected. The phone then locked before the focused rerun could finish, so that rerun was stopped and is not claimed as passing. The test package was removed and the app remains configured for the real Tailscale server. Earlier completed live playback checks are recorded above.

## Android player controls repair

Android version code 3 fixes black controls on the black player background, intercepts video touches in a Compose layer above PlayerView, and adds left/right double-tap seeking by five seconds. The description icon remains available even when metadata is absent. The real touch-input test passed on S25 Ultra in portrait and landscape, checking auto-hide/reveal, play/pause, exact five-second seeks in both directions, and description open/close. Seek/resume/audio and description-during-playback regression tests also passed. The portrait screenshot was visually checked for white controls; a landscape screenshot was obscured by the system notification shade, so it is not visual evidence.

The final real-library Tailscale playback check passed in 8.376s after its control-reveal helper was updated to wait for the double-tap detection interval. Test tooling and the USB forward were removed; version code 3 remains installed and configured for the personal library.

## iPad player parity check

The iPad controls already had an explicit white foreground. Build 4 adds a dedicated gesture layer over the video and letterboxing, exclusive single/double-tap recognition, five-second left/right seeking, 44-point playback buttons, and an always-available description button with a missing-metadata fallback. Two simulator tests passed with zero failures in 52.323s: coordinate-based taps/double-taps with exact seek positions in both orientations, and descriptions during playback across rotation. The physical-device build and signing also passed. Installation and verification on the actual iPad remain pending because the Mac reports it unavailable.

## Physical iPad installation completed

After USB reconnection, build 4 was installed on the iPad Air 5 with the folded-ribbon icon. The expanded real-device Tailscale test passed with zero failures in 44.285s. It verified advancing movie playback, pause, exact five-second double-tap seeking in both directions, and description open/close in portrait and landscape. The tested film's previous resume position was restored, and the temporary test-runner app was removed. This completes the previously pending iPad installation and device check.
