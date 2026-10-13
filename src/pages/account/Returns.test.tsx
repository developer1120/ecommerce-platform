import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { loadOrders, ORDERS_STORAGE_KEY } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { loadOutbox } from '@/api/outbox';
import { cancelReturn, getOrderReturns, listMyReturns, loadReturns, requestReturn } from '@/api/returnsApi';
import { CATALOG } from '@/data/catalog';
import { makeCartLine, type CartLine } from '@/domain/cart';
import type { Order, OrderStatus } from '@/domain/order';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

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
const MUG = CATALOG.find((product) => product.slug === 'stoneware-mug-set')!;
const INCENSE = CATALOG.find((product) => product.slug === 'ceramic-incense-holder')!;

function line(product: typeof MUG, quantity: number): CartLine {
  return { ...makeCartLine(product, product.variants[0]!), quantity };
}

async function shopper(email = 'ada@example.com', name = 'Ada Lovelace') {
  const { token } = await signUp({ name, email, password: 'slow mornings with tea', remember: true });
  return token;
}

/** An order on the account, moved to a status; delivered ones arrived on October 1 (now is October 7). */
async function orderFor(token: string, status: OrderStatus = 'delivered', deliveredOn = '2026-10-01T12:00:00Z'): Promise<Order> {
  const placed = await placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [line(MUG, 2), line(INCENSE, 1)],
    methodId: 'standard',
    address: ADDRESS,
    card: CARD,
    sessionToken: token,
  });
  const moved: Order = {
    ...placed,
    status,
    history: [...placed.history!, ...(status === 'delivered' ? [{ status, at: deliveredOn }] : [{ status, at: placed.placedAt }])],
  };
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(loadOrders().map((saved) => (saved.id === placed.id ? moved : saved))));
  return moved;
}

const mugLine = (order: Order) => order.lines.find((entry) => entry.productId === MUG.id)!;
const incenseLine = (order: Order) => order.lines.find((entry) => entry.productId === INCENSE.id)!;
const main = () => within(screen.getByRole('main'));

describe('returns on the server', () => {
  it('opens within 30 days of delivery, only for the order owner', async () => {
    const ada = await shopper();
    const order = await orderFor(ada);
    const options = await getOrderReturns(ada, order.id);
    expect(options.eligibility).toEqual({ ok: true, deadline: new Date('2026-10-31T12:00:00Z') });
    expect(options.remaining).toEqual({ [mugLine(order).variantId]: 2, [incenseLine(order).variantId]: 1 });

    const grace = await shopper('grace@example.com', 'Grace Hopper');
    await expect(getOrderReturns(grace, order.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getOrderReturns('nope', order.id)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const old = await orderFor(ada, 'delivered', '2026-08-01T12:00:00Z');
    expect((await getOrderReturns(ada, old.id)).eligibility).toEqual({ ok: false, reason: 'Returns for this order closed on August 31, 2026.' });
    const shipped = await orderFor(ada, 'shipped');
    await expect(
      requestReturn(ada, { orderId: shipped.id, method: 'drop-off', lines: [{ variantId: mugLine(shipped).variantId, quantity: 1, reason: 'damaged' }] }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'You can start a return once your order arrives.' });
  });

  it('records a request with a server-side refund, and emails the shopper', async () => {
    const ada = await shopper();
    const order = await orderFor(ada);
    const request = await requestReturn(ada, {
      orderId: order.id,
      method: 'pickup',
      note: '  One mug has a chip on the rim.  ',
      lines: [
        { variantId: mugLine(order).variantId, quantity: 1, reason: 'damaged' },
        { variantId: incenseLine(order).variantId, quantity: 0, reason: '' },
      ],
    });
    const share = mugLine(order).unitPrice / order.totals.subtotal;
    expect(request).toMatchObject({
      id: `RT-${order.id.slice(3)}-1`,
      status: 'requested',
      method: 'pickup',
      note: 'One mug has a chip on the rim.',
      refund: Math.round(share * (order.totals.subtotal - order.totals.discount + order.totals.tax)),
      lines: [{ variantId: mugLine(order).variantId, quantity: 1, reason: 'damaged', unitPrice: mugLine(order).unitPrice }],
    });
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'ada@example.com', subject: `We've got your return request ${request.id}` });
    expect((await getOrderReturns(ada, order.id)).remaining[mugLine(order).variantId]).toBe(1);
  });

  it('refuses bad requests', async () => {
    const ada = await shopper();
    const order = await orderFor(ada);
    const mug = mugLine(order).variantId;
    const send = (lines: { variantId: string; quantity: number; reason: string }[], method = 'drop-off') =>
      requestReturn(ada, { orderId: order.id, method: method as 'drop-off', lines: lines as never });

    await expect(send([])).rejects.toMatchObject({ code: 'VALIDATION', message: 'Choose at least one item to return' });
    await expect(send([{ variantId: mug, quantity: 1, reason: 'because' }])).rejects.toMatchObject({ message: 'Choose a reason' });
    await expect(send([{ variantId: mug, quantity: 3, reason: 'damaged' }])).rejects.toMatchObject({ message: 'You can return up to 2' });
    await expect(send([{ variantId: mug, quantity: 1, reason: 'damaged' }], 'carrier-pigeon')).rejects.toMatchObject({
      message: 'Choose how to send it back',
    });
    await expect(requestReturn(ada, { orderId: order.id, method: 'drop-off', note: 'x'.repeat(501), lines: [{ variantId: mug, quantity: 1, reason: 'damaged' }] })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(loadReturns()).toEqual([]);
  });

  it('lets the shopper cancel a request until the studio acts on it', async () => {
