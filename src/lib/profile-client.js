import { useEffect, useRef, useState } from 'react';

export async function api(path, body, options = {}) {
  const response = await fetch(path, { ...options, ...(body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The library could not complete this request.');
  return result;
}

export function applyProfileEvent(state, event) {
  if (event.type === 'snapshot') return { marks: event.marks, positions: event.positions, artistMarks: event.artistMarks };
  if (!['marks', 'positions', 'artistMarks'].includes(event.type)) return state;
  return { ...state, [event.type]: { ...state[event.type], [event.id]: event.value } };
}

function stored(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}

export function useSharedProfile() {
  const [state, setState] = useState({ marks: {}, positions: {}, artistMarks: {} });
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    let source, cancelled = false, retry;
    async function connect() {
      try {
        // Import only missing IDs. Existing server values, including false flags,
        // win over old device-local lists on every later connection.
        const migrated = stored('better-watch:shared-profile-migrated');
        if (migrated !== true) {
          await api('/api/profile/import', { data: {
            marks: stored('ultra-touch-gallery:movie-marks'), artistMarks: stored('ultra-touch-gallery:artist-marks')
          } });
          try { localStorage.setItem('better-watch:shared-profile-migrated', 'true'); } catch { /* Private browsing can disable storage. */ }
        }
        if (cancelled) return;
        source = new EventSource('/api/profile/events');
        source.onmessage = event => {
          const update = JSON.parse(event.data);
          // Playback fetches the latest position when it opens. Progress broadcasts
          // should not rerender a library containing thousands of covers.
          if (update.type !== 'positions') setState(current => applyProfileEvent(current, update));
          setConnected(true); setError('');
        };
        source.onopen = () => { setConnected(true); setError(''); };
        source.onerror = () => { setConnected(false); setError('Connection lost. Reconnecting to your library.'); };
      } catch (cause) {
        if (!cancelled) { setError(cause.message); retry = setTimeout(connect, 5000); }
      }
    }
    connect();
    return () => { cancelled = true; clearTimeout(retry); source?.close(); };
  }, []);
  function change(type, id, value) {
    setState(current => applyProfileEvent(current, { type, id, value: type === 'marks' ? { ...current.marks[id], ...value } : value }));
    const job = pending.current.then(() => api(`/api/profile/${type}/${encodeURIComponent(id)}`, value, { keepalive: true }));
    pending.current = job.catch(cause => { setError(`Could not sync: ${cause.message}`); });
    return job;
  }
  return { ...state, change, connected, error };
}
