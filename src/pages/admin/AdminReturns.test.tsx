import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAdminReturn, listAdminReturns, updateReturn } from '@/api/adminReturnsApi';
import { signIn, signUp } from '@/api/authApi';
import { findOrder, findVariant, loadOrders, ORDERS_STORAGE_KEY } from '@/api/mockDb';
import { getOrder, placeOrder } from '@/api/ordersApi';
import { loadOutbox } from '@/api/outbox';
import { getOrderReturns, requestReturn } from '@/api/returnsApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine } from '@/domain/cart';
import type { Order } from '@/domain/order';
import type { ReturnRequest } from '@/domain/returns';
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

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

/** A shopper's delivered order of two mug sets, and a return of one of them. */
async function returnOf(method: 'drop-off' | 'pickup' = 'drop-off'): Promise<{ order: Order; request: ReturnRequest; shopper: string }> {
  const { token: shopper } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  const placed = await placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [{ ...makeCartLine(MUG, MUG.variants[0]!), quantity: 2 }],
    methodId: 'standard',
    address: ADDRESS,
    card: CARD,
    sessionToken: shopper,
  });
  const order: Order = { ...placed, status: 'delivered', history: [...placed.history!, { status: 'delivered', at: '2026-10-01T12:00:00Z' }] };
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(loadOrders().map((saved) => (saved.id === order.id ? order : saved))));
  const request = await requestReturn(shopper, {
    orderId: order.id,
    method,
    note: 'One has a hairline crack.',
    lines: [{ variantId: order.lines[0]!.variantId, quantity: 1, reason: 'damaged' }],
  });
  return { order, request, shopper };
}

const lastEmail = () => loadOutbox().at(-1)!;
const main = () => within(screen.getByRole('main'));

describe('processing returns on the server', () => {
  it('is for admins only', async () => {
    const { request, shopper } = await returnOf();
    await expect(listAdminReturns(shopper)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getAdminReturn(shopper, request.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateReturn(shopper, request.id, { to: 'approved', expected: 'requested' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listAdminReturns('nope')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(getAdminReturn(await admin(), 'RT-nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('approves in order, refusing stale and skipped steps', async () => {
    const { request } = await returnOf('pickup');
    const token = await admin();
    await expect(updateReturn(token, request.id, { to: 'refunded', expected: 'requested' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateReturn(token, request.id, { to: 'approved', expected: 'approved' })).rejects.toMatchObject({ code: 'CONFLICT' });

    const { request: approved } = await updateReturn(token, request.id, { to: 'approved', expected: 'requested' });
    expect(approved.status).toBe('approved');
    expect(approved.history.at(-1)).toMatchObject({ status: 'approved', by: 'Studio Admin' });
    expect(lastEmail()).toMatchObject({ to: 'ada@example.com', subject: `Your return ${request.id} is approved` });
    expect(lastEmail().body).toMatch(/courier will collect it/);
  });

  it('needs a reason to decline, tells the shopper, and frees the items', async () => {
    const { order, request, shopper } = await returnOf();
    const token = await admin();
    await expect(updateReturn(token, request.id, { to: 'rejected', expected: 'requested', note: '  ' })).rejects.toMatchObject({
      message: 'Tell the shopper why the return was declined.',
    });
    await updateReturn(token, request.id, { to: 'rejected', expected: 'requested', note: 'This set was a final sale.' });
    expect(lastEmail().subject).toBe(`About your return ${request.id}`);
    expect(lastEmail().body).toContain('This set was a final sale.');
    expect((await getOrderReturns(shopper, order.id)).remaining[order.lines[0]!.variantId]).toBe(2);
  });

  it('restocks received items only when asked', async () => {
    const token = await admin();
    const { order, request } = await returnOf();
    const variant = order.lines[0]!.variantId;
    await updateReturn(token, request.id, { to: 'approved', expected: 'requested' });
    const before = findVariant(variant)!.variant.stock;
    const { restocked } = await updateReturn(token, request.id, { to: 'received', expected: 'approved', restock: true });
    expect(restocked).toBe(1);
    expect(findVariant(variant)!.variant.stock).toBe(before + 1);
    expect(lastEmail().subject).toBe(`Your return ${request.id} arrived`);
  });

  it('refunds up to the estimate, explains a lower one, and records it on the order', async () => {
    const token = await admin();
    const { order, request, shopper } = await returnOf();
    await updateReturn(token, request.id, { to: 'approved', expected: 'requested' });
    await updateReturn(token, request.id, { to: 'received', expected: 'approved' });

    const refund = (amount: number, note?: string) => updateReturn(token, request.id, { to: 'refunded', expected: 'received', amount, note });
    await expect(refund(request.refund + 1)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/^You can refund up to/) });
    await expect(refund(0)).rejects.toMatchObject({ message: 'Refund more than $0.00' });
    await expect(refund(request.refund - 500)).rejects.toMatchObject({ message: 'Say why the refund is less than expected.' });

    const { request: refunded } = await refund(request.refund - 500, 'One mug came back used.');
    expect(refunded).toMatchObject({ status: 'refunded', refund: request.refund - 500 });
    expect(findOrder(order.id)!.refunds).toEqual([{ returnId: request.id, amount: request.refund - 500, at: expect.any(String) }]);
    expect(lastEmail().body).toContain('One mug came back used.');
    expect((await getOrder(order.id, shopper)).refunds).toHaveLength(1);
  });
});

describe('the returns pages', () => {
  async function signedInAdmin() {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  }

  it('lists returns by what needs doing, with search', async () => {
    const user = userEvent.setup();
    const { request } = await returnOf();
    await signedInAdmin();
    renderRoute('/admin/returns');
    expect(await main().findByRole('heading', { name: 'Returns', level: 2 })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: 'Returns' })).toHaveAttribute('aria-current', 'page');
    expect(main().getByRole('button', { name: 'To review, 1 return' })).toHaveAttribute('aria-pressed', 'true');
    expect(main().getByRole('link', { name: request.id })).toHaveAttribute('href', `/admin/returns/${request.id}`);

    await user.type(main().getByRole('textbox', { name: 'Search returns' }), 'grace');
    expect(main().getByText('No returns match "grace".')).toBeInTheDocument();
    await user.clear(main().getByRole('textbox', { name: 'Search returns' }));

    await user.click(main().getByRole('button', { name: 'To refund, 0 returns' }));
    expect(main().getByText('Nothing waiting for a refund.')).toBeInTheDocument();
  });

  it('takes a return from request to refund', async () => {
    const user = userEvent.setup();
    const { order, request } = await returnOf();
    const variant = order.lines[0]!.variantId;
    await signedInAdmin();
    renderRoute(`/admin/returns/${request.id}`);
    expect(await main().findByRole('heading', { name: `Return ${request.id}` })).toBeInTheDocument();
    expect(main().getByText('One has a hairline crack.')).toBeInTheDocument();
    expect(main().getByRole('link', { name: order.id })).toHaveAttribute('href', `/admin/orders/${order.id}`);
    expect(main().getByRole('rowheader', { name: new RegExp(MUG.name) })).toBeInTheDocument();
    expect(main().getByRole('cell', { name: 'Arrived damaged' })).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Approve and send label' }));
    expect(await screen.findByText('Return approved')).toBeInTheDocument();
    expect(await main().findByRole('button', { name: 'Mark as received' })).toBeInTheDocument();

    const stock = findVariant(variant)!.variant.stock;
    await user.click(main().getByRole('checkbox', { name: 'Put the items back in stock' }));
    await user.click(main().getByRole('button', { name: 'Mark as received' }));
    expect(await screen.findByText('Nothing was restocked.')).toBeInTheDocument();
    expect(findVariant(variant)!.variant.stock).toBe(stock);

    const amount = await main().findByRole('textbox', { name: 'Refund amount' });
    await user.clear(amount);
    await user.type(amount, '5.00');
    await user.click(main().getByRole('button', { name: 'Issue refund' }));
    expect(main().getByText('Say why the refund is less than expected')).toBeInTheDocument();
    await user.type(main().getByLabelText(/Message to the shopper/), 'The glaze was scratched.');
    await user.click(main().getByRole('button', { name: 'Issue refund' }));

    expect(await screen.findByText('Refund issued')).toBeInTheDocument();
    expect(await main().findByText('Refunded. Nothing more to do.')).toBeInTheDocument();
    const history = main().getByRole('list', { name: 'History' });
    expect(within(history).getAllByRole('listitem').map((item) => item.firstChild!.textContent)).toEqual([
      'Refunded',
      'Received',
      'Approved',
      'Requested',
    ]);
    expect(within(history).getByText('The glaze was scratched.')).toBeInTheDocument();
    await waitFor(() => expect(findOrder(order.id)!.refunds?.[0]?.amount).toBe(500));
  });

  it('needs a message to decline', async () => {
    const user = userEvent.setup();
    const { request } = await returnOf();
    await signedInAdmin();
    renderRoute(`/admin/returns/${request.id}`);
    await user.click(await main().findByRole('button', { name: 'Decline return' }));
    expect(main().getByText('Tell the shopper why')).toBeInTheDocument();

    await user.type(main().getByLabelText(/Message to the shopper/), 'Outside our policy for opened candles.');
    await user.click(main().getByRole('button', { name: 'Decline return' }));
    expect(await screen.findByText('Return declined')).toBeInTheDocument();
    expect(await main().findByText('Declined. The shopper has been told why.')).toBeInTheDocument();
  });

  it('shows the refund on the shopper’s order', async () => {
    const { order, request, shopper } = await returnOf();
    const token = await admin();
    await updateReturn(token, request.id, { to: 'approved', expected: 'requested' });
    await updateReturn(token, request.id, { to: 'received', expected: 'approved' });
    await updateReturn(token, request.id, { to: 'refunded', expected: 'received' });
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(shopper));
    renderRoute(`/account/orders/${order.id}`);
    expect(await main().findByText(`Refunded for return ${request.id}`)).toBeInTheDocument();
    const returns = await screen.findByRole('region', { name: 'Returns' });
    expect(await within(returns).findByText('Refunded to your card. It can take 5 to 10 days to show.')).toBeInTheDocument();
  });
});
