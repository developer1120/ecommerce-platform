import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { loadOrders, ORDERS_STORAGE_KEY, findVariant } from '@/api/mockDb';
import { getOrder, placeOrder } from '@/api/ordersApi';
import { CATALOG } from '@/data/catalog';
import { makeCartLine, type CartLine } from '@/domain/cart';
import { loadCart } from '@/domain/cartStorage';
import type { OrderStatus } from '@/domain/order';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const PASSWORD = 'slow mornings with tea';
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

function line(slug: string, quantity = 1, variantIndex = 0): CartLine {
  const product = CATALOG.find((candidate) => candidate.slug === slug)!;
  return { ...makeCartLine(product, product.variants[variantIndex]!), quantity };
}

async function account(name = 'Ada Lovelace', email = 'ada@example.com') {
  return signUp({ name, email, password: PASSWORD, remember: true });
}

function signInAs(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
}

async function order(token: string | undefined, lines: CartLine[], key = Math.random().toString()) {
  return placeOrder({
    idempotencyKey: key,
    lines,
    methodId: 'standard',
    address: ADDRESS,
    card: CARD,
    ...(token && { sessionToken: token }),
  });
}

/** Stands in for the admin tools that arrive later: moves an order along. */
function setStatus(id: string, status: OrderStatus) {
  const orders = loadOrders().map((saved) => (saved.id === id ? { ...saved, status } : saved));
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

const main = () => within(screen.getByRole('main'));

describe('account access', () => {
  it('sends a signed-out visitor to sign in and back', async () => {
    const { router } = renderRoute('/account/orders');
    await waitFor(() => expect(router.state.location.pathname).toBe('/account/sign-in'));
    expect(router.state.location.search).toBe('?next=%2Faccount%2Forders');
  });

  it('opens on the orders page', async () => {
    const { token } = await account();
    signInAs(token);
    const { router } = renderRoute('/account');
    await waitFor(() => expect(router.state.location.pathname).toBe('/account/orders'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Ada' })).toBeInTheDocument();
  });

  it('links to orders and details from the account menu', async () => {
    const { token } = await account();
    signInAs(token);
    renderRoute('/');
    await userEvent.click(await screen.findByRole('button', { name: /account menu/i }));
    expect(screen.getByRole('link', { name: 'Your orders' })).toHaveAttribute('href', '/account/orders');
    expect(screen.getByRole('link', { name: 'Your details' })).toHaveAttribute('href', '/account/details');
  });

  it('shows the account details', async () => {
    const { token } = await account();
    signInAs(token);
    renderRoute('/account/details');
    const details = await main().findByRole('region', { name: 'Your details' });
    expect(details).toHaveTextContent('Ada Lovelace');
    expect(details).toHaveTextContent('ada@example.com');
    expect(details).toHaveTextContent('October 7, 2026');
  });
});

describe('order history', () => {
  it('lists only this account’s orders, newest first', async () => {
    const ada = await account();
    const grace = await account('Grace Hopper', 'grace@example.com');
    const first = await order(ada.token, [line('cedar-and-vetiver-soap', 2)]);
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const second = await order(ada.token, [line('washed-linen-throw'), line('rose-clay-mask')]);
    await order(grace.token, [line('oak-serving-board')]);
    await order(undefined, [line('lip-balm-trio')]);

    signInAs(ada.token);
    renderRoute('/account/orders');
    const cards = await main().findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([second.id, first.id]);
    expect(cards[0]).toHaveTextContent('Placed October 8, 2026 · 2 items');
    expect(cards[1]).toHaveTextContent('Order placed');
    expect(within(cards[0]!).getByRole('link', { name: `View order ${second.id}` })).toHaveAttribute(
      'href',
      `/account/orders/${second.id}`,
    );
  });

  it('filters by status', async () => {
    const { token } = await account();
    const open = await order(token, [line('cedar-and-vetiver-soap')]);
    const done = await order(token, [line('rose-clay-mask')]);
    setStatus(done.id, 'delivered');

    signInAs(token);
    renderRoute('/account/orders');
    await main().findAllByRole('article');
    await userEvent.click(main().getByRole('button', { name: 'Delivered' }));
    expect(main().getAllByRole('article').map((card) => within(card).getByRole('heading').textContent)).toEqual([done.id]);
    await userEvent.click(main().getByRole('button', { name: 'In progress' }));
    expect(main().getAllByRole('article').map((card) => within(card).getByRole('heading').textContent)).toEqual([open.id]);
    await userEvent.click(main().getByRole('button', { name: 'Cancelled' }));
    expect(main().getByText('No cancelled orders.')).toBeInTheDocument();
  });

  it('invites a first order when there are none', async () => {
    const { token } = await account();
    signInAs(token);
    renderRoute('/account/orders');
    expect(await main().findByRole('heading', { name: 'No orders yet' })).toBeInTheDocument();
  });
});

describe('order detail', () => {
  it('shows progress, delivery, payment, items and totals', async () => {
    const { token } = await account();
    const placed = await order(token, [line('washed-linen-throw'), line('cedar-and-vetiver-soap', 2)]);
    setStatus(placed.id, 'shipped');
    signInAs(token);
    renderRoute(`/account/orders/${placed.id}`);

    expect(await main().findByRole('heading', { name: `Order ${placed.id}` })).toBeInTheDocument();
    const progress = main().getByRole('list', { name: 'Order progress' });
    expect(within(progress).getByText('Shipped').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(within(progress).getByText('Packed').closest('li')).toHaveTextContent('(done)');
    expect(main().getByText(/expected tue, oct 13 – thu, oct 15/i)).toBeInTheDocument();
    expect(main().getByRole('region', { name: 'Shipping to' })).toHaveTextContent('Brooklyn, NY 11201');
    expect(main().getByRole('region', { name: 'Payment' })).toHaveTextContent('Visa ending 4242');
    expect(within(main().getByRole('region', { name: 'Items' })).getByText('Total').parentElement).toHaveTextContent('$124.80');
  });

  it('explains a cancelled order', async () => {
    const { token } = await account();
    const placed = await order(token, [line('rose-clay-mask')]);
    setStatus(placed.id, 'cancelled');
    signInAs(token);
    renderRoute(`/account/orders/${placed.id}`);
    expect(await main().findByText(/this order was cancelled/i)).toBeInTheDocument();
  });

  it('buys an item again, at today’s price', async () => {
    const { token } = await account();
    const placed = await order(token, [line('cedar-and-vetiver-soap', 2)]);
    signInAs(token);
    renderRoute(`/account/orders/${placed.id}`);
    await userEvent.click(await main().findByRole('button', { name: 'Buy again: Cedar and vetiver soap' }));
    await waitFor(() => expect(loadCart().lines).toHaveLength(1));
    expect(loadCart().lines[0]).toMatchObject({ variantId: 'ra-soap', quantity: 1, unitPrice: 1200 });
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Added to your bag');
  });

  it('says when an item to buy again has sold out', async () => {
    const { token } = await account();
    const placed = await order(token, [line('hand-thrown-bud-vase', 3)]); // the last three Chalk vases
    expect(findVariant('hk-vase-chal')!.variant.stock).toBe(0);
    signInAs(token);
    renderRoute(`/account/orders/${placed.id}`);
    await userEvent.click(await main().findByRole('button', { name: /buy again: hand-thrown bud vase/i }));
    expect(await screen.findByText('Hand-thrown bud vase is sold out')).toBeInTheDocument();
    expect(loadCart().lines).toEqual([]);
  });

  it("will not show another account's order", async () => {
    const grace = await account('Grace Hopper', 'grace@example.com');
    const theirs = await order(grace.token, [line('oak-serving-board')]);
    const { token } = await account();
    signInAs(token);
    renderRoute(`/account/orders/${theirs.id}`);
    expect(await main().findByRole('heading', { name: "We can't find that order" })).toBeInTheDocument();
  });
});

describe('order privacy outside the account', () => {
  it("hides an account's order from the public order page unless signed in as its owner", async () => {
    const { token } = await account();
    const placed = await order(token, [line('rose-clay-mask')]);
    await expect(getOrder(placed.id, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getOrder(placed.id, token)).resolves.toMatchObject({ id: placed.id });

    signInAs(token);
    renderRoute(`/orders/${placed.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Order ${placed.id}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Track it in your account' })).toHaveAttribute(
      'href',
      `/account/orders/${placed.id}`,
    );
  });

  it('keeps guest orders reachable by number, like a receipt link', async () => {
    const placed = await order(undefined, [line('rose-clay-mask')]);
    renderRoute(`/orders/${placed.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Order ${placed.id}` })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Track it in your account' })).not.toBeInTheDocument();
  });
});
