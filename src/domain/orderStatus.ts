import type { Order, OrderEvent, OrderStatus } from './order';

/*
 * How an order moves once it's placed. The studio packs it, ships it with
 * a tracking number, and marks it delivered. It can be cancelled until it
 * leaves the building; after that it's a return, which is a different job.
 */

export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  placed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function canMoveTo(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** What the admin button says for each move. */
export const MOVE_LABELS: Record<OrderStatus, string> = {
  placed: 'Reopen',
  packed: 'Mark as packed',
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered',
  cancelled: 'Cancel order',
};

/** Orders that still need someone in the studio to do something. */
export function needsAction(order: Pick<Order, 'status'>): boolean {
  return order.status === 'placed' || order.status === 'packed';
}

export const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;
export type Carrier = (typeof CARRIERS)[number];

export function isCarrier(value: string): value is Carrier {
  return (CARRIERS as readonly string[]).includes(value);
}

/** Tracking numbers are letters and digits; spaces people paste in are dropped. */
export function normalizeTracking(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function validateTracking(input: string): string | null {
  const number = normalizeTracking(input);
  if (!number) return 'Enter the tracking number from the label';
  if (!/^[A-Z0-9]{8,34}$/.test(number)) return 'Tracking numbers are 8 to 34 letters and digits';
  return null;
}

export const NOTE_MAX = 280;

/** Every change so far, oldest first. Orders from before history was kept start with their placing. */
export function orderHistory(order: Pick<Order, 'history' | 'placedAt'>): OrderEvent[] {
  return order.history ?? [{ status: 'placed', at: order.placedAt }];
}

const EVENT_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

/** "Oct 7, 2026, 7:00 PM UTC": the studio works from one clock. */
export function formatEventTime(iso: string): string {
  return `${EVENT_TIME.format(new Date(iso))} UTC`;
}

/** When the order reached a status, if it has. */
export function reachedAt(order: Pick<Order, 'history' | 'placedAt'>, status: OrderStatus): string | undefined {
  return orderHistory(order).find((event) => event.status === status)?.at;
}
