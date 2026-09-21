#!/bin/bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run this installer with sudo.' >&2; exit 1; }
[[ -x /usr/sbin/hdparm ]] || { echo "Install hdparm first: sudo dnf install hdparm" >&2; exit 1; }
ROOT=/home/kevin/Projects/better-watch
[[ -f "$ROOT/scripts/remote/drive.py" ]] || exit 1
/usr/bin/install -o root -g root -m 0755 "$ROOT/scripts/remote/drive.py" /usr/local/sbin/better-watch-drive
mkdir -p /var/lib/better-watch/config-backups
/usr/bin/python3 - <<'PY'
from pathlib import Path
import shutil
backup = Path('/var/lib/better-watch/config-backups')
# No periodic health queries for this USB bridge: its power-state reports are unreliable.
p = Path('/etc/smartmontools/smartd.conf')
line = '/dev/disk/by-id/usb-Seagate_Ultra_Touch_HDD_00000000NADD00NF-0:0 -d ignore'
if p.exists() and line not in p.read_text():
    if not (backup / 'smartd.conf').exists(): shutil.copy2(p, backup / 'smartd.conf')
    p.write_text('# Better Watch: leave this external drive asleep between sessions.\n' + line + '\n' + p.read_text())
p = Path('/etc/updatedb.conf')
if p.exists():
    text = p.read_text()
    if '/Volumes' not in text:
        if not (backup / 'updatedb.conf').exists(): shutil.copy2(p, backup / 'updatedb.conf')
        lines = text.splitlines()
        for i, line in enumerate(lines):
            if line.startswith('PRUNEPATHS = "'):
                lines[i] = line.rstrip('"') + ' /Volumes"'
                break
        else: raise RuntimeError('Unrecognized updatedb configuration')
        p.write_text('\n'.join(lines) + '\n')
PY
/usr/bin/systemctl try-reload-or-restart smartd.service
TASK_RULE=$(mktemp)
trap 'rm -f "$TASK_RULE"' EXIT
printf '%s\n' 'kevin ALL=(root) NOPASSWD: /usr/local/sbin/better-watch-drive mount, /usr/local/sbin/better-watch-drive wake' > "$TASK_RULE"
/usr/bin/visudo -cf "$TASK_RULE"
/usr/bin/install -o root -g root -m 0440 "$TASK_RULE" /etc/sudoers.d/better-watch-mount
/usr/local/sbin/better-watch-drive mount
/usr/bin/install -D -o kevin -g kevin -m 0644 "$ROOT/scripts/remote/better-watch.service" /home/kevin/.config/systemd/user/better-watch.service
/usr/bin/install -D -o kevin -g kevin -m 0644 "$ROOT/scripts/remote/better-watch.socket" /home/kevin/.config/systemd/user/better-watch.socket
/usr/bin/runuser -u kevin -- env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemctl --user daemon-reload
/usr/bin/runuser -u kevin -- env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/systemctl --user enable --now better-watch.socket

/usr/bin/install -o root -g root -m 0755 "$ROOT/scripts/remote/idle.py" /usr/local/sbin/better-watch-idle
/usr/bin/install -o root -g root -m 0644 "$ROOT/scripts/remote/better-watch-idle.service" /etc/systemd/system/better-watch-idle.service
/usr/bin/systemctl daemon-reload
/usr/bin/systemctl enable --now better-watch-idle.service
printf '%s\n' 'Better Watch installed. Restart the user service when playback is idle to activate drive wake protection.'
