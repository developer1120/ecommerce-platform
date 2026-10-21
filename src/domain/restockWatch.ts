import { isStringArray, readJson, writeJson } from '@/lib/storage';

/**
 * Options this device asked to hear about, so the product page can say
 * "back in stock" when the shopper returns. The email itself is the
 * server's job; this only remembers the asking.
 */
export const RESTOCK_WATCH_KEY = 'tanelt:restock-watch';

export function watchedVariants(): string[] {
  return readJson(RESTOCK_WATCH_KEY, [], isStringArray);
}

export function watchVariant(variantId: string): void {
  writeJson(RESTOCK_WATCH_KEY, [...new Set([...watchedVariants(), variantId])]);
}

export function unwatchVariant(variantId: string): void {
  writeJson(
    RESTOCK_WATCH_KEY,
    watchedVariants().filter((id) => id !== variantId),
  );
}
