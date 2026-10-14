import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveProduct } from '@/api/adminApi';
import { updateReturn } from '@/api/adminReturnsApi';
import { signIn, signUp } from '@/api/authApi';
import { adjustStock, getStockHistory, listInventory } from '@/api/inventoryApi';
import { CATALOG_KEY, findVariant, loadOrders, ORDERS_STORAGE_KEY } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { loadOutbox } from '@/api/outbox';
import { requestReturn } from '@/api/returnsApi';
import { subscribeToRestock } from '@/api/stockAlertsApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine } from '@/domain/cart';
import { draftFromProduct } from '@/domain/productForm';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const MUG = CATALOG.find((product) => product.slug === 'stoneware-mug-set')!;
const CUSHION = CATALOG.find((product) => product.slug === 'wool-boucle-cushion')!;
const mugVariant = MUG.variants[0]!.id;
const cushionVariant = CUSHION.variants[0]!.id;
const stockOf = (variantId: string) => findVariant(variantId)!.variant.stock;

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

async function buyMugs(quantity: number, sessionToken?: string) {
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [{ ...makeCartLine(MUG, MUG.variants[0]!), quantity }],
    methodId: 'standard',
    address: {
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      line1: '12 Analytical Way',
      line2: '',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
      phone: '',
    },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
    ...(sessionToken && { sessionToken }),
  });
}

const main = () => within(screen.getByRole('main'));

describe('inventory on the server', () => {
  it('is for admins only', async () => {
    const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    await expect(listInventory(token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getStockHistory(token, mugVariant)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adjustStock(token, mugVariant, { reason: 'received', quantity: '1', expected: stockOf(mugVariant) })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lists every variant with recent sales', async () => {
    await buyMugs(2);
    const rows = await listInventory(await admin());
    expect(rows).toHaveLength(CATALOG.flatMap((product) => product.variants).length);
    expect(rows.find((row) => row.variantId === mugVariant)).toMatchObject({ productName: MUG.name, sold30: 2 });
    expect(rows.find((row) => row.variantId === cushionVariant)).toMatchObject({ stock: 0, level: 'out' });
  });

  it('adds, removes and counts stock, logging each change', async () => {
    const token = await admin();
    const start = stockOf(mugVariant);
    const added = await adjustStock(token, mugVariant, { reason: 'received', quantity: '6', expected: start, note: 'Kiln batch 14' });
    expect(added.stock).toBe(start + 6);
    expect(added.movement).toMatchObject({ change: 6, reason: 'received', by: 'Studio Admin', note: 'Kiln batch 14' });

    await adjustStock(token, mugVariant, { reason: 'damaged', quantity: '2', expected: start + 6 });
    await adjustStock(token, mugVariant, { reason: 'count', quantity: '3', expected: start + 4 });
    expect(stockOf(mugVariant)).toBe(3);
    expect(JSON.parse(localStorage.getItem(CATALOG_KEY)!)).toBeTruthy();

    const { movements } = await getStockHistory(token, mugVariant);
    expect(movements.map((movement) => [movement.reason, movement.change])).toEqual([
      ['count', 3 - (start + 4)],
      ['damaged', -2],
      ['received', 6],
    ]);
  });

  it('refuses stale and impossible adjustments', async () => {
    const token = await admin();
    const stock = stockOf(mugVariant);
    await expect(adjustStock(token, mugVariant, { reason: 'received', quantity: '1', expected: stock + 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(adjustStock(token, mugVariant, { reason: 'lost', quantity: String(stock + 1), expected: stock })).rejects.toMatchObject({
      code: 'VALIDATION',
      message: `Only ${stock} in stock`,
    });
    await expect(adjustStock(token, mugVariant, { reason: 'stolen' as never, quantity: '1', expected: stock })).rejects.toMatchObject({
      message: 'Choose a reason',
    });
    await expect(adjustStock(token, 'nope', { reason: 'received', quantity: '1', expected: 0 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('emails waiting shoppers when a delivery brings an item back', async () => {
    await subscribeToRestock(cushionVariant, 'grace@example.com');
    const { notified } = await adjustStock(await admin(), cushionVariant, { reason: 'received', quantity: '4', expected: 0 });
    expect(notified).toBe(1);
    expect(loadOutbox().map((email) => email.to)).toEqual(['grace@example.com']);
  });

  it('includes sales, restocked returns and product edits in the history', async () => {
    const token = await admin();
    const { token: shopper } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    const order = await buyMugs(2, shopper);
    const delivered = { ...order, status: 'delivered' as const, history: [...order.history!, { status: 'delivered' as const, at: order.placedAt }] };
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(loadOrders().map((saved) => (saved.id === order.id ? delivered : saved))));
    const request = await requestReturn(shopper, { orderId: order.id, method: 'drop-off', lines: [{ variantId: mugVariant, quantity: 1, reason: 'damaged' }] });
    await updateReturn(token, request.id, { to: 'approved', expected: 'requested' });
    vi.advanceTimersByTime(60_000);
    await updateReturn(token, request.id, { to: 'received', expected: 'approved', restock: true });
    vi.advanceTimersByTime(60_000);
    const mug = CATALOG.find((product) => product.id === MUG.id)!;
    const draft = draftFromProduct(mug);
    await saveProduct(token, mug.id, { ...draft, variants: draft.variants.map((variant, index) => (index === 0 ? { ...variant, stock: '40' } : variant)) });

    const { movements, row } = await getStockHistory(token, mugVariant);
    expect(row.stock).toBe(40);
    expect(movements.map((movement) => [movement.reason, movement.reference])).toEqual([
      ['edited', undefined],
      ['returned', request.id],
      ['sale', order.id],
    ]);
  });
});

describe('the inventory pages', () => {
  async function signedInAdmin() {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  }

  it('lists items, sold-out first, with filters and search', async () => {
    const user = userEvent.setup();
    await signedInAdmin();
    renderRoute('/admin/inventory');
    expect(await main().findByRole('heading', { name: 'Inventory', level: 2 })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page');

    const rows = () => main().getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent);
    expect(main().getAllByRole('row')[1]).toHaveTextContent('Sold out');
    await user.click(main().getByRole('button', { name: /^Sold out, \d+ items?$/ }));
    expect(rows()).toContain(CUSHION.name);
    expect(main().getAllByText('Sold out', { selector: 'td' }).length).toBe(rows().length);

    await user.click(main().getByRole('button', { name: /^All, / }));
    await user.type(main().getByRole('textbox', { name: 'Search inventory' }), MUG.variants[0]!.sku);
    expect(rows()).toEqual([MUG.name]);
  });

  it('adjusts stock and shows the change in the history', async () => {
    const user = userEvent.setup();
    const start = stockOf(mugVariant);
    await signedInAdmin();
    renderRoute(`/admin/inventory/${mugVariant}`);
    expect(await main().findByRole('heading', { name: MUG.name, level: 2 })).toBeInTheDocument();
    expect(main().getByText('No changes yet. Sales, deliveries and counts will show here.')).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Save adjustment' }));
    expect(main().getByText('Enter a number of units')).toBeInTheDocument();

    await user.type(main().getByLabelText('Units to add'), '5');
    expect(main().getByText(`Stock will be ${start + 5}`)).toBeInTheDocument();
    await user.type(main().getByLabelText('Note (optional)'), 'Kiln batch 14');
    await user.click(main().getByRole('button', { name: 'Save adjustment' }));

    expect(await screen.findByText('Stock updated')).toBeInTheDocument();
    const history = await main().findByRole('region', { name: 'History' });
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(2));
    expect(within(history).getByText('+5')).toBeInTheDocument();
    expect(within(history).getByText('Delivery received')).toBeInTheDocument();
    expect(within(history).getByText('Kiln batch 14')).toBeInTheDocument();
    expect(main().getByText('In stock', { selector: 'dt' }).nextSibling).toHaveTextContent(String(start + 5));

    await user.selectOptions(main().getByLabelText('Reason'), 'count');
    await user.type(main().getByLabelText('Units on the shelf now'), String(start + 5));
    await user.click(main().getByRole('button', { name: 'Save adjustment' }));
    expect(main().getByText(`Stock is already ${start + 5}`)).toBeInTheDocument();
  });
});
