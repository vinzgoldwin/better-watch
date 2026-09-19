import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { byteRange, streamFile } from './stream-file.js';

test('native player ranges handle seeks, suffixes, and unsatisfiable ranges', () => {
  assert.deepEqual(byteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(byteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(byteRange('bytes=0-99', 10), { start: 0, end: 9 });
  for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=1e1-']) assert.equal(byteRange(range, 10), null);
  assert.equal(byteRange('bytes=0-', 0), null);
});

test('streams exact bytes, supports HEAD, and rejects invalid seeks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'better-watch-stream-'));
  const file = join(dir, 'movie.mp4');
  await writeFile(file, '0123456789');
  const server = http.createServer((req, res) => streamFile(req, res, file).catch(() => res.destroy()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(url, { headers: { Range: 'bytes=3-6' } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 3-6/10');
    assert.equal(await response.text(), '3456');
    response = await fetch(url, { method: 'HEAD' });
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(await response.text(), '');
    response = await fetch(url, { headers: { Range: 'bytes=10-' } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */10');
    assert.equal(await (await fetch(url)).text(), '0123456789');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});
