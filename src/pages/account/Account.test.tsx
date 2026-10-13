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
