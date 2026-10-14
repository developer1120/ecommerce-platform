import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCustomer, listCustomers, saveCustomerNote } from '@/api/adminCustomersApi';
import { signIn, signUp } from '@/api/authApi';
import { placeOrder } from '@/api/ordersApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine } from '@/domain/cart';
import { guestKey } from '@/domain/customers';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';
import * as download from '@/lib/download';

const CARD = { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Shopper' } as const;
const MUG = CATALOG.find((product) => product.slug === 'stoneware-mug-set')!;

const address = (email: string, firstName: string, lastName: string) => ({
  email,
  firstName,
  lastName,
  line1: '12 Analytical Way',
  line2: '',
  city: 'Brooklyn',
  state: 'NY',
  zip: '11201',
  phone: '',
});

async function shop(email: string, name: string, sessionToken?: string) {
  const [firstName = '', lastName = ''] = name.split(' ');
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines: [{ ...makeCartLine(MUG, MUG.variants[0]!), quantity: 1 }],
    methodId: 'standard',
    address: address(email, firstName, lastName),
    card: CARD,
    ...(sessionToken && { sessionToken }),
  });
}

async function admin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  return token;
}

/** Ada has an account and two orders; Bea has an account and none; Grace checked out as a guest. */
async function seed() {
  const { token: ada, user } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
  await signUp({ name: 'Bea Arthur', email: 'bea@example.com', password: 'slow mornings with tea', remember: true });
  const first = await shop('ada@example.com', 'Ada Lovelace', ada);
  vi.advanceTimersByTime(60_000);
  const second = await shop('ada@example.com', 'Ada Lovelace', ada);
  vi.advanceTimersByTime(60_000);
  await shop('grace@example.com', 'Grace Hopper');
  return { adaId: user.id, first, second };
}

const main = () => within(screen.getByRole('main'));

describe('customers on the server', () => {
  it('is for admins only', async () => {
    const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    await expect(listCustomers(token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getCustomer(token, 'x')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(saveCustomerNote(token, 'x', 'Hi')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists accounts and guests, without staff', async () => {
    await seed();
    const token = await admin();
    const list = await listCustomers(token);
    expect(list.map((customer) => customer.email).sort()).toEqual(['ada@example.com', 'bea@example.com', 'grace@example.com']);
    const ada = list.find((customer) => customer.email === 'ada@example.com')!;
    expect(ada).toMatchObject({ kind: 'account', orders: 2, segments: expect.arrayContaining(['repeat', 'new']) });
  });

  it('gives one customer’s orders, newest first, and keeps a private note', async () => {
    const { adaId, first, second } = await seed();
    const token = await admin();
    const detail = await getCustomer(token, adaId);
    expect(detail.orders.map((order) => order.id)).toEqual([second.id, first.id]);
    expect(detail.note).toBeUndefined();
    await expect(getCustomer(token, 'nobody')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const note = await saveCustomerNote(token, adaId, '  Prefers the speckled glaze.  ');
    expect(note).toMatchObject({ text: 'Prefers the speckled glaze.', by: 'Studio Admin' });
    expect((await getCustomer(token, adaId)).note?.text).toBe('Prefers the speckled glaze.');
    await expect(saveCustomerNote(token, adaId, 'x'.repeat(1001))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveCustomerNote(token, 'nobody', 'Hello')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await saveCustomerNote(token, adaId, '   ')).toBeNull();
    expect((await getCustomer(token, adaId)).note).toBeUndefined();
    expect((await getCustomer(token, guestKey('grace@example.com'))).customer.name).toBe('Grace Hopper');
  });
});

describe('the customers pages', () => {
  async function signedInAdmin() {
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(await admin()));
  }

  it('lists, filters, searches and sorts customers', async () => {
    const user = userEvent.setup();
    await seed();
    await signedInAdmin();
    renderRoute('/admin/customers');
    expect(await main().findByRole('heading', { name: 'Customers', level: 2 })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Admin' })).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const names = () => main().getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent);
    expect(names()).toEqual(['Grace Hopper', 'Ada Lovelace', 'Bea Arthur']);
    expect(main().getByText('grace@example.com · Guest')).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Repeat, 1 customer' }));
    expect(names()).toEqual(['Ada Lovelace']);
    await user.click(main().getByRole('button', { name: 'No orders, 1 customer' }));
    expect(names()).toEqual(['Bea Arthur']);
    await user.click(main().getByRole('button', { name: 'All, 3 customers' }));

    await user.type(main().getByRole('textbox', { name: 'Search customers' }), 'hopper');
    expect(names()).toEqual(['Grace Hopper']);
    await user.clear(main().getByRole('textbox', { name: 'Search customers' }));

    await user.selectOptions(main().getByLabelText('Sort by'), 'orders');
    expect(names()[0]).toBe('Ada Lovelace');
    await user.selectOptions(main().getByLabelText('Sort by'), 'name');
    expect(names()).toEqual(['Ada Lovelace', 'Bea Arthur', 'Grace Hopper']);
  });

  it('exports what is shown as CSV', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    await seed();
    await signedInAdmin();
    renderRoute('/admin/customers?segment=repeat');
    await user.click(await main().findByRole('button', { name: 'Export CSV' }));
    expect(save).toHaveBeenCalledWith('tanelt-customers.csv', expect.stringContaining('Ada Lovelace,ada@example.com,Account'), 'text/csv');
    expect(save.mock.calls[0]![1].split('\r\n')).toHaveLength(2);
  });

  it('shows a customer with their orders, and saves a note', async () => {
    const user = userEvent.setup();
    const { adaId, first } = await seed();
    await signedInAdmin();
    renderRoute(`/admin/customers/${adaId}`);
    expect(await main().findByRole('heading', { name: 'Ada Lovelace', level: 2 })).toBeInTheDocument();
    expect(main().getByText('Orders', { selector: 'dt' }).nextSibling).toHaveTextContent('2');
    expect(main().getByRole('link', { name: first.id })).toHaveAttribute('href', `/admin/orders/${first.id}`);

    const note = main().getByLabelText('Only the team sees this');
    expect(main().getByRole('button', { name: 'Save note' })).toBeDisabled();
    await user.type(note, 'Prefers the speckled glaze.');
    await user.click(main().getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved')).toBeInTheDocument();
    expect(main().getByText(/^Last saved by Studio Admin/)).toBeInTheDocument();

    await user.clear(note);
    await user.click(main().getByRole('button', { name: 'Remove note' }));
    expect(await screen.findByText('Note removed')).toBeInTheDocument();
  });

  it('opens guest customers from the list', async () => {
    const user = userEvent.setup();
    await seed();
    await signedInAdmin();
    const { router } = renderRoute('/admin/customers');
    await user.click(await main().findByRole('link', { name: 'Grace Hopper' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/customers/guest%3Agrace%40example.com'));
    expect(await main().findByRole('heading', { name: 'Grace Hopper', level: 2 })).toBeInTheDocument();
    expect(main().getByText('Guest', { selector: 'span' })).toBeInTheDocument();
  });
});
