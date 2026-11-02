#!/usr/bin/python3
"""Mount or wake only the known Better Watch HDD. Never modify disk contents."""
import fcntl
import os
from pathlib import Path
import subprocess
import sys

DRIVE = '/dev/disk/by-id/usb-Seagate_Ultra_Touch_HDD_00000000NADD00NF-0:0'
PART = DRIVE + '-part2'
TARGET = '/Volumes/Ultra Touch'
MOUNT_UNIT = r'Volumes-Ultra\x20Touch.mount'

def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=45).stdout

def mount():
    if not Path(PART).exists():
        raise ValueError('Expected Ultra Touch drive is not connected')
    if run('/usr/bin/blkid', '-s', 'UUID', '-o', 'value', PART).strip() != '3027-844B':
        raise ValueError('Expected Ultra Touch volume is not connected')
    # Ignore the automount placeholder, but never accept a different filesystem.
    existing = subprocess.run(['/usr/bin/findmnt', '-rn', '-M', TARGET, '-t', 'noautofs', '-o', 'SOURCE'], capture_output=True, text=True)
    if existing.returncode == 0:
        if os.path.realpath(existing.stdout.strip()) != os.path.realpath(PART):
            raise ValueError('Mount location is occupied by another device')
    # Systemd owns mount/unmount and device removal, including between connects.
    run('/usr/bin/systemctl', 'start', MOUNT_UNIT)


def main():
    if sys.argv[1:] not in (['mount'], ['wake']):
        raise ValueError('Only the mount and wake operations are supported')
    with open('/run/better-watch-drive.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        mount()
        if sys.argv[1:] == ['wake']:
            # Read only: bypass the page cache so Connect physically wakes the HDD.
            run('/usr/bin/dd', 'if=' + DRIVE, 'of=/dev/null', 'bs=4096', 'count=1', 'iflag=direct', 'status=none')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
