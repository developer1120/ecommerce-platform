import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listAdminOrders, updateOrderStatus } from '@/api/adminOrdersApi';
import { signIn, signUp } from '@/api/authApi';
import { findOrder, findVariant } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { loadOutbox, subscribeToRestock } from '@/api/stockAlertsApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine, type CartLine } from '@/domain/cart';
import type { Order } from '@/domain/order';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const TRACKING = { carrier: 'UPS', number: '1z 999 aa1 0123456784' };

function line(slug: string, quantity = 1): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[0]!), quantity };
}

function signInAs(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
}

async function adminToken() {
  return (await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true })).token;
}

async function customerToken() {
  return (await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true }))
    .token;
}

function order(lines: CartLine[], sessionToken?: string, firstName = 'Ada', email = 'ada@example.com'): Promise<Order> {
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines,
    methodId: 'standard',
    address: { email, firstName, lastName: 'Lovelace', line1: '12 Analytical Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: `${firstName} Lovelace` },
    ...(sessionToken && { sessionToken }),
  });
}

describe('order status on the server', () => {
  it('is for the Tanelt team only', async () => {
    const customer = await customerToken();
    const placed = await order([line('washed-linen-throw')], customer);
    await expect(listAdminOrders(customer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateOrderStatus(customer, placed.id, { to: 'packed', expected: 'placed' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(findOrder(placed.id)?.status).toBe('placed');
  });

  it('packs, ships and delivers, keeping a history and emailing the shopper', async () => {
    const admin = await adminToken();
    const placed = await order([line('washed-linen-throw')]);
    await updateOrderStatus(admin, placed.id, { to: 'packed', expected: 'placed', note: '  Gift wrapped  ' });
    const shipped = await updateOrderStatus(admin, placed.id, { to: 'shipped', expected: 'packed', tracking: TRACKING });
    expect(shipped.order.tracking).toEqual({ carrier: 'UPS', number: '1Z999AA10123456784' });
    const delivered = await updateOrderStatus(admin, placed.id, { to: 'delivered', expected: 'shipped' });

    expect(delivered.order.history).toEqual([
      { status: 'placed', at: placed.placedAt },
      { status: 'packed', at: expect.any(String), by: 'Studio Admin', note: 'Gift wrapped' },
      { status: 'shipped', at: expect.any(String), by: 'Studio Admin' },
      { status: 'delivered', at: expect.any(String), by: 'Studio Admin' },
    ]);
    expect(findOrder(placed.id)).toEqual(delivered.order);
    // Packing is behind the scenes; shipping and delivery are worth an email.
    expect(loadOutbox().map((email) => [email.to, email.subject])).toEqual([
      ['ada@example.com', `Your Tanelt order ${placed.id} is on its way`],
      ['ada@example.com', `Your Tanelt order ${placed.id} was delivered`],
    ]);
    expect(loadOutbox()[0]!.body).toContain('UPS. Tracking number: 1Z999AA10123456784');
  });

  it('refuses skipped steps, missing tracking and stale changes', async () => {
    const admin = await adminToken();
    const placed = await order([line('washed-linen-throw')]);
    await expect(updateOrderStatus(admin, placed.id, { to: 'shipped', expected: 'placed', tracking: TRACKING })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: `An order that is "Order placed" can't be moved to "Shipped".`,
    });
    await updateOrderStatus(admin, placed.id, { to: 'packed', expected: 'placed' });
    await expect(updateOrderStatus(admin, placed.id, { to: 'shipped', expected: 'packed' })).rejects.toMatchObject({
      message: 'Choose the carrier.',
    });
    await expect(
      updateOrderStatus(admin, placed.id, { to: 'shipped', expected: 'packed', tracking: { carrier: 'UPS', number: '123' } }),
    ).rejects.toMatchObject({ message: 'Tracking numbers are 8 to 34 letters and digits' });
    // A change from a screen that still shows the order as placed is refused.
    await expect(updateOrderStatus(admin, placed.id, { to: 'cancelled', expected: 'placed' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(updateOrderStatus(admin, 'OR-000000-NONE', { to: 'packed', expected: 'placed' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(findOrder(placed.id)?.status).toBe('packed');
    expect(loadOutbox()).toEqual([]);
  });

  it('puts cancelled items back into stock and tells shoppers waiting for them', async () => {
    const admin = await adminToken();
    const product = CATALOG.find((candidate) => candidate.variants[0]!.stock >= 2 && candidate.variants[0]!.stock <= 6)!;
    const variant = product.variants[0]!;
    const before = variant.stock;
    const placed = await order([line(product.slug, before)]);
    expect(findVariant(variant.id)?.variant.stock).toBe(0);
    await subscribeToRestock(variant.id, 'grace@example.com');

    const result = await updateOrderStatus(admin, placed.id, { to: 'cancelled', expected: 'placed' });
    expect(result).toMatchObject({ restocked: before, notified: 1, order: { status: 'cancelled' } });
    expect(findVariant(variant.id)?.variant.stock).toBe(before);
    expect(loadOutbox().map((email) => email.to).sort()).toEqual(['ada@example.com', 'grace@example.com']);
    expect(loadOutbox().find((email) => email.to === 'ada@example.com')?.body).toContain('refunded');
    await expect(updateOrderStatus(admin, placed.id, { to: 'packed', expected: 'cancelled' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
