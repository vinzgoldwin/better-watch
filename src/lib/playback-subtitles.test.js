import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { PlaybackSubtitles } from './playback-subtitles.js';

test('matches adjacent and catalog English subtitles without following symlinks or crossing the root', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'bw-subtitles-'));
  try {
    const root = join(temp,'library');
    await mkdir(join(root,'jav','sub'),{recursive:true});
    const path = join(root,'jav','ABC-123.mp4');
    for (const file of [path,join(root,'jav','ABC-123.en.srt'),join(root,'jav','ABC-123.ja.srt'),join(root,'jav','sub','ABC-123.ja.whisperjav.english.ass'),join(root,'jav','sub','OTHER.en.srt')]) await writeFile(file,'fixture');
    const outside = join(temp,'ABC-123.en.srt'); await writeFile(outside,'outside');
    await symlink(outside,join(root,'jav','sub','ABC-123.en.srt'));
    const catalog = new PlaybackSubtitles(root), movie = {path,relativePath:'jav/ABC-123.mp4'};
    const tracks = await catalog.tracks(movie);
    assert.equal(tracks.length,2);
    assert(tracks.every(track=>track.language==='eng' && !track.url.includes('ABC')));
    assert.equal(await catalog.file(tracks[0].id),await realpath(join(root,'jav','ABC-123.en.srt')));
    await assert.rejects(catalog.file('../../ABC-123.en.srt'));
    await assert.rejects(catalog.tracks({path:outside,relativePath:'jav/ABC-123.mp4'}));
    await rm(join(root,'jav','ABC-123.en.srt')); await symlink(outside,join(root,'jav','ABC-123.en.srt'));
    await assert.rejects(catalog.file(tracks[0].id),/outside/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
