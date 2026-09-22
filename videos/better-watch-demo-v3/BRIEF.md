# Better Watch product demo

## Request

Create a polished video demo using the installed **HyperFrames by HeyGen** plugin, with music. Work in the existing `/home/kevin/Projects/better-watch` checkout on M1 Asahi. This brief is prepared for a separate Codex task; that task has not yet been created or started.

Keep this exact narrative order:

1. Opening: introduce Better Watch with its folded play ribbon logo and a glimpse of the movie library.
2. Repurpose an old computer as a movie server available around the clock, with an external HDD holding the library.
3. Show Tailscale connecting the server, Android phone, iPad, Mac, and Google TV / Android TV. Show the same personal library across devices.
4. Explain that direct viewing on the same home Wi-Fi keeps movie traffic on the local network.
5. Show remote viewing when away from home, with the server still available at home.
6. Close on Better Watch and the folded play ribbon logo.

The user's wording for scene 4 was “no internet use with same wifi connection.” Express the underlying benefit accurately: local video streaming can avoid internet video traffic when the connection is direct. Do not promise zero network bandwidth, zero Tailscale control traffic, or that all Tailscale connections always stay local. Remote streaming uses internet upload and download. Verify these technical statements against official Tailscale documentation before finalizing copy.

## Creative direction

Suggested starting format: 60–75 seconds, landscape 1920×1080, with a cohesive instrumental music bed, purposeful transitions, and concise on-screen text. These are defaults, not user-imposed duration or format requirements. Voiceover was not requested.

Use Better Watch's established dark interface, coral accents, and transparent folded play ribbon. Let large device compositions, the movie library, and animated connection paths explain the product. Keep device screens readable. Favor deliberate, polished motion over template effects. Use licensed or original music and record its source and license.

Follow AGENTS.md, including the static design review gate for a substantial new visual direction: use the html-communication skill to present distinct storyboard/style options and wait for the user's pick before full video production. The user previously selected option A for the TV app layout; that approves the TV UI reference, not a new video storyboard. Build on the existing app branding and do not ask again which logo to use.

Read and apply the HyperFrames main and CLI skills and their required typography, transitions, and house-style references. Establish DESIGN.md before composition HTML. Keep animation deterministic and renderable through the HyperFrames timeline.

## Existing assets and references

- Brand master: `assets/branding/folded-play-ribbon.png`.
- Brand notes: `assets/branding/README.md`.
- Approved TV layout: option A in `outputs/tv-app-options.html`.
- App architecture and feature map: `CROSS_PLATFORM.md`.
- Actual native implementations: `native/`, `mobile/ios/`, and `mobile/android/` (confirm paths in the checkout).
- TV status and verification: `mobile/android/TV.md` and `mobile/android/TV-VERIFICATION.md`.
- Other UI references, if present: `outputs/native-macos-comparison.html`, `outputs/native-player-comparison.html`, `outputs/mobile-app-options.html`, and `outputs/movie-description-options.html`. Actual native implementation takes precedence over older mockups.
- Synthetic library fixture: `scripts/mobile-fixture.js`.

Palette starting points from the approved TV mock: background `#18191B`, sidebar `#222325`, coral `#FFA397`, secondary text `#B6B6BC`, and white primary text. Follow the user's preference for minimal copy, no decorative card or pill chrome, and no em dashes.

## Product facts and boundaries

Better Watch has native Mac, iPad, Android phone, and Google TV / Android TV interfaces sharing the server and personal-library state. Relevant features include browsing, search, favorites, Watch Later, watched state, playback resume, movie descriptions during playback, play/pause, five-second seeking, and TV remote navigation. Confirm any featured behavior in the repository before claiming it in the video.

The server runs on a repurposed M1 Asahi computer with an external HDD. Present round-the-clock availability as the setup's intended use, not as a measured uptime guarantee.

The Google TV app has been built and locally tested, but physical TCL TV installation, playback, remote-control behavior, and its Tailscale connection have not been verified. Recheck the verification document for newer evidence. Illustrative device mockups are fine; do not present them as recordings of a successful physical TV test.

Use synthetic movie titles, covers, and test media. Do not expose the user's personal movie library, private filenames, account information, device identifiers, or private network endpoints. A stylized network diagram should use device names, not real IP addresses.

## Delivery and verification

Deliver a rendered MP4 with music, the editable HyperFrames project, a contact sheet or preview, and concise validation notes. Keep sources and artifacts in a dedicated directory such as `outputs/hyperframes-demo/`.

Run the relevant HyperFrames lint, validation, inspection, and animation-map checks. Inspect actual rendered frames at all scene starts, key transitions, and the closing. Verify text readability, contrast, safe margins, device proportions, overlap, and animation timing. Use ffprobe to confirm duration, dimensions, video encoding, and a real audio track. Check music timing, fades, and clipping with available audio tools. Report any playback or listening check that could not be performed rather than claiming it passed.

Preserve existing uncommitted product changes. Do not alter production library marks or restart the movie server for the demo. Keep work on Asahi; the main Mac is reserved for Apple builds. No product code changes, commit, PR, or publishing is requested.
