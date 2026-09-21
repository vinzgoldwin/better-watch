# Better Watch on M1-asahi

Mac launcher: `~/Applications/Better Watch.app`.
Remote project: `/home/kevin/Projects/better-watch`.
The launcher starts the user service and opens an SSH tunnel from Mac localhost:3000 to remote localhost:3300. An enabled user socket listens on localhost:3300 and activates the service on demand, including when the Mac is off. The native app receives a seekable HTTP stream through its tunnel.

On Fedora 44, SELinux policy 44.9 or newer is required for SSH forwarding. This machine was updated to 44.9 while keeping enforcement enabled.

Run the prepared privileged installer once:

```sh
ssh -t asahi-codex 'sudo dnf install hdparm && sudo bash /home/kevin/Projects/better-watch/scripts/remote/install.sh'
```

The installer makes no partition-table changes and runs no disk repair tools.

It mounts the known ExFAT volume at `/Volumes/Ultra Touch`, retaining cached file paths and IDs. Media cache stays in `.better-watch-cache` on the HDD. Service logs use the internal system journal. Background indexing excludes `/Volumes`; SMART polling ignores this bridge because its power-state readings are unreliable. The system service `better-watch-idle` requests standby after 10 minutes without disk I/O or Better Watch work (checked every 15 seconds). It reads kernel counters, not SMART power-state queries. Connecting from any app wakes the drive through `/api/library` using one uncached, read-only block read. Scans and advancing playback progress keep it awake, including buffered playback. Paused progress and profile SSE heartbeats do not. The monitor remains active when the application server is stopped and survives reboot/reconnection.

System configuration backups: `/var/lib/better-watch/config-backups/`.
Media tools: `/home/kevin/.local/share/better-watch-media/bin/` (conda-forge FFmpeg).

Diagnostics:

```sh
ssh asahi-codex 'systemctl --user status better-watch.service --no-pager'
ssh asahi-codex 'journalctl --user -u better-watch.service -n 40 --no-pager'
```

Mobile clients use [Better Watch over Tailscale](https://m1-asahi.taila125ad.ts.net:8449/). This endpoint was added with `tailscale serve --bg --https=8449 http://127.0.0.1:3300`; existing Serve routes are unchanged. Systemd user lingering is enabled on this server so the user socket survives logout.

After installing this change, restart `better-watch.service` when nobody is playing a film so it loads the wake and activity integration. Installation alone does not restart an already running server.

The updated native app disconnects only itself. To take the disk offline, first finish playback on all devices, then stop **both** the socket and service before unmounting or unplugging:

```sh
systemctl --user stop better-watch.socket better-watch.service
```

Re-enable access with `systemctl --user start better-watch.socket`. An older Mac build may still stop the service; the socket remains available to start it on the next incoming request.

Shared lists and progress are stored at `~/.local/share/better-watch/profile.json` on the internal disk. `STATE_DIR` can override this location, particularly in tests. The service reads the cached library on startup and does not rescan periodically. See [the cross-platform change map](../../CROSS_PLATFORM.md).

## Drive power verification

The idle monitor uses `hdparm -y` (standby, which wakes on reads), never deep sleep `-Y`; see the [hdparm manual](https://man7.org/linux/man-pages/man8/hdparm.8.html). Only the known Seagate by-id device is targeted. A root-owned lock serializes explicit Connect wakes with standby requests. Activity timestamps live on the internal runtime filesystem and expire naturally if the server exits.

After privileged installation, verify one full idle interval, then Connect from Mac, iPad, and Android and verify library loading and playback. Keep an active scan or buffered playback running across the interval and check that standby is deferred. Use the synthetic fixture for automated playback tests, never personal marks. Because this USB bridge reports power state unreliably, a successful standby command is not proof the motor stopped: confirm physically. Inspect `journalctl -u better-watch-idle.service` for command errors.

Disable the policy with `sudo systemctl disable --now better-watch-idle.service`. This does not unmount or power off the drive.
