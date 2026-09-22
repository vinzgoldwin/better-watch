# Better Watch demo visual identity

Status: direction A approved by the user. Produce the 43-second screen-led composition, with the existing six-scene narrative and branding. No additional design selection is needed.

## Style Prompt

Show a personal movie library as something tangible: a reused computer, an external drive, and familiar native screens. Use Better Watch's charcoal canvas and sculptural coral folded play ribbon. Give the screen compositions room to read. Use purposeful movement to connect the same synthetic films across devices and explain where video traffic goes. Keep the exact brief order: introduction, home server and HDD, Tailscale and devices, direct home streaming, remote streaming, brand close.

## Colors

- Canvas: #18191B.
- App sidebar and hardware surfaces: #222325.
- Coral accent, focus and movie paths: #FFA397.
- Primary text: #F3F3F2.
- Secondary text: #B6B6BC.

Synthetic cover illustrations may use muted landscape colors, as in the approved TV reference. Hardware outlines may use intermediate neutral tones. Do not introduce a second interface accent.

## Typography

Use a single system sans family for continuity with the native apps. Static SVGs use Nimbus Sans, available on the Asahi host, with normal and bold weights. The final composition should embed that same font locally for deterministic rendering. Large display statements use 80 to 112 px at 1080p; essential explanations and device labels use 30 to 42 px. Native screen text keeps the app's relative hierarchy. Do not force every label in a wide device montage to be readable: pair wide establishing views with a close view of each featured screen in the animation.

## Direction A: Screen-led (recommended)

43 seconds. Large readable screens, restrained hardware silhouettes, and generous negative space. A screen appears before its connections. Library artwork carries visual interest. Primary transition: 0.55-second crossfade on related points. Accent transition: a 0.6-second scale match from a film cover to that film on another device. One warm instrumental bed around 100 BPM, soft keys, round bass, restrained percussion, and a resolved closing chord.

## Direction B: Connection-led

72 seconds. A continuous horizontal journey anchored to the home server. A coral path carries the viewer from storage to screens, stays inside the house for local streaming, then extends beyond it for remote viewing. More diagrammatic spacing and larger statements. Primary transition: a 0.5-second horizontal push; a gentle crossfade resolves the close. Sparse instrumental bed around 90 BPM with plucked notes marking device arrivals.

## Motion contract

After selection, use synchronous, paused, registered HyperFrames GSAP timelines. Build each static hero frame first. Each scene's elements enter; scene transitions handle departures. Only the closing may fade out. Use transform and opacity; no continuously repainting blur, shimmer, or pulse. No random or wall-clock animation. Draw connection paths as deterministic transforms/masks and show finite travelling markers. Holds are intentional reading time.

## Composition contract

1920 x 1080 landscape, 30 fps. Keep primary content at least 96 px from the edges. Device screens use the same synthetic titles and covers. TV has a sidebar, four columns, coral remote focus, and a selected-film description. Android phone uses a compact two-column grid. Mac and landscape iPad retain side navigation. Rendered footage is illustrative, not a recording of installed apps.

## What NOT to Do

- No new logo, em dashes, taglines, decorative cards, pills, or gray subtitle lines above sections.
- No template fireworks, neon, lens flares, shader noise, ambient pulsing, or background gradients.
- No personal films, private addresses, machine identifiers, accounts, or real library state.
- No zero-internet or guaranteed-direct-connection claim. Qualify local movie traffic with a direct local connection.
- No measured-uptime guarantee or suggestion that the physical TV has passed verification.

## Audio

No voiceover. Create an original instrumental bed after the direction is selected, keeping its score/generator and source/license record in the project. Do not download music with ambiguous reuse rights. Validate fades, duration and peak levels in the final mux, and distinguish numerical checks from actual listening.
