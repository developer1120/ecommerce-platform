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
