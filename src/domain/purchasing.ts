import { percentOf, sumCents, multiplyCents, type Cents } from './money';
import { daysOfCover, type InventoryRow } from './inventory';

/*
 * Buying stock from makers. A purchase order is drafted (often from the
 * reorder suggestions), sent to the maker, and received in one or more
 * deliveries; each delivery puts its units straight on sale.
 */

export interface Supplier {
  /** The maker's name, as on their products. */
  name: string;
  email: string;
  /** Working days from sending an order to the parcel arriving. */
  leadDays: number;
  /** The fewest units the maker will make in one order. */
  minUnits: number;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

export interface PurchaseOrderLine {
  variantId: string;
  productId: string;
  name: string;
  /** "Oat · M", or empty for single-variant products. */
  variantLabel: string;
  sku: string;
  ordered: number;
  received: number;
  /** What the studio pays the maker per unit. */
  unitCost: Cents;
}

export interface PurchaseOrderEvent {
  status: PurchaseOrderStatus;
  at: string;
  by: string;
  note?: string;
}

export interface PurchaseOrder {
  /** "PO-1001". */
  id: string;
  supplier: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  /** When the maker should deliver, set on sending. */
  expectedAt?: string;
  lines: PurchaseOrderLine[];
  note?: string;
  history: PurchaseOrderEvent[];
}

/** Makers sell to the studio at a little under half the shelf price. */
export const WHOLESALE_PERCENT = 45;

export function wholesaleCost(price: Cents): Cents {
  return percentOf(price, WHOLESALE_PERCENT);
}

/** Order enough to cover the lead time plus this many days of sales. */
export const COVER_DAYS = 30;
export const MAX_ORDER_UNITS = 500;
export const PO_NOTE_MAX = 500;

export interface ReorderSuggestion {
  row: InventoryRow;
  /** Why it's suggested: "Sold out", "Low stock" or "Runs out in 9 days". */
  reason: string;
  quantity: number;
}

/**
 * Variants worth reordering from one maker: anything sold out, low, or set
 * to run out before a new order could arrive. The quantity covers the lead
 * time plus a month of sales at the 30-day pace, and never less than the
 * maker's minimum when it's the only line.
 */
export function suggestReorders(rows: InventoryRow[], supplier: Pick<Supplier, 'leadDays' | 'minUnits'>, onOrder: Map<string, number>): ReorderSuggestion[] {
  const suggestions: ReorderSuggestion[] = [];
  const horizon = supplier.leadDays + COVER_DAYS;
  for (const row of rows) {
    const incoming = onOrder.get(row.variantId) ?? 0;
    const cover = daysOfCover(row);
    const runsOutSoon = cover !== undefined && cover <= supplier.leadDays + 7;
    if (row.level === 'in' && !runsOutSoon) continue;
    const daily = row.sold30 / 30;
    const wanted = Math.max(Math.ceil(daily * horizon), 6) - row.stock - incoming;
    if (wanted <= 0) continue;
    const reason = row.level === 'out' ? 'Sold out' : row.level === 'low' ? 'Low stock' : `Runs out in ${cover} days`;
    suggestions.push({ row, reason, quantity: wanted });
  }
  const total = suggestions.reduce((sum, suggestion) => sum + suggestion.quantity, 0);
  // Top up the first line so the order meets the maker's minimum.
  if (suggestions.length > 0 && total < supplier.minUnits) suggestions[0]!.quantity += supplier.minUnits - total;
  return suggestions;
}

/** Units already ordered but not yet received, per variant, across open orders. */
export function unitsOnOrder(orders: Pick<PurchaseOrder, 'status' | 'lines'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.status !== 'sent' && order.status !== 'partial') continue;
    for (const line of order.lines) counts.set(line.variantId, (counts.get(line.variantId) ?? 0) + line.ordered - line.received);
  }
  return counts;
}

export function orderUnits(order: Pick<PurchaseOrder, 'lines'>): { ordered: number; received: number } {
  return order.lines.reduce(
    (sum, line) => ({ ordered: sum.ordered + line.ordered, received: sum.received + line.received }),
    { ordered: 0, received: 0 },
  );
}

export function orderCost(order: Pick<PurchaseOrder, 'lines'>): Cents {
  return sumCents(order.lines.map((line) => multiplyCents(line.unitCost, line.ordered)));
}

/** Reads a typed quantity for an order line. */
export function checkOrderQuantity(input: string): { ok: true; quantity: number } | { ok: false; error: string } {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Enter a whole number' };
  const quantity = Number(text);
  if (quantity < 1) return { ok: false, error: 'Order at least 1' };
  if (quantity > MAX_ORDER_UNITS) return { ok: false, error: `Order at most ${MAX_ORDER_UNITS}` };
  return { ok: true, quantity };
}

/** Problems with a delivery, keyed by variant, or a form-level one. */
export function checkReceipt(order: Pick<PurchaseOrder, 'lines'>, receipt: Record<string, number>): Record<string, string> {
  const errors: Record<string, string> = {};
  let total = 0;
  for (const line of order.lines) {
    const quantity = receipt[line.variantId] ?? 0;
    const outstanding = line.ordered - line.received;
    if (!Number.isInteger(quantity) || quantity < 0) errors[line.variantId] = 'Enter a whole number';
    else if (quantity > outstanding) errors[line.variantId] = outstanding === 0 ? 'Already received in full' : `Only ${outstanding} still to come`;
    else total += quantity;
  }
  if (Object.keys(errors).length === 0 && total === 0) errors.form = 'Enter how many units arrived';
  return errors;
}

/** What a PO's status becomes after a delivery. */
export function statusAfterReceipt(lines: Pick<PurchaseOrderLine, 'ordered' | 'received'>[]): PurchaseOrderStatus {
  return lines.every((line) => line.received >= line.ordered) ? 'received' : 'partial';
}

export function nextPurchaseOrderId(existing: Pick<PurchaseOrder, 'id'>[]): string {
  const highest = existing.reduce((max, order) => Math.max(max, Number(order.id.replace(/^PO-/, '')) || 0), 1000);
  return `PO-${highest + 1}`;
}

/** Adds working days, skipping weekends. */
export function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from);
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

/** Sent and not yet in full past the expected date. */
export function isLate(order: Pick<PurchaseOrder, 'status' | 'expectedAt'>, now: Date): boolean {
  return (order.status === 'sent' || order.status === 'partial') && order.expectedAt !== undefined && new Date(order.expectedAt) < now;
}

export type PurchaseQueue = 'open' | 'draft' | 'closed' | 'all';

export const PURCHASE_QUEUES: { value: PurchaseQueue; label: string }[] = [
  { value: 'open', label: 'On order' },
  { value: 'draft', label: 'Drafts' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export function inPurchaseQueue(order: Pick<PurchaseOrder, 'status'>, queue: PurchaseQueue): boolean {
  switch (queue) {
    case 'open':
      return order.status === 'sent' || order.status === 'partial';
    case 'draft':
      return order.status === 'draft';
    case 'closed':
      return order.status === 'received' || order.status === 'cancelled';
    default:
      return true;
  }
}
