import type { InventoryRow } from './inventory';
import {
  addWorkingDays,
  checkOrderQuantity,
  checkReceipt,
  inPurchaseQueue,
  isLate,
  nextPurchaseOrderId,
  orderCost,
  orderUnits,
  statusAfterReceipt,
  suggestReorders,
  unitsOnOrder,
  wholesaleCost,
  type PurchaseOrderLine,
} from './purchasing';

const row = (variantId: string, stock: number, sold30: number, level: InventoryRow['level'] = stock === 0 ? 'out' : stock <= 5 ? 'low' : 'in'): InventoryRow => ({
  productId: 'p',
  productName: 'Mug',
  slug: 'mug',
  variantId,
  sku: variantId.toUpperCase(),
  variantLabel: '',
  stock,
  level,
  sold30,
});

const line = (variantId: string, ordered: number, received = 0): PurchaseOrderLine => ({
  variantId,
  productId: 'p',
  name: 'Mug',
  variantLabel: '',
  sku: variantId,
  ordered,
  received,
  unitCost: 1000,
});

describe('suggestReorders', () => {
  const supplier = { leadDays: 10, minUnits: 0 };

  it('suggests sold-out, low and soon-to-run-out items, enough for lead time plus a month', () => {
    const suggestions = suggestReorders([row('out', 0, 30), row('low', 3, 0), row('fast', 20, 45), row('fine', 50, 15)], supplier, new Map());
    expect(suggestions.map(({ row: { variantId }, reason, quantity }) => ({ variantId, reason, quantity }))).toEqual([
      // 1 a day for 40 days.
      { variantId: 'out', reason: 'Sold out', quantity: 40 },
      // Not selling, so the floor of six, less what's left.
      { variantId: 'low', reason: 'Low stock', quantity: 3 },
      // 1.5 a day: 20 units last 13 days, inside lead time plus a week; 60 needed for 40 days.
      { variantId: 'fast', reason: 'Runs out in 13 days', quantity: 40 },
    ]);
  });

  it('counts what is already on order', () => {
    expect(suggestReorders([row('out', 0, 30)], supplier, new Map([['out', 40]]))).toEqual([]);
    expect(suggestReorders([row('out', 0, 30)], supplier, new Map([['out', 25]]))[0]!.quantity).toBe(15);
  });

  it('tops the first line up to the maker’s minimum', () => {
    const suggestions = suggestReorders([row('a', 2, 0), row('b', 1, 0)], { leadDays: 5, minUnits: 24 }, new Map());
    expect(suggestions.map((suggestion) => suggestion.quantity)).toEqual([4 + 15, 5]);
  });
});

describe('orders', () => {
  it('totals units and cost, and tracks units still to come on open orders', () => {
    const order = { status: 'partial' as const, lines: [line('a', 10, 4), line('b', 5)] };
    expect(orderUnits(order)).toEqual({ ordered: 15, received: 4 });
    expect(orderCost(order)).toBe(15_000);
    expect(unitsOnOrder([order, { status: 'draft', lines: [line('a', 99)] }, { status: 'sent', lines: [line('a', 3)] }])).toEqual(
      new Map([
        ['a', 9],
        ['b', 5],
      ]),
    );
  });

  it('checks deliveries against what is outstanding', () => {
    const order = { lines: [line('a', 10, 4), line('b', 5, 5)] };
    expect(checkReceipt(order, { a: 6 })).toEqual({});
    expect(checkReceipt(order, { a: 7 })).toEqual({ a: 'Only 6 still to come' });
    expect(checkReceipt(order, { b: 1 })).toEqual({ b: 'Already received in full' });
    expect(checkReceipt(order, { a: 1.5 })).toEqual({ a: 'Enter a whole number' });
    expect(checkReceipt(order, {})).toEqual({ form: 'Enter how many units arrived' });
    expect(statusAfterReceipt([line('a', 10, 10), line('b', 5, 5)])).toBe('received');
    expect(statusAfterReceipt([line('a', 10, 10), line('b', 5, 2)])).toBe('partial');
  });

  it('reads typed quantities', () => {
    expect(checkOrderQuantity(' 12 ')).toEqual({ ok: true, quantity: 12 });
    expect(checkOrderQuantity('0')).toEqual({ ok: false, error: 'Order at least 1' });
    expect(checkOrderQuantity('501')).toEqual({ ok: false, error: 'Order at most 500' });
    expect(checkOrderQuantity('a dozen')).toEqual({ ok: false, error: 'Enter a whole number' });
  });

  it('numbers orders, prices them wholesale and sorts them into queues', () => {
    expect(nextPurchaseOrderId([])).toBe('PO-1001');
    expect(nextPurchaseOrderId([{ id: 'PO-1004' }, { id: 'PO-1002' }])).toBe('PO-1005');
    expect(wholesaleCost(3840)).toBe(1728);
    expect(inPurchaseQueue({ status: 'partial' }, 'open')).toBe(true);
    expect(inPurchaseQueue({ status: 'cancelled' }, 'closed')).toBe(true);
    expect(inPurchaseQueue({ status: 'draft' }, 'open')).toBe(false);
  });

  it('skips weekends when working out arrival, and flags late orders', () => {
    // Wednesday plus three working days is Monday.
    expect(addWorkingDays(new Date('2026-10-07T19:00:00Z'), 3).toISOString()).toBe('2026-10-12T19:00:00.000Z');
    const now = new Date('2026-10-07T19:00:00Z');
    expect(isLate({ status: 'sent', expectedAt: '2026-10-06T00:00:00Z' }, now)).toBe(true);
    expect(isLate({ status: 'received', expectedAt: '2026-10-06T00:00:00Z' }, now)).toBe(false);
    expect(isLate({ status: 'sent', expectedAt: '2026-10-08T00:00:00Z' }, now)).toBe(false);
  });
});
