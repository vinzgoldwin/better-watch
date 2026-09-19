import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaQueue } from './media-queue.js';

const gate = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('foreground jobs pass queued thumbnails without concurrent encoders', async () => {
  const queue = new MediaQueue(), blocked = gate(), sequence = [];
  const current = queue.enqueue('running', async () => { sequence.push('running'); await blocked.promise; });
  const thumbnail = queue.enqueue('thumbnail', () => sequence.push('thumbnail'));
  const preview = queue.enqueue('preview', () => sequence.push('preview'), { priority: 2 });
  blocked.resolve();
  await Promise.all([current, thumbnail, preview]);
  assert.deepEqual(sequence, ['running', 'preview', 'thumbnail']);
});

test('abandoned queued work is dropped while shared requests still complete', async () => {
  const queue = new MediaQueue(), blocked = gate(), aborted = new AbortController();
  const current = queue.enqueue('running', () => blocked.promise);
  let calls = 0;
  const abandoned = queue.enqueue('abandoned', () => assert.fail('Abandoned encoder started'), { signal: aborted.signal });
  const rejected = assert.rejects(abandoned, { name: 'AbortError' });
  aborted.abort();
  const first = new AbortController();
  const shared = queue.enqueue('shared', () => { calls++; return 'clip'; }, { signal: first.signal });
  const sharedRejected = assert.rejects(shared, { name: 'AbortError' });
  const retained = queue.enqueue('shared', () => assert.fail('Duplicate encoder started'), { priority: 2 });
  first.abort();
  blocked.resolve();
  await Promise.all([current, rejected, sharedRejected]);
  assert.equal(await retained, 'clip');
  assert.equal(calls, 1);
});

test('failed encoding does not block later work or retries', async () => {
  const queue = new MediaQueue();
  await assert.rejects(queue.enqueue('broken', () => { throw new Error('failed'); }), /failed/);
  assert.equal(await queue.enqueue('broken', () => 'retry'), 'retry');
});
