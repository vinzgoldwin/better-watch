import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// Single byte ranges let native players seek without downloading the whole film.
export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export async function streamFile(request, response, path, options = {}) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('Video is not a regular file');
  const range = request.headers.range ? byteRange(request.headers.range, info.size) : undefined;
  const headers = { 'accept-ranges': 'bytes', 'content-type': options.contentType || 'application/octet-stream', 'cache-control': options.cacheControl || 'private, no-store' };
  if (range === null) {
    response.writeHead(416, { ...headers, 'content-range': `bytes */${info.size}` });
    response.end();
    return;
  }
  headers['content-length'] = range ? range.end - range.start + 1 : info.size;
  if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = createReadStream(path, range || {});
  response.once('close', () => stream.destroy());
  stream.once('error', (error) => response.destroy(error));
  stream.pipe(response);
}
