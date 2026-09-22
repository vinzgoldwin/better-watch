#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP="${1:-$ROOT/.build/Better Watch.app}"
FIXTURE=$(mktemp -d /tmp/better-watch-engine.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
cat > "$FIXTURE/english.srt" <<'EOF'
1
00:00:00,000 --> 00:01:00,000
English subtitle test
EOF
cat > "$FIXTURE/japanese.srt" <<'EOF'
1
00:00:00,000 --> 00:01:00,000
Japanese track test
EOF
ffmpeg -hide_banner -loglevel error -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=10' \
  -f lavfi -i 'sine=frequency=440:duration=10' -f lavfi -i 'sine=frequency=660:duration=10' \
  -i "$FIXTURE/japanese.srt" -i "$FIXTURE/english.srt" \
  -map 0:v -map 1:a -map 2:a -map 3 -map 4 -c:v libx264 -preset ultrafast -c:a aac -c:s srt \
  -metadata:s:a:0 language=jpn -metadata:s:a:1 language=eng \
  -metadata:s:s:0 language=jpn -metadata:s:s:1 language=eng \
  -disposition:s:0 default -disposition:s:1 0 "$FIXTURE/embedded.mkv"
clang -I "$ROOT/Sources/MPVKit/include" "$ROOT/Integration/engine-check.c" \
  -L "$APP/Contents/Frameworks" -lmpv.2 -Wl,-rpath,"$APP/Contents/Frameworks" -o "$FIXTURE/engine-check"
"$FIXTURE/engine-check" "$FIXTURE/embedded.mkv"
