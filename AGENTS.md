# Better Watch platforms

This checkout contains the shared server and native apps in `apps/mac/`, `apps/ipad/`, `apps/android/`, and `apps/tv/`. Read [CROSS_PLATFORM.md](CROSS_PLATFORM.md) before changing a feature that affects more than one app. Keep matching behavior and UI changes aligned across the affected native implementations.

Mac and iPad directly share Swift models and profile synchronization source. Android shares the server API contract. Native UI updates need rebuilding and installation; a server deployment does not update compiled interfaces.

Phone and TV use the same Android APK, LibraryModel, filtering, and PlaybackSession. Their interfaces are separate: MainActivity for phones, TvActivity for TV. Check both when changing Android behavior. TV verification must cover physical D-pad focus and playback; local Robolectric tests do not verify a TV decoder.

The canonical checkout is `/home/kevin/Projects/better-watch` on M1 Asahi. `/Users/kego/Projects/better-watch` on the main Mac is the Apple build copy. Android builds and USB device tests run locally on Asahi using `apps/android/asahi-env.sh`; keep both `apps/android/` and `apps/tv/` and Android tooling off the Mac. Check for unrelated changes before syncing files to it. Follow the platform READMEs for focused build and end-to-end checks. Use the isolated synthetic movie fixture for automated tests of lists and playback; do not change the personal library's marks for tests.
