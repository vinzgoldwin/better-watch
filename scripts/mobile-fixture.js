// Isolated, reproducible media and profile for the native end-to-end suites.
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'better-watch-ui-'));
let server;
try {
  const root = join(directory, 'library'), folder = join(root, 'Cinema'), cache = join(root, '.better-watch-cache');
  await mkdir(folder, { recursive: true }); await mkdir(join(cache, 'thumbs'), { recursive: true });
  const direct = join(folder, 'direct.mp4'), compatible = join(folder, 'compatible.mkv'), subtitles = join(folder, 'compatible.en.srt');
  await writeFile(subtitles, '1\n00:00:00,000 --> 00:01:29,000\nEnglish subtitle test\n');
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '90', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-movflags', '+faststart', direct]);
  await exec('ffmpeg', ['-v', 'error', '-i', direct, '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-i', subtitles, '-t', '90', '-map', '0:v', '-map', '0:a', '-map', '1:a', '-map', '2:s', '-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-c:s', 'srt', '-metadata:s:a:0', 'title=Original', '-metadata:s:a:1', 'title=Alternate', '-metadata:s:s:0', 'language=eng', compatible]);
  await exec('ffmpeg', ['-v', 'error', '-ss', '45', '-i', direct, '-frames:v', '1', join(cache, 'thumbs/fixture.jpg')]);
  const size = (await stat(direct)).size;
  const movies = Array.from({ length: 36 }, (_, index) => ({
    id: index === 0 ? 'compatible' : index === 1 ? 'direct' : `film-${String(index).padStart(2, '0')}`,
    title: index === 0 ? 'Compatible film' : index === 1 ? 'Direct film' : `Film ${String(index).padStart(2, '0')}`,
    path: index === 0 ? compatible : direct, relativePath: index === 0 ? 'Cinema/compatible.mkv' : 'Cinema/direct.mp4',
    folder: 'Cinema', topFolder: 'Cinema', duration: 90, height: 360, size, releaseDate: '2025-01-01',
    categories: [index % 2 ? 'Drama' : 'Adventure'], artists: ['Test Artist'], thumbnail: '/thumbs/fixture.jpg', hasEnglishSub: index === 0,
    description: 'A generated test film.'
  }));
  await writeFile(join(cache, 'index.json'), JSON.stringify({ root, generatedAt: 'fixture', movies, directories: ['Cinema'], scanning: false, errors: [] }));
  server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, LIBRARY_ROOT: root, STATE_DIR: join(directory, 'state'), HOST: '127.0.0.1', PORT: process.env.PORT || '3399', LISTEN_PID: '', LISTEN_FDS: '' }, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server?.kill(signal));
  console.log(`Isolated native test library: ${directory}`);
  const [code] = await once(server, 'exit'); process.exitCode = code || 0;
} finally {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
  await rm(directory, { recursive: true, force: true });
}
