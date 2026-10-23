import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { updateOrderStatus } from '@/api/adminOrdersApi';
import { signIn, signUp } from '@/api/authApi';
import { placeOrder } from '@/api/ordersApi';
import { subscribeToRestock } from '@/api/stockAlertsApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine, type CartLine } from '@/domain/cart';
import { saveCart } from '@/domain/cartStorage';
import type { Order } from '@/domain/order';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { CHECKOUT_STORAGE_KEY } from '@/state/CheckoutProvider';
import { GUEST_WISHLIST_KEY } from '@/state/WishlistProvider';
import { axeViolations } from './axe';
import { setViewportWidth } from './matchMedia';
import { renderRoute } from './renderRoute';

/*
 * Every screen, scanned with axe-core once it has finished loading. Each
 * case sets up the data its page needs, so the scan sees real content
 * rather than a spinner.
 */

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const ADDRESS = {
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: '12 Analytical Way',
  line2: '',
  city: 'Brooklyn',
  state: 'NY',
  zip: '11201',
  phone: '',
};
const CARD = { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' } as const;

function line(slug: string, quantity = 1): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants.find((variant) => variant.stock > 0)!), quantity };
}

function fillBag() {
  saveCart({ lines: [line('washed-linen-throw'), line('cedar-and-vetiver-soap', 2)] });
}

function readyToPay() {
  fillBag();
  sessionStorage.setItem(
    CHECKOUT_STORAGE_KEY,
    JSON.stringify({ address: ADDRESS, addressConfirmed: true, methodId: 'standard', deliveryConfirmed: true, card: CARD }),
  );
}

async function asCustomer() {
  const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

async function asAdmin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return token;
}

function order(sessionToken?: string): Promise<Order> {
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [line('washed-linen-throw')],
    methodId: 'standard',
    address: ADDRESS,
    card: CARD,
    ...(sessionToken && { sessionToken }),
  });
}

async function expectAccessible(ready: () => Promise<unknown>) {
  await ready();
  expect(await axeViolations()).toEqual([]);
}

const main = () => within(screen.getByRole('main'));
const heading = (name: string | RegExp) => main().findByRole('heading', { level: 1, name });

describe('storefront', () => {
  it('home', async () => {
    renderRoute('/');
    await expectAccessible(() => main().findAllByRole('article'));
  });

  it('a collection, with filters applied', async () => {
    renderRoute('/shop/apparel?color=Ink&sort=price-asc');
    await expectAccessible(() => main().findAllByRole('article'));
  });

  it('a product', async () => {
    renderRoute('/product/relaxed-linen-shirt');
    await expectAccessible(() => main().findByRole('button', { name: /Add to bag/ }));
  });

  it('a sold-out product, with the restock form', async () => {
    renderRoute('/product/wool-boucle-cushion');
    await expectAccessible(() => main().findByRole('heading', { level: 1, name: 'Wool bouclé cushion' }));
  });

  it('search, with and without results', async () => {
    const view = renderRoute('/search?q=wool');
    await expectAccessible(() => main().findAllByRole('article'));
    view.unmount();
    renderRoute('/search?q=trampoline');
    await expectAccessible(() => main().findByRole('heading', { name: 'No matches' }));
  });

  it('the bag, empty and full', async () => {
    const view = renderRoute('/cart');
    await expectAccessible(() => heading('Your bag is empty'));
    view.unmount();
    fillBag();
    renderRoute('/cart');
    await expectAccessible(() => heading('Your bag'));
  });

  it('the wishlist', async () => {
    const throwBlanket = bySlug('washed-linen-throw');
    localStorage.setItem(
      GUEST_WISHLIST_KEY,
      JSON.stringify([{ productId: throwBlanket.id, addedAt: '2026-10-01T00:00:00Z', priceAtSave: throwBlanket.price }]),
    );
    renderRoute('/wishlist');
    await expectAccessible(() => main().findByRole('heading', { name: throwBlanket.name }));
  });

  it('a missing page', async () => {
    renderRoute('/no-such-page');
    await expectAccessible(() => heading('This page has wandered off'));
  });
});

describe('dialogs and panels', () => {
  it('the bag drawer', async () => {
    fillBag();
    renderRoute('/');
    await userEvent.click(screen.getByRole('button', { name: /^Bag/ }));
    await expectAccessible(() => screen.findByRole('dialog', { name: /Your bag/ }));
  });

  it('the search panel with suggestions', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('combobox', { name: 'Search the shop' }), 'lin');
    await expectAccessible(() => screen.findAllByRole('option'));
  });

  it('the filter sheet and bottom bar on a phone', async () => {
    const user = userEvent.setup();
    setViewportWidth(375);
    renderRoute('/shop/home');
    await main().findAllByRole('article');
    expect(await axeViolations()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await expectAccessible(() => screen.findByRole('dialog', { name: 'Filters' }));
  });

  it('a form full of errors', async () => {
    const user = userEvent.setup();
    fillBag();
    renderRoute('/checkout');
    await user.click(await main().findByRole('button', { name: /Continue/ }));
    await expectAccessible(() => main().findByRole('alert'));
  });
});

describe('checkout', () => {
  it('address, delivery and payment steps', async () => {
    fillBag();
    const view = renderRoute('/checkout');
    await expectAccessible(() => heading('Checkout'));
    view.unmount();

    readyToPay();
    const delivery = renderRoute('/checkout/delivery');
    await expectAccessible(() => main().findByRole('group', { name: /Delivery speed/ }));
    delivery.unmount();

    renderRoute('/checkout/payment');
    await expectAccessible(() => main().findByRole('heading', { level: 2, name: /Payment/ }));
  });

  it('review and confirmation', async () => {
    readyToPay();
    const view = renderRoute('/checkout/review');
    await expectAccessible(() => main().findByRole('button', { name: /Place order/ }));
    view.unmount();

    const placed = await order();
    renderRoute(`/orders/${placed.id}`);
    await expectAccessible(() => heading(`Order ${placed.id}`));
  });
});

describe('account', () => {
  it('sign in and sign up', async () => {
    const view = renderRoute('/account/sign-in');
    await expectAccessible(() => heading('Sign in'));
    view.unmount();
    renderRoute('/account/sign-up');
    await expectAccessible(() => heading(/Create/));
  });

  it('orders, an order and details', async () => {
    const token = await asCustomer();
    const placed = await order(token);
    await subscribeToRestock(bySlug('wool-boucle-cushion').variants[0]!.id, 'ada@example.com', token);

    const list = renderRoute('/account/orders');
    await expectAccessible(() => main().findByRole('link', { name: new RegExp(placed.id) }));
    list.unmount();

    const detail = renderRoute(`/account/orders/${placed.id}`);
    await expectAccessible(() => main().findByRole('list', { name: 'Order progress' }));
    detail.unmount();

    renderRoute('/account/details');
    await expectAccessible(() => main().findByRole('heading', { name: /restock/i }));
  });
});

describe('admin', () => {
  it('overview, orders and an order', async () => {
    const admin = await asAdmin();
    const placed = await order();
    await updateOrderStatus(admin, placed.id, { to: 'packed', expected: 'placed', note: 'Gift wrapped' });

    const overview = renderRoute('/admin');
    await expectAccessible(() => main().findByRole('heading', { name: 'Net sales by day' }));
    overview.unmount();

    const list = renderRoute('/admin/orders');
    await expectAccessible(() => main().findByRole('table'));
    list.unmount();

    renderRoute(`/admin/orders/${placed.id}`);
    await expectAccessible(() => main().findByRole('button', { name: 'Mark as shipped' }));
  });

  it('products and the product form, with errors', async () => {
    const user = userEvent.setup();
    await asAdmin();
    const list = renderRoute('/admin/products');
    await expectAccessible(() => main().findByRole('table'));
    list.unmount();

    renderRoute('/admin/products/new');
    await user.click(await main().findByRole('button', { name: 'Create product' }));
    await expectAccessible(() => waitFor(() => expect(main().getByRole('alert')).toHaveFocus()));
  });

  it('the refusal customers see', async () => {
    await asCustomer();
    renderRoute('/admin');
    await expectAccessible(() => heading('This area is for the Tanelt team'));
  });
});

describe('page changes', () => {
  const announcer = () => document.querySelector('[data-route-announcer]')!;

  it('announces the new page, but not the first one', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await main().findAllByRole('article');
    expect(announcer()).toHaveTextContent('');
    expect(announcer()).toHaveAttribute('aria-live', 'polite');

    await user.click(within(screen.getByRole('navigation', { name: 'Departments' })).getByRole('link', { name: 'Apparel' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Apparel · Tanelt'));
  });

  it('waits for a title that arrives once the page has loaded', async () => {
    const user = userEvent.setup();
    renderRoute('/shop/apparel');
    const card = (await main().findAllByRole('link', { name: /Relaxed linen shirt/ }))[0]!;
    await user.click(card);
    await waitFor(() => expect(announcer()).toHaveTextContent('Relaxed linen shirt · Tanelt'));
  });
});

describe('control names', () => {
  it('names repeated buttons and links after what they act on', async () => {
    const token = await asCustomer();
    const placed = await order(token);
    fillBag();
    const view = renderRoute('/cart');
    expect(await main().findByRole('button', { name: 'Remove Washed linen throw' })).toBeInTheDocument();
    view.unmount();
    renderRoute('/account/orders');
    expect(await main().findByRole('link', { name: `View order ${placed.id}` })).toBeInTheDocument();
  });
});
