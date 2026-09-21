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

def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=45).stdout

def main():
    if sys.argv[1:] == ['wake']:
        if not Path(DRIVE).exists():
            raise ValueError('Expected Ultra Touch drive is not connected')
        with open('/run/better-watch-drive.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            # Read only: bypass the page cache so Connect physically wakes the HDD.
            run('/usr/bin/dd', 'if=' + DRIVE, 'of=/dev/null', 'bs=4096', 'count=1', 'iflag=direct', 'status=none')
        return
    if sys.argv[1:] != ['mount']:
        raise ValueError('Only the mount and wake operations are supported')
    if run('/usr/bin/blkid', '-s', 'UUID', '-o', 'value', PART).strip() != '3027-844B':
        raise ValueError('Expected Ultra Touch volume is not connected')
    existing = subprocess.run(['/usr/bin/findmnt', '-rn', '-M', TARGET, '-o', 'SOURCE'], capture_output=True, text=True)
    if existing.returncode == 0:
        if os.path.realpath(existing.stdout.strip()) != os.path.realpath(PART):
            raise ValueError('Mount location is occupied by another device')
        return
    target = Path(TARGET)
    if target.is_symlink() or (target.exists() and (target.stat().st_uid != 0 or any(target.iterdir()))):
        raise ValueError('Mount location is not a safe empty directory')
    target.mkdir(parents=True, exist_ok=True)
    run('/usr/bin/mount', '-t', 'exfat', '-o', 'uid=1000,gid=1000,umask=0077,noatime,nosuid,nodev,noexec', PART, TARGET)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
