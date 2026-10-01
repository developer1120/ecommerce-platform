import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from '@/api/authApi';
import { saveOrder } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { ProductCard } from '@/components/product/ProductCard';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine } from '@/domain/cart';
import { ADMIN_ORDERS_PAGE_SIZE } from '@/pages/admin/AdminOrdersPage';
import { SHOP_PAGE_SIZE } from '@/pages/ShopPage';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute, renderWithProviders } from '@/test/renderRoute';

const results = () => screen.getByRole('region', { name: 'Products' });
const cards = () => within(results()).getAllByRole('article');
const pages = () => screen.getByRole('navigation', { name: 'Pages of products' });

describe('shop pagination', () => {
  it('shows a page at a time, with links to the others', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/shop');
    await within(results()).findAllByRole('article');
    expect(CATALOG.length).toBeGreaterThan(SHOP_PAGE_SIZE);
    expect(cards()).toHaveLength(SHOP_PAGE_SIZE);
    // The count is still every match; the footer says which slice is showing.
    expect(screen.getByText(`${CATALOG.length} products`)).toBeInTheDocument();
    expect(screen.getByText(`Showing 1–${SHOP_PAGE_SIZE} of ${CATALOG.length} products`)).toBeInTheDocument();
    expect(within(pages()).getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages()).queryByRole('link', { name: /Previous/ })).not.toBeInTheDocument();

    await user.click(within(pages()).getByRole('link', { name: /Next/ }));
    expect(router.state.location.search).toBe('?page=2');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Products' })).toHaveFocus());
    expect(cards()).toHaveLength(CATALOG.length - SHOP_PAGE_SIZE);
    expect(screen.getByText(`Showing ${SHOP_PAGE_SIZE + 1}–${CATALOG.length} of ${CATALOG.length} products`)).toBeInTheDocument();
    expect(within(pages()).getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages()).getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/shop');

    // A different sort is a different list, so it starts again from page one.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc');
    expect(router.state.location.search).toBe('?sort=price-asc');
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveFocus();
    expect(within(pages()).getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps filters in the page links, and shows the last page for one past the end', async () => {
    renderRoute('/shop?sort=price-desc&page=9');
    await within(results()).findAllByRole('article');
    expect(within(pages()).getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages()).getByRole('link', { name: 'Page 1' })).toHaveAttribute('href', '/shop?sort=price-desc');
  });

  it('has no page links when everything fits on one page', async () => {
    renderRoute('/shop/apparel?page=2');
    await within(results()).findAllByRole('article');
    expect(screen.queryByRole('navigation', { name: 'Pages of products' })).not.toBeInTheDocument();
    expect(cards().length).toBeLessThanOrEqual(SHOP_PAGE_SIZE);
  });
});

describe('admin order pagination', () => {
  it('pages through orders and starts over for a new search', async () => {
    const user = userEvent.setup();
    const product = CATALOG.find((candidate) => candidate.slug === 'washed-linen-throw')!;
    const first = await placeOrder({
      idempotencyKey: 'first',
      lines: [{ ...makeCartLine(product, product.variants[0]!), quantity: 1 }],
      methodId: 'standard',
      address: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', line1: '1 Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
      card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
    });
    for (let index = 1; index <= ADMIN_ORDERS_PAGE_SIZE; index++) {
      const placedAt = new Date(Date.parse(first.placedAt) - index * 60_000).toISOString();
      saveOrder({ ...first, id: `OR-261007-T${String(index).padStart(3, '0')}`, placedAt });
    }
    const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    const { router } = renderRoute('/admin/orders');

    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
    await waitFor(() => expect(rows()).toHaveLength(ADMIN_ORDERS_PAGE_SIZE));
    const orderPages = screen.getByRole('navigation', { name: 'Pages of orders' });
    await user.click(within(orderPages).getByRole('link', { name: 'Page 2' }));
    expect(router.state.location.search).toBe('?page=2');
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Orders' })).toHaveFocus();

    await user.type(screen.getByLabelText('Search orders'), 'T00');
    expect(router.state.location.search).toBe('');
    expect(screen.getByLabelText('Search orders')).toHaveFocus();
    expect(rows()).toHaveLength(9);
  });
});

describe('art placeholders', () => {
  const observers: { callback: IntersectionObserverCallback; observed: Element[] }[] = [];

  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observed: Element[] = [];
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe(element: Element) {
          this.observed.push(element);
        }
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('holds the space with a tinted frame until the card nears the screen', async () => {
    const product = CATALOG[0]!;
    renderWithProviders(<ProductCard product={product} />);
    const frame = document.querySelector('[data-lazy]')!;
    expect(frame).toHaveAttribute('data-placeholder');
    expect(frame).toHaveAttribute('data-tint', product.art.tint);
    expect(frame.querySelector('svg')).toBeNull();

    const [observer] = observers;
    expect(observer!.observed).toEqual([frame]);
    act(() => observer!.callback([{ isIntersecting: true } as IntersectionObserverEntry], observer as never));
    expect(frame).not.toHaveAttribute('data-placeholder');
    expect(frame.querySelector('svg')).not.toBeNull();
  });

  it('draws straight away where the browser cannot tell', () => {
    vi.unstubAllGlobals();
    const original = window.IntersectionObserver;
    // @ts-expect-error -- jsdom has none; make sure of it for this test.
    delete window.IntersectionObserver;
    renderWithProviders(<ProductCard product={CATALOG[0]!} />);
    expect(document.querySelector('[data-lazy] svg')).not.toBeNull();
    if (original) window.IntersectionObserver = original;
  });
});
