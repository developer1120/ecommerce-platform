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
    const ada = await shopper();
    const order = await orderFor(ada);
    const request = await requestReturn(ada, { orderId: order.id, method: 'drop-off', lines: [{ variantId: mugLine(order).variantId, quantity: 2, reason: 'too-large' }] });

    const grace = await shopper('grace@example.com', 'Grace Hopper');
    await expect(cancelReturn(grace, request.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const cancelled = await cancelReturn(ada, request.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.history.map((event) => event.status)).toEqual(['requested', 'cancelled']);
    await expect(cancelReturn(ada, request.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    // Cancelled items can go back again, in a new request with the next number.
    expect((await getOrderReturns(ada, order.id)).remaining[mugLine(order).variantId]).toBe(2);
    const again = await requestReturn(ada, { orderId: order.id, method: 'drop-off', lines: [{ variantId: mugLine(order).variantId, quantity: 1, reason: 'too-large' }] });
    expect(again.id).toBe(`RT-${order.id.slice(3)}-2`);
    expect((await listMyReturns(ada)).map((entry) => entry.id)).toEqual([again.id, request.id]);
    expect(await listMyReturns(grace)).toEqual([]);
  });
});

describe('returning items from the account', () => {
  async function signedIn() {
    const token = await shopper();
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    return token;
  }

  it('offers a return on a delivered order, with the deadline', async () => {
    const order = await orderFor(await signedIn());
    renderRoute(`/account/orders/${order.id}`);
    const returns = await screen.findByRole('region', { name: 'Returns' });
    expect(await within(returns).findByText('October 31, 2026')).toBeInTheDocument();
    expect(within(returns).getByRole('link', { name: 'Start a return' })).toHaveAttribute('href', `/account/orders/${order.id}/return`);
  });

  it('explains why a shipped order cannot be returned yet, and hides returns before shipping', async () => {
    const token = await signedIn();
    const shipped = await orderFor(token, 'shipped');
    const { router } = renderRoute(`/account/orders/${shipped.id}`);
    const returns = await screen.findByRole('region', { name: 'Returns' });
    expect(await within(returns).findByText('You can start a return once your order arrives.')).toBeInTheDocument();

    const packed = await orderFor(token, 'packed');
    await router.navigate(`/account/orders/${packed.id}`);
    expect(await main().findByRole('heading', { name: `Order ${packed.id}` })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Returns' })).not.toBeInTheDocument();
  });

  it('walks through a return request', async () => {
    const user = userEvent.setup();
    const order = await orderFor(await signedIn());
    const { router } = renderRoute(`/account/orders/${order.id}/return`);
    expect(await main().findByRole('heading', { name: 'Return items' })).toBeInTheDocument();
    const refund = () => within(screen.getByRole('complementary', { name: 'Refund' }));

    await user.click(main().getByRole('button', { name: 'Request return' }));
    expect(main().getByRole('alert')).toHaveTextContent('Choose at least one item to return');

    const mug = main().getByRole('group', { name: MUG.name });
    await user.click(within(mug).getByRole('checkbox', { name: new RegExp(`Return ${MUG.name}`) }));
    expect(main().queryByRole('alert')).not.toBeInTheDocument();
    await user.selectOptions(within(mug).getByLabelText('How many'), '2');
    await user.click(main().getByRole('button', { name: 'Request return' }));
    expect(within(mug).getByLabelText(/^Reason/)).toHaveAccessibleDescription('Choose a reason');

    await user.selectOptions(within(mug).getByLabelText(/^Reason/), 'too-large');
    expect(refund().getByText('2')).toBeInTheDocument();
    await user.click(main().getByRole('radio', { name: /Book a pickup/ }));
    await user.type(main().getByLabelText(/Anything we should know/), 'Lovely, just too big.');
    await user.click(main().getByRole('button', { name: 'Request return' }));

    expect(await screen.findByText('Return requested')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/account/orders/${order.id}`));
    const returns = await screen.findByRole('region', { name: 'Returns' });
    const request = await within(returns).findByRole('article', { name: `Return RT-${order.id.slice(3)}-1` });
    expect(request).toHaveTextContent(`2 × ${MUG.name}`);
    expect(request).toHaveTextContent('Too large');
    expect(request).toHaveTextContent('Book a pickup');
    expect(within(request).getByText('Requested', { selector: 'span' })).toBeInTheDocument();
    expect(loadReturns()[0]!.note).toBe('Lovely, just too big.');
  });

  it('does not offer items already in a return', async () => {
    const token = await signedIn();
    const order = await orderFor(token);
    await requestReturn(token, { orderId: order.id, method: 'drop-off', lines: [{ variantId: incenseLine(order).variantId, quantity: 1, reason: 'changed-mind' }] });
    renderRoute(`/account/orders/${order.id}/return`);
    const incense = await main().findByRole('group', { name: INCENSE.name });
    expect(incense).toBeDisabled();
    expect(incense).toHaveTextContent('Already in a return');
  });

  it('cancels a return from the returns page', async () => {
    const user = userEvent.setup();
    const token = await signedIn();
    const order = await orderFor(token);
    const request = await requestReturn(token, { orderId: order.id, method: 'drop-off', lines: [{ variantId: mugLine(order).variantId, quantity: 1, reason: 'damaged' }] });
    renderRoute('/account/returns');
    const nav = await screen.findByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('link', { name: 'Returns' })).toHaveAttribute('aria-current', 'page');

    const inProgress = await main().findByRole('region', { name: /In progress/ });
    const card = within(inProgress).getByRole('article', { name: `Return ${request.id}` });
    expect(within(card).getByRole('link', { name: order.id })).toHaveAttribute('href', `/account/orders/${order.id}`);
    await user.click(within(card).getByRole('button', { name: 'Cancel return' }));
    await user.click(within(card).getByRole('button', { name: 'Yes, cancel it' }));

    expect(await screen.findByText('Return cancelled')).toBeInTheDocument();
    const finished = await main().findByRole('region', { name: /Finished/ });
    expect(within(finished).getByRole('article', { name: `Return ${request.id}` })).toHaveTextContent('You cancelled this return.');
    expect(within(main().getByRole('region', { name: /In progress/ })).getByText('Nothing in progress.')).toBeInTheDocument();
  });

  it('says when there are no returns', async () => {
    await signedIn();
    renderRoute('/account/returns');
    expect(await main().findByText(/No returns\./)).toBeInTheDocument();
  });

  it('keeps others away from the return form', async () => {
    const order = await orderFor(await shopper('grace@example.com', 'Grace Hopper'));
    await signedIn();
    renderRoute(`/account/orders/${order.id}/return`);
    expect(await main().findByText("We can't find that order")).toBeInTheDocument();
  });
});
