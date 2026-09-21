# Cross-platform change map

The approved architecture is **native SwiftUI on Mac and iPad, and native Kotlin/Compose on Android**. Keep the mobile UI close to the Mac, adapting navigation and sizing to portrait, landscape, and compact screens.

Canonical source and Android build/test host: `/home/kevin/Projects/better-watch` on M1 Asahi. Apple build host: `kego@100.99.243.29`, checkout `/Users/kego/Projects/better-watch`. Android source, SDK, signing key, builds, and USB tests stay on Asahi; do not sync `mobile/android` to the Mac.

| Change | Shared implementation | Mac | iPad | Android |
| --- | --- | --- | --- | --- |
| Favorites, lists, progress | [SharedProfile](src/lib/shared-profile.js), `/api/profile` in [server.js](server.js) | [SharedLibrary.swift](native/Sources/BetterWatch/SharedLibrary.swift), [Store.swift](native/Sources/BetterWatch/Store.swift) | **Same SharedLibrary.swift source**, [MobileStore.swift](native/ios/Sources/MobileStore.swift) | [Library.kt](mobile/android/app/src/main/java/local/kego/betterwatch/Library.kt) |
| Navigation, filtering, metadata | `/api/library`, stable movie IDs | [Models.swift](native/Sources/BetterWatch/Models.swift), [Views.swift](native/Sources/BetterWatch/Views.swift) | **Same Models.swift source**, [App.swift](native/ios/Sources/App.swift) | [Library.kt](mobile/android/app/src/main/java/local/kego/betterwatch/Library.kt), [MainActivity.kt](mobile/android/app/src/main/java/local/kego/betterwatch/MainActivity.kt) |
| Covers and Quick Look | Thumbnail and `/api/preview` endpoints | Views.swift | App.swift | MainActivity.kt |
| App icon | [Transparent ribbon master](assets/branding/folded-play-ribbon.png), [export script](scripts/build-icons.mjs) | native/Resources/AppIcon.icns | AppIcon asset catalog | Adaptive launcher icon and foreground |
| Playback | Range streams, [compatibility HLS and subtitles](src/lib/browser-playback.js) | [Playback.swift](native/Sources/BetterWatch/Playback.swift), mpv | [NativePlayback.swift](native/ios/Sources/NativePlayback.swift), AVPlayer | [Playback.kt](mobile/android/app/src/main/java/local/kego/betterwatch/Playback.kt), Media3 |
| Availability | [systemd socket](scripts/remote/better-watch.socket), private Tailscale HTTPS | SSH tunnel; disconnect never stops server | Tailscale on device | Tailscale on device |

The iPad [XcodeGen project](native/ios/project.yml) directly references the Mac model and sync files. They are not copied or forked. Android shares the server contract rather than Swift source. Existing React companion code remains in `src/`; it is not the mobile app implementation.

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
4. Build and test Android locally on Asahi using the [Android instructions](mobile/android/README.md). For Apple changes only, check the Mac build copy for unrelated changes before syncing affected Swift files. Follow the [Mac](native/README.md) and [iPad](native/ios/README.md) instructions.
5. Run the affected native UI tests, including portrait/landscape and playback. Reinstall changed native binaries. Server updates alone do not change compiled UI.
6. Keep this map and app READMEs current. Keep the map in the Mac build copy so future tasks started there can find all platforms.
