#!/bin/bash
set -euo pipefail
SSH=/usr/bin/ssh
SOCKET="$HOME/.ssh/better-watch-tunnel"
# Reuse one tunnel; localhost:3000 preserves existing browser lists and settings.
"$SSH" -o BatchMode=yes -o ConnectTimeout=10 asahi-codex 'if [ ! -e /dev/disk/by-id/usb-Seagate_Ultra_Touch_HDD_00000000NADD00NF-0:0-part2 ]; then printf "Connect the Ultra Touch HDD to M1-asahi, then try again.\n" >&2; exit 1; fi; systemctl --user reset-failed better-watch.service; systemctl --user start better-watch.service'
if ! "$SSH" -S "$SOCKET" -O check asahi-codex >/dev/null 2>&1; then
  "$SSH" -M -S "$SOCKET" -fNT -o BatchMode=yes -o ConnectTimeout=10 \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -L 127.0.0.1:3000:127.0.0.1:3300 asahi-codex
fi
for attempt in {1..30}; do
  if /usr/bin/curl --noproxy '*' -fsS --max-time 2 http://localhost:3000/api/library/status >/dev/null 2>&1; then
    if [[ "${1:-}" != '--check' ]]; then /usr/bin/open http://localhost:3000; fi
    exit 0
  fi
  /bin/sleep 1
done
printf '%s\n' 'Better Watch did not become ready. Check that the HDD is connected to M1-asahi.' >&2
exit 1
