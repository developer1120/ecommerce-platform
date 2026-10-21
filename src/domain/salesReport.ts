import { lineTotal } from './cart';
import type { Cents } from './money';
import type { Order } from './order';
import { isListed, LOW_STOCK_THRESHOLD, type Department, type Product } from './product';

/*
 * The numbers on the admin overview, worked out from orders and the
 * catalog. Days are UTC days, like the rest of the studio's clock.
 * Cancelled orders don't count as sales; they are reported separately.
 */

export type ReportRange = 7 | 30 | 90;
export const REPORT_RANGES: ReportRange[] = [7, 30, 90];
export const DEFAULT_RANGE: ReportRange = 30;

export function isReportRange(value: number): value is ReportRange {
  return (REPORT_RANGES as number[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Period {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/** The last `days` days up to and including today, and the same length of time just before. */
export function periodsFor(now: Date, days: number): { current: Period; previous: Period } {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS;
  const start = end - days * DAY_MS;
  return {
    current: { start: new Date(start), end: new Date(end) },
    previous: { start: new Date(start - days * DAY_MS), end: new Date(start) },
  };
}

function within(order: Order, period: Period): boolean {
  const at = Date.parse(order.placedAt);
  return at >= period.start.getTime() && at < period.end.getTime();
}

/** Merchandise sold after discounts: no tax, no shipping. */
export function netSalesOf(order: Order): Cents {
  return order.totals.subtotal - order.totals.discount;
}

export interface SalesTotals {
  netSales: Cents;
  orders: number;
  averageOrder: Cents;
  items: number;
}

export function totalsOf(orders: Order[]): SalesTotals {
  const counted = orders.filter((order) => order.status !== 'cancelled');
  const netSales = counted.reduce((sum, order) => sum + netSalesOf(order), 0);
  return {
    netSales,
    orders: counted.length,
    averageOrder: counted.length > 0 ? Math.round(netSales / counted.length) : 0,
    items: counted.reduce((sum, order) => sum + order.lines.reduce((count, line) => count + line.quantity, 0), 0),
  };
}

/** Whole-percent change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface DayPoint {
  /** YYYY-MM-DD. */
  date: string;
  netSales: Cents;
  orders: number;
}

export interface ProductSales {
  productId: string;
  name: string;
  slug: string;
  units: number;
  /** Line totals, before order-wide promo discounts. */
  sales: Cents;
}

export interface DepartmentSales {
  department: Department | 'other';
  sales: Cents;
  /** 0 to 1. */
  share: number;
}

export interface PromoUsage {
  code: string;
  orders: number;
  discount: Cents;
}
