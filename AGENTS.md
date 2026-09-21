# Better Watch platforms

This checkout contains the shared server and native apps for Mac, iPad, and Android. Read [CROSS_PLATFORM.md](CROSS_PLATFORM.md) before changing a feature that affects more than one app. Keep matching behavior and UI changes aligned across the affected native implementations.

Mac and iPad directly share Swift models and profile synchronization source. Android shares the server API contract. Native UI updates need rebuilding and installation; a server deployment does not update compiled interfaces.

The canonical checkout is `/home/kevin/Projects/better-watch` on M1 Asahi. `/Users/kego/Projects/better-watch` on the main Mac is the Apple build copy. Android builds and USB device tests run locally on Asahi using `mobile/android/asahi-env.sh`; keep Android files and tooling off the Mac. Check for unrelated changes before syncing files to it. Follow the platform READMEs for focused build and end-to-end checks. Use the isolated synthetic movie fixture for automated tests of lists and playback; do not change the personal library's marks for tests.
