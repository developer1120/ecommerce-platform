import type { StockMovement } from '@/domain/inventory';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';

/*
 * The log of stock changes made in the studio. Sales and cancellations
 * aren't stored here; they're read from the orders when needed.
 */

export const MOVEMENTS_KEY = 'tanelt:mock-db:stock-movements';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export function loadMovements(): StockMovement[] {
  return readJson(MOVEMENTS_KEY, [], isArray) as StockMovement[];
}

export function recordMovement(movement: Omit<StockMovement, 'id' | 'at'>): StockMovement {
  const saved: StockMovement = { id: `mv_${randomHex(6)}`, at: new Date().toISOString(), ...movement };
  writeJson(MOVEMENTS_KEY, [...loadMovements(), saved]);
  return saved;
}
