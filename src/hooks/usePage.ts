import { useEffect, useRef, type RefObject } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { PAGE_PARAM, parsePage } from '@/domain/pagination';

/** Navigation state set by pagination links, so a page change can be told apart from a reset to page one. */
export interface PaginationState {
  fromPagination: true;
}

export const PAGINATION_STATE: PaginationState = { fromPagination: true };

/** The page number from the URL, 1 when there is none. */
export function usePageParam(): number {
  const [params] = useSearchParams();
  return parsePage(params.get(PAGE_PARAM));
}

/**
 * After a pagination link moves to another page of a list, puts focus (and
 * so the view) at the top of the list, so keyboard and screen reader users
 * start on the new page instead of at the pagination links.
 *
 * It reacts to navigations, not to the page number: a list that shrinks
 * under a search also lands on page one, and that must leave focus in the
 * search box.
 */
export function useFocusOnPagination(target: RefObject<HTMLElement | null>) {
  const { key, state } = useLocation();
  const handled = useRef(key);
  const fromPagination = (state as Partial<PaginationState> | null)?.fromPagination === true;

  useEffect(() => {
    if (handled.current === key) return;
    handled.current = key;
    if (fromPagination) target.current?.focus();
  }, [key, fromPagination, target]);
}
