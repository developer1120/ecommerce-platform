import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COMPARE_STORAGE_KEY, MAX_COMPARE, toggleCompare, type CompareItem, type ToggleOutcome } from '@/domain/compare';
import { readJson, writeJson } from '@/lib/storage';

interface CompareContextValue {
  items: CompareItem[];
  has: (productId: string) => boolean;
  /** Adds or removes a product; "full" means it wasn't added because four are already picked. */
  toggle: (item: CompareItem) => ToggleOutcome;
  remove: (productId: string) => void;
  /** Replaces the whole list, e.g. when opening a shared comparison link. */
  replace: (items: CompareItem[]) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

function isItemList(value: unknown): value is CompareItem[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_COMPARE &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as CompareItem).id === 'string' &&
        typeof (item as CompareItem).slug === 'string' &&
        typeof (item as CompareItem).name === 'string' &&
        typeof (item as CompareItem).art === 'object',
    )
  );
}

/** The products picked for comparison, kept on this device and in step across tabs. */
export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>(() => readJson(COMPARE_STORAGE_KEY, [], isItemList));

  useEffect(() => {
    writeJson(COMPARE_STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== COMPARE_STORAGE_KEY && event.key !== null) return;
      setItems(readJson(COMPARE_STORAGE_KEY, [], isItemList));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const has = useCallback((productId: string) => items.some((item) => item.id === productId), [items]);

  const toggle = useCallback(
    (item: CompareItem): ToggleOutcome => {
      const result = toggleCompare(items, item);
      if (result.outcome !== 'full') setItems(result.items);
      return result.outcome;
    },
    [items],
  );

  const remove = useCallback((productId: string) => setItems((current) => current.filter((item) => item.id !== productId)), []);
  const replace = useCallback((next: CompareItem[]) => setItems(next.slice(0, MAX_COMPARE)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, has, toggle, remove, replace, clear }), [items, has, toggle, remove, replace, clear]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const context = useContext(CompareContext);
  if (!context) throw new Error('useCompare must be used inside <CompareProvider>');
  return context;
}
