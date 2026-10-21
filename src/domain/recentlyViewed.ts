import { isStringArray, readJson, removeKey, writeJson } from '@/lib/storage';

/** Products this device opened recently, newest first. It never leaves the device. */
export const RECENTLY_VIEWED_KEY = 'tanelt:recently-viewed';
export const MAX_RECENTLY_VIEWED = 12;

export function loadRecentlyViewed(): string[] {
  return readJson(RECENTLY_VIEWED_KEY, [], isStringArray).slice(0, MAX_RECENTLY_VIEWED);
}

export function recordView(productId: string): string[] {
  const next = [productId, ...loadRecentlyViewed().filter((id) => id !== productId)].slice(0, MAX_RECENTLY_VIEWED);
  writeJson(RECENTLY_VIEWED_KEY, next);
  return next;
}

export function clearRecentlyViewed(): void {
  removeKey(RECENTLY_VIEWED_KEY);
}
