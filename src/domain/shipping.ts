import type { Cents } from './money';

export type ShippingMethodId = 'standard' | 'express' | 'next-day';

export interface ShippingMethod {
  id: ShippingMethodId;
  label: string;
  price: Cents;
  /** Business days in transit after dispatch: [fastest, slowest]. */
  transitDays: [number, number];
  /** Whether it can go to Alaska and Hawaii. */
  remoteOk: boolean;
}

export const SHIPPING_METHODS: ShippingMethod[] = [
  { id: 'standard', label: 'Standard', price: 595, transitDays: [3, 5], remoteOk: true },
  { id: 'express', label: 'Express', price: 1495, transitDays: [1, 2], remoteOk: true },
  { id: 'next-day', label: 'Next day', price: 2495, transitDays: [1, 1], remoteOk: false },
];

/** Added to every method for Alaska and Hawaii. */
export const REMOTE_SURCHARGE: Cents = 1000;
/** Orders placed at or after this hour (UTC; 2pm Eastern daylight time) ship the next business day. */
export const DISPATCH_CUTOFF_UTC_HOUR = 18;

export function findShippingMethod(id: string | null | undefined): ShippingMethod | undefined {
  return SHIPPING_METHODS.find((method) => method.id === id);
}

export function availableMethods(remote: boolean): ShippingMethod[] {
  return SHIPPING_METHODS.filter((method) => !remote || method.remoteOk);
}

export type FreeShippingReason = 'threshold' | 'promo';

export interface ShippingQuote {
  method: ShippingMethod;
  /** What the shopper pays for shipping. */
  price: Cents;
  /** What it would have cost, before any free-shipping offer. */
  fullPrice: Cents;
  freeReason?: FreeShippingReason;
}

/**
 * Prices a shipping method. Free shipping, from the order threshold or a
 * code, covers standard delivery only; faster methods are always charged.
 */
export function quoteShipping(
  method: ShippingMethod,
  { merchandiseTotal, threshold, promoFreeShipping, remote }: {
    merchandiseTotal: Cents;
    threshold: Cents;
    promoFreeShipping: boolean;
    remote: boolean;
  },
): ShippingQuote {
  const fullPrice = method.price + (remote ? REMOTE_SURCHARGE : 0);
  if (method.id === 'standard') {
    if (promoFreeShipping) return { method, price: 0, fullPrice, freeReason: 'promo' };
    if (merchandiseTotal >= threshold) return { method, price: 0, fullPrice, freeReason: 'threshold' };
  }
  return { method, price: fullPrice, fullPrice };
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addBusinessDays(date: Date, days: number): Date {
  const result = startOfUtcDay(date);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}

/** The business day an order placed now leaves the warehouse. */
export function dispatchDate(now: Date): Date {
  const today = startOfUtcDay(now);
  if (!isWeekend(today) && now.getUTCHours() < DISPATCH_CUTOFF_UTC_HOUR) return today;
  return addBusinessDays(today, 1);
}

export interface DeliveryWindow {
  earliest: Date;
  latest: Date;
}

export function deliveryWindow(method: ShippingMethod, now: Date): DeliveryWindow {
  const dispatched = dispatchDate(now);
  return {
    earliest: addBusinessDays(dispatched, method.transitDays[0]),
    latest: addBusinessDays(dispatched, method.transitDays[1]),
  };
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Fri, Oct 9" or "Tue, Oct 13 – Thu, Oct 15". */
export function formatDeliveryWindow({ earliest, latest }: DeliveryWindow): string {
  const first = DAY_FORMAT.format(earliest);
  return earliest.getTime() === latest.getTime() ? first : `${first} – ${DAY_FORMAT.format(latest)}`;
}
