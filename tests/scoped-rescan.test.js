import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Run the real API with an isolated library and index, never the external drive.
test('scoped rescans merge only the selected subtree and persist the result', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'better-watch-scan-'));
  const app = join(temp, 'app');
  const root = join(temp, 'library');
  let child;
  try {
    await mkdir(join(app, '.cache/thumbs'), { recursive: true });
    await cp(new URL('../server.js', import.meta.url), join(app, 'server.js'));
    await cp(new URL('../src/lib', import.meta.url), join(app, 'src/lib'), { recursive: true });
    await writeFile(join(app, 'package.json'), '{"type":"module"}');
    async function movie(relativePath, exists = true) {
      const path = join(root, relativePath);
      await mkdir(join(path, '..'), { recursive: true });
      if (exists) await writeFile(path, 'fixture');
      const stats = exists ? await stat(path) : { mtimeMs: 0, size: 0 };
      const id = createHash('sha1').update(`${path}:${stats.mtimeMs}:${stats.size}`).digest('hex');
      await writeFile(join(app, '.cache/thumbs', `${id}.jpg`), 'fixture');
      return { path, relativePath, folder: relativePath.split('/').slice(0, -1).join('/'), topFolder: relativePath.split('/')[0], id, thumbnail: `/thumbs/${id}.jpg`, embeddedDescription: 'Saved description', description: 'Saved description' };
    }
    const retained = await movie('Cinema/Drama/retained.mp4');
    const removed = await movie('Cinema/Drama/removed.mp4', false);
    const unreadable = await movie('Cinema/Drama/Locked/saved.mp4');
    const sibling = await movie('Cinema/Drama Extras/sibling.mp4');
    const other = await movie('Other/untouched.mp4');
    const added = await movie('Cinema/Drama/Deep/added.mp4');
    await mkdir(join(root, 'Cinema/Drama/Empty'), { recursive: true });
    await writeFile(join(app, '.cache/index.json'), JSON.stringify({ root, generatedAt: 'old', scanning: false, errors: [], movies: [retained, removed, unreadable, sibling, other], directories: ['Cinema', 'Cinema/Drama', 'Cinema/Drama/Deleted', 'Cinema/Drama/Locked', 'Cinema/Drama Extras', 'Other'] }));
    child = spawn(process.execPath, ['server.js'], { cwd: app, env: { ...process.env, LIBRARY_ROOT: root, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.stdout.on('data', () => { clearTimeout(timeout); resolve(); });
      child.once('error', reject);
    });
    // Ask the OS for the ephemeral listener, avoiding a fixed application port.
    const { execFileSync } = await import('node:child_process');
    const listener = execFileSync('lsof', ['-a', '-p', String(child.pid), '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8' });
    const port = listener.match(/n.*:(\d+)/)[1];
    const url = `http://localhost:${port}`;
    const get = async () => (await fetch(`${url}/api/library`)).json();
    const rescan = async (folder) => fetch(`${url}/api/rescan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder }) });
    async function completed() {
      for (let i = 0; i < 200; i++) {
        const index = await get();
        if (!index.scanning) return index;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error('Scan timed out');
    }
    await chmod(join(root, 'Cinema/Drama/Locked'), 0);
    assert.equal((await rescan('Cinema/Drama')).status, 202);
    let index = await completed();
    assert.deepEqual(index.movies.map((m) => m.relativePath).sort(), [retained, added, unreadable, sibling, other].map((m) => m.relativePath).sort());
    assert.equal(index.movies.find((m) => m.path === retained.path).description, 'Saved description');
    assert.equal(index.movies.find((m) => m.path === other.path).description, 'Saved description');
    assert.ok(index.errors.some((error) => error.path.endsWith('/Locked')));
    assert.ok(index.directories.includes('Cinema/Drama/Locked'));
    await chmod(join(root, 'Cinema/Drama/Locked'), 0o755);
    assert.ok(index.directories.includes('Cinema/Drama/Empty'));
    assert.ok(index.directories.includes('Cinema/Drama/Deep'));
    assert.ok(!index.directories.includes('Cinema/Drama/Deleted'));
    assert.ok(index.directories.includes('Cinema/Drama Extras'));
    const saved = JSON.parse(await readFile(join(app, '.cache/index.json'), 'utf8'));
    assert.equal(saved.movies.length, 5);
    assert.equal((await rescan('../')).status, 400);
    assert.equal((await rescan('Missing')).status, 400);
    assert.deepEqual((await get()).movies, index.movies);
    // A removed file in another collection survives a scoped scan, then is
    // removed when All Films explicitly requests a full-library scan.
    await rm(other.path);
    assert.equal((await rescan('Cinema')).status, 202);
    index = await completed();
    assert.ok(index.movies.some((m) => m.path === other.path));
    assert.equal((await rescan('')).status, 202);
    index = await completed();
    assert.ok(!index.movies.some((m) => m.path === other.path));
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await chmod(join(root, 'Cinema/Drama/Locked'), 0o755).catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }
});
