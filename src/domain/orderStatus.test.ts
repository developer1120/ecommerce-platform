import type { OrderStatus } from './order';
import { canMoveTo, formatEventTime, needsAction, normalizeTracking, orderHistory, reachedAt, validateTracking } from './orderStatus';

const ALL: OrderStatus[] = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];

describe('canMoveTo', () => {
  it('only moves forward, one step at a time, and cancels before shipping', () => {
    const allowed = ALL.flatMap((from) => ALL.filter((to) => canMoveTo(from, to)).map((to) => `${from}→${to}`));
    expect(allowed).toEqual(['placed→packed', 'placed→cancelled', 'packed→shipped', 'packed→cancelled', 'shipped→delivered']);
  });

  it('knows which orders still need work', () => {
    expect(ALL.filter((status) => needsAction({ status }))).toEqual(['placed', 'packed']);
  });
});

describe('tracking numbers', () => {
  it('drops spaces and capitalises', () => {
    expect(normalizeTracking(' 1z 999 aa1 0123456784 ')).toBe('1Z999AA10123456784');
  });

  it('explains what is wrong', () => {
    expect(validateTracking('')).toBe('Enter the tracking number from the label');
    expect(validateTracking('12345')).toBe('Tracking numbers are 8 to 34 letters and digits');
    expect(validateTracking('1Z-999-AA1')).toBe('Tracking numbers are 8 to 34 letters and digits');
    expect(validateTracking('9400 1000 0000 0000 0000 00')).toBeNull();
  });
});

describe('order history', () => {
  it('starts older orders with their placing', () => {
    expect(orderHistory({ placedAt: '2026-10-01T10:00:00Z' })).toEqual([{ status: 'placed', at: '2026-10-01T10:00:00Z' }]);
  });

  it('finds when a status was reached', () => {
    const order = {
      placedAt: '2026-10-01T10:00:00Z',
      history: [
        { status: 'placed' as const, at: '2026-10-01T10:00:00Z' },
        { status: 'packed' as const, at: '2026-10-02T15:30:00Z', by: 'Studio Admin' },
      ],
    };
    expect(reachedAt(order, 'packed')).toBe('2026-10-02T15:30:00Z');
    expect(reachedAt(order, 'shipped')).toBeUndefined();
    expect(formatEventTime('2026-10-02T15:30:00Z')).toBe('Oct 2, 2026, 3:30 PM UTC');
  });
});
