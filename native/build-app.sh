#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
swift build --package-path "$ROOT/native" -c release
APP="$ROOT/native/.build/Better Watch.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/native/.build/release/BetterWatch" "$APP/Contents/MacOS/BetterWatch"
cp "$ROOT/scripts/remote/launch-mac.sh" "$APP/Contents/Resources/launch-mac.sh"
cp "$ROOT/native/Resources/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$ROOT/native/Resources/Playback-Libraries.txt" "$APP/Contents/Resources/"
cp "$ROOT/native/Resources/Playback-Distributor-Credits.rtf" "$APP/Contents/Resources/"
python3 "$ROOT/native/bundle-mpv.py" "$APP"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>BetterWatch</string>
<key>CFBundleIdentifier</key><string>local.kego.BetterWatch</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleName</key><string>Better Watch</string>
<key>CFBundleDisplayName</key><string>Better Watch</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>3.0</string>
<key>CFBundleVersion</key><string>3</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsForMedia</key><true/></dict>
<key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
/usr/bin/codesign --force --sign - "$APP"
/usr/bin/codesign --verify --strict "$APP"
printf '%s\n' "$APP"
