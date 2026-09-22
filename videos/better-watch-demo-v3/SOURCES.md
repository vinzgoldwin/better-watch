# Demo copy and asset sources

Reviewed 2026-09-22. These are concept illustrations, not a recording of connected physical devices.

## Network copy

Revised on-screen local claim: “Same home Wi-Fi” plus “No internet data used for movies.” The house diagram depicts a direct Wi-Fi path from the home server to the device. This statement concerns movie data on that local path; it does not imply zero local bandwidth, zero internet control traffic, or that a direct local path is always possible. “Strong Wi-Fi helps avoid buffering” states a benefit without guaranteeing uninterrupted playback. Network conditions, file bitrate and device/server performance can still cause pauses.

Official Tailscale sources:

- [Connection types](https://tailscale.com/docs/reference/connection-types): distinguishes direct UDP paths, DERP relays and peer relays; describes connection negotiation and relay fallback. Direct connections are not guaranteed.
- [Traffic routing](https://tailscale.com/docs/concepts/traffic-routing-through-tailscale): describes shortest-path routing and relays when direct connectivity cannot be established.
- [Control and data planes](https://tailscale.com/kb/1508/control-data-planes): separates connection coordination from actual device traffic.
- [AWS networking guide](https://tailscale.com/docs/install/cloud/aws): explicitly explains that devices maintain coordination-server connections for metadata, separate from the data plane.

The local-streaming benefit is the network-topology inference from those documents: when the video takes a direct path between devices on the home LAN, that path stays on the LAN. The remote-streaming upload/download wording likewise describes data crossing the home and remote internet links. No live packet-path measurement was made. The diagram does not claim all traffic travels locally or that all connections are direct.

## Repository evidence

- `CROSS_PLATFORM.md`: native platforms, shared personal-library state, server contract, and native iPad source location.
- `apps/mac/Sources/BetterWatch/Views.swift`: Mac navigation, search/filtering and landscape-cover grid.
- `apps/ipad/Sources/App.swift`: iPad navigation split view, search and adaptive grid.
- `apps/android/app/src/main/java/local/kego/betterwatch/MainActivity.kt`: phone menu, search and two-column compact grid.
- `apps/tv/src/main/java/local/kego/betterwatch/TvActivity.kt`: four-column grid, sidebar, coral focus, selected-film description.
- `apps/tv/VERIFICATION.md`: physical TV installation/playback/remote/Tailscale verification is still incomplete.
- `apps/tv/DESIGN.html`: approved TV layout A and synthetic film-cover direction.
- `videos/better-watch-demo-v3/BRIEF.md`: intended round-the-clock server use, reused computer and external HDD.

The wording “Set it up for day-and-night access” or “Set up for 24/7 access” describes the intended setup, not measured uptime.

## Assets and music

- Folded Play Ribbon: exact transparent master from `assets/branding/folded-play-ribbon.png`. Existing project branding; repository notes identify it as generated and approved by the user. No replacement logo.
- Film titles and cover artwork: synthetic names and simple vector landscapes consistent with the approved mockup, regenerated locally by `build-storyboards.py`. No personal films or private data.
- Device shells: original vector illustrations authored for this storyboard.
- Font: Nimbus Sans Regular and Bold, embedded locally in the composition. Original font license notices and upstream Type 1 sources are included in `project/licenses/`.
- Music: **Home Library**, an original procedural instrumental score created for this video at 100 BPM in D major. The synthesizer and score are included in `project/scripts/compose-music.py` and `project/assets/music-score.json`. No third-party music or samples. Task-created music and generator are dedicated under CC0 1.0 to the extent rights exist; see `project/licenses/ASSETS.md`.
