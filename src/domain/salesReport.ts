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

export interface StockWarning {
  productId: string;
  name: string;
  variantId: string;
  /** "Oat / M", or empty for a product without options. */
  option: string;
  stock: number;
}

export interface SalesReport {
  days: ReportRange;
  current: SalesTotals;
  previous: SalesTotals;
  /** Orders placed in the period and since cancelled. */
  cancelled: number;
  daily: DayPoint[];
  topProducts: ProductSales[];
  departments: DepartmentSales[];
  promos: PromoUsage[];
  /** Work waiting now, whenever the orders were placed. */
  toPack: number;
  toShip: number;
  lowStock: StockWarning[];
}

export const TOP_PRODUCTS = 5;
export const LOW_STOCK_ROWS = 8;

export function buildSalesReport(orders: Order[], catalog: Product[], now: Date, days: ReportRange): SalesReport {
  const { current, previous } = periodsFor(now, days);
  const inRange = orders.filter((order) => within(order, current));
  const sold = inRange.filter((order) => order.status !== 'cancelled');

  const daily: DayPoint[] = Array.from({ length: days }, (_, index) => ({
    date: new Date(current.start.getTime() + index * DAY_MS).toISOString().slice(0, 10),
    netSales: 0,
    orders: 0,
  }));
  for (const order of sold) {
    const index = Math.floor((Date.parse(order.placedAt) - current.start.getTime()) / DAY_MS);
    const day = daily[index]!;
    day.netSales += netSalesOf(order);
    day.orders += 1;
  }

  const byProduct = new Map<string, ProductSales>();
  const byDepartment = new Map<DepartmentSales['department'], Cents>();
  const byPromo = new Map<string, PromoUsage>();
  for (const order of sold) {
    for (const line of order.lines) {
      const entry = byProduct.get(line.productId) ?? { productId: line.productId, name: line.name, slug: line.slug, units: 0, sales: 0 };
      entry.units += line.quantity;
      entry.sales += lineTotal(line);
      byProduct.set(line.productId, entry);
      const department = catalog.find((product) => product.id === line.productId)?.department ?? 'other';
      byDepartment.set(department, (byDepartment.get(department) ?? 0) + lineTotal(line));
    }
    if (order.promoCode) {
      const usage = byPromo.get(order.promoCode) ?? { code: order.promoCode, orders: 0, discount: 0 };
      usage.orders += 1;
      usage.discount += order.totals.discount;
      byPromo.set(order.promoCode, usage);
    }
  }
  const departmentTotal = [...byDepartment.values()].reduce((sum, sales) => sum + sales, 0);

  const lowStock: StockWarning[] = catalog
    .filter(isListed)
    .flatMap((product) =>
      product.variants
        .filter((variant) => variant.stock <= LOW_STOCK_THRESHOLD)
        .map((variant) => ({
          productId: product.id,
          name: product.name,
          variantId: variant.id,
          option: Object.values(variant.options).join(' / '),
          stock: variant.stock,
        })),
    )
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

  return {
    days,
    current: totalsOf(inRange),
    previous: totalsOf(orders.filter((order) => within(order, previous))),
    cancelled: inRange.length - sold.length,
    daily,
    topProducts: [...byProduct.values()]
      .sort((a, b) => b.sales - a.sales || b.units - a.units || a.name.localeCompare(b.name))
      .slice(0, TOP_PRODUCTS),
    departments: [...byDepartment.entries()]
      .map(([department, sales]) => ({ department, sales, share: departmentTotal > 0 ? sales / departmentTotal : 0 }))
      .sort((a, b) => b.sales - a.sales),
    promos: [...byPromo.values()].sort((a, b) => b.orders - a.orders || b.discount - a.discount),
    toPack: orders.filter((order) => order.status === 'placed').length,
    toShip: orders.filter((order) => order.status === 'packed').length,
    lowStock: lowStock.slice(0, LOW_STOCK_ROWS),
  };
}
