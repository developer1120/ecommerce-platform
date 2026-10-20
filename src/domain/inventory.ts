import type { Order } from './order';
import { orderHistory } from './orderStatus';
import { stockLevel, type Product, type StockLevel } from './product';
import { describeOptions } from './cart';

/*
 * Stock as the studio manages it. Every change to a variant's units is a
 * movement: sales and cancellations come from the orders themselves, and
 * the rest (deliveries, counts, breakages, restocked returns, edits on the
 * product form) are recorded as they happen.
 */

export type MovementReason = 'sale' | 'cancelled' | 'returned' | 'received' | 'count' | 'damaged' | 'lost' | 'edited';

export const MOVEMENT_LABELS: Record<MovementReason, string> = {
  sale: 'Sold',
  cancelled: 'Order cancelled',
  returned: 'Returned',
  received: 'Delivery received',
  count: 'Stock count',
  damaged: 'Damaged',
  lost: 'Lost',
  edited: 'Product edited',
};

export interface StockMovement {
  id: string;
  variantId: string;
  at: string;
  /** Units added (positive) or taken away (negative). */
  change: number;
  reason: MovementReason;
  note?: string;
  /** The staff member who made it; absent for shopper orders. */
  by?: string;
  /** The order or return behind it, if any. */
  reference?: string;
}

/** The changes an admin can make by hand, and which way each one goes. */
export type ManualReason = 'received' | 'count' | 'damaged' | 'lost';

export const MANUAL_REASONS: { value: ManualReason; label: string; mode: 'add' | 'remove' | 'set'; hint: string }[] = [
  { value: 'received', label: 'Delivery received', mode: 'add', hint: 'Units to add' },
  { value: 'count', label: 'Stock count', mode: 'set', hint: 'Units on the shelf now' },
  { value: 'damaged', label: 'Damaged', mode: 'remove', hint: 'Units to take off sale' },
  { value: 'lost', label: 'Lost', mode: 'remove', hint: 'Units to take off sale' },
];

export const isManualReason = (value: string): value is ManualReason => MANUAL_REASONS.some((reason) => reason.value === value);
export const MAX_STOCK = 9999;
export const MOVEMENT_NOTE_MAX = 200;

export type AdjustmentCheck = { ok: true; change: number; after: number } | { ok: false; error: string };

/** Works out a hand adjustment from what was typed, or says what's wrong with it. */
export function checkAdjustment(current: number, reason: ManualReason, input: string): AdjustmentCheck {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter a number of units' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Use a whole number' };
  const quantity = Number(text);
  const mode = MANUAL_REASONS.find((option) => option.value === reason)!.mode;
  if (mode === 'set') {
    if (quantity > MAX_STOCK) return { ok: false, error: `Stock can't be more than ${MAX_STOCK}` };
    if (quantity === current) return { ok: false, error: `Stock is already ${current}` };
    return { ok: true, change: quantity - current, after: quantity };
  }
  if (quantity === 0) return { ok: false, error: 'Enter at least 1' };
  if (mode === 'remove') {
    if (quantity > current) return { ok: false, error: current === 0 ? 'There is no stock to remove' : `Only ${current} in stock` };
    return { ok: true, change: -quantity, after: current - quantity };
  }
  if (current + quantity > MAX_STOCK) return { ok: false, error: `Stock can't be more than ${MAX_STOCK}` };
  return { ok: true, change: quantity, after: current + quantity };
}

/** Sales from every order, and stock put back by cancellations. */
export function movementsFromOrders(orders: Order[]): StockMovement[] {
  const movements: StockMovement[] = [];
  for (const order of orders) {
    const cancelled = order.status === 'cancelled' ? orderHistory(order).find((event) => event.status === 'cancelled') : undefined;
    for (const line of order.lines) {
      movements.push({
        id: `${order.id}:${line.variantId}:sale`,
        variantId: line.variantId,
        at: order.placedAt,
        change: -line.quantity,
        reason: 'sale',
        reference: order.id,
      });
      if (cancelled) {
        movements.push({
          id: `${order.id}:${line.variantId}:cancelled`,
          variantId: line.variantId,
          at: cancelled.at,
          change: line.quantity,
          reason: 'cancelled',
          reference: order.id,
          ...(cancelled.by && { by: cancelled.by }),
        });
      }
    }
  }
  return movements;
}

/** Newest first. Changes made in the same instant keep the order they were made in, latest first. */
export function sortMovements(movements: StockMovement[]): StockMovement[] {
  return movements
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => b.movement.at.localeCompare(a.movement.at) || b.index - a.index)
    .map(({ movement }) => movement);
}

export interface InventoryRow {
  productId: string;
  productName: string;
  slug: string;
  variantId: string;
  sku: string;
  /** "Oat · M", or empty for single-variant products. */
  variantLabel: string;
  stock: number;
  level: StockLevel;
  /** Units sold in the last 30 days. */
  sold30: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** One row per variant, with recent sales so the studio can see what runs out fastest. */
export function inventoryRows(catalog: Product[], movements: StockMovement[], now: Date): InventoryRow[] {
  const since = now.getTime() - 30 * DAY;
  const sold = new Map<string, number>();
  for (const movement of movements) {
    if (movement.reason === 'sale' && new Date(movement.at).getTime() >= since) {
      sold.set(movement.variantId, (sold.get(movement.variantId) ?? 0) - movement.change);
    }
  }
  return catalog.flatMap((product) =>
    product.variants.map((variant) => ({
      productId: product.id,
      productName: product.name,
      slug: product.slug,
      variantId: variant.id,
      sku: variant.sku,
      variantLabel: describeOptions(variant.options),
      stock: variant.stock,
      level: stockLevel(variant.stock),
      sold30: sold.get(variant.id) ?? 0,
    })),
  );
}

/**
 * Roughly how many days until a variant sells out at its 30-day pace.
 * Undefined when it hasn't sold, or is already out.
 */
export function daysOfCover(row: Pick<InventoryRow, 'stock' | 'sold30'>): number | undefined {
  if (row.stock <= 0 || row.sold30 <= 0) return undefined;
  return Math.floor(row.stock / (row.sold30 / 30));
}

export type InventoryFilter = 'all' | 'low' | 'out';

export function matchesInventoryFilter(row: Pick<InventoryRow, 'level'>, filter: InventoryFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'out' ? row.level === 'out' : row.level === 'low';
}
