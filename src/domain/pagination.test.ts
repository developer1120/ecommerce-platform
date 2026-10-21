import { pageLinks, pageSearch, paginate, parsePage } from './pagination';

const range = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe('parsePage', () => {
  it('reads whole page numbers and falls back to the first page', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(null)).toBe(1);
    expect(parsePage('')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-2')).toBe(1);
    expect(parsePage('2.5')).toBe(1);
    expect(parsePage('two')).toBe(1);
  });
});

describe('paginate', () => {
  it('slices a page and says where it sits', () => {
    expect(paginate(range(30), 2, 12)).toEqual({ items: range(24).slice(12), page: 2, pageCount: 3, total: 30, first: 13, last: 24 });
    expect(paginate(range(30), 3, 12)).toMatchObject({ items: [25, 26, 27, 28, 29, 30], first: 25, last: 30 });
  });

  it('shows the last page for a page past the end', () => {
    expect(paginate(range(30), 99, 12)).toMatchObject({ page: 3, first: 25 });
  });

  it('treats an empty list as one empty page', () => {
    expect(paginate([], 4, 12)).toEqual({ items: [], page: 1, pageCount: 1, total: 0, first: 0, last: 0 });
  });
});

describe('pageLinks', () => {
  it('lists every page when there are few', () => {
    expect(pageLinks(1, 1)).toEqual([1]);
    expect(pageLinks(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the ends and the neighbours, with gaps between', () => {
    expect(pageLinks(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageLinks(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageLinks(20, 20)).toEqual([1, 'gap', 19, 20]);
  });

  it('shows a single hidden page rather than a gap', () => {
    expect(pageLinks(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageLinks(5, 9)).toEqual([1, 'gap', 4, 5, 6, 'gap', 9]);
  });
});

describe('pageSearch', () => {
  it('sets the page and keeps the rest of the query', () => {
    expect(pageSearch(new URLSearchParams('color=Ink&sort=price-asc'), 2)).toBe('?color=Ink&sort=price-asc&page=2');
    expect(pageSearch(new URLSearchParams('page=3&q=wool'), 1)).toBe('?q=wool');
    expect(pageSearch(new URLSearchParams('page=2'), 1)).toBe('');
  });
});
