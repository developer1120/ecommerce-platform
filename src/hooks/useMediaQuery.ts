import { useCallback, useSyncExternalStore } from 'react';

/** Phones and small tablets: the header collapses, the bottom bar appears and filters move into a sheet. */
export const COMPACT_QUERY = '(max-width: 900px)';

/** Whether a CSS media query matches right now, updating as it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}
