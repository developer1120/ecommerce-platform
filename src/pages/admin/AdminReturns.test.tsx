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
