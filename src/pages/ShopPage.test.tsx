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
        <Breadcrumbs trail={[{ label: 'Home', to: '/' }, { label: 'Here', to: '/here' }]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: 'Here' })).not.toBeInTheDocument();
    expect(screen.getByText('Here')).toHaveAttribute('aria-current', 'page');
  });
});

describe('LoadError', () => {
  it('shows only shopper-facing messages and hides internal ones', () => {
    const { rerender } = render(<LoadError error={new ApiError('NOT_FOUND', 'That product is gone.')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('That product is gone.');

    rerender(<LoadError error={new TypeError("Cannot read properties of undefined (reading 'id')")} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Cannot read');
  });

  it('only offers a retry when it can retry', () => {
    render(<LoadError error={new Error('x')} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('ShopPage filters and sorting', () => {
  const results = () => screen.getByRole('region', { name: 'Products' });
  const productNames = async () =>
    (await within(results()).findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
  const filterPanel = () => screen.getByRole('complementary', { name: 'Filters' });

  it('applies filters from the URL on load', async () => {
    renderRoute('/shop/apparel?color=Ink&stock=in&sort=price-asc');
    expect(await productNames()).toEqual(['Organic cotton tee', 'Wide-leg cord trousers', 'Relaxed linen shirt']);
    expect(screen.getByRole('status')).toHaveTextContent('3 of 8 products');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('price-asc');
    expect(within(filterPanel()).getByRole('checkbox', { name: /in stock only/i })).toBeChecked();
  });

  it('writes a checked filter to the URL and narrows the grid', async () => {
    const { router } = renderRoute('/shop/home');
    await screen.findAllByRole('article');

    await userEvent.click(within(filterPanel()).getByRole('checkbox', { name: /textiles/i }));
    expect(router.state.location.search).toBe('?type=Textiles');
    expect(await productNames()).toEqual(['Washed linen throw', 'Linen napkin set', 'Wool bouclé cushion']);
    expect(screen.getByRole('status')).toHaveTextContent('3 of 9 products');
  });

  it('shows each choice with the number of products it would leave', async () => {
    renderRoute('/shop/home');
    await screen.findAllByRole('article');
    const panel = filterPanel();
    expect(within(panel).getByRole('checkbox', { name: /tableware/i }).closest('label')).toHaveTextContent('Tableware2');
    expect(within(panel).getByRole('button', { name: 'Lilac, 2 products' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sorts from the select and drops the bento layout for sorted results', async () => {
    const { router } = renderRoute('/shop/beauty');
    await screen.findAllByRole('article');
    expect(results().querySelector('[data-feature]')).not.toBeNull();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-desc');
    expect(router.state.location.search).toBe('?sort=price-desc');
    expect((await productNames())[0]).toBe('Camellia face oil');
    expect(results().querySelector('[data-feature]')).toBeNull();
  });

  it('steps back through filter changes with the back button', async () => {
    const { router } = renderRoute('/shop/apparel');
    await screen.findAllByRole('article');

    await userEvent.click(within(filterPanel()).getByRole('button', { name: /^Ink,/ }));
    await userEvent.click(within(filterPanel()).getByRole('checkbox', { name: /in stock only/i }));
    expect(router.state.location.search).toBe('?color=Ink&stock=in');

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?color=Ink');
    expect(within(filterPanel()).getByRole('checkbox', { name: /in stock only/i })).not.toBeChecked();
    expect(within(filterPanel()).getByRole('button', { name: /^Ink,/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('removes one filter from its chip and clears the rest, keeping the sort', async () => {
    const { router } = renderRoute('/shop/apparel?type=Tops&type=Knitwear&stock=in&sort=newest');
    await screen.findAllByRole('article');
    const applied = screen.getByRole('list', { name: 'Applied filters' });

    await userEvent.click(within(applied).getByRole('button', { name: 'Remove Knitwear' }));
    expect(router.state.location.search).toBe('?type=Tops&stock=in&sort=newest');

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(router.state.location.search).toBe('?sort=newest');
    expect(screen.queryByRole('list', { name: 'Applied filters' })).not.toBeInTheDocument();
  });

  it('offers to clear filters when nothing matches', async () => {
    const { router } = renderRoute('/shop/beauty?price=100-plus');
    expect(await screen.findByRole('heading', { level: 2, name: 'No matches' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.state.location.search).toBe('');
    expect(await within(results()).findAllByRole('article')).toHaveLength(7);
  });

  it('keeps the filters in the sidebar on wide screens', async () => {
    renderRoute('/shop/apparel?color=Ink');
    await screen.findAllByRole('article');
    expect(filterPanel()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
  });

  it('starts unfiltered when moving to another department', async () => {
    renderRoute('/shop/apparel?color=Ink');
    await screen.findAllByRole('article');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Departments' })).getByRole('link', { name: 'Home' }));
    expect(await screen.findByText('9 products')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Applied filters' })).not.toBeInTheDocument();
  });
});
