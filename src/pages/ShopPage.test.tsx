import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ApiError, configureApi } from '@/api/client';
import { LoadError } from '@/components/feedback/LoadError';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';
import { isFeatureSlot, ProductGrid } from '@/components/product/ProductGrid';
import { CATALOG } from '@/data/catalog';
import { renderRoute, renderWithProviders } from '@/test/renderRoute';

describe('ShopPage', () => {
  it('shows skeletons while loading, then the collection with a count', async () => {
    renderRoute('/shop/beauty');
    const products = screen.getByRole('region', { name: 'Products' });
    expect(products).toHaveAttribute('aria-busy', 'true');

    expect(await within(products).findAllByRole('article')).toHaveLength(7);
    expect(products).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('7 products')).toBeInTheDocument();
  });

  it('introduces the collection under its title', async () => {
    renderRoute('/shop/home');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText(/stoneware, linen and light/i)).toBeInTheDocument();
    expect(await screen.findByText('9 products')).toBeInTheDocument();
  });

  it('lists every product on /shop', async () => {
    renderRoute('/shop');
    expect(screen.getByRole('heading', { level: 1, name: 'All products' })).toBeInTheDocument();
    expect(await screen.findByText(`${CATALOG.length} products`)).toBeInTheDocument();
  });

  it('only shows discounted products on the sale page', async () => {
    renderRoute('/shop/sale');
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(within(card).getByText(/^−\d+%$/)).toBeInTheDocument();
  });

  it('leads with a feature card', async () => {
    renderRoute('/shop/apparel');
    const products = screen.getByRole('region', { name: 'Products' });
    const [first, second] = (await within(products).findAllByRole('article')).map((card) => card.parentElement);
    expect(first).toHaveAttribute('data-feature');
    expect(second).not.toHaveAttribute('data-feature');
  });

  it('shows a breadcrumb trail back to the shop', () => {
    renderRoute('/shop/apparel');
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(trail).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(within(trail).getByText('Apparel')).toHaveAttribute('aria-current', 'page');
  });

  it('invites the shopper elsewhere when a collection is empty', async () => {
    // Years later, nothing in the catalog counts as new any more.
    vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
    renderRoute('/shop/new');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nothing here just now' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse everything' })).toHaveAttribute('href', '/shop');
    expect(screen.getByText('0 products')).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown collection', () => {
    renderRoute('/shop/garden-tools');
    expect(screen.getByRole('heading', { level: 1, name: 'This page has wandered off' })).toBeInTheDocument();
  });

  it('explains a failed load and retries on request', async () => {
    configureApi({ failureRate: 1 });
    renderRoute('/shop/home');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load these products");
    expect(alert).toHaveTextContent("We couldn't reach the shop");

    configureApi({ failureRate: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('9 products')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the new collection when navigating between departments', async () => {
    renderRoute('/shop/beauty');
    expect(await screen.findByText('7 products')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Departments' })).getByRole('link', { name: 'Apparel' }));
    expect(await screen.findByText('8 products')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Apparel' })).toBeInTheDocument();
  });
});

describe('ProductGrid', () => {
  it('features the first card and every seventh after it', () => {
    expect([0, 1, 6, 7, 13, 14].map((index) => isFeatureSlot(index))).toEqual([true, false, false, true, false, true]);
    expect(isFeatureSlot(0, 0)).toBe(false);
  });

  it('marks feature cells in a long grid', () => {
    renderWithProviders(<ProductGrid products={CATALOG.slice(0, 9)} />);
    const cells = screen.getAllByRole('listitem').filter((item) => item.querySelector('article'));
    expect(cells.filter((cell) => cell.hasAttribute('data-feature')).map((cell) => cells.indexOf(cell))).toEqual([0, 7]);
  });

  it('keeps a very short grid even', () => {
    renderWithProviders(<ProductGrid products={CATALOG.slice(0, 2)} />);
    expect(document.querySelector('[data-feature]')).toBeNull();
  });
});

describe('Breadcrumbs', () => {
  it('never links the current page, even if given a link', () => {
    render(
      <MemoryRouter>
