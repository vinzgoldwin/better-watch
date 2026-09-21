# Better Watch

Native movie apps for Mac, iPad, and Android, backed by one library on the M1 Asahi server’s external HDD.

- **Mac:** SwiftUI with the bundled mpv player. See [Mac setup](native/README.md).
- **iPad:** SwiftUI with AVPlayer. See [iPad setup](native/ios/README.md).
- **Android:** Kotlin, Jetpack Compose, and Media3. See [Android setup](mobile/android/README.md).

Install Tailscale on each device, sign into the same tailnet, and connect it. The mobile apps default to `https://m1-asahi.taila125ad.ts.net:8449`. The server and HDD must be available; the Mac can be off after installing the iPad app. The existing [web companion](https://m1-asahi.taila125ad.ts.net:8449/) remains available separately.

The mobile interfaces follow the Mac: saved lists, folders, landscape covers, Quick Look with three preview moments, and integrated playback. The player's info button opens the film description while playback continues. Compact screens use a navigation drawer/sidebar button. Portrait and landscape retain filters and playback.

## Shared library

Favorites, Watch Later, watched status, and playback positions live in `~/.local/share/better-watch/profile.json` on the server’s internal disk. Mac and existing browser data migrate once, filling missing records without replacing server values. Clients subscribe to small changes over SSE; playback updates do not redraw the movie grid.

Progress saves every 15 seconds while playing and on pause/exit. Concurrent playback of the same film uses the latest received save. Resume below five seconds or within ten seconds of completion starts from zero. Sync requires a connection; the Mac also keeps its existing local recovery files.

## Keep future changes connected

**Start with [CROSS_PLATFORM.md](CROSS_PLATFORM.md) when changing a feature.** This server checkout is the source of truth for the backend and all three native apps. Android builds and USB device tests run on Asahi. The Mac checkout is for Apple builds only.

Mac and iPad compile the same Swift model and sync source files. Android uses the same API contract. Shared backend changes reach every app; native UI changes require updating the affected implementations, rebuilding, and installing the new binaries. A source link cannot automatically replace an installed native app.

## Playback

Compatible H.264/AAC MP4 files stream directly at original quality. Other codecs, alternate audio, or direct-play failures use H.264/AAC HLS at up to 720p/30fps. The server encodes requested eight-second chunks through one worker, with a 64 MiB memory cache and no full-film conversion. Embedded text subtitles and matching external English subtitles are available as WebVTT. Image subtitles remain supported by the Mac player; mobile track menus explain the limitation.

## Server checks

```sh
npm ci
npm run build
PATH="$HOME/.local/share/better-watch-media/bin:$PATH" node --test src/lib/*.test.js tests/*.test.js
```

Media checks require FFmpeg/ffprobe. Native build and end-to-end commands are in each app’s README. See [server setup](scripts/remote/README.md) for systemd and Tailscale Serve. The enabled localhost socket starts the server on demand. Closing the Mac app only disconnects that client.
