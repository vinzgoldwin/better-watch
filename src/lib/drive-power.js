import { writeFile, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// One server contract for Mac, iPad, Android, and the web companion. The activity
// file lives in /run, never on the HDD. No drive commands run unless opted in.
export class DrivePower {
  constructor({ activityPath = process.env.DRIVE_ACTIVITY_PATH, wake = () => exec('/usr/bin/sudo', ['-n', '/usr/local/sbin/better-watch-drive', 'wake'], { timeout: 45000 }), scanning = () => false } = {}) {
    this.path = activityPath;
    this.wake = wake;
    this.scanning = scanning;
    this.active = 0;
    this.pending = Promise.resolve();
    this.waking = null;
  }

  async start() {
    if (!this.path) return;
    // Node hrtime and Python monotonic both use Linux CLOCK_MONOTONIC.
    await this.touch();
    this.timer = setInterval(() => {
      if (this.active || this.scanning()) this.touch().catch(error => console.error('Drive activity:', error));
    }, 15000);
    this.timer.unref();
  }

  touch() {
    if (!this.path) return Promise.resolve();
    this.pending = this.pending.catch(() => {}).then(async () => {
      await writeFile(this.path + '.tmp', String(Number(process.hrtime.bigint()) / 1e9));
      await rename(this.path + '.tmp', this.path);
    });
    return this.pending;
  }

  async connect() {
    if (!this.path) return;
    await this.touch();
    // Coalesce simultaneous connects; an uncached read guarantees physical wake.
    if (!this.waking) this.waking = this.wake().finally(() => { this.waking = null; });
    await this.waking;
    await this.touch();
  }

  async hold(response) {
    if (!this.path) return;
    this.active++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active--;
      this.touch().catch(error => console.error('Drive activity:', error));
    };
    response.once('close', release);
    response.once('finish', release);
    await this.touch();
  }

  close() { clearInterval(this.timer); }
}
