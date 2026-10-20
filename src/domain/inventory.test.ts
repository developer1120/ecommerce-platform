import type { Order } from './order';
import type { Product } from './product';
import {
  checkAdjustment,
  daysOfCover,
  inventoryRows,
  matchesInventoryFilter,
  movementsFromOrders,
  sortMovements,
  type StockMovement,
} from './inventory';

describe('checkAdjustment', () => {
  it('adds deliveries', () => {
    expect(checkAdjustment(4, 'received', '6')).toEqual({ ok: true, change: 6, after: 10 });
    expect(checkAdjustment(4, 'received', '0')).toEqual({ ok: false, error: 'Enter at least 1' });
    expect(checkAdjustment(9990, 'received', '20')).toEqual({ ok: false, error: "Stock can't be more than 9999" });
  });

  it('removes damaged and lost units, never below zero', () => {
    expect(checkAdjustment(4, 'damaged', '1')).toEqual({ ok: true, change: -1, after: 3 });
    expect(checkAdjustment(4, 'lost', '5')).toEqual({ ok: false, error: 'Only 4 in stock' });
    expect(checkAdjustment(0, 'lost', '1')).toEqual({ ok: false, error: 'There is no stock to remove' });
  });

  it('sets the total after a count', () => {
    expect(checkAdjustment(4, 'count', '2')).toEqual({ ok: true, change: -2, after: 2 });
    expect(checkAdjustment(4, 'count', '0')).toEqual({ ok: true, change: -4, after: 0 });
    expect(checkAdjustment(4, 'count', '4')).toEqual({ ok: false, error: 'Stock is already 4' });
  });

  it('wants a whole number', () => {
    expect(checkAdjustment(4, 'received', ' ')).toEqual({ ok: false, error: 'Enter a number of units' });
    expect(checkAdjustment(4, 'received', '2.5')).toEqual({ ok: false, error: 'Use a whole number' });
    expect(checkAdjustment(4, 'received', '-2')).toEqual({ ok: false, error: 'Use a whole number' });
  });
});

const line = (variantId: string, quantity: number) => ({ variantId, quantity }) as Order['lines'][number];

describe('movementsFromOrders', () => {
  it('turns order lines into sales, and cancellations into stock coming back', () => {
    const orders = [
      { id: 'OR-1', placedAt: '2026-10-01T10:00:00Z', status: 'delivered', lines: [line('a', 2), line('b', 1)] },
      {
        id: 'OR-2',
        placedAt: '2026-10-02T10:00:00Z',
        status: 'cancelled',
        lines: [line('a', 1)],
        history: [
          { status: 'placed', at: '2026-10-02T10:00:00Z' },
          { status: 'cancelled', at: '2026-10-02T12:00:00Z', by: 'Studio Admin' },
        ],
      },
    ] as Order[];
    expect(movementsFromOrders(orders)).toEqual([
      { id: 'OR-1:a:sale', variantId: 'a', at: '2026-10-01T10:00:00Z', change: -2, reason: 'sale', reference: 'OR-1' },
      { id: 'OR-1:b:sale', variantId: 'b', at: '2026-10-01T10:00:00Z', change: -1, reason: 'sale', reference: 'OR-1' },
      { id: 'OR-2:a:sale', variantId: 'a', at: '2026-10-02T10:00:00Z', change: -1, reason: 'sale', reference: 'OR-2' },
      { id: 'OR-2:a:cancelled', variantId: 'a', at: '2026-10-02T12:00:00Z', change: 1, reason: 'cancelled', reference: 'OR-2', by: 'Studio Admin' },
    ]);
  });
});

describe('sortMovements', () => {
  it('puts the newest first, and the later of two at the same moment', () => {
    const movements = [
      { id: 'x', at: '2026-10-01T00:00:00Z' },
      { id: 'y', at: '2026-10-03T00:00:00Z' },
      { id: 'a', at: '2026-10-01T00:00:00Z' },
    ] as StockMovement[];
    expect(sortMovements(movements).map((movement) => movement.id)).toEqual(['y', 'a', 'x']);
  });
});

describe('inventoryRows', () => {
  const catalog = [
    {
      id: 'p1',
      name: 'Linen shirt',
      slug: 'linen-shirt',
      variants: [
        { id: 'a', sku: 'LS-S', options: { Size: 'S' }, stock: 12 },
        { id: 'b', sku: 'LS-M', options: { Size: 'M' }, stock: 2 },
      ],
    },
    { id: 'p2', name: 'Candle', slug: 'candle', variants: [{ id: 'c', sku: 'CN', options: {}, stock: 0 }] },
  ] as unknown as Product[];
  const now = new Date('2026-10-07T00:00:00Z');
  const movements = [
    { id: '1', variantId: 'a', at: '2026-10-01T00:00:00Z', change: -3, reason: 'sale' },
    { id: '2', variantId: 'a', at: '2026-08-01T00:00:00Z', change: -9, reason: 'sale' },
    { id: '3', variantId: 'a', at: '2026-10-02T00:00:00Z', change: 5, reason: 'received' },
  ] as StockMovement[];

  it('lists every variant with its level and sales in the last 30 days', () => {
    const rows = inventoryRows(catalog, movements, now);
    expect(rows.map((row) => [row.variantId, row.variantLabel, row.level, row.sold30])).toEqual([
      ['a', 'S', 'in', 3],
      ['b', 'M', 'low', 0],
      ['c', '', 'out', 0],
    ]);
  });

  it('filters by level', () => {
    const rows = inventoryRows(catalog, movements, now);
    expect(rows.filter((row) => matchesInventoryFilter(row, 'low')).map((row) => row.variantId)).toEqual(['b']);
    expect(rows.filter((row) => matchesInventoryFilter(row, 'out')).map((row) => row.variantId)).toEqual(['c']);
    expect(rows.filter((row) => matchesInventoryFilter(row, 'all'))).toHaveLength(3);
  });
});

describe('daysOfCover', () => {
  it('estimates days left at the recent pace', () => {
    expect(daysOfCover({ stock: 12, sold30: 3 })).toBe(120);
    expect(daysOfCover({ stock: 1, sold30: 60 })).toBe(0);
    expect(daysOfCover({ stock: 5, sold30: 0 })).toBeUndefined();
    expect(daysOfCover({ stock: 0, sold30: 9 })).toBeUndefined();
  });
});
