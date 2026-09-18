export function readReleaseDate(tags = {}) {
  const normalized = Object.fromEntries(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
  // Container creation_time may describe encoding, not the movie's release.
  for (const key of ['release_date', 'date', 'year']) {
    const value = normalized[key]?.trim();
    if (!value || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) continue;
    const fullDate = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
    const date = new Date(`${fullDate}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === fullDate) return value;
  }
  return null;
}

const dayFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatReleaseDate(value) {
  if (value.length === 4) return value;
  if (value.length === 7) return monthFormatter.format(new Date(`${value}-01T00:00:00Z`));
  return dayFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function compareReleaseDates(a, b, oldestFirst = false) {
  if (!a.releaseDate || !b.releaseDate) {
    return Number(Boolean(b.releaseDate)) - Number(Boolean(a.releaseDate)) || a.title.localeCompare(b.title);
  }
  const order = a.releaseDate.localeCompare(b.releaseDate);
  return (oldestFirst ? order : -order) || a.title.localeCompare(b.title);
}
