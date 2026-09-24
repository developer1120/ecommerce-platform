import { formatMoney } from '@/domain/money';
import type { Order } from '@/domain/order';
import {
  estimateRefund,
  formatReturnDate,
  isReturnReason,
  RETURN_NOTE_MAX,
  returnableQuantities,
  returnEligibility,
  returnNumber,
  toReturnLines,
  validateReturn,
  type ReturnDraftLine,
  type ReturnEligibility,
  type ReturnMethod,
  type ReturnRequest,
} from '@/domain/returns';
import { readJson, writeJson } from '@/lib/storage';
import { userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findOrder } from './mockDb';
import { sendEmails } from './outbox';

export const RETURNS_KEY = 'tanelt:mock-db:returns';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
/** Every return request in the shop, newest first. */
export const loadReturns = (): ReturnRequest[] => readJson(RETURNS_KEY, [], isArray) as ReturnRequest[];
export const saveReturns = (list: ReturnRequest[]) => writeJson(RETURNS_KEY, list);
export const returnsForOrder = (orderId: string) => loadReturns().filter((request) => request.orderId === orderId);

const ORDER_NOT_FOUND = "We couldn't find that order.";

/** The signed-in shopper's own order. Anyone else's, or a guest order, reads as not found. */
function ownOrder(token: string | null | undefined, orderId: string): Order {
  const user = userForToken(token);
  if (!user) throw new ApiError('UNAUTHORIZED', 'Sign in to return items from an order.');
  const order = findOrder(orderId);
  if (!order || order.customerId !== user.id) throw new ApiError('NOT_FOUND', ORDER_NOT_FOUND);
  return order;
}

export interface OrderReturns {
  eligibility: ReturnEligibility;
  /** Units of each variant that can still go back. */
  remaining: Record<string, number>;
  /** Requests already made on the order, newest first. */
  requests: ReturnRequest[];
}

/** What the shopper can still return from an order, and what they already asked to. */
export function getOrderReturns(token: string, orderId: string, options?: RequestOptions): Promise<OrderReturns> {
  return simulateRequest(() => {
    const order = ownOrder(token, orderId);
    const requests = returnsForOrder(order.id);
    return {
      eligibility: returnEligibility(order, requests, new Date()),
      remaining: Object.fromEntries(returnableQuantities(order, requests)),
      requests,
    };
  }, options);
}

export interface ReturnSubmission {
  orderId: string;
  lines: ReturnDraftLine[];
  method: ReturnMethod;
  note?: string;
}

/**
 * Opens a return. Like checkout, it believes nothing from the browser: the
 * window, the quantities left and the refund are all worked out again here.
 */
export function requestReturn(token: string, submission: ReturnSubmission, options?: RequestOptions): Promise<ReturnRequest> {
  return simulateRequest(() => {
    const order = ownOrder(token, submission.orderId);
    const existing = returnsForOrder(order.id);
    const now = new Date();
    const eligibility = returnEligibility(order, existing, now);
    if (!eligibility.ok) throw new ApiError('CONFLICT', eligibility.reason);

    const lines = submission.lines.map((line) => ({ ...line, reason: isReturnReason(line.reason) ? line.reason : ('' as const) }));
    const errors = validateReturn(order, lines, returnableQuantities(order, existing));
    const problem = errors.form ?? Object.values(errors)[0];
    if (problem) throw new ApiError('VALIDATION', problem);
    if (submission.method !== 'drop-off' && submission.method !== 'pickup') throw new ApiError('VALIDATION', 'Choose how to send it back');
    const note = submission.note?.trim() ?? '';
    if (note.length > RETURN_NOTE_MAX) throw new ApiError('VALIDATION', `Keep the note under ${RETURN_NOTE_MAX} characters`);

    const returnLines = toReturnLines(order.lines, lines);
    const request: ReturnRequest = {
      id: returnNumber(order.id, existing.length),
      orderId: order.id,
      ...(order.customerId && { customerId: order.customerId }),
      email: order.email,
      createdAt: now.toISOString(),
      status: 'requested',
      lines: returnLines,
      method: submission.method,
      ...(note && { note }),
      refund: estimateRefund(order, returnLines),
      history: [{ status: 'requested', at: now.toISOString() }],
    };
    saveReturns([request, ...loadReturns()]);
    sendEmails([
      {
        to: order.email,
        subject: `We've got your return request ${request.id}`,
        body: `Hi ${order.address.firstName}, we'll check your return for order ${order.id} within two working days and email ${
          request.method === 'pickup' ? 'a pickup time' : 'a prepaid label'
        }. Expected refund: ${formatMoney(request.refund)}. Return window closes ${formatReturnDate(eligibility.deadline)}.`,
        sentAt: now.toISOString(),
      },
    ]);
    return request;
  }, options);
}

/** Withdraws a request the studio hasn't acted on yet. */
export function cancelReturn(token: string, returnId: string, options?: RequestOptions): Promise<ReturnRequest> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Sign in to manage your returns.');
    const all = loadReturns();
    const index = all.findIndex((request) => request.id === returnId && request.customerId === user.id);
    if (index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that return.");
    const request = all[index]!;
    if (request.status !== 'requested') {
      throw new ApiError('CONFLICT', "This return is already under way, so it can't be cancelled here. Contact us instead.");
    }
    const at = new Date().toISOString();
    const updated: ReturnRequest = { ...request, status: 'cancelled', history: [...request.history, { status: 'cancelled', at }] };
    all[index] = updated;
    saveReturns(all);
    return updated;
  }, options);
}

/** Every return the signed-in shopper has made, newest first. */
export function listMyReturns(token: string, options?: RequestOptions): Promise<ReturnRequest[]> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
    return loadReturns()
      .filter((request) => request.customerId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, options);
}
