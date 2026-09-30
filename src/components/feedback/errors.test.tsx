import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AppErrorBoundary } from '@/app/AppErrorBoundary';
import { AppProviders } from '@/app/AppProviders';
import { routes } from '@/app/routes';
import { searchFromPath } from '@/domain/notFound';
import { describeError, isChunkLoadError, reloadPage } from '@/lib/errors';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';

vi.mock('@/lib/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/errors')>()),
  reloadPage: vi.fn(),
}));

const crash = { current: null as Error | null };

/** The wishlist page, but able to crash on demand. */
vi.mock('@/pages/WishlistPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/WishlistPage')>();
  return {
    WishlistPage: () => {
      if (crash.current) throw crash.current;
      return <actual.WishlistPage />;
    },
  };
});

/** React and jsdom both report errors a boundary catches; keep the output readable. */
function quietErrors() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const quiet = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener('error', quiet);
  onTestFinished(() => window.removeEventListener('error', quiet));
}

beforeEach(() => {
  crash.current = null;
});

const main = () => within(screen.getByRole('main'));

describe('page errors', () => {
  it('shows the error inside the layout, which keeps working', async () => {
    quietErrors();
    crash.current = new Error('Wishlist exploded');
    renderRoute('/wishlist');

    const title = await main().findByRole('heading', { level: 1, name: 'Something went wrong on this page' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(document.title).toBe('Something went wrong · Tanelt');
    expect(main().getByText(/Your bag and account are safe/)).toBeInTheDocument();
    // The header still works around it.
    expect(screen.getByRole('navigation', { name: 'Departments' })).toBeInTheDocument();
    expect(main().getByText('Error: Wishlist exploded')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('[Tanelt] Error in /wishlist:', crash.current);
    expect(await axeViolations()).toEqual([]);
  });

  it('tries the page again, and leaves the error behind on the next page', async () => {
    const user = userEvent.setup();
    quietErrors();
    crash.current = new Error('Just this once');
    const { router } = renderRoute('/wishlist');
    await main().findByRole('heading', { name: 'Something went wrong on this page' });

    crash.current = null;
    await user.click(main().getByRole('button', { name: 'Try again' }));
    expect(await main().findByRole('heading', { level: 1, name: 'Wishlist' })).toBeInTheDocument();

    // Breaks again on a later visit; going elsewhere clears it.
    await act(() => router.navigate('/'));
    crash.current = new Error('Again');
    await act(() => router.navigate('/wishlist'));
    await main().findByRole('heading', { name: 'Something went wrong on this page' });
    await user.click(main().getByRole('link', { name: 'Back to the shop' }));
    expect(router.state.location.pathname).toBe('/');
    expect(await main().findByRole('heading', { level: 1, name: /slower living/i })).toBeInTheDocument();
  });

  it('offers a reload when a page\'s code failed to download', async () => {
    const user = userEvent.setup();
    quietErrors();
    crash.current = new TypeError('Failed to fetch dynamically imported module: /assets/WishlistPage-abc123.js');
    renderRoute('/wishlist');

    expect(await main().findByRole('heading', { level: 1, name: "This page didn't load" })).toBeInTheDocument();
    expect(document.title).toBe("Page didn't load · Tanelt");
    await user.click(main().getByRole('button', { name: 'Reload page' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(main().queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps every page behind a boundary', () => {
    const unguarded: string[] = [];
    const walk = (list: RouteObject[], guarded: boolean, path: string) => {
      for (const route of list) {
        const here = route.path ? `${path}/${route.path}` : path;
        const covered = guarded || Boolean(route.errorElement);
        if (route.element && !route.children && !covered) unguarded.push(here || '/');
