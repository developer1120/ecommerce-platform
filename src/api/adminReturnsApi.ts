import { formatMoney, type Cents } from '@/domain/money';
import type { Order } from '@/domain/order';
import { NOTE_MAX } from '@/domain/orderStatus';
import {
  canMoveReturn,
  RETURN_METHODS,
  RETURN_STATUS_LABELS,
  validateRefund,
  type ReturnRequest,
  type ReturnStatus,
} from '@/domain/returns';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findOrder, findVariant, saveOrder } from './mockDb';
import { sendEmails, type OutboxEmail } from './outbox';
import { loadReturns, saveReturns } from './returnsApi';
import { restockVariant } from './stockAlertsApi';
import { recordMovement } from './stockMovements';

/** Every return in the shop, newest first. Admins only. */
export function listAdminReturns(token: string, options?: RequestOptions): Promise<ReturnRequest[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return loadReturns().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, options);
}

export interface AdminReturn {
  request: ReturnRequest;
  /** The order it came from; absent only if the order has since gone. */
  order?: Order;
}

export function getAdminReturn(token: string, id: string, options?: RequestOptions): Promise<AdminReturn> {
  return simulateRequest(() => {
    requireAdmin(token);
    const request = loadReturns().find((candidate) => candidate.id === id);
    if (!request) throw new ApiError('NOT_FOUND', "We couldn't find that return.");
    return { request, order: findOrder(request.orderId) };
  }, options);
}

export interface ReturnChange {
  to: ReturnStatus;
  /** The status the admin was looking at; if the return has moved on since, the change is refused. */
  expected: ReturnStatus;
  /** Shown to the shopper. Required to decline, and to refund less than the estimate. */
  note?: string;
  /** On receipt: put the items back on sale. */
  restock?: boolean;
  /** On refund: how much, in cents. Defaults to the estimate. */
  amount?: Cents;
}

export interface ReturnChangeResult {
  request: ReturnRequest;
  /** Units put back into stock on receipt. */
  restocked: number;
}

function emailFor(request: ReturnRequest, order: Order | undefined): OutboxEmail | null {
  const sentAt = new Date().toISOString();
  const hello = order ? `Hi ${order.address.firstName},` : 'Hello,';
  const note = request.history.at(-1)?.note;
  switch (request.status) {
    case 'approved': {
      const method = RETURN_METHODS.find((option) => option.value === request.method)!;
      const how =
        request.method === 'pickup'
          ? 'a courier will collect it from your shipping address within three working days.'
          : 'your prepaid label is attached. Drop the parcel at any post office.';
      return {
        to: request.email,
        subject: `Your return ${request.id} is approved`,
        body: `${hello} we've approved your return (${method.label.toLowerCase()}): ${how} We'll refund ${formatMoney(request.refund)} once it reaches us.`,
        sentAt,
      };
    }
    case 'rejected':
      return {
        to: request.email,
        subject: `About your return ${request.id}`,
        body: `${hello} we're sorry, we can't accept this return. ${note ?? ''} Reply to this email if you'd like to talk it through.`.replace(/\s+/g, ' '),
        sentAt,
      };
    case 'received':
      return {
        to: request.email,
        subject: `Your return ${request.id} arrived`,
        body: `${hello} your parcel is back with us. Your refund will follow shortly.`,
        sentAt,
      };
    case 'refunded':
      return {
        to: request.email,
        subject: `We've refunded ${formatMoney(request.refund)} for return ${request.id}`,
        body: `${hello} ${formatMoney(request.refund)} is on its way to your card. It can take 5 to 10 days to appear.${note ? ` ${note}` : ''}`,
        sentAt,
      };
    default:
      return null;
  }
}

/**
 * Moves a return along: approve or decline it, mark the parcel received
 * (optionally restocking the items), and refund it, which is recorded on
 * the order as well. The shopper is emailed at every step.
 */
export function updateReturn(token: string, id: string, change: ReturnChange, options?: RequestOptions): Promise<ReturnChangeResult> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const all = loadReturns();
    const index = all.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that return.");
    const current = all[index]!;
    if (current.status !== change.expected) {
      throw new ApiError('CONFLICT', `This return changed while you had it open. It's now "${RETURN_STATUS_LABELS[current.status]}".`);
    }
    if (!canMoveReturn(current.status, change.to)) {
      throw new ApiError(
        'VALIDATION',
        `A return that is "${RETURN_STATUS_LABELS[current.status]}" can't be moved to "${RETURN_STATUS_LABELS[change.to]}".`,
      );
    }

    const note = change.note?.trim() ?? '';
    if (note.length > NOTE_MAX) throw new ApiError('VALIDATION', `Keep the note under ${NOTE_MAX} characters.`);
    if (change.to === 'rejected' && !note) throw new ApiError('VALIDATION', 'Tell the shopper why the return was declined.');

    let refund = current.refund;
    if (change.to === 'refunded') {
      refund = change.amount ?? current.refund;
      const problem = validateRefund(refund, current.refund);
      if (problem) throw new ApiError('VALIDATION', problem);
      if (refund < current.refund && !note) throw new ApiError('VALIDATION', 'Say why the refund is less than expected.');
    }

    let restocked = 0;
    if (change.to === 'received' && change.restock) {
      for (const line of current.lines) {
        // A product removed since the order was placed has nowhere to go back to.
        if (!findVariant(line.variantId)) continue;
        restockVariant(line.variantId, line.quantity);
        recordMovement({ variantId: line.variantId, change: line.quantity, reason: 'returned', by: admin.name, reference: current.id });
        restocked += line.quantity;
      }
    }

    const at = new Date().toISOString();
    const request: ReturnRequest = {
      ...current,
      status: change.to,
      refund,
      history: [...current.history, { status: change.to, at, by: admin.name, ...(note && { note }) }],
    };
    all[index] = request;
    saveReturns(all);

    const order = findOrder(current.orderId);
    if (change.to === 'refunded' && order) {
      saveOrder({ ...order, refunds: [...(order.refunds ?? []), { returnId: request.id, amount: refund, at }] });
    }
    const email = emailFor(request, order);
    if (email) sendEmails([email]);
    return { request, restocked };
  }, options);
}
