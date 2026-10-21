/*
 * Splitting a long list into numbered pages. The page lives in the URL
 * (?page=2), so it survives a reload, can be shared, and the back button
 * steps through pages.
 */

export const PAGE_PARAM = 'page';

/** "2" → 2. Anything that isn't a whole number from 1 up means the first page. */
export function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

export interface Page<T> {
  items: T[];
  /** The page shown, 1-based; a page past the end shows the last one. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last item shown, for "13–24 of 30". */
  first: number;
  last: number;
}

export function paginate<T>(items: T[], requested: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requested)), pageCount);
  const start = (page - 1) * pageSize;
  const shown = items.slice(start, start + pageSize);
  return {
    items: shown,
    page,
    pageCount,
    total: items.length,
    first: shown.length > 0 ? start + 1 : 0,
    last: start + shown.length,
  };
}

export type PageLink = number | 'gap';

/**
 * Which page numbers to offer: always the first and last, the current page
 * and its neighbours, with gaps for the rest. A gap only stands in for two
 * or more pages; a single hidden page is shown instead.
 * 1 … 4 5 6 … 20
 */
export function pageLinks(current: number, pageCount: number, around = 1): PageLink[] {
  const wanted = new Set([1, pageCount]);
  for (let page = current - around; page <= current + around; page++) {
    if (page >= 1 && page <= pageCount) wanted.add(page);
  }
  const pages = [...wanted].sort((a, b) => a - b);
  const links: PageLink[] = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous === 2) links.push(previous + 1);
    else if (previous !== undefined && page - previous > 2) links.push('gap');
    links.push(page);
  });
  return links;
}

/** The query string for another page, keeping everything else; page 1 drops the parameter. */
export function pageSearch(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete(PAGE_PARAM);
  else next.set(PAGE_PARAM, String(page));
  const query = next.toString();
  return query ? `?${query}` : '';
}
