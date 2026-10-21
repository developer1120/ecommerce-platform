import type { CartLine } from './cart';
import type { Order } from './order';
import {
  deliveredAt,
  estimateRefund,
  isActiveReturn,
  isOpenReturn,
  returnableQuantities,
  returnDeadline,
  returnEligibility,
  returnItemCount,
  returnNumber,
  toReturnLines,
  validateReturn,
  type ReturnRequest,
} from './returns';

const line = (variantId: string, quantity: number, unitPrice: number): CartLine => ({
  variantId,
  productId: variantId,
  slug: variantId,
  name: `Item ${variantId}`,
  maker: 'Hollow Kiln',
  sku: variantId.toUpperCase(),
  options: { Color: 'Oat' },
  unitPrice,
  art: { tint: 'sand', motif: 'cup' },
  stock: 9,
  quantity,
  addedAt: '2026-09-01T00:00:00Z',
});

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'OR-260920-K7F3',
    placedAt: '2026-09-20T10:00:00Z',
    status: 'delivered',
    email: 'ada@example.com',
    address: {} as Order['address'],
    shipping: { methodId: 'standard', label: 'Standard', earliest: '2026-09-24T00:00:00Z', latest: '2026-09-26T00:00:00Z' },
    card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada' },
    lines: [line('a', 2, 3000), line('b', 1, 4000)],
    totals: { subtotal: 10000, discount: 1000, shipping: 800, tax: 900, taxRate: 10000, total: 10700 },
    history: [
      { status: 'placed', at: '2026-09-20T10:00:00Z' },
      { status: 'delivered', at: '2026-09-25T15:00:00Z' },
    ],
    ...overrides,
  };
}

const request = (status: ReturnRequest['status'], lines: { variantId: string; quantity: number }[]) =>
  ({ status, lines }) as Pick<ReturnRequest, 'status' | 'lines'>;

describe('the return window', () => {
  it('runs 30 days from delivery', () => {
    expect(deliveredAt(order())?.toISOString()).toBe('2026-09-25T15:00:00.000Z');
    expect(returnDeadline(order())?.toISOString()).toBe('2026-10-25T15:00:00.000Z');
  });

  it('falls back to the latest delivery date when history is missing, and is closed before delivery', () => {
    expect(deliveredAt(order({ history: undefined }))?.toISOString()).toBe('2026-09-26T00:00:00.000Z');
    expect(returnDeadline(order({ status: 'shipped' }))).toBeUndefined();
  });
});

describe('returnEligibility', () => {
  const now = new Date('2026-10-07T19:00:00Z');

  it('allows a return within the window', () => {
    expect(returnEligibility(order(), [], now)).toEqual({ ok: true, deadline: new Date('2026-10-25T15:00:00Z') });
  });

  it('explains why a return is not possible', () => {
    expect(returnEligibility(order({ status: 'cancelled' }), [], now)).toMatchObject({ ok: false, reason: expect.stringMatching(/cancelled/) });
    expect(returnEligibility(order({ status: 'shipped' }), [], now)).toEqual({ ok: false, reason: 'You can start a return once your order arrives.' });
    expect(returnEligibility(order(), [], new Date('2026-10-26T00:00:00Z'))).toEqual({
      ok: false,
      reason: 'Returns for this order closed on October 25, 2026.',
    });
    const everything = request('requested', [
      { variantId: 'a', quantity: 2 },
      { variantId: 'b', quantity: 1 },
    ]);
    expect(returnEligibility(order(), [everything], now)).toEqual({ ok: false, reason: 'Every item in this order is already in a return.' });
  });
});

describe('returnableQuantities', () => {
  it('subtracts active returns but not declined or cancelled ones', () => {
    const left = returnableQuantities(order(), [
      request('approved', [{ variantId: 'a', quantity: 1 }]),
      request('rejected', [{ variantId: 'b', quantity: 1 }]),
      request('cancelled', [{ variantId: 'a', quantity: 1 }]),
    ]);
    expect(Object.fromEntries(left)).toEqual({ a: 1, b: 1 });
  });

  it('never goes below zero', () => {
    const left = returnableQuantities(order(), [request('refunded', [{ variantId: 'b', quantity: 3 }])]);
    expect(left.get('b')).toBe(0);
  });
});

describe('return states', () => {
  it('knows which requests hold items and which still need work', () => {
    expect(['requested', 'approved', 'received', 'refunded'].every((status) => isActiveReturn({ status: status as never }))).toBe(true);
    expect(isActiveReturn({ status: 'rejected' })).toBe(false);
    expect(isOpenReturn({ status: 'received' })).toBe(true);
    expect(isOpenReturn({ status: 'refunded' })).toBe(false);
  });

  it('numbers returns after the order', () => {
    expect(returnNumber('OR-260920-K7F3', 0)).toBe('RT-260920-K7F3-1');
    expect(returnNumber('OR-260920-K7F3', 2)).toBe('RT-260920-K7F3-3');
  });
});

describe('estimateRefund', () => {
  it('refunds the items share of the discounted goods and their tax, not shipping', () => {
    // $40 of a $100 subtotal: 40% of ($100 − $10 + $9).
    expect(estimateRefund(order(), [{ unitPrice: 4000, quantity: 1 }])).toBe(3960);
    // Everything: what was paid less shipping.
    expect(
      estimateRefund(order(), [
        { unitPrice: 3000, quantity: 2 },
        { unitPrice: 4000, quantity: 1 },
      ]),
    ).toBe(9900);
  });

  it('is zero for nothing, and never more than was paid for goods', () => {
    expect(estimateRefund(order(), [])).toBe(0);
    expect(estimateRefund(order(), [{ unitPrice: 50000, quantity: 1 }])).toBe(9900);
  });
});

describe('validateReturn', () => {
  const left = new Map([
    ['a', 2],
    ['b', 0],
  ]);

  it('needs at least one item', () => {
    expect(validateReturn(order(), [{ variantId: 'a', quantity: 0, reason: '' }], left)).toEqual({
      form: 'Choose at least one item to return',
    });
  });

  it('checks each chosen item', () => {
    expect(
      validateReturn(
        order(),
        [
          { variantId: 'a', quantity: 1, reason: '' },
          { variantId: 'b', quantity: 1, reason: 'damaged' },
          { variantId: 'zzz', quantity: 1, reason: 'damaged' },
        ],
        left,
      ),
    ).toEqual({ a: 'Choose a reason', b: 'This item is already in a return', zzz: "That item isn't in this order" });
    expect(validateReturn(order(), [{ variantId: 'a', quantity: 3, reason: 'too-small' }], left)).toEqual({ a: 'You can return up to 2' });
    expect(validateReturn(order(), [{ variantId: 'a', quantity: 2, reason: 'too-small' }], left)).toEqual({});
  });
});

describe('toReturnLines', () => {
  it('copies names, options and prices from the order', () => {
    const lines = toReturnLines(order().lines, [
      { variantId: 'a', quantity: 2, reason: 'too-small' },
      { variantId: 'b', quantity: 0, reason: '' },
    ]);
    expect(lines).toEqual([{ variantId: 'a', name: 'Item a', options: { Color: 'Oat' }, unitPrice: 3000, quantity: 2, reason: 'too-small' }]);
    expect(returnItemCount({ lines })).toBe(2);
  });
});
