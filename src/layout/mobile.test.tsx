import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { CATALOG } from '@/data/catalog';
import { makeCartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import { COMPACT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { GUEST_WISHLIST_KEY } from '@/state/WishlistProvider';
import { setViewportWidth } from '@/test/matchMedia';
import { renderRoute } from '@/test/renderRoute';

const PHONE = 375;
const shortcuts = () => screen.getByRole('navigation', { name: 'Shortcuts' });
const results = () => screen.getByRole('region', { name: 'Products' });

describe('useMediaQuery', () => {
  it('follows the viewport as it changes', () => {
    const { result } = renderHook(() => useMediaQuery(COMPACT_QUERY));
    expect(result.current).toBe(false);
    act(() => setViewportWidth(PHONE));
    expect(result.current).toBe(true);
    act(() => setViewportWidth(901));
    expect(result.current).toBe(false);
  });
});

describe('bottom navigation', () => {
  it('only appears on small screens', async () => {
    renderRoute('/');
    expect(screen.queryByRole('navigation', { name: 'Shortcuts' })).not.toBeInTheDocument();
    act(() => setViewportWidth(PHONE));
    expect(await screen.findByRole('navigation', { name: 'Shortcuts' })).toBeInTheDocument();
  });

  it('offers the places the compact header has no room for', async () => {
    setViewportWidth(PHONE);
    const first = CATALOG[0]!;
    const second = CATALOG[1]!;
    localStorage.setItem(
      GUEST_WISHLIST_KEY,
      JSON.stringify([first, second].map((product) => ({ productId: product.id, addedAt: '2026-10-01T00:00:00Z', priceAtSave: product.price }))),
    );
    renderRoute('/shop/home');

    const links = within(shortcuts()).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Shop', '/shop'],
      ['Search', '/search'],
      ['2Saved', '/wishlist'],
      ['Sign in', `/account/sign-in?next=${encodeURIComponent('/shop/home')}`],
    ]);
    expect(within(shortcuts()).getByRole('link', { name: 'Saved, 2 items' })).toBeInTheDocument();
    // Shop stays marked inside a department; Home only on the home page.
    expect(within(shortcuts()).getByRole('link', { name: 'Shop' })).toHaveAttribute('aria-current', 'page');
    expect(within(shortcuts()).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('links a signed-in shopper to their account', async () => {
    setViewportWidth(PHONE);
    const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    renderRoute('/');
    expect(await within(shortcuts()).findByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
    expect(within(shortcuts()).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('steps aside during checkout', async () => {
    setViewportWidth(PHONE);
    const product = CATALOG.find((candidate) => candidate.variants[0]!.stock > 0)!;
    saveCart({ lines: [{ ...makeCartLine(product, product.variants[0]!), quantity: 1 }] });
    renderRoute('/checkout');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('navigation', { name: 'Shortcuts' })).not.toBeInTheDocument();
  });
});

describe('filter sheet', () => {
  it('opens the filters as a modal sheet and applies them as you go', async () => {
    const user = userEvent.setup();
    setViewportWidth(PHONE);
    const { router } = renderRoute('/shop/apparel?color=Ink');
    await within(results()).findAllByRole('article');
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Filters (1)' });
    await user.click(button);
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('[data-app-shell]')).toHaveAttribute('inert');
    expect(sheet.contains(document.activeElement)).toBe(true);

    const showButton = () => within(sheet).getByRole('button', { name: /^Show \d+ products?$|^No matches$/ });
    const before = showButton().textContent;
    await user.click(within(sheet).getByRole('checkbox', { name: /Knitwear/ }));
    expect(router.state.location.search).toContain('type=');
    expect(showButton().textContent).not.toBe(before);
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toBeInTheDocument();

    await user.click(showButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-app-shell]')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toHaveFocus();
  });

  it('clears everything from the sheet, and closes on Escape', async () => {
    const user = userEvent.setup();
    setViewportWidth(PHONE);
    const { router } = renderRoute('/shop/apparel?color=Ink');
    await within(results()).findAllByRole('article');
    await user.click(screen.getByRole('button', { name: 'Filters (1)' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });

    await user.click(within(sheet).getByRole('button', { name: 'Clear all' }));
    expect(router.state.location.search).toBe('');
    expect(within(sheet).getByRole('button', { name: 'Clear all' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
  });

  it('moves the filters back to the sidebar when the window widens', async () => {
    const user = userEvent.setup();
    setViewportWidth(PHONE);
    renderRoute('/shop/apparel');
    await within(results()).findAllByRole('article');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();

    act(() => setViewportWidth(1280));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
    expect(document.querySelector('[data-app-shell]')).not.toHaveAttribute('inert');
  });
});

describe('search page', () => {
  it('has its own search box for starting or refining a search', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/search?q=wool');
    const form = screen.getByRole('search', { name: 'Search the shop' });
    const box = within(form).getByRole('searchbox', { name: 'Search for' });
    expect(box).toHaveValue('wool');

    await user.clear(box);
    await user.type(box, 'linen{Enter}');
    expect(router.state.location.search).toBe('?q=linen');
    expect(await screen.findByRole('heading', { level: 1, name: 'Results for “linen”' })).toBeInTheDocument();
    expect(within(screen.getByRole('search', { name: 'Search the shop' })).getByRole('searchbox')).toHaveValue('linen');
  });
});
