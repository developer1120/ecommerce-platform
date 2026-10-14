import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getSalesReport } from '@/api/adminReportsApi';
import { signIn, signUp } from '@/api/authApi';
import { saveOrder } from '@/api/mockDb';
import { placeOrder } from '@/api/ordersApi';
import { CATALOG } from '@/data/catalog';
import { DEMO_ADMIN } from '@/data/demoAccounts';
import { makeCartLine, type CartLine } from '@/domain/cart';
import type { Order } from '@/domain/order';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const main = () => within(screen.getByRole('main'));
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

function line(slug: string, quantity = 1): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[0]!), quantity };
}

function order(lines: CartLine[], promoCode?: string): Promise<Order> {
  return placeOrder({
    idempotencyKey: Math.random().toString(),
    lines,
    methodId: 'standard',
    address: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', line1: '12 Analytical Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada Lovelace' },
    ...(promoCode && { promoCode }),
  });
}

async function asAdmin() {
  const { token } = await signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
}

/** Today: a $96 throw with $10 off, and three $12 soaps. Nine days ago: the same throw. Plus one cancelled. */
async function sales() {
  const throwOrder = await order([line('washed-linen-throw')], 'TAKE10');
  const soapOrder = await order([line('cedar-and-vetiver-soap', 3)]);
  saveOrder({ ...throwOrder, id: 'OR-260928-PREV', placedAt: '2026-09-28T10:00:00Z', status: 'delivered' });
  saveOrder({ ...soapOrder, id: 'OR-261007-GONE', status: 'cancelled' });
}

const stat = (label: string) => main().getByText(label, { selector: 'dt' }).parentElement!;

describe('admin overview', () => {
  it('is for the Tanelt team only', async () => {
    const { token } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'slow mornings with tea', remember: true });
    await expect(getSalesReport(token, 30)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('opens the admin area with the last 30 days', async () => {
    await sales();
    await asAdmin();
    renderRoute('/admin');

    expect(await main().findByText('$208.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(main().getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(stat('Net sales')).toHaveTextContent('Net sales$208.00Nothing in the previous 30 days');
    expect(stat('Orders')).toHaveTextContent('Orders3Nothing in the previous 30 days1 cancelled, not counted');
    expect(stat('Average order')).toHaveTextContent('$69.33');
    expect(stat('Items sold')).toHaveTextContent('5');
    expect(main().getByRole('link', { name: /2 orders to pack/ })).toHaveAttribute('href', '/admin/orders?status=placed');
    expect(main().queryByRole('link', { name: /to ship/ })).not.toBeInTheDocument();

    const best = within(main().getByRole('region', { name: 'Best sellers' }));
    expect(best.getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      'Washed linen throw2$192.00',
      'Cedar and vetiver soap3$36.00',
    ]);
    expect(best.getByRole('link', { name: 'Washed linen throw' })).toHaveAttribute('href', `/admin/products/${bySlug('washed-linen-throw').id}`);
    const departments = within(main().getByRole('region', { name: 'By department' }));
    expect(departments.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Home$192.00 · 84%', 'Beauty$36.00 · 16%']);
    expect(within(main().getByRole('region', { name: 'Promo codes' })).getByRole('row', { name: /TAKE10/ })).toHaveTextContent('TAKE102$20.00');
  });

  it('compares a shorter period with the one before it', async () => {
    const user = userEvent.setup();
    await sales();
    await asAdmin();
    const { router } = renderRoute('/admin');
    await main().findByText('$208.00');

    await user.click(main().getByRole('button', { name: '7 days' }));
    expect(router.state.location.search).toBe('?range=7');
    await waitFor(() => expect(stat('Net sales')).toHaveTextContent('$122.00Up 42% on the previous 7 days'));
    expect(stat('Orders')).toHaveTextContent('2Up 100% on the previous 7 days');
    expect(stat('Average order')).toHaveTextContent('$61.00Down 29% on the previous 7 days');
    expect(main().getByText('Best day: Oct 7, $122.00 from 2 orders.')).toBeInTheDocument();

    await user.click(main().getByText('Show the numbers'));
    const numbers = main().getByText('Show the numbers').closest('details')!;
    expect(within(numbers).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual(['Oct 72$122.00']);
  });

  it('says so when nothing has sold yet, and lists stock running low', async () => {
    await asAdmin();
    renderRoute('/admin?range=90');
    expect(await main().findByText('No sales in the last 90 days yet.')).toBeInTheDocument();
    expect(stat('Net sales')).toHaveTextContent('$0.00');
    expect(main().getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    const low = within(main().getByRole('region', { name: 'Running low' }));
    const cushion = bySlug('wool-boucle-cushion');
    expect(low.getByRole('link', { name: cushion.name })).toHaveAttribute('href', `/admin/products/${cushion.id}`);
    expect(low.getAllByText('Sold out').length).toBeGreaterThan(0);
  });

  it('ignores a period it does not offer', async () => {
    await asAdmin();
    renderRoute('/admin?range=365');
    expect(await main().findByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(await main().findByText('No sales in the last 30 days yet.')).toBeInTheDocument();
  });
});
