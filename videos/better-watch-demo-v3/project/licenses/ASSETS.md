# Sources and rights

## Original music

Title: **Home Library**. Created for this Better Watch demo by the included `scripts/compose-music.py`. It is an original procedural instrumental score at 100 BPM in D major: synthesized electric keys, pad, bass, kick and brush percussion. All sounds are generated mathematically; no recordings, samples, melodies or stock music were imported.

Source: the included generator and `assets/music-score.json`. Recording: `assets/home-library.wav`, stereo PCM, 48 kHz, 16-bit, 43 seconds.

The task-created music, score, synthesizer code and original device/vector artwork are dedicated under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) to the extent any rights exist. They may be used, edited and redistributed without attribution. This dedication does not apply to the existing logo, fonts, GSAP or HyperFrames.

## Better Watch identity and film artwork

The Folded Play Ribbon is the existing, user-approved transparent master from the Better Watch repository, used unchanged. The repository's branding notes identify it as AI-generated artwork. This project does not grant independent trademark rights to the Better Watch identity.

The library uses synthetic titles and simple landscape illustrations based on the approved TV storyboard. Device shells are original vector illustrations. There are no personal films, private endpoints, account names or hardware identifiers.

## Nimbus Sans

Unmodified Nimbus Sans Regular and Bold OTF files from the host's `urw-base35-fonts` package. Copyright and license details are retained in `NimbusSans-LICENSE.txt` and `NimbusSans-COPYING.txt`. The upstream Type 1 font sources are included under `nimbus-source/`.

Upstream: [Artifex URW Base35 fonts](https://github.com/ArtifexSoftware/urw-base35-fonts). Fonts are separate assets under their own license; the music dedication does not relicense them.

## GSAP and HyperFrames

GSAP 3.14.2 comes from the pinned npm package. `assets/gsap.min.js` retains its original copyright/license header. Use is governed by the [GSAP standard license](https://gsap.com/standard-license/). HyperFrames and its producer are npm dependencies, pinned to 0.8.60, distributed under their respective upstream licenses. Their dependency metadata is retained in package-lock.json.

## Network statements

The copy was checked against official [Tailscale connection types](https://tailscale.com/docs/reference/connection-types), [traffic routing](https://tailscale.com/docs/concepts/traffic-routing-through-tailscale) and [control/data plane](https://tailscale.com/kb/1508/control-data-planes) documentation. Local movie traffic staying on the home LAN is conditional on the depicted direct local path. It is a topology inference, not a measured packet trace. Tailscale negotiation and control traffic can still use the internet. Remote viewing crosses the home and remote internet links.
