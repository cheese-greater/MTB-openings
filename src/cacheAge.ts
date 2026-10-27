// How far behind the hourly publish may fall before the page says so.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export const isCacheStale = (cachedAt: number, now: number): boolean => now - cachedAt >= STALE_AFTER_MS;
