import type { CartLine } from './cart';
import { formatMoney, multiplyCents, sumCents, type Cents } from './money';
import type { Order } from './order';
import { reachedAt } from './orderStatus';

/*
 * Returns. A shopper can send back anything from a delivered order within
 * 30 days of it arriving. They choose the items and a reason for each, the
 * studio approves the request and emails a label, and once the parcel is
 * back the refund goes to the card the order was paid with.
 */

export const RETURN_WINDOW_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type ReturnStatus = 'requested' | 'approved' | 'received' | 'refunded' | 'rejected' | 'cancelled';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  received: 'Received',
  refunded: 'Refunded',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

export type ReturnReason = 'too-small' | 'too-large' | 'not-as-described' | 'damaged' | 'wrong-item' | 'changed-mind';

export const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'too-small', label: 'Too small' },
  { value: 'too-large', label: 'Too large' },
  { value: 'not-as-described', label: 'Not as described' },
  { value: 'damaged', label: 'Arrived damaged' },
  { value: 'wrong-item', label: 'Wrong item sent' },
  { value: 'changed-mind', label: 'Changed my mind' },
];

export const isReturnReason = (value: string): value is ReturnReason => RETURN_REASONS.some((reason) => reason.value === value);
export const reasonLabel = (reason: ReturnReason) => RETURN_REASONS.find((option) => option.value === reason)!.label;

export type ReturnMethod = 'drop-off' | 'pickup';

export const RETURN_METHODS: { value: ReturnMethod; label: string; description: string }[] = [
  { value: 'drop-off', label: 'Drop it off', description: 'We email a prepaid label. Leave the parcel at any post office.' },
  { value: 'pickup', label: 'Book a pickup', description: 'A courier collects it from your shipping address.' },
];

export interface ReturnLine {
  variantId: string;
  name: string;
  options: Record<string, string>;
  /** What the shopper paid for one, before any promo. */
  unitPrice: Cents;
  quantity: number;
  reason: ReturnReason;
}

export interface ReturnEvent {
  status: ReturnStatus;
  at: string;
  /** The staff member who made the change; absent when the shopper did. */
  by?: string;
  note?: string;
}

export interface ReturnRequest {
  /** "RT-" and the order number, then a count: RT-261011-K7F3-1. */
  id: string;
  orderId: string;
  customerId?: string;
  email: string;
  createdAt: string;
  status: ReturnStatus;
  lines: ReturnLine[];
  method: ReturnMethod;
  note?: string;
  /** What the shopper will get back, worked out when they asked. */
  refund: Cents;
  history: ReturnEvent[];
}

/** What the shopper sends: which items, how many and why. */
export interface ReturnDraftLine {
  variantId: string;
  quantity: number;
  reason: ReturnReason | '';
}

export const RETURN_NOTE_MAX = 500;

export function returnNumber(orderId: string, existing: number): string {
  return `RT-${orderId.replace(/^OR-/, '')}-${existing + 1}`;
}

/** Returns that still hold on to items: everything but declined and cancelled ones. */
export function isActiveReturn(request: Pick<ReturnRequest, 'status'>): boolean {
  return request.status !== 'rejected' && request.status !== 'cancelled';
}

/** Requests the studio still has to do something about. */
export function isOpenReturn(request: Pick<ReturnRequest, 'status'>): boolean {
  return request.status === 'requested' || request.status === 'approved' || request.status === 'received';
}

/** When the order arrived. Orders marked delivered before history was kept fall back to the latest delivery date. */
export function deliveredAt(order: Pick<Order, 'status' | 'history' | 'placedAt' | 'shipping'>): Date | undefined {
  if (order.status !== 'delivered') return undefined;
  return new Date(reachedAt(order, 'delivered') ?? order.shipping.latest);
}

export function returnDeadline(order: Pick<Order, 'status' | 'history' | 'placedAt' | 'shipping'>): Date | undefined {
  const arrived = deliveredAt(order);
  return arrived && new Date(arrived.getTime() + RETURN_WINDOW_DAYS * DAY);
}

/** How many of each item can still be sent back, after earlier requests. */
export function returnableQuantities(order: Pick<Order, 'lines'>, requests: Pick<ReturnRequest, 'status' | 'lines'>[]): Map<string, number> {
  const remaining = new Map(order.lines.map((line) => [line.variantId, line.quantity]));
  for (const request of requests.filter(isActiveReturn)) {
    for (const line of request.lines) {
      remaining.set(line.variantId, Math.max(0, (remaining.get(line.variantId) ?? 0) - line.quantity));
    }
  }
