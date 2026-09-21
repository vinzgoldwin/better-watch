# Better Watch for Mac

Native SwiftUI client for the existing M1-asahi library. The installed app is at `~/Applications/Better Watch.app`. Opening it starts the library over the existing SSH/Tailscale connection. No Terminal command is needed.

## Use

- Click a film to open centered Quick Look. The first preview plays once with sound at 40%. Left/right arrows change the three preview moments; Escape returns focus to the same film in the grid. Arrow keys move between cards and Space opens Quick Look. Replay is explicit.
- Use the sidebar for collections, saved lists, and artists. Subfolders, category multiselect, search, and all seven original sorts are available. The grid scrolls continuously.
- Full films play inside the app with libmpv. The player uses a Netflix-style overlay: a full-width timeline, playback/volume at left, title in the middle, and audio/subtitles and fullscreen at right. Video extends behind the transparent window toolbar, with the native window controls available (move the pointer to the top in fullscreen). The back arrow returns to the same grid position and filters without leaving fullscreen.
- Left/right arrows seek exactly 5 seconds; Space pauses/resumes; up/down adjust volume; M mutes; F toggles fullscreen. Escape leaves fullscreen first, then returns to the library. Double-click the picture for fullscreen.
- Controls and cursor hide after 3 seconds of inactivity, including while paused. Pointer movement or a playback key reveals them. Open description/track popovers stay visible. The information button appears only when the film has a description.
- Embedded English subtitle tracks are preferred automatically. Matching external English subtitles are loaded from the movie directory and the existing `jav/sub*` and `hrine/sub*` catalogs. The track menu selects audio, alternate subtitles, or Off. A badge can also mean burned-in subtitles, which cannot be toggled.
- Playback positions are synced to the server and also saved locally in `~/Library/Application Support/Better Watch/resume.json`, every 15 seconds and on exit/pause. Films within 10 seconds of the end restart from the beginning. Volume is remembered.
- Disconnect ends playback and the SSH tunnel on this Mac. Quit and the red close button flush progress and disconnect without stopping the server or interrupting other devices.
- When all clients stop reading, the HDD can follow its existing automatic idle behavior. It does not force power off, unmount, or claim to sense the motor. There is no idle library polling, scheduled scan, or SMART polling added by this app.
- Library Tools includes reconnect, scoped rescan, sidecar cleanup, and list import. Deletion is available in a film's context menu with an explicit confirmation.

## Shared lists and progress

See [the cross-platform change map](../CROSS_PLATFORM.md) for the linked server, Mac, and mobile implementations. The server profile lives on its internal disk, and SSE delivers small updates without polling media files.

## Existing browser lists

Mac and browser movie lists now share the server profile. Each client imports its previous local lists once, filling only IDs not already on the server. The Mac also migrates local playback positions. Explicit **Library Tools → Import Movie Lists** imports are saved to the shared profile. Artist favorites remain a web-only UI feature.

A local recovery copy of native lists is stored in `~/Library/Application Support/Better Watch/marks.json`. Media and generated preview/cover files remain on the remote HDD. The app's URLSession is ephemeral with no disk cache; decoded covers use a 48 MiB / 160-image memory cache, and offscreen image views release their images. Only the open Quick Look owns a preview player. Full playback owns one libmpv engine, and starting it releases the Quick Look AVPlayer. No webview or Electron runtime is bundled. libmpv uses VideoToolbox when supported, with a software fallback for unsupported codecs. Its forward/backward packet caches are capped at 128/16 MiB and forward read-ahead at 90 seconds. It never caches films to the Mac disk, and paused playback stops drive reads once its bounded buffer fills. No periodic keep-awake reads are added. Display/system sleep prevention applies only during active playback and is released on pause or exit.

## Build and check

Requires Xcode / Swift 6 and macOS 14 or later. This installation was built with Swift 6.3.2 / Xcode 26.5.

```sh
native/build-app.sh
swift test --package-path native -c release
node --test src/lib/stream-file.test.js src/lib/playback-subtitles.test.js tests/preview.test.js tests/playback.test.js
native/Integration/check-engine.sh
```

The build uses the installed IINA libmpv libraries by default, or `MPV_LIBRARY_DIR` pointing to another compatible library directory. The official mpv v0.38 API headers are vendored with their license notices. `bundle-mpv.py` copies the current architecture and complete dependency closure, rewrites runtime paths, and signs every library. The installed app has no runtime dependency on IINA or Homebrew. The libmpv render API uses macOS OpenGL, which Apple has deprecated but still supports; this path supports VideoToolbox decoding.

The build script creates and ad-hoc signs `native/.build/Better Watch.app`. Quit the installed app before copying a new build to `~/Applications/Better Watch.app` with `ditto`. The original launcher was preserved at `~/Library/Application Support/Better Watch/Previous Launcher.app`.

The bundled launcher uses `ssh asahi-codex`, the socket-activated systemd service, and the localhost:3000 tunnel. No additional root permission or disk-power setting is needed. The remote server needs this revision's byte-range support for `/previews/` because AVPlayer probes those URLs with range requests.

## Prior library validation

The real 2,545-film library was used for native visual and interaction checks: collection navigation, category filtering, release-date sorting, first/next/wrapped preview moments, 40% volume, one-shot playback, IINA handoff, shutdown and relaunch, and traversing to the end of both the 770-film collection and the full library. No real video was deleted and no rescan or sidecar cleanup was run just for testing.

Automated checks cover nested folder boundaries, combined filters, category OR matching, missing release dates, partial browser-list imports, short previews, 10,000-film filtering/sorting, and AVPlayer's HTTP range/HEAD requirements. A shuffled 10,000-film query took about 43 ms in a release-build test on this Mac; queries run off the main actor and typing is debounced.

Observed app RSS was roughly 160–280 MB over browsing/preview checks. A process sample after full-library traversal reported a 255 MB physical footprint with a 351 MB peak. These are local samples, not a fixed memory guarantee or a frame-rate benchmark. Cached idle samples reached 0% CPU. These measurements predate the integrated player. The current app bundle is about 54 MB; playback validation is in `PLAYBACK-VALIDATION.md`.

The final Stop Library check confirmed the user service inactive and the SSH control socket removed. The first 60 seconds had zero reads and one 512-byte write; the following 55-second interval had zero reads and zero writes. The app was left open in its stopped state. This verifies quiet disk I/O, not a motor-state sensor reading.

## Playback diagnostics

For explicit testing, launch with `open --env BW_PLAYBACK_DIAGNOSTICS=/tmp/bw-playback.jsonl ~/Applications/Better\ Watch.app`. This appends timestamped engine state at 4 Hz only while a film is open. It includes track titles, cache size, hardware decoder, dropped frames, and command times. Ordinary launches do not log these diagnostics. Property sampling reads engine memory, not media or drive power state.

`Integration/engine-check.c` checks English embedded-track preference, audio switching, and subtitle disabling against the bundled engine using a generated MKV fixture. Real native UI tests are documented separately.
