import { CATALOG } from '@/data/catalog';
import { makeCartLine, type CartLine } from '@/domain/cart';
import { newOrderNumber, type PlaceOrderRequest } from '@/domain/order';
import { configureApi } from './client';
import { loadOrders } from './mockDb';
import { getOrder, placeOrder } from './ordersApi';

const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;

function line(slug: string, quantity = 1, variantIndex = 0, overrides: Partial<CartLine> = {}): CartLine {
  const product = bySlug(slug);
  return { ...makeCartLine(product, product.variants[variantIndex]!), quantity, ...overrides };
}

function request(overrides: Partial<PlaceOrderRequest> = {}): PlaceOrderRequest {
  return {
    idempotencyKey: `key-${Math.random()}`,
    lines: [line('washed-linen-throw', 1), line('cedar-and-vetiver-soap', 2)],
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
    ...overrides,
  };
}

describe('newOrderNumber', () => {
  it('combines the date with unambiguous characters', () => {
    expect(newOrderNumber(new Date('2026-10-11T09:00:00Z'), () => 0)).toBe('OR-261011-AAAA');
    expect(newOrderNumber(new Date('2026-10-11T09:00:00Z'), () => 0.999)).toMatch(/^OR-261011-[A-Z2-9]{4}$/);
  });
});

describe('placeOrder', () => {
  it('recalculates the totals on the server and stores the order', async () => {
    const order = await placeOrder(request());
    expect(order).toMatchObject({
      status: 'placed',
      email: 'ada@example.com',
      shipping: { methodId: 'standard', label: 'Standard' },
      totals: { subtotal: 12000, discount: 0, shipping: 0, tax: 480, taxRate: 4000, total: 12480 },
    });
    expect(order.id).toMatch(/^OR-261007-/);
    expect(loadOrders().map((saved) => saved.id)).toEqual([order.id]);
    await expect(getOrder(order.id, null)).resolves.toMatchObject({ id: order.id });
  });

  it('ignores prices sent by the browser', async () => {
    const tampered = request({ lines: [line('washed-linen-throw', 1, 0, { unitPrice: 100 })] });
    await expect(placeOrder(tampered)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('takes the stock it sells', async () => {
    const vase = bySlug('hand-thrown-bud-vase').variants[0]!; // 3 in stock
    await placeOrder(request({ lines: [line('hand-thrown-bud-vase', 2)] }));
    expect(vase.stock).toBe(1);
    // A second order for 2 now exceeds what is left.
    await expect(placeOrder(request({ lines: [line('hand-thrown-bud-vase', 2, 0, { stock: 3 })] }))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('returns the same order for a repeated request instead of charging twice', async () => {
    const first = await placeOrder(request({ idempotencyKey: 'same' }));
    const second = await placeOrder(request({ idempotencyKey: 'same' }));
    expect(second.id).toBe(first.id);
    expect(loadOrders()).toHaveLength(1);
  });

  it('declines the test card ending 0002 without taking stock', async () => {
    const soap = bySlug('cedar-and-vetiver-soap').variants[0]!;
    const before = soap.stock;
    await expect(placeOrder(request({ card: { ...request().card, last4: '0002' } }))).rejects.toMatchObject({
      code: 'PAYMENT_DECLINED',
      status: 402,
    });
    expect(soap.stock).toBe(before);
    expect(loadOrders()).toEqual([]);
  });

  it('applies a promo code by its own rules and refuses one that no longer applies', async () => {
    const order = await placeOrder(request({ promoCode: 'TAKE10' }));
    expect(order.totals).toMatchObject({ discount: 1000, total: 12000 - 1000 + Math.round(((12000 - 1000) * 4000) / 100_000) });
    expect(order.promoCode).toBe('TAKE10');

    await expect(placeOrder(request({ promoCode: 'AUTUMN25' }))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'AUTUMN25 ended on Sep 30, 2026.',
    });
    await expect(placeOrder(request({ promoCode: 'NOPE' }))).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('refuses next day to Alaska, an incomplete address and an empty bag', async () => {
    const alaska = { ...request().address, city: 'Anchorage', state: 'AK', zip: '99501' };
    await expect(placeOrder(request({ address: alaska, methodId: 'next-day' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(placeOrder(request({ address: { ...request().address, zip: '' } }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(placeOrder(request({ lines: [] }))).rejects.toMatchObject({ code: 'VALIDATION', message: 'Your bag is empty.' });
  });

  it('places nothing when the network fails', async () => {
    configureApi({ failureRate: 1 });
    await expect(placeOrder(request())).rejects.toMatchObject({ code: 'NETWORK' });
    expect(loadOrders()).toEqual([]);
  });

  it('reports an unknown order', async () => {
    await expect(getOrder('OR-000000-XXXX', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
