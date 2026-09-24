import { lookupProduct } from '@/data/catalogLookup';
import { CATALOG } from '@/data/catalog';
import { PROMOTIONS } from '@/data/promotions';
import { findState } from '@/data/usStates';
import { isCompleteAddress } from '@/domain/address';
import { reconcileCart } from '@/domain/cartReconcile';
import { newOrderNumber, type Order, type PlaceOrderRequest } from '@/domain/order';
import { calculateOrderTotals } from '@/domain/orderTotals';
import { TEST_CARDS } from '@/domain/payment';
import { evaluatePromotion } from '@/domain/promotions';
import { deliveryWindow, findShippingMethod } from '@/domain/shipping';
import { userForToken } from './authApi';
import { ApiError, getApiConfig, simulateRequest, type RequestOptions } from './client';
import { findOrder, findVariant, loadOrders, orderForIdempotencyKey, rememberIdempotencyKey, saveOrder } from './mockDb';

const DECLINED_LAST4 = TEST_CARDS.declined.slice(-4);

/**
 * Places an order the way a careful server would: it trusts nothing the
 * browser computed. It re-checks stock and prices, re-applies the promo
 * code, recalculates every amount, charges the (pretend) card, then takes
 * the stock. A repeated request with the same idempotency key returns the
 * order already placed instead of charging twice.
 */
export function placeOrder(request: PlaceOrderRequest, options?: RequestOptions): Promise<Order> {
  return simulateRequest(() => {
    const existing = orderForIdempotencyKey(request.idempotencyKey);
    if (existing) return existing;

    if (request.lines.length === 0) throw new ApiError('VALIDATION', 'Your bag is empty.');
    if (!isCompleteAddress(request.address)) {
      throw new ApiError('VALIDATION', 'The shipping address is incomplete. Check it and try again.');
    }

    const check = reconcileCart({ lines: request.lines }, CATALOG);
    if (check.notices.length > 0) {
      throw new ApiError(
        'CONFLICT',
        "Some items changed while you were checking out. We've updated your bag; check it and place the order again.",
      );
    }
    const lines = check.state.lines;
    const now = new Date();

    let promo = null;
    if (request.promoCode) {
      const promotion = PROMOTIONS.find((candidate) => candidate.code === request.promoCode);
      promo = promotion ? evaluatePromotion(promotion, lines, lookupProduct, now) : null;
      if (!promo?.ok) {
        throw new ApiError(
          'CONFLICT',
          promo && !promo.ok ? promo.message : `${request.promoCode} can't be used any more. Remove it to continue.`,
        );
      }
    }

    const destination = findState(request.address.state);
    const method = findShippingMethod(request.methodId);
    if (!method || (destination?.remote && !method.remoteOk)) {
      throw new ApiError('VALIDATION', "That delivery option isn't available for this address.");
    }

    if (request.card.last4 === DECLINED_LAST4) {
      throw new ApiError('PAYMENT_DECLINED', 'Your card was declined and you have not been charged. Try a different card.');
    }

    const totals = calculateOrderTotals({ lines, promo, method, destination, lookup: lookupProduct });
    const customerId = userForToken(request.sessionToken)?.id;
    const window = deliveryWindow(method, now);
    const order: Order = {
      id: newOrderNumber(now, getApiConfig().random),
      placedAt: now.toISOString(),
      status: 'placed',
      history: [{ status: 'placed', at: now.toISOString() }],
      email: request.address.email,
      address: request.address,
      shipping: {
        methodId: method.id,
        label: method.label,
        earliest: window.earliest.toISOString(),
        latest: window.latest.toISOString(),
      },
      card: request.card,
      lines,
      ...(request.promoCode && { promoCode: request.promoCode }),
      ...(customerId && { customerId }),
      totals: {
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping.price,
        tax: totals.tax?.tax ?? 0,
        taxRate: totals.tax?.rate ?? 0,
        total: totals.total,
      },
    };

    for (const line of lines) {
      const found = findVariant(line.variantId);
      if (found) found.variant.stock = Math.max(0, found.variant.stock - line.quantity);
    }
    saveOrder(order);
    rememberIdempotencyKey(request.idempotencyKey, order.id);
    return order;
  }, options);
}

const ORDER_NOT_FOUND = "We couldn't find that order. Check the order number in your email.";

/**
 * One order by its number. An order placed from an account is only shown to
 * that account; anyone else gets "not found", so its existence isn't revealed.
 * Guest orders are reachable by number alone, like a receipt link.
 */
export function getOrder(id: string, sessionToken: string | null, options?: RequestOptions): Promise<Order> {
  return simulateRequest(() => {
    const order = findOrder(id);
    if (!order) throw new ApiError('NOT_FOUND', ORDER_NOT_FOUND);
    if (order.customerId && userForToken(sessionToken)?.id !== order.customerId) {
      throw new ApiError('NOT_FOUND', ORDER_NOT_FOUND);
    }
    return order;
  }, options);
}

/** Every order placed from the signed-in account, newest first. */
export function listMyOrders(sessionToken: string, options?: RequestOptions): Promise<Order[]> {
  return simulateRequest(() => {
    const user = userForToken(sessionToken);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Your session has ended. Sign in again.');
    return loadOrders()
      .filter((order) => order.customerId === user.id)
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }, options);
}
