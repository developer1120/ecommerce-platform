import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configureApi } from '@/api/client';
import { loadOrders } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { CATALOG } from '@/data/catalog';
import { PROMOTIONS } from '@/data/promotions';
import { cartReducer, EMPTY_CART, makeCartLine, type CartLine, type CartState } from '@/domain/cart';
import { loadCart, saveCart } from '@/domain/cartStorage';
import { CHECKOUT_STORAGE_KEY } from '@/state/CheckoutProvider';
import { PROMO_STORAGE_KEY } from '@/state/PromoProvider';
import { renderRoute } from '@/test/renderRoute';

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

function seedBag(lines: CartLine[]) {
  const state = lines.reduce<CartState>(
    (current, { quantity, ...snapshot }) => cartReducer(current, { type: 'add', line: snapshot, quantity }),
    EMPTY_CART,
  );
  saveCart(state);
}

function line(slug: string, quantity = 1): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[0]!), quantity };
}

function seedReady(card: typeof CARD | { last4: string } = CARD) {
  sessionStorage.setItem(
    CHECKOUT_STORAGE_KEY,
    JSON.stringify({
      address: ADDRESS,
      addressConfirmed: true,
      methodId: 'standard',
      deliveryConfirmed: true,
      card: { ...CARD, ...card },
    }),
  );
}

const placeButton = () => screen.getByRole('button', { name: /^place order/i });

describe('placing an order', () => {
  it('shows the total on the button', () => {
    seedBag([line('washed-linen-throw'), line('cedar-and-vetiver-soap', 2)]);
    seedReady();
    renderRoute('/checkout/review');
    expect(placeButton()).toHaveTextContent('Place order · $124.80');
  });

  it('places the order, opens the confirmation and empties the bag, code and draft', async () => {
    seedBag([line('washed-linen-throw'), line('cedar-and-vetiver-soap', 2)]);
    localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(PROMOTIONS.find((p) => p.code === 'TAKE10')));
    seedReady();
    const { router } = renderRoute('/checkout/review');
    await userEvent.click(placeButton());

    expect(await screen.findByRole('heading', { level: 1, name: 'Your order is on its way, Ada' })).toBeInTheDocument();
    const [order] = loadOrders();
    expect(router.state.location.pathname).toBe(`/orders/${order!.id}`);
    expect(order!.promoCode).toBe('TAKE10');
    expect(screen.getByText(/a receipt is on its way to/i)).toHaveTextContent('ada@example.com');
    await waitFor(() => expect(document.title).toBe('Order confirmed · Tanelt'));

    expect(loadCart().lines).toEqual([]);
    expect(localStorage.getItem(PROMO_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(CHECKOUT_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Bag' })).toBeInTheDocument();
  });

  it('lays out the order on the confirmation page', async () => {
    seedBag([line('washed-linen-throw'), line('cedar-and-vetiver-soap', 2)]);
    seedReady();
    renderRoute('/checkout/review');
    await userEvent.click(placeButton());
    // The review page has a level-1 heading too, so wait for the confirmation's own.
    await screen.findByRole('heading', { level: 1, name: /Your order is on its way/ });

    const delivery = screen.getByRole('region', { name: 'Delivery and payment' });
    expect(delivery).toHaveTextContent('Tue, Oct 13 – Thu, Oct 15');
    expect(delivery).toHaveTextContent('Brooklyn, NY 11201');
    expect(delivery).toHaveTextContent('Visa ending 4242');

    const items = screen.getByRole('region', { name: 'Items' });
    expect(within(items).getAllByRole('listitem')).toHaveLength(2);
    expect(within(items).getByText('Total').parentElement).toHaveTextContent('$124.80');
    expect(within(items).getByText('Tax (NY 4%)').parentElement).toHaveTextContent('$4.80');
  });

  it('explains a declined card and keeps the bag', async () => {
    seedBag([line('cedar-and-vetiver-soap', 1)]);
    seedReady({ last4: '0002' });
    const { router } = renderRoute('/checkout/review');
    await userEvent.click(placeButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your card was declined and you have not been charged.');
    expect(within(alert).getByRole('link', { name: 'Use a different card' })).toHaveAttribute('href', '/checkout/payment');
    expect(router.state.location.pathname).toBe('/checkout/review');
    expect(loadCart().lines).toHaveLength(1);
    expect(placeButton()).not.toHaveAttribute('aria-busy');
  });

  it('updates the bag and lists what changed when stock ran out meanwhile', async () => {
    seedBag([line('hand-thrown-bud-vase', 3)]); // all 3 Chalk vases
    seedReady();
    // Someone else buys two first.
    await placeOrder({
      idempotencyKey: 'someone-else',
      lines: [line('hand-thrown-bud-vase', 2)],
      methodId: 'standard',
      address: ADDRESS,
      card: CARD,
    });

    renderRoute('/checkout/review');
    await userEvent.click(placeButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Some items changed while you were checking out.');
    expect(alert).toHaveTextContent('Only 1 of Hand-thrown bud vase (Chalk) is left, so we lowered your quantity.');
    await waitFor(() => expect(loadCart().lines[0]!.quantity).toBe(1));
    // One $32 vase plus $5.95 shipping, and New York taxes both at 4%: $37.95 + $1.52.
    expect(placeButton()).toHaveTextContent('$39.47');
  });

  it('can be retried after a network error without a second order', async () => {
    seedBag([line('cedar-and-vetiver-soap', 1)]);
    seedReady();
    configureApi({ failureRate: 1 });
    renderRoute('/checkout/review');
    await userEvent.click(placeButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('You have not been charged.');

    configureApi({ failureRate: 0 });
    await userEvent.click(placeButton());
    await screen.findByRole('heading', { level: 1, name: /your order is on its way/i });
    expect(loadOrders()).toHaveLength(1);
  });
});

describe('order page', () => {
  it('shows a past order with its status when revisited', async () => {
    const order = await placeOrder({
      idempotencyKey: 'revisit',
      lines: [line('rose-clay-mask', 1)],
      methodId: 'express',
      address: ADDRESS,
      card: CARD,
    });
    renderRoute(`/orders/${order.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: `Order ${order.id}` })).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.queryByText(/a receipt is on its way/i)).not.toBeInTheDocument();
  });

  it('explains an unknown order number', async () => {
    renderRoute('/orders/OR-000000-XXXX');
    expect(await screen.findByRole('heading', { level: 1, name: "We can't find that order" })).toBeInTheDocument();
  });
});
