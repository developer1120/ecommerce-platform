import { readJson, removeKey, writeJson } from '@/lib/storage';

const JUST_PLACED_KEY = 'tanelt:just-placed';

const isString = (value: unknown): value is string => typeof value === 'string';

/** Notes the order checkout has just placed, for the confirmation page to tidy up after. */
export function markJustPlaced(orderId: string): void {
  writeJson(JUST_PLACED_KEY, orderId, 'session');
}

/**
 * True once for the order that was just placed, then false: the mark is
 * removed as it is read, so revisiting the order later changes nothing.
 */
export function consumeJustPlaced(orderId: string): boolean {
  const marked = readJson<string | null>(JUST_PLACED_KEY, null, isString, 'session');
  if (marked !== orderId) return false;
  removeKey(JUST_PLACED_KEY, 'session');
  return true;
}
