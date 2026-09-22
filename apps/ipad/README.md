# Better Watch for iPad

Native SwiftUI interface and AVPlayer playback. Shares `Models.swift` and `SharedLibrary.swift` directly with the Mac app through `project.yml`. See the [cross-platform map](../../CROSS_PLATFORM.md) before editing shared behavior.

Tap the video or letterboxing to show controls. Double-tap the left or right half to seek backward or forward five seconds. Play/pause and five-second buttons have 44-point touch targets. The info button always opens the movie description, with a short fallback when metadata is absent.

## Build and install

Requires Xcode and XcodeGen on a Mac. Connect and trust the iPad, enable Developer Mode, and use an Apple Development signing identity.

```sh
cd apps/ipad
xcodegen generate
xcodebuild -project BetterWatchMobile.xcodeproj -scheme BetterWatchMobile \
  -destination 'id=YOUR_IPAD_UDID' -derivedDataPath .device-build \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID -allowProvisioningUpdates build
xcrun devicectl device install app --device YOUR_IPAD_UDID \
  '.device-build/Build/Products/Debug-iphoneos/Better Watch.app'
xcrun devicectl device process launch --device YOUR_IPAD_UDID local.kego.BetterWatch.mobile
```

If signing over SSH reports `errSecInternalComponent`, run the same build in the Mac’s normal Terminal session so macOS can request keychain access. Do not put keychain passwords in scripts or source files.

Install/open Tailscale on the iPad, sign into the server’s tailnet, approve the VPN configuration, and connect. Better Watch defaults to `https://m1-asahi.taila125ad.ts.net:8449`; change it in the sidebar’s Server screen if needed. USB and the Mac are not needed for streaming after installation. Reinstallation is required for native UI updates. Development provisioning expires according to the signing account/profile.

## End-to-end tests

Start the fixture from the repository root with `PATH="$HOME/.local/share/better-watch-media/bin:$PATH" node scripts/mobile-fixture.js`. It generates synthetic films and an isolated profile on the internal disk, then removes them when stopped.

Simulator tests use this server at `http://localhost:3399`. A reverse SSH forward (`ssh -N -R 127.0.0.1:3399:127.0.0.1:3399 kego@100.99.243.29`) exposes the Linux fixture server to the Mac simulator. They exercise Quick Look, favorites, search, HLS playback, seeking, resume, and opening the movie description during playback across rotation.

```sh
xcodebuild -project BetterWatchMobile.xcodeproj -scheme BetterWatchMobile \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' \
  -derivedDataPath .build CODE_SIGNING_ALLOWED=NO test
```

On a physical iPad the test target instead runs the real-library Tailscale check. It opens the first film, verifies advancing playback, pauses, double-taps both sides to seek five seconds, and opens/closes the description in portrait and landscape. It then returns to the library. The log prints `BW_TEST_MOVIE_ID` so the tested film's previous resume position can be restored from a profile snapshot. Use a test profile or preserve that position when testing the personal library. Leave the iPad untouched during automation.
