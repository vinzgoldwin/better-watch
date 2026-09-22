# Better Watch

The approved A direction: a 43-second, 1920 × 1080, 30 fps product demo with an original instrumental score and no voiceover.

The HTML composition and all media are local. HyperFrames 0.8.60, its producer and GSAP 3.14.2 are pinned in package-lock.json. No product server, personal library, or network connection is required to render.

## Edit and render

Requires Node.js 22+, FFmpeg/FFprobe and Chromium. On Asahi, the existing FFmpeg tools are in `$HOME/.local/share/better-watch-media/bin`; add that directory to PATH before running the commands below.

```sh
npm ci
npm run check
npm run render -- --quality high --fps 30 --workers 2 --strict-all --output renders/better-watch-demo.mp4
```

To edit in HyperFrames Studio, run `npx hyperframes preview --background`, then use the Studio project URL printed by the CLI. Stop it with `npx hyperframes preview --stop` when finished.

- `index.html` is the editable composition: SVG illustration layers, native screen mockups, local media, and one paused, deterministic GSAP timeline.
- `DESIGN.md` records the approved palette, visual direction and motion constraints.
- `scene-map.json` gives exact boundaries, including the device close-ups inside narrative scene 3.
- `assets/home-library.wav` is the original stereo soundtrack.
- `assets/music-score.json` records musical timing and note events.

The generation scripts are optional. Editing index.html directly is sufficient. To rebuild the composition from its drawing helpers, run `python3 scripts/build-composition.py`; this replaces index.html. To regenerate the music, install NumPy in your Python environment and run `python3 scripts/compose-music.py`.

## Verification

`qa/check.json` contains HyperFrames lint, runtime, layout and contrast results. `qa/animation-map/animation-map.json` contains the timeline map. The bundled animation-map script comes from the installed HyperFrames plugin, with one fix: it includes a finite tween's total duration, so repeated travelling markers are counted throughout their movement.

Use the accompanying VALIDATION.md for the final video and audio measurements and the scope of visual inspection.

The film library and devices are illustrative. TV follows the approved native layout, but the video is not evidence of a physical TV installation or playback test. The home Wi-Fi diagram depicts a direct local movie path. Remote streaming is labeled as home upload and remote download.

## Rights and sources

See `licenses/ASSETS.md` for the original music, project logo, synthetic artwork, fonts and GSAP. The original music generator and score are included. No commercial recording or third-party music samples are used.

## Pacing revision

The opening is 4 seconds, the reused-computer section 6 seconds, home Wi-Fi 6 seconds, and away-from-home viewing 7 seconds. The device showcase remains 14 seconds and the closing 6 seconds. The original instrumental score resolves into the new closing. Home Wi-Fi copy now reads “No internet data used for movies” and “Strong Wi-Fi helps avoid buffering.” The diagram depicts a direct home Wi-Fi movie path; buffering is not guaranteed absent.

## Alignment revision

The logo is centered on the front panel of every server drawing. The home Wi-Fi tablet and both HDDs have visible clearance above the house floor. Local and remote connection lines meet the left-edge midpoint of their tablets. The duration remains 43 seconds.
