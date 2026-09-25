import { readJson, writeJson } from '@/lib/storage';
import { userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';

/** One saved product. The price is remembered so the wishlist can point out a drop. */
export interface WishlistItem {
  productId: string;
  addedAt: string;
  /** The lowest variant price when it was saved, in cents. */
  priceAtSave: number;
}

export const WISHLISTS_KEY = 'tanelt:mock-db:wishlists';

type Store = Record<string, WishlistItem[]>;
const isStore = (value: unknown): value is Store => typeof value === 'object' && value !== null && !Array.isArray(value);

function requireUser(token: string) {
  const user = userForToken(token);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
  return user;
}

function read(userId: string): WishlistItem[] {
  return readJson(WISHLISTS_KEY, {}, isStore)[userId] ?? [];
}

function write(userId: string, items: WishlistItem[]): WishlistItem[] {
  writeJson(WISHLISTS_KEY, { ...readJson(WISHLISTS_KEY, {}, isStore), [userId]: items });
  return items;
}

/** Newest first, one entry per product, keeping the earliest save. */
export function mergeItems(...lists: WishlistItem[][]): WishlistItem[] {
  const byProduct = new Map<string, WishlistItem>();
  for (const item of lists.flat()) {
    const existing = byProduct.get(item.productId);
    if (!existing || item.addedAt < existing.addedAt) byProduct.set(item.productId, item);
  }
  return [...byProduct.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function getWishlist(token: string, options?: RequestOptions): Promise<WishlistItem[]> {
  return simulateRequest(() => read(requireUser(token).id), options);
}

export function saveWishlistItem(token: string, item: WishlistItem, options?: RequestOptions): Promise<WishlistItem[]> {
  return simulateRequest(() => {
    const { id } = requireUser(token);
    return write(id, mergeItems(read(id), [item]));
  }, options);
}

export function removeWishlistItem(token: string, productId: string, options?: RequestOptions): Promise<WishlistItem[]> {
  return simulateRequest(() => {
    const { id } = requireUser(token);
    return write(
      id,
      read(id).filter((item) => item.productId !== productId),
    );
  }, options);
}

/** Folds a guest's saved items into the account's list on sign in. */
export function mergeWishlist(token: string, items: WishlistItem[], options?: RequestOptions): Promise<WishlistItem[]> {
  return simulateRequest(() => {
    const { id } = requireUser(token);
    return write(id, mergeItems(read(id), items));
  }, options);
}
