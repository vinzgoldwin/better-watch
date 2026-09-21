#!/usr/bin/python3
"""Sleep the known HDD after ten idle minutes, without polling its firmware."""
import fcntl
from pathlib import Path
import subprocess
import time

DRIVE = Path('/dev/disk/by-id/usb-Seagate_Ultra_Touch_HDD_00000000NADD00NF-0:0')
ACTIVITY = Path('/run/user/1000/better-watch-drive.activity')


class IdleTimer:
    def __init__(self, timeout=600):
        self.timeout = timeout
        self.previous = None
        self.last_active = None
        self.sleep_requested = False

    def update(self, now, counters, busy=False, activity=0):
        if counters is None:
            self.previous = None
            self.last_active = None
            self.sleep_requested = False
            return False
        # Include completed reads/writes and in-flight I/O, not time spent idle.
        changed = counters != self.previous
        self.previous = counters
        if changed or busy or self.last_active is None:
            self.last_active = now
            self.sleep_requested = False
        if self.last_active < activity <= now:
            self.last_active = activity
            self.sleep_requested = False
        if not self.sleep_requested and now - self.last_active >= self.timeout:
            self.sleep_requested = True
            return True
        return False


def snapshot():
    if not DRIVE.exists():
        return None, False, 0
    name = DRIVE.resolve().name
    fields = list(map(int, Path('/sys/class/block', name, 'stat').read_text().split()))
    # diskseq distinguishes a reconnected device even if Linux reuses its name.
    sequence = Path('/sys/class/block', name, 'diskseq').read_text().strip()
    counters = (sequence, fields[0], fields[2], fields[4], fields[6])
    try:
        # Server timestamps use this same machine's monotonic clock.
        activity = float(ACTIVITY.read_text())
    except FileNotFoundError:
        activity = 0
    return counters, bool(fields[8]), activity


def main():
    timer = IdleTimer()
    while True:
        try:
            counters, busy, activity = snapshot()
            if timer.update(time.monotonic(), counters, busy, activity):
                # Standby wakes on the next read; never use hdparm's deeper -Y sleep.
                with open('/run/better-watch-drive.lock', 'w') as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX)
                    latest, busy, latest_activity = snapshot()
                    if latest != counters or busy or latest_activity != activity:
                        timer.update(time.monotonic(), latest, busy, latest_activity)
                    else:
                        subprocess.run(['/usr/sbin/hdparm', '-y', str(DRIVE)], check=True, timeout=30)
                        print('Requested standby after 10 idle minutes', flush=True)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            # Retry only after another full idle period, never every polling tick.
            timer = IdleTimer()
            print(f'Drive idle monitor: {error}', flush=True)
        time.sleep(15)


if __name__ == '__main__':
    main()
