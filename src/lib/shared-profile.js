import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';

const markKeys = new Set(['favorite', 'watchLater', 'watched']);
const validID = id => typeof id === 'string' && id.length > 0 && id.length <= 300 && !['__proto__', 'constructor', 'prototype'].includes(id);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateChange(type, id, value) {
  if (!validID(id)) throw new Error('Invalid library item');
  if (type === 'marks') {
    if (!object(value) || !Object.keys(value).length || Object.entries(value).some(([key, flag]) => !markKeys.has(key) || typeof flag !== 'boolean')) throw new Error('Invalid movie marks');
  } else if (type === 'positions') {
    if (!object(value) || !Number.isFinite(value.seconds) || !Number.isFinite(value.duration) || value.duration <= 0 || value.seconds < 0 || value.seconds > value.duration) throw new Error('Invalid playback position');
    return { seconds: value.seconds, duration: value.duration };
  } else if (type === 'artistMarks') {
    if (typeof value !== 'boolean') throw new Error('Invalid artist favorite');
  } else throw new Error('Invalid profile field');
  return value;
}

// One personal profile, persisted on the internal disk. Serialize read/modify/write
// transactions so two clients changing different fields never overwrite each other.
export class SharedProfile extends EventEmitter {
  constructor(path) {
    super(); this.path = path; this.state = { marks: {}, positions: {}, artistMarks: {} }; this.pending = Promise.resolve();
  }
  async load() {
    try {
      const stored = JSON.parse(await readFile(this.path, 'utf8'));
      for (const type of Object.keys(this.state)) {
        if (!object(stored[type])) throw new Error('Invalid saved profile');
        for (const [id, value] of Object.entries(stored[type])) validateChange(type, id, value);
      }
      this.state = stored;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  transaction(update) {
    const job = this.pending.then(async () => {
      const next = structuredClone(this.state);
      const event = update(next);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + '.tmp', JSON.stringify(next), { mode: 0o600 });
      await rename(this.path + '.tmp', this.path);
      this.state = next;
      this.emit('change', event);
      return next;
    });
    this.pending = job.catch(() => {});
    return job;
  }
  change(type, id, value) {
    value = validateChange(type, id, value);
    return this.transaction(next => {
      next[type][id] = type === 'marks' ? { ...next[type][id], ...value } : value;
      return { type, id, value: next[type][id] };
    });
  }
  import(data, overwrite = false) {
    if (!object(data)) throw new Error('Invalid profile import');
    for (const [type, entries] of Object.entries(data)) {
      if (!Object.hasOwn(this.state, type) || !object(entries)) throw new Error('Invalid profile import');
      for (const [id, value] of Object.entries(entries)) validateChange(type, id, value);
    }
    return this.transaction(next => {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries)) {
          if (!overwrite && Object.hasOwn(next[type], id)) continue;
          next[type][id] = value;
        }
      }
      return { type: 'snapshot', ...next };
    });
  }
}
