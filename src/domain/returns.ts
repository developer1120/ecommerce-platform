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
  return remaining;
}

const DEADLINE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function formatReturnDate(date: Date | string): string {
  return DEADLINE.format(typeof date === 'string' ? new Date(date) : date);
}

export type ReturnEligibility = { ok: true; deadline: Date } | { ok: false; reason: string };

/** Whether the shopper can start another return on this order, and if not, why not in their words. */
export function returnEligibility(order: Order, requests: Pick<ReturnRequest, 'status' | 'lines'>[], now: Date): ReturnEligibility {
  if (order.status === 'cancelled') return { ok: false, reason: 'This order was cancelled, so there is nothing to return.' };
  const deadline = returnDeadline(order);
  if (!deadline) return { ok: false, reason: 'You can start a return once your order arrives.' };
  if (now > deadline) return { ok: false, reason: `Returns for this order closed on ${formatReturnDate(deadline)}.` };
  const remaining = returnableQuantities(order, requests);
  if ([...remaining.values()].every((quantity) => quantity === 0)) {
    return { ok: false, reason: 'Every item in this order is already in a return.' };
  }
  return { ok: true, deadline };
}

/**
 * The refund for some items: their share of what was paid for goods, so a
 * promo discount and the tax on them come off and back in proportion.
 * Shipping isn't refunded, and returns themselves are free.
 */
export function estimateRefund(order: Pick<Order, 'totals'>, items: { unitPrice: Cents; quantity: number }[]): Cents {
  const value = sumCents(items.map((item) => multiplyCents(item.unitPrice, item.quantity)));
  const { subtotal, discount, tax } = order.totals;
  if (subtotal <= 0 || value <= 0) return 0;
  const share = Math.min(1, value / subtotal);
  return Math.round(share * (subtotal - discount + tax));
}

/** The chosen lines, checked against the order. Returns an error per variant, or for the whole form under "form". */
export function validateReturn(order: Pick<Order, 'lines'>, draft: ReturnDraftLine[], remaining: Map<string, number>): Record<string, string> {
  const errors: Record<string, string> = {};
  const chosen = draft.filter((line) => line.quantity > 0);
  if (chosen.length === 0) {
    errors.form = 'Choose at least one item to return';
    return errors;
  }
  for (const line of chosen) {
    const ordered = order.lines.find((candidate) => candidate.variantId === line.variantId);
    const left = remaining.get(line.variantId) ?? 0;
    if (!ordered) errors[line.variantId] = "That item isn't in this order";
    else if (!Number.isInteger(line.quantity) || line.quantity > left) {
      errors[line.variantId] = left === 0 ? 'This item is already in a return' : `You can return up to ${left}`;
    } else if (!line.reason) errors[line.variantId] = 'Choose a reason';
  }
  return errors;
}

/** Turns the shopper's choices into the lines stored on the request. */
export function toReturnLines(orderLines: CartLine[], draft: ReturnDraftLine[]): ReturnLine[] {
  return draft
    .filter((line) => line.quantity > 0 && line.reason)
    .map((line) => {
      const ordered = orderLines.find((candidate) => candidate.variantId === line.variantId)!;
      return {
        variantId: line.variantId,
        name: ordered.name,
        options: ordered.options,
        unitPrice: ordered.unitPrice,
        quantity: line.quantity,
        reason: line.reason as ReturnReason,
      };
    });
}

export function returnItemCount(request: Pick<ReturnRequest, 'lines'>): number {
  return request.lines.reduce((total, line) => total + line.quantity, 0);
}

/* The studio's side. */

/** Where a return can go next. The shopper cancels from "requested" themselves; that isn't a studio move. */
export const NEXT_RETURN_STATUSES: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'rejected'],
  received: ['refunded'],
  refunded: [],
  rejected: [],
  cancelled: [],
};

export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return NEXT_RETURN_STATUSES[from].includes(to);
}

/** What the admin button says for each move. */
export const RETURN_MOVE_LABELS: Partial<Record<ReturnStatus, string>> = {
  approved: 'Approve and send label',
  received: 'Mark as received',
  refunded: 'Issue refund',
  rejected: 'Decline return',
};

/** The admin list's tabs, by what the studio has to do next. */
export type ReturnQueue = 'review' | 'awaiting' | 'refund' | 'closed' | 'all';

export const RETURN_QUEUES: { value: ReturnQueue; label: string; statuses: ReturnStatus[] }[] = [
  { value: 'review', label: 'To review', statuses: ['requested'] },
  { value: 'awaiting', label: 'Awaiting parcel', statuses: ['approved'] },
  { value: 'refund', label: 'To refund', statuses: ['received'] },
  { value: 'closed', label: 'Closed', statuses: ['refunded', 'rejected', 'cancelled'] },
  { value: 'all', label: 'All', statuses: ['requested', 'approved', 'received', 'refunded', 'rejected', 'cancelled'] },
];

export function inQueue(request: Pick<ReturnRequest, 'status'>, queue: ReturnQueue): boolean {
  return RETURN_QUEUES.find((option) => option.value === queue)!.statuses.includes(request.status);
}

/** A refund can be less than the estimate (say, an item came back used), never more. */
export function validateRefund(amount: Cents | null, max: Cents): string | null {
  if (amount === null) return 'Enter the amount to refund';
  if (amount <= 0) return 'Refund more than $0.00';
  if (amount > max) return `You can refund up to ${formatMoney(max)}`;
  return null;
}
