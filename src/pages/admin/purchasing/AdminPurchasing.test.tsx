import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn, signUp } from '@/api/authApi';
import { findVariant } from '@/api/mockDb';
import { loadOutbox } from '@/api/outbox';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  listSuppliers,
  loadPurchaseOrders,
  receivePurchaseOrder,
  sendPurchaseOrder,
} from '@/api/purchaseOrdersApi';
import { subscribeToRestock } from '@/api/stockAlertsApi';
import { loadMovements } from '@/api/stockMovements';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
// Ids only: the mock server swaps in fresh catalog objects between tests.
const [SPECKLED, LILAC] = CATALOG.find((product) => product.id === 'hk-mug')!.variants.map((variant) => variant.id) as [string, string];
const variant = (variantId: string) => findVariant(variantId)!.variant;
const stockOf = (variantId: string) => variant(variantId).stock;

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

describe('purchase orders on the server', () => {
  it('drafts, sends and receives an order in two deliveries', async () => {
    const token = await admin();
    const before = stockOf(LILAC);
    const draft = await createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: LILAC, quantity: 12 }], note: 'Glossy rims please' });
    expect(draft).toMatchObject({ id: 'PO-1001', status: 'draft', lines: [{ ordered: 12, received: 0, unitCost: 1728 }] });

    const sent = await sendPurchaseOrder(token, draft.id);
    // Wednesday October 7 plus 15 working days.
    expect(sent).toMatchObject({ status: 'sent', expectedAt: '2026-10-28T19:00:00.000Z' });
    expect(loadOutbox().at(-1)).toMatchObject({ to: 'orders@hollowkiln.example', subject: 'Purchase order PO-1001 from Tanelt' });
    expect(loadOutbox().at(-1)!.body).toContain(`12 × Stoneware mug set (Lilac), ${variant(LILAC).sku}`);

    const first = await receivePurchaseOrder(token, draft.id, { receipt: { [LILAC]: 5 }, expected: 'sent' });
    expect(first.order.status).toBe('partial');
    expect(stockOf(LILAC)).toBe(before + 5);
    await expect(receivePurchaseOrder(token, draft.id, { receipt: { [LILAC]: 8 }, expected: 'partial' })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Only 7 still to come',
    });
    // Someone looking at the order before the first delivery can't book it twice.
    await expect(receivePurchaseOrder(token, draft.id, { receipt: { [LILAC]: 7 }, expected: 'sent' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const second = await receivePurchaseOrder(token, draft.id, { receipt: { [LILAC]: 7 }, expected: 'partial' });
    expect(second.order.status).toBe('received');
    expect(stockOf(LILAC)).toBe(before + 12);
    expect(loadMovements().filter((movement) => movement.reference === 'PO-1001').map((movement) => movement.change)).toEqual([5, 7]);
  });

  it('emails shoppers waiting for an item when the delivery restocks it', async () => {
    const token = await admin();
    variant(LILAC).stock = 0;
    await subscribeToRestock(LILAC, 'ada@example.com');
    const order = await createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: LILAC, quantity: 24 }] });
    await sendPurchaseOrder(token, order.id);
    const { notified } = await receivePurchaseOrder(token, order.id, { receipt: { [LILAC]: 24 }, expected: 'sent' });
    expect(notified).toBe(1);
  });

  it('only orders a maker’s own items, once each, from admins', async () => {
    const token = await admin();
    const throw_ = CATALOG.find((product) => product.id === 'ff-throw')!.variants[0]!;
    await expect(createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: throw_.id, quantity: 1 }] })).rejects.toMatchObject({
      message: "Hollow Kiln doesn't make that item",
    });
    await expect(
      createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: LILAC, quantity: 1 }, { variantId: LILAC, quantity: 2 }] }),
    ).rejects.toMatchObject({ message: 'Each item can only be on the order once' });
    await expect(createPurchaseOrder(token, { supplier: 'Nobody', lines: [] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { token: shopper } = await signUp({ name: 'Ada', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    await expect(listSuppliers(shopper)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cancels quietly as a draft, and tells the maker once sent', async () => {
    const token = await admin();
    const taper = CATALOG.find((product) => product.id === 'sl-taper')!.variants[0]!;
    const draft = await createPurchaseOrder(token, { supplier: 'Still Light', lines: [{ variantId: taper.id, quantity: 24 }] });
    const emails = loadOutbox().length;
    await cancelPurchaseOrder(token, draft.id, { expected: 'draft' });
    expect(loadOutbox()).toHaveLength(emails);

    const again = await createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: SPECKLED, quantity: 24 }] });
    await sendPurchaseOrder(token, again.id);
    const cancelled = await cancelPurchaseOrder(token, again.id, { expected: 'sent', note: 'Overstocked after all.' });
    expect(cancelled.history.at(-1)).toMatchObject({ status: 'cancelled', note: 'Overstocked after all.' });
    expect(loadOutbox().at(-1)).toMatchObject({ subject: `Cancelled: purchase order ${again.id}` });
    await expect(cancelPurchaseOrder(token, again.id, { expected: 'cancelled' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('purchasing in the admin', () => {
  beforeEach(async () => {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  });

  it('builds a draft from the reorder suggestions, sends it and books in the delivery', async () => {
    const user = userEvent.setup();
    variant(LILAC).stock = 0;
    const { router } = renderRoute('/admin/purchasing');

    const makers = await main().findByRole('table', { name: 'Makers' });
    const kiln = within(makers).getByRole('row', { name: /Hollow Kiln/ });
    expect(kiln).toHaveTextContent('15 working days');
    expect(main().getByText('Nothing on order. Start one from a maker below.')).toBeInTheDocument();
    await user.click(within(kiln).getByRole('link', { name: 'Hollow Kiln' }));

    const lilac = await main().findByRole('textbox', { name: 'Units of Stoneware mug set, Lilac' });
    expect(lilac).not.toHaveValue('');
    expect(within(lilac.closest('tr')!).getByText('Sold out')).toBeInTheDocument();

    const speckled = main().getByRole('textbox', { name: 'Units of Stoneware mug set, Speckled' });
    await user.clear(speckled);
    await user.type(speckled, 'lots');
    await user.click(main().getByRole('button', { name: 'Save draft' }));
    expect(main().getByText('Enter a whole number')).toBeInTheDocument();

    for (const input of main().getAllByRole('textbox', { name: /^Units of/ })) await user.clear(input);
    await user.type(lilac, '30');
    expect(main().getByText(/30 units · \$518\.40/)).toBeInTheDocument();
    await user.click(main().getByRole('button', { name: 'Save draft' }));

    expect(await main().findByRole('heading', { name: 'Purchase order PO-1001' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/purchasing/PO-1001');
    await user.click(main().getByRole('button', { name: 'Send to Hollow Kiln' }));
    expect(await screen.findByText('PO-1001 sent')).toBeInTheDocument();

    await user.click(await main().findByRole('button', { name: 'Everything arrived' }));
    expect(main().getByRole('textbox', { name: 'Units of Stoneware mug set, Lilac that arrived' })).toHaveValue('30');
    await user.click(main().getByRole('button', { name: 'Book in and restock' }));
    expect(await screen.findByText('30 units booked in')).toBeInTheDocument();
    await waitFor(() => expect(main().getByText('Everything has arrived. Nothing more to do.')).toBeInTheDocument());
    expect(stockOf(LILAC)).toBe(30);
    expect(loadPurchaseOrders()[0]).toMatchObject({ status: 'received' });
  });

  it('lists open orders and flags late ones', async () => {
    const token = JSON.parse(localStorage.getItem(SESSION_TOKEN_KEY)!) as string;
    const order = await createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: SPECKLED, quantity: 24 }] });
    await sendPurchaseOrder(token, order.id);
    // Past the expected date, but inside the admin session.
    vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1000);

    renderRoute('/admin/purchasing');
    const orders = await main().findByRole('table', { name: 'Purchase orders' });
    const row = within(orders).getByRole('row', { name: /PO-1001/ });
    expect(row).toHaveTextContent('Hollow Kiln');
    expect(row).toHaveTextContent('0 / 24');
    expect(within(row).getByText('Late')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'On order, 1 order' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: 'Purchasing' })).toHaveAttribute('aria-current', 'page');
  });

  it('asks before cancelling, and tells the maker', async () => {
    const user = userEvent.setup();
    const token = JSON.parse(localStorage.getItem(SESSION_TOKEN_KEY)!) as string;
    const order = await createPurchaseOrder(token, { supplier: 'Hollow Kiln', lines: [{ variantId: SPECKLED, quantity: 24 }] });
    await sendPurchaseOrder(token, order.id);
    renderRoute(`/admin/purchasing/${order.id}`);

    await user.click(await main().findByRole('button', { name: 'Cancel order' }));
    await user.type(main().getByLabelText('Message to Hollow Kiln (optional)'), 'Sorry, overstocked.');
    await user.click(main().getByRole('button', { name: 'Yes, cancel order' }));
    expect(await screen.findByText('PO-1001 cancelled')).toBeInTheDocument();
    expect(main().getByText('This order was cancelled.')).toBeInTheDocument();
    expect(loadOutbox().at(-1)!.body).toContain('Sorry, overstocked.');
  });
});
