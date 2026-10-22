import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import {
  cartReducer,
  itemCount,
  makeCartLine,
  savings,
  subtotal,
  type CartLine,
  type CartState,
} from '@/domain/cart';
import { CART_STORAGE_KEY, loadCart, parseStoredCart, saveCart } from '@/domain/cartStorage';
import type { Cents } from '@/domain/money';
import type { Product, Variant } from '@/domain/product';

export interface AddToCartResult {
  /** The line's quantity after adding. */
  quantity: number;
  /** How many were actually added; less than asked when stock or the per-line cap got in the way. */
  added: number;
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: Cents;
  savings: Cents;
  add: (product: Product, variant: Variant, quantity?: number) => AddToCartResult;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  /** Puts a removed line back as it was, for an Undo button. */
  restoreLine: (line: CartLine) => void;
  /** Replaces every line at once, e.g. after checking the bag against the catalog or undoing a clear. */
  replaceLines: (lines: CartLine[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, loadCart);

  // The latest state, so add() can report what it did without waiting for a render.
  const stateRef = useRef<CartState>(state);
  stateRef.current = state;

  // Changes made here are saved; changes from another tab arrive through the storage event.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    saveCart(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
      fromOtherTab.current = true;
      dispatch({ type: 'replace', state: parseStoredCart(event.key === null ? null : event.newValue) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((product: Product, variant: Variant, quantity = 1): AddToCartResult => {
    const action = { type: 'add', line: makeCartLine(product, variant), quantity } as const;
    const before = stateRef.current.lines.find((line) => line.variantId === variant.id)?.quantity ?? 0;
    const next = cartReducer(stateRef.current, action);
    const after = next.lines.find((line) => line.variantId === variant.id)?.quantity ?? 0;
    stateRef.current = next;
    dispatch(action);
    return { quantity: after, added: Math.max(0, after - before) };
  }, []);

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => dispatch({ type: 'setQuantity', variantId, quantity }),
    [],
  );
  const remove = useCallback((variantId: string) => dispatch({ type: 'remove', variantId }), []);
  const restoreLine = useCallback((line: CartLine) => {
    const { quantity, ...snapshot } = line;
    dispatch({ type: 'add', line: snapshot, quantity });
  }, []);
  const replaceLines = useCallback((lines: CartLine[]) => dispatch({ type: 'replace', state: { lines } }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      itemCount: itemCount(state),
      subtotal: subtotal(state),
      savings: savings(state),
      add,
      setQuantity,
      remove,
      restoreLine,
      replaceLines,
      clear,
    }),
    [state, add, setQuantity, remove, restoreLine, replaceLines, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
