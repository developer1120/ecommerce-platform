import { act, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureApi } from '@/api/client';
import { loadRecentSearches, rememberSearch } from '@/domain/recentSearches';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { renderRoute } from '@/test/renderRoute';

async function openSearch() {
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
  return screen.getByRole('combobox', { name: 'Search the shop' });
}

describe('header search', () => {
  it('opens from the header with the input focused', async () => {
    renderRoute('/');
    const toggle = screen.getByRole('button', { name: 'Search' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const input = await openSearch();
    expect(input).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('suggests matching products with the query highlighted', async () => {
    renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'linen');

    const listbox = await screen.findByRole('listbox', { name: 'Suggestions' });
    const options = within(listbox).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Relaxed linen shirt'),
      expect.stringContaining('Washed linen throw'),
      expect.stringContaining('Linen napkin set'),
      expect.stringContaining('See all 3 results for “linen”'),
    ]);
    expect(within(options[0]!).getByText('linen').tagName).toBe('MARK');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('3 products match');
  });

  it('waits for two characters before searching', async () => {
    renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'l');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /popular right now/i })).toBeInTheDocument();
  });

  it('moves through options with the arrow keys and wraps around', async () => {
    renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'linen');
    const options = await screen.findAllByRole('option');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id);
    expect(input).toHaveFocus();
  });

  it('opens the highlighted product on Enter and remembers the search', async () => {
    const { router } = renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'linen');
    await screen.findAllByRole('option');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(router.state.location.pathname).toBe('/product/washed-linen-throw');
    expect(screen.queryByRole('combobox', { name: 'Search the shop' })).not.toBeInTheDocument();
    expect(loadRecentSearches()).toEqual(['linen']);
  });

  it('goes to the results page on Enter with nothing highlighted', async () => {
    const { router } = renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'wool gift{Enter}');
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?q=wool%20gift');
  });

  it('opens a product with a click', async () => {
    const { router } = renderRoute('/');
    await userEvent.type(await openSearch(), 'oak');
    await userEvent.click(await screen.findByRole('option', { name: /oak serving board/i }));
    expect(router.state.location.pathname).toBe('/product/oak-serving-board');
  });

  it('says when nothing matches', async () => {
    renderRoute('/');
    await userEvent.type(await openSearch(), 'zzzz');
    expect(await screen.findByText(/nothing matches “zzzz”/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No products match zzzz');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('clears the text on the first Escape and closes on the second, returning focus', async () => {
    renderRoute('/');
    const input = await openSearch();
    await userEvent.type(input, 'oak');
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Search the shop' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('closes when clicking outside the header', async () => {
    renderRoute('/');
    await openSearch();
    await userEvent.click(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('combobox', { name: 'Search the shop' })).not.toBeInTheDocument();
  });

  it('offers popular searches and fills them in', async () => {
    renderRoute('/');
    const input = await openSearch();
    await userEvent.click(screen.getByRole('button', { name: 'ceramic' }));
    expect(input).toHaveValue('ceramic');
    expect(await screen.findAllByRole('option')).not.toHaveLength(0);
  });

  it('lists recent searches, runs them, and clears them', async () => {
    rememberSearch('wool');
    const { router } = renderRoute('/');
    await openSearch();
    const recent = screen.getByRole('region', { name: /recent searches/i });
    expect(within(recent).getByRole('button', { name: 'wool' })).toBeInTheDocument();

    await userEvent.click(within(recent).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: /recent searches/i })).not.toBeInTheDocument();
    expect(loadRecentSearches()).toEqual([]);

    rememberSearch('oak');
    await userEvent.keyboard('{Escape}');
    await openSearch();
    await userEvent.click(screen.getByRole('button', { name: 'oak' }));
    expect(router.state.location.search).toBe('?q=oak');
  });

  it('closes the mobile menu when search opens', async () => {
    renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await openSearch();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SearchPage', () => {
  it('lists every match for the query in the URL', async () => {
    renderRoute('/search?q=wool');
    expect(screen.getByRole('heading', { level: 1, name: 'Results for “wool”' })).toBeInTheDocument();
    expect(document.title).toBe('Search: wool · Tanelt');
    const results = await screen.findByRole('region', { name: 'Search results' });
    expect(within(results).getAllByRole('article')).toHaveLength(4);
    expect(within(results).getByRole('status')).toHaveTextContent('4 products');
  });

  it('re-sorts results and keeps the query in the URL', async () => {
    const { router } = renderRoute('/search?q=wool');
    await screen.findByRole('region', { name: 'Search results' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
    expect(router.state.location.search).toBe('?q=wool&sort=price-asc');
    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(names[0]).toBe('Ribbed wool beanie');
  });

  it('suggests other searches when nothing matches', async () => {
    renderRoute('/search?q=trampoline');
    expect(await screen.findByRole('heading', { level: 2, name: 'No matches' })).toBeInTheDocument();
    const popular = screen.getByRole('list', { name: 'Popular searches' });
    expect(within(popular).getByRole('link', { name: 'linen' })).toHaveAttribute('href', '/search?q=linen');
  });

  it('prompts for a query when there is none', () => {
    renderRoute('/search');
    expect(screen.getByRole('heading', { level: 1, name: 'Search the shop' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Popular searches' })).toBeInTheDocument();
  });

  it('offers a retry when the search fails', async () => {
    configureApi({ failureRate: 1 });
    renderRoute('/search?q=oak');
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load search results");
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());

  it('only passes a value on once it settles', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'l' },
    });
    rerender({ value: 'li' });
    act(() => vi.advanceTimersByTime(150));
    rerender({ value: 'lin' });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current).toBe('l');

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('lin');
  });
});
