// Export the approved artwork without redrawing it. Requires FFmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const master = join(root, 'assets/branding/folded-play-ribbon.png');
const temporary = mkdtempSync(join(tmpdir(), 'better-watch-icons-'));
function png(path, filter) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', master, '-vf', filter,
    '-frames:v', '1', '-update', '1', path]);
}
try {
  // Modern ICNS entries contain PNGs; macOS scales these for smaller displays.
  const entries = [[128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
    const path = join(temporary, `${size}.png`);
    png(path, `scale=${size}:${size}:flags=lanczos,format=rgba`);
    const data = readFileSync(path), header = Buffer.alloc(8);
    header.write(type); header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8); header.write('icns');
  header.writeUInt32BE(8 + entries.reduce((size, entry) => size + entry.length, 0), 4);
  writeFileSync(join(root, 'native/Resources/AppIcon.icns'), Buffer.concat([header, ...entries]));

  // The default iPad asset is opaque; the transparent master remains unchanged.
  png(join(root, 'native/ios/Sources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'),
    'scale=1024:1024:flags=lanczos,format=rgba,split[art][base];[base]drawbox=color=0x151515:t=fill:replace=1[bg];[bg][art]overlay=format=auto,format=rgb24');

  const android = join(root, 'mobile/android/app/src/main/res/drawable-nodpi');
  mkdirSync(android, { recursive: true });
  // Keep the ribbon inside the adaptive icon safe area; the launcher supplies its mask.
  png(join(android, 'ic_launcher.png'),
    'scale=288:288:flags=lanczos,format=rgba,pad=432:432:(ow-iw)/2:(oh-ih)/2:color=black@0');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
