import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('playback subtitle API serves matched English files with HEAD/ranges and rejects unknown paths', async () => {
  const temp = await mkdtemp(join(tmpdir(),'bw-playback-api-'));
  let child;
  try {
    const root=join(temp,'library'), app=join(temp,'app');
    await mkdir(join(root,'hrine','sub-whisper'),{recursive:true});
    await mkdir(join(root,'.better-watch-cache'));
    await cp(new URL('../server.js',import.meta.url),join(app,'server.js'));
    await cp(new URL('../src/lib',import.meta.url),join(app,'src/lib'),{recursive:true});
    await writeFile(join(app,'package.json'),'{"type":"module"}');
    const path=join(root,'hrine','example.mp4'), text='1\n00:00:00,000 --> 00:00:05,000\nEnglish line\n';
    await writeFile(path,'original');
    await writeFile(join(root,'hrine','sub-whisper','example.ja.whisperjav.english.srt'),text);
    await writeFile(join(root,'hrine','sub-whisper','example.ja.whisperjav.srt'),'Japanese');
    await writeFile(join(root,'.better-watch-cache','index.json'),JSON.stringify({root,generatedAt:'fixture',movies:[{id:'fixture',path,title:'Example',folder:'hrine',topFolder:'hrine',hasEnglishSub:true,relativePath:'hrine/example.mp4'}],directories:[],scanning:false,errors:[]}));
    child=spawn(process.execPath,['server.js'],{cwd:app,env:{...process.env,LIBRARY_ROOT:root,PORT:'0',REMOTE_PLAYBACK:'1'},stdio:['ignore','pipe','pipe']});
    await once(child.stdout,'data');
    const listener=execFileSync('lsof',['-a','-p',String(child.pid),'-iTCP','-sTCP:LISTEN','-Fn'],{encoding:'utf8'});
    const base=`http://127.0.0.1:${listener.match(/n.*:(\d+)/)[1]}`;
    const response=await fetch(base+'/api/subtitles/fixture');
    assert.equal(response.status,200,response.status === 200 ? '' : await response.text());
    const {tracks}=await response.json();
    assert.equal(tracks.length,1); assert.equal(tracks[0].language,'eng');
    assert.equal(await (await fetch(base+tracks[0].url)).text(),text);
    const head=await fetch(base+tracks[0].url,{method:'HEAD'});
    assert.equal(head.status,200); assert.equal(Number(head.headers.get('content-length')),Buffer.byteLength(text));
    assert.equal((await head.arrayBuffer()).byteLength,0);
    const range=await fetch(base+tracks[0].url,{headers:{Range:'bytes=0-3'}});
    assert.equal(range.status,206);assert.equal(await range.text(),text.slice(0,4));
    assert.equal((await fetch(base+'/api/subtitles/missing')).status,404);
    assert.equal((await fetch(base+'/api/subtitles/file/unknown')).status,404);
    assert.equal((await fetch(base+'/api/subtitles/file/%2e%2e%2fexample.srt')).status,404);
  } finally {
    if(child && child.exitCode===null){child.kill();await once(child,'exit');}
    await rm(temp,{recursive:true,force:true});
  }
});
