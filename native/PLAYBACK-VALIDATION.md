# Integrated playback validation

Verified 2026-09-19 on this Mac, against the installed `~/Applications/Better Watch.app` and the M1-asahi library through the existing SSH tunnel. Existing uncommitted library/web changes were preserved.

## Installed behavior

- Netflix-style controls render over the film inside the SwiftUI app. The native browsing toolbar hides during playback. Controls disappear after three seconds of inactivity and return with input.
- Left/right keys seek five seconds. On a paused 23.976 fps source, positions were 12.387375 → 17.392375 → 12.387375 seconds, reflecting frame boundaries.
- Space, volume up/down, mute, fullscreen, Escape, track selection, and the description popover were exercised through native computer use. Films without a description omit the information button.
- An accessibility timeline test found and fixed an incorrect starting value. The installed correction adjusted 46.254542 → 69.527792 seconds, the slider's 10% increment from the current position. Native coordinate dragging was unavailable in the automation tool; the slider's exposed increment action exercised the editing path.
- Real MP4/H.264/AAC and MKV/VP9/AAC streams played with `hwdec-current=videotoolbox`. The sampled sessions reported zero dropped frames.
- A real external-subtitle film automatically loaded two matching English SRT versions and selected the first. Off and alternate-track selection were verified against engine state. Translated `.ja.whisperjav.english.srt` files are now recognized despite their source-language marker. Subtitle files are served by opaque IDs with root/realpath checks, ranges, and HEAD support.
- A generated MKV with two audio tracks and Japanese-default/English-secondary embedded subtitles selected English automatically; changing audio and disabling subtitles passed against the bundled engine. This was an engine integration test, separate from the native UI tests on real films.
- Starting full playback from Quick Look released the preview. Returning restored the same search/collection and focused film. A saved position of 113.738625 seconds was restored after quitting and reopening the app.
- Stop Library during playback released the player, stopped the remote service, and removed the tunnel. Quit/Cancel retained the player window. Normal launch and Reconnect restored the 2,545-film library.

## Responsiveness and drive activity

Test diagnostics sampled engine state every 250 ms and timestamped input using a monotonic clock. These measurements are upper bounds to observing advancing playback, not high-speed camera measurements of input-to-photon latency.

| Pause duration | Advancing playback observed after resume |
| --- | --- |
| 38.4 seconds | 221 ms |
| 220.7 seconds | 37 ms |
| 14.7 seconds | 108 ms |
| Additional short pauses | 288–291 ms |

During the long pause, multiple `/sys/block/sda/stat` snapshots remained identical: 5,001 completed reads, 2,060,827 sectors read, 227 writes, 12,515 sectors written. No periodic media reads or drive-power commands were used. The player held about 90 seconds ahead in RAM, resumed from that buffer, and replenished it without a reported buffering stall. The largest sampled packet cache among the real test sessions was 91.8 MiB. Configured forward/backward limits are 128/16 MiB, plus ordinary decoder, renderer, and network overhead.

This confirms a quiet disk-I/O interval, not physical spindle state. The USB bridge does not provide reliable motor-state evidence. A fresh unbuffered seek or opening another film may still wait for a cold HDD to wake. The original IINA 5–10 second delay was not reproduced in a controlled IINA comparison, so its precise cause remains unproven. The in-app buffering behavior was measured rather than assuming a UI replacement fixes network or drive latency.

Sampled full-player RSS was approximately 187–347 MiB over several playback/close cycles, including four consecutive films in one app process. Sampled CPU was approximately 17–19% during 1080p playback and 0.2–0.8% while paused with diagnostics enabled. These are point samples, not a long-running leak or worst-case codec benchmark. After stopping, there were no app TCP connections; the final normal-launch stopped app sampled about 158 MiB RSS and 0% CPU.

## Checks and delivery

- 10 Swift tests passed, covering existing browsing contracts plus resume boundaries, track metadata, and time formatting.
- Six focused Node tests passed across stream ranges, preview regressions, subtitle matching/path safety, and the subtitle HTTP API. A malformed test index fixture was corrected before the API test passed.
- `native/Integration/check-engine.sh` passed against the installed bundle using synthetic media only.
- `git diff --check` and deep/strict code-signature verification passed. Deployed server/subtitle modules matched local SHA-256 hashes.
- The app bundle is about 54 MB. Its 69 playback libraries are embedded; the installed app loaded no libraries from IINA. The build source is documented in `README.md`.
- Diagnostic logging was disabled by relaunching normally and checking the process environment. The app was left open with the library stopped so the drive can idle. No films were copied to the Mac, no film/library deletion or rescan was performed, and no drive-power settings were changed.
- The final 65-second stopped interval had zero additional read operations, read sectors, write operations, or write sectors on the HDD.

The libmpv render API uses macOS OpenGL, which is deprecated by Apple but functional on the tested system. Hardware decoding uses VideoToolbox; unsupported formats may fall back to software decoding.
