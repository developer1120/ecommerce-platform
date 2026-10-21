import { isStringArray, readJson, removeKey, writeJson } from '@/lib/storage';

export const RECENT_SEARCHES_KEY = 'tanelt:recent-searches';
export const MAX_RECENT_SEARCHES = 5;

export function loadRecentSearches(): string[] {
  return readJson(RECENT_SEARCHES_KEY, [], isStringArray).slice(0, MAX_RECENT_SEARCHES);
}

/** Puts the query first, without duplicates (ignoring case), and keeps the newest five. */
export function rememberSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return loadRecentSearches();
  const next = [trimmed, ...loadRecentSearches().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  writeJson(RECENT_SEARCHES_KEY, next);
  return next;
}

export function clearRecentSearches(): void {
  removeKey(RECENT_SEARCHES_KEY);
}
