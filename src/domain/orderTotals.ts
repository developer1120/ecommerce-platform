import { FREE_SHIPPING_THRESHOLD } from '@/config/store';
import type { UsState } from '@/data/usStates';
import { lineTotal, type CartLine } from './cart';
import { sumCents, type Cents } from './money';
import type { PromoEvaluation, ProductLookup } from './promotions';
import { quoteShipping, type ShippingMethod, type ShippingQuote } from './shipping';
import { quoteTax, type TaxQuote } from './tax';

export interface OrderTotalsInput {
  lines: CartLine[];
  promo: PromoEvaluation | null;
  method: ShippingMethod;
  /** Unknown until the shopper says where the order goes; tax waits for it. */
  destination: UsState | undefined;
  lookup: ProductLookup;
  threshold?: Cents;
}

export interface OrderTotals {
  subtotal: Cents;
  discount: Cents;
  /** Subtotal less the promo discount: what free shipping is measured against. */
  merchandiseTotal: Cents;
  shipping: ShippingQuote;
  /** Null until there is a destination. */
  tax: TaxQuote | null;
  total: Cents;
}

/**
 * Every number in an order summary, from one place, in cents. The bag page
 * shows it as an estimate and checkout charges it.
 */
export function calculateOrderTotals({
  lines,
  promo,
  method,
  destination,
  lookup,
  threshold = FREE_SHIPPING_THRESHOLD,
}: OrderTotalsInput): OrderTotals {
  const subtotal = sumCents(lines.map(lineTotal));
  const discount = promo?.ok ? promo.discount : 0;
  const merchandiseTotal = subtotal - discount;

  const shipping = quoteShipping(method, {
    merchandiseTotal,
    threshold,
    promoFreeShipping: Boolean(promo?.ok && promo.freeShipping),
    remote: Boolean(destination?.remote),
  });

  const tax = destination
    ? quoteTax(
        destination,
        lines.map((line) => ({
          department: lookup(line.productId)?.department,
          amount: lineTotal(line) - (promo?.ok ? (promo.lineDiscounts[line.variantId] ?? 0) : 0),
        })),
        shipping.price,
      )
    : null;

  return {
    subtotal,
    discount,
    merchandiseTotal,
    shipping,
    tax,
    total: merchandiseTotal + shipping.price + (tax?.tax ?? 0),
  };
}
