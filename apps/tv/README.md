# Better Watch for Google TV / Android TV

Native Kotlin/Compose app for TCL TVs running Google TV or Android TV, Android 9 or later. This does not target TCL Roku TVs. It ships in the same APK as the Android phone app, with its own TV launcher, banner, screen layout, and D-pad controls. It shares playback, filters, favorites, Watch Later, watched status, and resume positions with the existing library. See [CROSS_PLATFORM.md](../../CROSS_PLATFORM.md).

## Install

TV sources and tests live in this directory. The shared manifest, dependencies, library model, and playback remain in `../android/`. Build the single phone/TV APK from the Android directory below.

Build on Asahi, keeping Android tooling off the Mac:

```sh
cd apps/android
source ./asahi-env.sh
./gradlew assembleDebug
```

The signed APK is `app/build/outputs/apk/debug/app-debug.apk`. It uses the existing debug signing key, application ID `local.kego.betterwatch`, version 1.1, build 4. Copy it to the TV with a USB drive and open it using a TV file manager; allow that file manager to install apps if prompted. No browser or WebView is used by Better Watch.

For installation through an already authorized ADB connection:

```sh
adb -s TV_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
adb -s TV_SERIAL shell am start -n local.kego.betterwatch/.TvActivity
```

Replace `TV_SERIAL` with the connected TV's entry in `adb devices -l`. Network ADB requires enabling the TV's developer/debugging options and accepting its authorization prompt. Do not enable or expose debugging on the internet.

Install [Tailscale for Android TV](https://tailscale.com/docs/install/android) and connect to the same tailnet as the server. Better Watch defaults to the existing private HTTPS server. The Server action in the sidebar changes the address. The server and HDD must be available; the main Mac can remain off. The TV does not need a separate profile or server deployment.

## Remote controls

| Screen | Remote behavior |
| --- | --- |
| Library | D-pad moves the coral focus outline. OK opens film details. Back returns focus to collections; Back again exits. |
| Details | Play or Resume, Play from start when available, Favorite, Watch Later, and Watched. Back returns to the selected film. |
| Search/server input | OK edits with the system keyboard. Keyboard Done submits. Down moves from the text field to the action button. |
| Playing, controls hidden | OK/up/down reveals controls. Left/right seeks five seconds. |
| Playing, controls visible | D-pad selects play/pause, five-second buttons, Info, and Audio / CC. Focus the timeline and press left/right to seek five seconds. |
| Media buttons | Play, pause, play/pause, rewind, and fast-forward work when provided by the remote. |
| Description | Info opens a panel on the right. Up selects its scrollable text; up/down scrolls. Close or Back returns to the player. |
| Back from playback | Close an open panel first, then hide controls, then return to the library. During a playback error, Back returns directly to the library. |

Controls hide after four seconds while playing. They do not auto-hide when paused, preparing, or displaying an error. Leaving the app pauses playback. Film browsing loads still covers; moving focus does not start additional preview streams. Text subtitles and alternate audio use the same compatibility endpoints as the phone app. Image-based subtitles remain unsupported by this player.

## Local native UI integration checks

Start the isolated fixture from the repository root in a separate terminal:

```sh
PATH="$HOME/.local/share/better-watch-media/bin:$PATH" node scripts/mobile-fixture.js
```

Then, from `apps/android`:

```sh
source ./asahi-env.sh
./gradlew testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug
```

`TvNavigationTest` launches the actual TvActivity with TV dimensions and no touchscreen under Robolectric. It sends D-pad events through Compose and uses the real fixture HTTP/profile API. It covers browsing, details, favorite writes, focus restoration, grid/sidebar scrolling, exiting with Back, search including empty results, sort, categories, and reaching the actual player's description and audio/subtitle controls. `TvControlsTest` covers play/pause actions, exact five-second timeline steps, missing descriptions, and scrolling long descriptions. `PhoneLibraryTest` checks that shared filtering still works in the phone interface.

These use Robolectric's legacy graphics mode on Linux ARM64. They **do not validate video decoding, rendered TV screenshots, system keyboard behavior, or physical remote events**. Google does not support the standard Android Emulator on Linux ARM hosts. Local checks are not a substitute for the device suite below.

## Physical-device E2E

With the synthetic fixture running, build and install both APKs on a connected TV:

```sh
source ./asahi-env.sh
./gradlew assembleDebug assembleDebugAndroidTest
adb -s TV_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
adb -s TV_SERIAL install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s TV_SERIAL reverse tcp:3399 tcp:3399
adb -s TV_SERIAL shell am instrument -w -r \
  -e server http://127.0.0.1:3399 \
  -e class local.kego.betterwatch.TvDeviceTest \
  local.kego.betterwatch.test/androidx.test.runner.AndroidJUnitRunner
```

The suite checks the fixture identity before changing any marks. It injects Android key events, checks focus and persisted favorites, plays both direct MP4 and HLS, waits for the first rendered video frame, checks advancing playback, hidden controls, five-second seeking, description and audio/subtitle panels, and reopening playback at the saved position. Its teardown restores the original server preference. TV screenshots are written under the app's external files directory. An Android phone can exercise this TV activity with the extra explicit argument `-e tv true`, but that does not certify a TV's decoder or remote.

After collecting the test result and screenshots:

```sh
adb -s TV_SERIAL reverse --remove tcp:3399
adb -s TV_SERIAL uninstall local.kego.betterwatch.test
```

Stop the fixture with Ctrl-C, which removes its generated media and test profile. Reopen Better Watch to reconnect to the real server. Separately verify real Tailscale playback on the TCL, preserving any tested film's resume position; never automate personal-library marks.

## Verification status

See [VERIFICATION.md](VERIFICATION.md). A successful APK build or local UI test is not evidence of physical TV E2E.
