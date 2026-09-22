/**
 * JSON in web storage that never throws. Storage can be full, disabled or
 * hold something stale from an older version; callers then get the fallback.
 * "local" survives the browser closing; "session" lasts for the tab.
 */
export type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage {
  // Read lazily: touching window.localStorage itself can throw when storage is blocked.
  return kind === 'session' ? window.sessionStorage : window.localStorage;
}

export function readJson<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
  kind: StorageArea = 'local',
): T {
  try {
    const raw = area(kind).getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: StorageArea = 'local'): void {
  try {
    area(kind).setItem(key, JSON.stringify(value));
  } catch {
    // Out of space or blocked: the app keeps working without persistence.
  }
}

export function removeKey(key: string, kind: StorageArea = 'local'): void {
  try {
    area(kind).removeItem(key);
  } catch {
    // Ignore, as above.
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
