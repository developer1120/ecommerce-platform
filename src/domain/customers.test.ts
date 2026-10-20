import {
  csvCell,
  customerPath,
  customersToCsv,
  guestKey,
  segmentsFor,
  sortCustomers,
  summarizeCustomers,
  VIP_SPEND,
  type CustomerAccount,
  type CustomerSummary,
} from './customers';
import type { Order } from './order';
import type { ReturnRequest } from './returns';

const NOW = new Date('2026-10-07T19:00:00Z');

const account = (id: string, email: string, overrides: Partial<CustomerAccount> = {}): CustomerAccount => ({
  id,
  name: `${id} Person`,
  email,
  createdAt: '2026-01-01T00:00:00Z',
  role: 'customer',
  ...overrides,
});

function order(id: string, overrides: Partial<Order>): Order {
  return {
    id,
    placedAt: '2026-09-01T00:00:00Z',
    status: 'delivered',
    email: 'guest@example.com',
    address: { firstName: 'Grace', lastName: 'Hopper' } as Order['address'],
    shipping: { methodId: 'standard', label: 'Standard', earliest: '', latest: '' },
    card: { brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030, name: 'G' },
    lines: [],
    totals: { subtotal: 10000, discount: 0, shipping: 0, tax: 0, taxRate: 0, total: 10000 },
    ...overrides,
  };
}

const ret = (orderId: string) => ({ id: `RT-${orderId}`, orderId }) as ReturnRequest;

describe('summarizeCustomers', () => {
  const accounts = [
    account('u1', 'ada@example.com'),
    account('u2', 'bea@example.com', { createdAt: '2026-10-01T00:00:00Z' }),
    account('admin', 'studio@tanelt.test', { role: 'admin' }),
  ];
  const orders = [
    order('o1', { customerId: 'u1', placedAt: '2026-08-01T00:00:00Z' }),
    order('o2', { customerId: 'u1', placedAt: '2026-09-15T00:00:00Z', refunds: [{ returnId: 'RT-o2', amount: 2500, at: '' }] }),
    order('o3', { customerId: 'u1', status: 'cancelled', placedAt: '2026-09-20T00:00:00Z' }),
    // A guest checkout with an account's email belongs to that account.
    order('o4', { email: 'ADA@example.com', placedAt: '2026-09-25T00:00:00Z' }),
    order('o5', { email: 'guest@example.com', placedAt: '2026-05-01T00:00:00Z' }),
  ];
  const list = summarizeCustomers(accounts, orders, [ret('o2'), ret('o5')], NOW);
  const byKey = (key: string) => list.find((customer) => customer.key === key)!;

  it('leaves out staff and adds guests', () => {
    expect(list.map((customer) => customer.key)).toEqual(['u1', 'u2', guestKey('guest@example.com')]);
    expect(byKey(guestKey('guest@example.com'))).toMatchObject({ kind: 'guest', name: 'Grace Hopper', since: '2026-05-01T00:00:00Z', orders: 1 });
  });

  it('counts what was kept: no cancelled orders, less refunds', () => {
    expect(byKey('u1')).toMatchObject({
      orders: 4,
      spent: 3 * 10000 - 2500,
      refunded: 2500,
      returns: 1,
      lastOrderAt: '2026-09-25T00:00:00Z',
    });
  });

  it('puts customers into groups', () => {
    expect(byKey('u1').segments).toEqual(['repeat']);
    expect(byKey('u2').segments).toEqual(['no-orders']);
  });
});

describe('segmentsFor', () => {
  const base = { orders: 1, spent: 1000, since: '2026-01-01T00:00:00Z', lastOrderAt: '2026-09-01T00:00:00Z' };

  it('spots top spenders, new and lapsed customers', () => {
    expect(segmentsFor({ ...base, spent: VIP_SPEND }, NOW)).toEqual(['vip']);
    expect(segmentsFor({ ...base, since: '2026-09-20T00:00:00Z' }, NOW)).toEqual(['new']);
    expect(segmentsFor({ ...base, lastOrderAt: '2026-05-01T00:00:00Z' }, NOW)).toEqual(['lapsed']);
    expect(segmentsFor(base, NOW)).toEqual([]);
  });
});

describe('sortCustomers', () => {
  const people = [
    { key: 'a', name: 'bea', spent: 500, orders: 1, since: '2026-01-01', lastOrderAt: '2026-09-01' },
    { key: 'b', name: 'Ada', spent: 900, orders: 3, since: '2026-02-01', lastOrderAt: '2026-08-01' },
    { key: 'c', name: 'Cy', spent: 0, orders: 0, since: '2026-03-01' },
  ] as CustomerSummary[];
  const keys = (sort: Parameters<typeof sortCustomers>[1]) => sortCustomers(people, sort).map((customer) => customer.key);

  it('sorts by recent order, spend, orders and name', () => {
    expect(keys('recent')).toEqual(['a', 'b', 'c']);
    expect(keys('spent')).toEqual(['b', 'a', 'c']);
    expect(keys('orders')).toEqual(['b', 'a', 'c']);
    expect(keys('name')).toEqual(['b', 'a', 'c']);
  });
});

describe('CSV export', () => {
  it('quotes when needed and defuses formulas', () => {
    expect(csvCell('Ada')).toBe('Ada');
    expect(csvCell('Lovelace, Ada')).toBe('"Lovelace, Ada"');
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(12)).toBe('12');
  });

  it('writes a header and a row per customer, in dollars', () => {
    const csv = customersToCsv([
      {
        key: 'u1',
        kind: 'account',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        since: '2026-01-01T00:00:00Z',
        orders: 2,
        spent: 12345,
        refunded: 500,
        returns: 1,
        lastOrderAt: '2026-09-01T00:00:00Z',
        segments: ['repeat', 'vip'],
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'Name,Email,Type,Customer since,Orders,Spent,Refunded,Returns,Last order,Segments',
      'Ada Lovelace,ada@example.com,Account,2026-01-01,2,123.45,5.00,1,2026-09-01,Repeat; Top spender',
    ]);
  });
});

it('links to a customer, encoding guest emails', () => {
  expect(customerPath('u1')).toBe('/admin/customers/u1');
  expect(customerPath(guestKey(' Grace@Example.com '))).toBe('/admin/customers/guest%3Agrace%40example.com');
});
