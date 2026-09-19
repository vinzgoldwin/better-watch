# Better Watch on M1-asahi

Mac launcher: `~/Applications/Better Watch.app`.
Remote project: `/home/kevin/Projects/better-watch`.
The launcher starts the user service and opens an SSH tunnel from Mac localhost:3000 to remote localhost:3300. The service is not enabled at login. Browser lists keep their existing origin. IINA receives a seekable HTTP stream through the tunnel.

On Fedora 44, SELinux policy 44.9 or newer is required for SSH forwarding. This machine was updated to 44.9 while keeping enforcement enabled.

Run the prepared privileged installer once:

```sh
ssh -t asahi-codex 'sudo bash /home/kevin/Projects/better-watch/scripts/remote/install.sh'
```

The installer makes no partition-table changes and runs no disk repair tools.

It mounts the known ExFAT volume at `/Volumes/Ultra Touch`, retaining cached file paths and IDs. Media cache stays in `.better-watch-cache` on the HDD. Service logs use the internal system journal. Background indexing excludes `/Volumes`; SMART polling ignores this bridge because its power-state readings are unreliable. No drive sleep timer is changed.

System configuration backups: `/var/lib/better-watch/config-backups/`.
Media tools: `/home/kevin/.local/share/better-watch-media/bin/` (conda-forge FFmpeg).

Diagnostics:

```sh
ssh asahi-codex 'systemctl --user status better-watch.service --no-pager'
ssh asahi-codex 'journalctl --user -u better-watch.service -n 40 --no-pager'
```

Stopping the service does not close IINA automatically. Close playback and stop the service before unmounting or unplugging the disk.
