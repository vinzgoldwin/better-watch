export function embeddedDescription(tags = {}) {
  const normalized = Object.fromEntries(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of ['description', 'comment']) {
    const value = normalized[key];
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\r\n/g, '\n');
  }
  return null;
}
