# Cross-platform change map

The approved architecture is **native SwiftUI on Mac and iPad, and native Kotlin/Compose on Android phones and Google TV / Android TV**. Keep the mobile UI close to the Mac, adapting navigation and sizing to portrait, landscape, and compact screens. TV uses approved layout A: sidebar, four-column grid, and remote focus.

Canonical source and Android build/test host: `/home/kevin/Projects/better-watch` on M1 Asahi. Apple build host: `kego@100.99.243.29`, checkout `/Users/kego/Projects/better-watch`. Android source, SDK, signing key, builds, and USB tests stay on Asahi; do not sync `apps/android/` or `apps/tv/` to the Mac.

| Change | Shared implementation | Mac | iPad | Android |
| --- | --- | --- | --- | --- |
| Favorites, lists, progress | [SharedProfile](src/lib/shared-profile.js), `/api/profile` in [server.js](server.js) | [SharedLibrary.swift](apps/mac/Sources/BetterWatch/SharedLibrary.swift), [Store.swift](apps/mac/Sources/BetterWatch/Store.swift) | **Same SharedLibrary.swift source**, [MobileStore.swift](apps/ipad/Sources/MobileStore.swift) | [Library.kt](apps/android/app/src/main/java/local/kego/betterwatch/Library.kt) |
| Navigation, filtering, metadata | `/api/library`, stable movie IDs | [Models.swift](apps/mac/Sources/BetterWatch/Models.swift), [Views.swift](apps/mac/Sources/BetterWatch/Views.swift) | **Same Models.swift source**, [App.swift](apps/ipad/Sources/App.swift) | [Library.kt](apps/android/app/src/main/java/local/kego/betterwatch/Library.kt), [MainActivity.kt](apps/android/app/src/main/java/local/kego/betterwatch/MainActivity.kt) |
| Covers and Quick Look | Thumbnail and `/api/preview` endpoints | Views.swift | App.swift | MainActivity.kt |
| App icon | [Transparent ribbon master](assets/branding/folded-play-ribbon.png), [export script](scripts/build-icons.mjs) | apps/mac/Resources/AppIcon.icns | AppIcon asset catalog | Adaptive launcher icon and foreground |
| Playback | Range streams, [compatibility HLS and subtitles](src/lib/browser-playback.js) | [Playback.swift](apps/mac/Sources/BetterWatch/Playback.swift), mpv | [NativePlayback.swift](apps/ipad/Sources/NativePlayback.swift), AVPlayer | [Playback.kt](apps/android/app/src/main/java/local/kego/betterwatch/Playback.kt), Media3 |
| Availability | [systemd socket](scripts/remote/better-watch.socket), private Tailscale HTTPS | SSH tunnel; disconnect never stops server | Tailscale on device | Tailscale on device |

The iPad [XcodeGen project](apps/ipad/project.yml) directly references the Mac model and sync files. They are not copied or forked. Android shares the server contract rather than Swift source. Existing React companion code remains in `src/`; it is not the mobile app implementation.

## TV implementation

Platform source lives in `apps/mac/`, `apps/ipad/`, `apps/android/`, and `apps/tv/`. Android's Gradle app includes TV's source, resources, unit tests, and device tests through source sets. Keep the shared Android manifest and dependencies in `apps/android/app/`.

Phone and TV ship in **one Android APK**. The TV launcher opens [TvActivity.kt](apps/tv/src/main/java/local/kego/betterwatch/TvActivity.kt); the phone launcher opens MainActivity. Both directly use LibraryModel, `rememberFilteredMovies`, and PlaybackSession. The Android column above applies to both, with TV-specific navigation, film details, playback controls, and remote dialogs in TvActivity. No separate server or profile exists for TV.

Shared server or Android playback/sync changes therefore reach TV as well. UI changes must be applied to both native Android interfaces where relevant, rebuilt, and installed. TV has still film details instead of automatic Quick Look previews, avoiding remote-focus-triggered streaming. Its launcher banner uses the same approved icon, packaged by [build-tv-banner.mjs](scripts/build-tv-banner.mjs).

See [TV instructions](apps/tv/README.md) for controls, installation, local native UI tests, and the physical-device suite. Keep the distinction between local Robolectric integration checks and actual decoder/device E2E results explicit.

## Drive sleep and wake

All apps fetch `GET /api/library` during Connect/foreground reconnect. On Fedora this explicitly wakes the HDD before returning the cached library. No client rebuild is needed for this contract. The root idle monitor requests standby after 10 minutes without I/O or server activity. Scanning and changed playback-position reports protect buffered playback; unchanged paused positions and SSE heartbeats do not reset idle. The server stores activity on the internal runtime filesystem. See [installation and physical verification](scripts/remote/README.md#drive-power-verification).

## Shared contract

- `GET /api/profile`: `{ marks, positions, artistMarks }`.
- `GET /api/profile/events`: SSE. Initial/reconnect snapshot: `{ type: "snapshot", marks, positions, artistMarks }`. Delta: `{ type, id, value }`. Heartbeats touch no HDD files.
- `POST /api/profile/marks/:id`: only changed boolean fields (`favorite`, `watchLater`, `watched`), not a stale full profile.
- `POST /api/profile/positions/:id`: `{ seconds, duration }`, finite values, `0 <= seconds <= duration`, positive duration. Completion saves zero. Resume below five seconds or within ten seconds of the end starts from zero.
- `POST /api/profile/import`: `{ data: { marks?, positions?, artistMarks? }, overwrite?: boolean }`. Migration fills missing IDs by default. False tombstones prevent stale imports resurrecting removed marks.
- Artist favorites currently belong to the existing web companion, stored in the same profile. Native apps support artist browsing.
- `GET /api/playback/:id?audio=<stream index>`: `{ duration, audio, direct, hls, audioTracks, subtitles, subtitleNotice }`. Audio selection is a server stream index. Text subtitle URLs return WebVTT.

Server writes are atomic and serialized. Mark patches preserve simultaneous changes to different fields. Last received playback position wins. Offline synchronization is not implemented.

## Shipping a change

1. Edit the canonical checkout. Check every affected native column above when changing user-facing behavior. Update companion React behavior when applicable.
2. Run focused Node/media tests. Build tracked web assets with `npm run build` when changing React.
3. For server code, restart `systemctl --user restart better-watch.service` when no one is playing a film.
4. Build and test Android locally on Asahi using the [Android instructions](apps/android/README.md). For Apple changes only, check the Mac build copy for unrelated changes before syncing affected Swift files. Follow the [Mac](apps/mac/README.md) and [iPad](apps/ipad/README.md) instructions.
5. Run the affected native UI tests, including portrait/landscape and playback. Reinstall changed native binaries. Server updates alone do not change compiled UI.
6. Keep this map and app READMEs current. Keep the map in the Mac build copy so future tasks started there can find all platforms.
