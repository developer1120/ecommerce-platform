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
});

describe('orders list', () => {
  it('shows work to do first, with counts, search and a filter kept in the address', async () => {
    const user = userEvent.setup();
    const admin = await adminToken();
    const customer = await customerToken();
    const first = await order([line('washed-linen-throw')], customer);
    const second = await order([line('cedar-and-vetiver-soap', 3)], undefined, 'Grace', 'grace@example.com');
    const third = await order([line('washed-linen-throw')], undefined, 'Hedy', 'hedy@example.com');
    await updateOrderStatus(admin, third.id, { to: 'cancelled', expected: 'placed' });
    signInAs(admin);
    const { router } = renderRoute('/admin/orders');

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/orders'));
    const rows = () => within(main().getByRole('table')).getAllByRole('row').slice(1);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(main().getByRole('button', { name: 'To do, 2 orders' })).toHaveAttribute('aria-pressed', 'true');
    expect(main().getByRole('button', { name: 'Cancelled, 1 order' })).toBeInTheDocument();
    expect(rows().map((row) => within(row).getByRole('rowheader').textContent).sort()).toEqual([first.id, second.id].sort());
    const graceRow = rows().find((row) => row.textContent?.includes('Grace'))!;
    expect(graceRow).toHaveTextContent('grace@example.com · guest');
    expect(graceRow).toHaveTextContent('3');

    await user.click(main().getByRole('button', { name: 'All, 3 orders' }));
    expect(router.state.location.search).toBe('?status=all');
    expect(rows()).toHaveLength(3);
    await user.type(main().getByLabelText('Search orders'), 'hedy');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Cancelled');

    await user.click(within(rows()[0]!).getByRole('link', { name: third.id }));
    expect(await main().findByRole('heading', { name: `Order ${third.id}` })).toBeInTheDocument();
    expect(main().getByText('This order is cancelled. Nothing more to do.')).toBeInTheDocument();
  });
});

describe('working an order', () => {
  it('packs and ships it, and the shopper sees the tracking number', async () => {
    const user = userEvent.setup();
    const customer = await customerToken();
    const placed = await order([line('washed-linen-throw')], customer);
    signInAs(await adminToken());
    const view = renderRoute(`/admin/orders/${placed.id}`);
    const history = () => main().getByRole('list', { name: 'History' });

    await user.type(await main().findByLabelText('Note for the history (optional)'), 'Wrapped in tissue');
    await user.click(main().getByRole('button', { name: 'Mark as packed' }));
    expect(await screen.findByText('Marked as packed')).toBeInTheDocument();
    expect(within(history()).getAllByRole('listitem')[0]).toHaveTextContent('PackedOct 7, 2026, 7:00 PM UTC · Studio AdminWrapped in tissue');
    expect(main().getByLabelText('Note for the history (optional)')).toHaveValue('');

    // Shipping needs the carrier and a tracking number.
    await user.click(main().getByRole('button', { name: 'Mark as shipped' }));
    expect(main().getByRole('combobox', { name: /Carrier/ })).toHaveAccessibleDescription('Choose the carrier');
    expect(main().getByLabelText(/^Tracking number/)).toHaveAccessibleDescription('Enter the tracking number from the label');
    await user.selectOptions(main().getByRole('combobox', { name: /Carrier/ }), 'UPS');
    await user.type(main().getByLabelText(/^Tracking number/), TRACKING.number);
    await user.click(main().getByRole('button', { name: 'Mark as shipped' }));
    expect(await screen.findByText('Marked as shipped')).toBeInTheDocument();
    expect(screen.getByText("We've emailed ada@example.com the tracking number.")).toBeInTheDocument();
    expect(main().getByText('1Z999AA10123456784')).toBeInTheDocument();
    // Once it's shipped it can only be delivered, not cancelled.
    expect(main().getByRole('button', { name: 'Mark as delivered' })).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();

    view.unmount();
    signInAs(customer);
    renderRoute(`/account/orders/${placed.id}`);
    expect(await main().findByText(/On its way with UPS\. Tracking number/)).toHaveTextContent('1Z999AA10123456784');
    const progress = main().getByRole('list', { name: 'Order progress' });
    expect(within(progress).getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Order placed (done)Oct 7',
      'Packed (done)Oct 7',
      'ShippedOct 7',
      'Delivered',
    ]);
  });

  it('asks before cancelling, then restocks', async () => {
    const user = userEvent.setup();
    const placed = await order([line('washed-linen-throw', 2)]);
    const variantId = placed.lines[0]!.variantId;
    const stockAfterOrder = findVariant(variantId)!.variant.stock;
    signInAs(await adminToken());
    renderRoute(`/admin/orders/${placed.id}`);

    await user.click(await main().findByRole('button', { name: 'Cancel order' }));
    const confirm = main().getByRole('group', { name: /Cancel order OR-/ });
    expect(confirm).toHaveTextContent('Its 2 items go back into stock');
    expect(within(confirm).getByRole('button', { name: 'Keep order' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Keep order' }));
    expect(main().getByRole('button', { name: 'Cancel order' })).toHaveFocus();
    expect(findOrder(placed.id)?.status).toBe('placed');

    await user.click(main().getByRole('button', { name: 'Cancel order' }));
    await user.click(main().getByRole('button', { name: 'Yes, cancel order' }));
    expect(await screen.findByText('Order cancelled')).toBeInTheDocument();
    expect(screen.getByText('2 items are back in stock and the refund is on its way.')).toBeInTheDocument();
    expect(main().getByText('This order is cancelled. Nothing more to do.')).toBeInTheDocument();
    expect(findVariant(variantId)!.variant.stock).toBe(stockAfterOrder + 2);
  });

  it('loads the latest version when someone else got there first', async () => {
    const user = userEvent.setup();
    const admin = await adminToken();
    const placed = await order([line('washed-linen-throw')]);
    signInAs(admin);
    renderRoute(`/admin/orders/${placed.id}`);
    const pack = await main().findByRole('button', { name: 'Mark as packed' });

    await updateOrderStatus(admin, placed.id, { to: 'cancelled', expected: 'placed' });
    await user.click(pack);
    expect(await screen.findByText('This order changed')).toBeInTheDocument();
    expect(await main().findByText('This order is cancelled. Nothing more to do.')).toBeInTheDocument();
    expect(findOrder(placed.id)?.status).toBe('cancelled');
  });

  it('turns customers away from orders too', async () => {
    signInAs(await customerToken());
    renderRoute('/admin/orders');
    expect(await main().findByRole('heading', { name: 'This area is for the Tanelt team' })).toBeInTheDocument();
  });
});
