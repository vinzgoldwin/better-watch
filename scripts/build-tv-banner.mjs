// Package the approved ribbon and app name for the Android TV launcher.
// Run on Asahi with FFmpeg and fontconfig on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}apps/tv/src/main/res/drawable-xhdpi`;
mkdirSync(output, { recursive: true });
const font = execFileSync('fc-match', ['-f', '%{file}', 'sans:style=Bold'], { encoding: 'utf8' }).trim();
const escapedFont = font.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll(':', '\\:');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x151515:s=320x180',
  '-i', `${root}assets/branding/folded-play-ribbon.png`, '-filter_complex',
  `[1:v]scale=105:105:flags=lanczos[icon];[0:v][icon]overlay=18:37,drawtext=fontfile='${escapedFont}':text='Better':fontsize=32:fontcolor=white:x=134:y=51,drawtext=fontfile='${escapedFont}':text='Watch':fontsize=32:fontcolor=white:x=134:y=92,format=rgb24`,
  '-frames:v', '1', '-update', '1', `${output}/tv_banner.png`]);
