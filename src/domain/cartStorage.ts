import { removeKey, writeJson } from '@/lib/storage';
import { EMPTY_CART, maxQuantity, type CartLine, type CartState } from './cart';

export const CART_STORAGE_KEY = 'tanelt:cart';
/** Bump when the stored shape changes; older data is then discarded. */
export const CART_STORAGE_VERSION = 1;

interface StoredCart {
  version: number;
  lines: unknown[];
}

function isStoredCart(value: unknown): value is StoredCart {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as StoredCart).version === CART_STORAGE_VERSION &&
    Array.isArray((value as StoredCart).lines)
  );
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/** Checks one stored line field by field, so a damaged entry is dropped instead of breaking the bag. */
export function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  const options = line.options;
  const art = line.art as Record<string, unknown> | undefined;
  return (
    isString(line.variantId) &&
    isString(line.productId) &&
    isString(line.slug) &&
    isString(line.name) &&
    isString(line.maker) &&
    isString(line.sku) &&
    isString(line.addedAt) &&
    isCount(line.unitPrice) &&
    (line.compareAtPrice === undefined || isCount(line.compareAtPrice)) &&
    (line.swatch === undefined || isString(line.swatch)) &&
    isCount(line.stock) &&
    Number.isInteger(line.quantity) &&
    (line.quantity as number) > 0 &&
    typeof options === 'object' &&
    options !== null &&
    Object.values(options).every(isString) &&
    typeof art === 'object' &&
    art !== null &&
    isString(art.tint) &&
    isString(art.motif)
  );
}

/** Parses stored bag JSON, keeping only valid lines and capping their quantities. */
export function parseStoredCart(raw: string | null): CartState {
  if (raw === null) return EMPTY_CART;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredCart(parsed)) return EMPTY_CART;
    const lines = parsed.lines
      .filter(isCartLine)
      .map((line) => ({ ...line, quantity: Math.min(line.quantity, maxQuantity(line)) }))
      .filter((line) => line.quantity > 0);
    return { lines };
  } catch {
    return EMPTY_CART;
  }
}

export function loadCart(): CartState {
  try {
    return parseStoredCart(localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return EMPTY_CART;
  }
}

export function saveCart(state: CartState): void {
  if (state.lines.length === 0) removeKey(CART_STORAGE_KEY);
  else writeJson(CART_STORAGE_KEY, { version: CART_STORAGE_VERSION, lines: state.lines });
}
