import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  getWishlist,
  mergeWishlist,
  removeWishlistItem,
  saveWishlistItem,
  type WishlistItem,
} from '@/api/wishlistApi';
import { priceRange, type Product } from '@/domain/product';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';

/** A signed-out shopper's wishlist, kept on this device until they sign in. */
export const GUEST_WISHLIST_KEY = 'tanelt:wishlist';

function isItemList(value: unknown): value is WishlistItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.productId === 'string' &&
        typeof item.addedAt === 'string' &&
        Number.isInteger(item.priceAtSave),
    )
  );
}

const loadGuest = () => readJson(GUEST_WISHLIST_KEY, [], isItemList);

interface WishlistContextValue {
  items: WishlistItem[];
  count: number;
  has: (productId: string) => boolean;
  /** Saves or removes a product; returns whether it is now saved. */
  toggle: (product: Product) => boolean;
  remove: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

/**
 * The wishlist lives on this device while signed out and on the account
 * once signed in; signing in merges the two. Changes show straight away
 * and are rolled back if the server refuses them.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { status, token } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WishlistItem[]>(loadGuest);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const signedIn = status === 'signed-in' && token !== null;

  useEffect(() => {
    if (status === 'signed-out') {
      setItems(loadGuest());
      return;
    }
    if (!signedIn) return;
    let cancelled = false;
    const guest = loadGuest();
    (guest.length > 0 ? mergeWishlist(token, guest) : getWishlist(token)).then(
      (server) => {
        if (cancelled) return;
        removeKey(GUEST_WISHLIST_KEY);
        setItems(server);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [status, signedIn, token]);

  // Only the guest list is saved locally; an account's list belongs to the server.
  useEffect(() => {
    if (status === 'signed-out') {
      if (items.length > 0) writeJson(GUEST_WISHLIST_KEY, items);
      else removeKey(GUEST_WISHLIST_KEY);
    }
  }, [items, status]);

  const sync = useCallback(
    (request: Promise<WishlistItem[]>, previous: WishlistItem[]) => {
      request.then(setItems, () => {
        setItems(previous);
        toast({ tone: 'error', title: "We couldn't update your wishlist", description: 'Try again in a moment.' });
      });
    },
    [toast],
  );

  const remove = useCallback(
    (productId: string) => {
      const previous = itemsRef.current;
      setItems(previous.filter((item) => item.productId !== productId));
      if (signedIn) sync(removeWishlistItem(token, productId), previous);
    },
    [signedIn, token, sync],
  );

  const toggle = useCallback(
    (product: Product) => {
      const previous = itemsRef.current;
      if (previous.some((item) => item.productId === product.id)) {
        remove(product.id);
        return false;
      }
      const item: WishlistItem = {
        productId: product.id,
        addedAt: new Date().toISOString(),
        priceAtSave: priceRange(product).min,
      };
      setItems([item, ...previous]);
      if (signedIn) sync(saveWishlistItem(token, item), previous);
      return true;
    },
    [remove, signedIn, token, sync],
  );

  const value = useMemo(() => {
    const ids = new Set(items.map((item) => item.productId));
    return { items, count: items.length, has: (productId: string) => ids.has(productId), toggle, remove };
  }, [items, toggle, remove]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return context;
}
