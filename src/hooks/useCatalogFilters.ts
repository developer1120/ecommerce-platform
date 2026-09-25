import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { EMPTY_FILTERS, FILTER_PARAMS, parseFilters, serializeFilters, type CatalogFilters } from '@/domain/catalogFilters';
import { PAGE_PARAM } from '@/domain/pagination';

/** Adds the value if missing, removes it if present. */
export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Collection filters, read from and written to the URL query string. Each
 * change adds a history entry, so the back button steps back through them.
 */
export function useCatalogFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const update = useCallback(
    (change: Partial<CatalogFilters> | ((current: CatalogFilters) => Partial<CatalogFilters>)) => {
      setParams(
        (previous) => {
          const current = parseFilters(previous);
          const patch = typeof change === 'function' ? change(current) : change;
          // Keep parameters that are not filters, such as the search query.
          const next = new URLSearchParams(previous);
          for (const key of FILTER_PARAMS) next.delete(key);
          // A different selection starts again from its first page.
          next.delete(PAGE_PARAM);
          for (const [key, value] of serializeFilters({ ...current, ...patch })) next.append(key, value);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setParams],
  );

  /** Removes every filter but keeps the chosen sort order. */
  const clear = useCallback(() => update((current) => ({ ...EMPTY_FILTERS, sort: current.sort })), [update]);

  return { filters, update, clear };
}
