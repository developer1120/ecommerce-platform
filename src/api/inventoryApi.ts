import { CATALOG } from '@/data/catalog';
import {
  checkAdjustment,
  inventoryRows,
  isManualReason,
  movementsFromOrders,
  MOVEMENT_NOTE_MAX,
  sortMovements,
  type InventoryRow,
  type ManualReason,
  type StockMovement,
} from '@/domain/inventory';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findVariant, loadOrders, persistCatalog } from './mockDb';
import { loadMovements, recordMovement } from './stockMovements';
import { restockVariant } from './stockAlertsApi';

const allMovements = () => [...loadMovements(), ...movementsFromOrders(loadOrders())];

/** Every variant of every product, drafts included. Admins only. */
export function listInventory(token: string, options?: RequestOptions): Promise<InventoryRow[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return inventoryRows(CATALOG, allMovements(), new Date());
  }, options);
}

export interface StockHistory {
  row: InventoryRow;
  /** Newest first. */
  movements: StockMovement[];
}

export function getStockHistory(token: string, variantId: string, options?: RequestOptions): Promise<StockHistory> {
  return simulateRequest(() => {
    requireAdmin(token);
    const movements = allMovements();
    const row = inventoryRows(CATALOG, movements, new Date()).find((candidate) => candidate.variantId === variantId);
    if (!row) throw new ApiError('NOT_FOUND', "We couldn't find that item.");
    return { row, movements: sortMovements(movements.filter((movement) => movement.variantId === variantId)) };
  }, options);
}

export interface StockAdjustment {
  reason: ManualReason;
  /** What was typed: units to add or remove, or the new total for a count. */
  quantity: string;
  /** The stock the admin was looking at. If it changed since, the adjustment is refused. */
  expected: number;
  note?: string;
}

export interface AdjustmentResult {
  movement: StockMovement;
  stock: number;
  /** Shoppers emailed because the variant came back in stock. */
  notified: number;
}

/**
 * Changes a variant's stock by hand and logs why. Stock that rises goes
 * through restocking, so anyone waiting for it hears straight away.
 */
export function adjustStock(token: string, variantId: string, adjustment: StockAdjustment, options?: RequestOptions): Promise<AdjustmentResult> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const found = findVariant(variantId);
    if (!found) throw new ApiError('NOT_FOUND', "We couldn't find that item.");
    if (!isManualReason(adjustment.reason)) throw new ApiError('VALIDATION', 'Choose a reason');
    const current = found.variant.stock;
    if (current !== adjustment.expected) {
      throw new ApiError('CONFLICT', `Stock changed to ${current} while you were editing. Check the new number and try again.`);
    }
    const check = checkAdjustment(current, adjustment.reason, adjustment.quantity);
    if (!check.ok) throw new ApiError('VALIDATION', check.error);
    const note = adjustment.note?.trim() ?? '';
    if (note.length > MOVEMENT_NOTE_MAX) throw new ApiError('VALIDATION', `Keep the note under ${MOVEMENT_NOTE_MAX} characters`);

    let notified = 0;
    if (check.change > 0) notified = restockVariant(variantId, check.change).notified;
    else found.variant.stock = check.after;
    persistCatalog();

    const movement = recordMovement({
      variantId,
      change: check.change,
      reason: adjustment.reason,
      by: admin.name,
      ...(note && { note }),
    });
    return { movement, stock: found.variant.stock, notified };
  }, options);
}
