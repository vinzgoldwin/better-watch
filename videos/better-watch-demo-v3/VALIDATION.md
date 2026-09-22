# Better Watch demo validation

Revised output: 43.000 seconds, 1920 × 1080, 30 fps, 1,290 decoded video frames. H.264 video in yuv420p with stereo AAC at 48 kHz. Rendered on Asahi with HyperFrames 0.8.60, high quality, screenshot capture and hardware GPU. The CLI upgrade probe confirmed the pinned version is current.

## Alignment fixes

Centered the logo on the front face of every movie/home server using the shared drawing helper. Added approximately 45 pixels below the local tablet, 52 pixels below the local HDD and 48 pixels below the remote HDD at 1080p. Both local and internet paths now reach the tablet's left edge at its vertical midpoint, and their travelling markers use the same endpoints. Duration, copy and music remain unchanged.

## Pacing changes

| Section | Previous | Revised |
| --- | ---: | ---: |
| Opening | 8 seconds | 4 seconds |
| Old computer. New purpose. | 12 seconds | 6 seconds |
| Same home Wi-Fi. | 12 seconds | 6 seconds |
| Away from home. Still your library. | 14 seconds | 7 seconds |

The native-device showcase remains 14 seconds and the closing remains 6 seconds. Scene starts, transitions, travelling movie-data markers and the original score were retimed together. The music now resolves under the closing at 37.8 seconds and fades out at 43 seconds.

Home Wi-Fi text now reads “No internet data used for movies.” and “Strong Wi-Fi helps avoid buffering.” The house diagram depicts a direct local movie path. The wording concerns internet movie data, not local Wi-Fi bandwidth or internet control traffic; it does not guarantee zero buffering. See SOURCES.md for the network reasoning and limitations.

## Composition checks

`npx hyperframes check --json` passed lint, runtime, layout and contrast with zero errors and zero warnings. Five informational findings concern brief text/device overlaps during dissolves. All 85 sampled contrast checks passed. No blanket layout-ignore annotation was added.

The animation map covered all 77 timeline entries over 43 seconds. No offscreen, invisible or degenerate-element flags. The 25 bounds-collision flags are expected scene crossfades, nested device drawings, the house and its contents, and branched connections. Two slow-motion flags describe the finite local and remote data markers. Remaining holds are in the unchanged device showcase and closing.

## Render inspection

Extracted 44 decoded frames and regenerated five contact sheets from the corrected MP4. Inspected the four affected scenes at full resolution (9.4, 22.5, 28 and 34 seconds), confirming centered logos, clear house-floor spacing and continuous line-to-device connections. Text remains readable. The first 0.2 seconds and final short tail are intentionally charcoal. All film titles/covers and device views are illustrative. The earlier pacing revision included a full contact-sheet review of the sequence.

## Audio checks

The final decoded stereo track is 43.0 seconds. Integrated loudness is −19.3 LUFS and true peak approximately −2.7 dBFS. Zero clipped decoded samples. The first quarter-second RMS is −43.7 dBFS; the final quarter-second is −86.1 dBFS. Numerical fade and clipping checks passed.

The included original Home Library synthesizer and score were regenerated for this duration. No imported music samples or third-party recording was used.

## Limits

Continuous real-time playback and auditory listening were not performed. Numerical audio checks do not replace listening. No physical TV, phone, iPad or Mac app was tested, and no network throughput or packet routing was measured. TV hardware playback and Tailscale remain unverified as recorded by the product repository.

## Evidence

- `project/scene-map.json`: exact revised scene boundaries.
- `project/qa/check.json`: lint, runtime, layout and contrast results.
- `project/qa/animation-map/animation-map.json`: motion timing and geometry.
- `project/qa/ffprobe.json`: decoded frame count, duration and codecs.
- `project/qa/audio-summary.json` and `audio-final.log`: levels, fades and clipping.
- `project/qa/rendered-frame-times.json`: 44 extracted timestamps.
- `project/qa/rendered-audit-*.png`: inspected contact sheets kept in the original local review directory; regenerate with the included verification scripts.

Previous deliveries remain in the local `outputs/hyperframes-demo/revisions/` directory and are not included in Git. Older standalone preview snapshots in the unpacked QA directory belong to that original cut; the current evidence is listed above.

Only demo artifacts changed. Existing product edits were preserved. No production-library writes, server restart, native builds, commit, PR or video publication occurred.
