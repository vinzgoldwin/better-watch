import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SharedProfile } from './shared-profile.js';

test('concurrent device edits merge fields, persist resume, and preserve explicit removals during migration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bw-profile-'));
  try {
    const profile = new SharedProfile(join(dir, 'profile.json')); await profile.load();
    await Promise.all([
      profile.change('marks', 'film', { favorite: true }),
      profile.change('marks', 'film', { watchLater: true }),
      profile.change('marks', 'film', { favorite: false }),
      profile.change('positions', 'film', { seconds: 42, duration: 120 })
    ]);
    await profile.import({ marks: { film: { favorite: true }, second: { watched: true } }, positions: { film: { seconds: 2, duration: 120 } } });
    const restored = new SharedProfile(profile.path); await restored.load();
    assert.deepEqual(restored.state.marks.film, { favorite: false, watchLater: true });
    assert.deepEqual(restored.state.positions.film, { seconds: 42, duration: 120 });
    assert.equal(restored.state.marks.second.watched, true);
    await profile.change('positions', 'film', { seconds: 0, duration: 120 });
    assert.equal(profile.state.positions.film.seconds, 0, 'completion clears resume');
    assert.throws(() => profile.change('positions', 'film', { seconds: -1, duration: 120 }));
    assert.throws(() => profile.change('positions', 'film', { seconds: 121, duration: 120 }));
    assert.throws(() => profile.change('marks', '__proto__', { favorite: true }));
    assert.throws(() => profile.import({ marks: { film: { favorite: 'yes' } } }));
    assert.deepEqual(profile.state.marks.film, { favorite: false, watchLater: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed persistence leaves the last shared state intact and corrupt storage is not silently replaced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bw-profile-failure-'));
  try {
    await writeFile(join(dir, 'not-directory'), 'file');
    const profile = new SharedProfile(join(dir, 'not-directory', 'profile.json'));
    await assert.rejects(profile.change('marks', 'film', { favorite: true }));
    assert.deepEqual(profile.state.marks, {});
    await writeFile(join(dir, 'corrupt.json'), '{');
    await assert.rejects(new SharedProfile(join(dir, 'corrupt.json')).load());
  } finally { await rm(dir, { recursive: true, force: true }); }
});
