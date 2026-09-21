# Better Watch icon

The approved icon is **Folded Play Ribbon**, shared by Mac, iPad, and Android. `folded-play-ribbon.png` is the original generated image with transparent alpha. Keep it as the single artwork source.

Run `PATH="$HOME/.local/share/better-watch-media/bin:$PATH" node scripts/build-icons.mjs` on Asahi to export the Mac ICNS, opaque iPad asset, and transparent Android adaptive foreground. The mobile background is `#151515`; Android's launcher applies its own shape. Sync only the Apple outputs to the Mac. Build and install each app to ship icon changes.

Generated using the built-in image generation tool. Approved prompt:

> Use case: logo-brand. Generate one polished app icon concept for Better Watch, a personal movie library app on macOS, iPad and Android. Concept 2: Cinema Ribbon. A single substantial folded coral ribbon forming a distinctive right-facing triangular play symbol, subtly evoking a film strip through two clean broad folds, no tiny perforations. Sculptural but restrained, satin coral #FFA397 transitioning to deeper coral along folded faces, precise beautifully rounded edges. Simple bold silhouette legible at 32px, premium native app craftsmanship. Centered single symbol occupying about 75% of square 1024x1024 canvas with clear margins. Genuine transparent alpha background with open negative space, no background tile or baked checkerboard, no text, letters, watermark, mockup, decorative objects or external shadow.

Platform references: [Apple asset catalogs](https://developer.apple.com/documentation/xcode/configuring-your-app-icon), [Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
