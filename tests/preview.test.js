import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

for (const withAudio of [false, true]) test(`preview API caches playable moments (${withAudio ? 'with audio' : 'silent source'})`, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'better-watch-preview-'));
  let child;
  try {
    const app = join(temp, 'app'), root = join(temp, 'library');
    await mkdir(join(root, '.better-watch-cache'), { recursive: true });
    await mkdir(root, { recursive: true });
    await cp(new URL('../server.js', import.meta.url), join(app, 'server.js'));
    await cp(new URL('../src/lib', import.meta.url), join(app, 'src/lib'), { recursive: true });
    await writeFile(join(app, 'package.json'), '{"type":"module"}');
    const path = join(root, 'sample.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=size=${withAudio ? '1920x1080' : '160x90'}:rate=30:duration=20`, ...(withAudio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-c:a', 'aac'] : []), '-c:v', 'libx264', '-preset', 'ultrafast', path]);
    await writeFile(join(root, '.better-watch-cache/index.json'), JSON.stringify({ generatedAt: 'fixture', root, movies: [{ id: 'fixture', path, duration: 20, title: 'Sample', relativePath: 'sample.mp4', folder: '', topFolder: '', thumbnail: '/thumbs/fixture.jpg' }], directories: [], scanning: false, errors: [] }));
    await mkdir(join(root, '.better-watch-cache/previews'));
    await writeFile(join(root, '.better-watch-cache/previews/fixture-moment-1.mp4'), 'old silent cache');
    child = spawn(process.execPath, ['server.js'], { cwd: app, env: { ...process.env, LIBRARY_ROOT: root, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await once(child.stdout, 'data');
    const listener = execFileSync('lsof', ['-a', '-p', String(child.pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' });
    const url = `http://localhost:${listener.match(/n.*:(\d+)/)[1]}`;
    const request = (moment) => fetch(`${url}/api/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'fixture', moment }) });
    for (const invalid of [-1, 3, '1']) assert.equal((await request(invalid)).status, 400);
    const simultaneous = await Promise.all([request(1), request(1)]);
    for (const response of simultaneous) {
      assert.equal(response.status, 200);
      assert.equal((await response.json()).preview, '/previews/fixture-moment-1-hd-v3.mp4');
    }
    for (const moment of [0, 2]) assert.equal((await request(moment)).status, 200);
    const directory = join(root, '.better-watch-cache/previews');
    assert.deepEqual((await readdir(directory)).sort(), [...([0, 1, 2].map((i) => `fixture-moment-${i}-hd-v3.mp4`)), 'fixture-moment-1.mp4'].sort());
    const target = join(directory, 'fixture-moment-1-hd-v3.mp4');
    const before = await stat(target);
    await request(1);
    assert.equal((await stat(target)).mtimeMs, before.mtimeMs);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type,codec_name,r_frame_rate', '-of', 'json', target], { encoding: 'utf8' }));
    assert.equal(probe.streams[0].width, withAudio ? 1280 : 160);
    assert.equal(probe.streams[0].height, withAudio ? 720 : 90);
    assert.equal(probe.streams[0].r_frame_rate, '24/1');
    assert(Math.abs(Number(probe.format.duration) - 6) < 0.1);
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    assert.equal(Boolean(audio), withAudio);
    if (withAudio) assert.equal(audio.codec_name, 'aac');
    assert.equal((await fetch(`${url}/previews/fixture-moment-1-hd-v3.mp4`)).status, 200);
    const thumb = await fetch(`${url}/thumbs/fixture.jpg?quality=hd`);
    assert.equal(thumb.status, 200);
    const still = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', join(root, '.better-watch-cache/thumbs/fixture-hd-v3.jpg')], { encoding: 'utf8' }));
    assert.equal(still.streams[0].width, (withAudio ? 1280 : 160) * 3);
    assert.equal(still.streams[0].height, withAudio ? 720 : 90);
    const index = JSON.parse(await readFile(join(root, '.better-watch-cache/index.json'), 'utf8'));
    assert.equal(index.movies[0].preview, undefined, 'moment requests do not overwrite the legacy preview');
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(temp, { recursive: true, force: true });
  }
});
