import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DrivePower } from './drive-power.js';

test('connect wakes once for concurrent clients and records internal activity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drive-power-'));
  let wakeCount = 0, release;
  const wakeFinished = new Promise(resolve => { release = resolve; });
  const power = new DrivePower({ activityPath: join(dir, 'activity'), wake: async () => { wakeCount++; await wakeFinished; } });
  try {
    const a = power.connect(), b = power.connect();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(wakeCount, 1);
    release(); await Promise.all([a, b]);
    assert.ok(Number(await readFile(power.path, 'utf8')) > 0);
    const response = new EventEmitter();
    await power.hold(response);
    assert.equal(power.active, 1);
    response.emit('finish'); response.emit('close');
    assert.equal(power.active, 0);
    await power.pending;
  } finally { power.close(); await rm(dir, { recursive: true, force: true }); }
});

test('local fixtures never invoke privileged drive commands', async () => {
  const power = new DrivePower({ activityPath: '', wake: () => assert.fail('unexpected disk command') });
  await power.start(); await power.connect(); await power.hold(new EventEmitter());
  assert.equal(power.active, 0);
});

test('failed wake fails Connect and permits a later retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drive-power-'));
  let calls = 0;
  const power = new DrivePower({ activityPath: join(dir, 'activity'), wake: async () => { if (++calls === 1) throw new Error('drive unavailable'); } });
  try {
    await assert.rejects(power.connect(), /drive unavailable/);
    await power.connect(); assert.equal(calls, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
