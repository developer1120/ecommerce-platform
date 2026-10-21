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
