import { formatMoney } from '@/domain/money';
import { STATUS_LABELS, type Order, type OrderStatus } from '@/domain/order';
import { canMoveTo, isCarrier, normalizeTracking, NOTE_MAX, orderHistory, validateTracking } from '@/domain/orderStatus';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findOrder, findVariant, loadOrders, saveOrder } from './mockDb';
import { sendEmails, type OutboxEmail } from './outbox';
import { restockVariant } from './stockAlertsApi';

/** Every order in the shop, newest first. */
export function listAdminOrders(token: string, options?: RequestOptions): Promise<Order[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return loadOrders().sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }, options);
}

export function getAdminOrder(token: string, id: string, options?: RequestOptions): Promise<Order> {
  return simulateRequest(() => {
    requireAdmin(token);
    const order = findOrder(id);
    if (!order) throw new ApiError('NOT_FOUND', "We couldn't find that order.");
    return order;
  }, options);
}

export interface StatusChange {
  to: OrderStatus;
  /** The status the admin was looking at; if the order has moved on since, the change is refused. */
  expected: OrderStatus;
  /** Required to ship. */
  tracking?: { carrier: string; number: string };
  note?: string;
}

export interface StatusChangeResult {
  order: Order;
  /** Units put back into stock by a cancellation. */
  restocked: number;
  /** Shoppers emailed because a cancellation brought a sold-out option back. */
  notified: number;
}

function emailFor(order: Order, to: OrderStatus): OutboxEmail | null {
  const sentAt = new Date().toISOString();
  const hello = `Hi ${order.address.firstName},`;
  switch (to) {
    case 'shipped':
      return {
        to: order.email,
        subject: `Your Tanelt order ${order.id} is on its way`,
        body: `${hello} your order has shipped with ${order.tracking!.carrier}. Tracking number: ${order.tracking!.number}.`,
        sentAt,
      };
    case 'delivered':
      return {
        to: order.email,
        subject: `Your Tanelt order ${order.id} was delivered`,
        body: `${hello} your order has arrived. We hope you love it.`,
        sentAt,
      };
    case 'cancelled':
      return {
        to: order.email,
        subject: `Your Tanelt order ${order.id} was cancelled`,
        body: `${hello} we've cancelled your order and refunded ${formatMoney(order.totals.total)} to your card. It can take 5 to 10 days to appear.`,
        sentAt,
      };
    default:
      return null;
  }
}

/**
 * Moves an order to its next status. Shipping needs a tracking number;
 * cancelling puts the items back into stock. The shopper is emailed when
 * their order ships, arrives, or is cancelled.
 */
export function updateOrderStatus(
  token: string,
  id: string,
  change: StatusChange,
  options?: RequestOptions,
): Promise<StatusChangeResult> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const current = findOrder(id);
    if (!current) throw new ApiError('NOT_FOUND', "We couldn't find that order.");
    if (current.status !== change.expected) {
      throw new ApiError(
        'CONFLICT',
        `Someone else changed this order while you had it open. It's now "${STATUS_LABELS[current.status]}".`,
      );
    }
    if (!canMoveTo(current.status, change.to)) {
      throw new ApiError(
        'VALIDATION',
        `An order that is "${STATUS_LABELS[current.status]}" can't be moved to "${STATUS_LABELS[change.to]}".`,
      );
    }

    let tracking = current.tracking;
    if (change.to === 'shipped') {
      const carrier = change.tracking?.carrier ?? '';
      const problem = validateTracking(change.tracking?.number ?? '');
      if (!isCarrier(carrier)) throw new ApiError('VALIDATION', 'Choose the carrier.');
      if (problem) throw new ApiError('VALIDATION', problem);
      tracking = { carrier, number: normalizeTracking(change.tracking!.number) };
    }
    const note = change.note?.trim();
    if (note && note.length > NOTE_MAX) throw new ApiError('VALIDATION', `Keep the note under ${NOTE_MAX} characters.`);

    let restocked = 0;
    let notified = 0;
    if (change.to === 'cancelled') {
      for (const line of current.lines) {
        // A product removed since the order was placed has nowhere to go back to.
        if (!findVariant(line.variantId)) continue;
        notified += restockVariant(line.variantId, line.quantity).notified;
        restocked += line.quantity;
      }
    }

    const order: Order = {
      ...current,
      status: change.to,
      ...(tracking && { tracking }),
      history: [
        ...orderHistory(current),
        { status: change.to, at: new Date().toISOString(), by: admin.name, ...(note && { note }) },
      ],
    };
    saveOrder(order);
    const email = emailFor(order, change.to);
    if (email) sendEmails([email]);
    return { order, restocked, notified };
  }, options);
}
