import { CATALOG } from '@/data/catalog';
import { SUPPLIERS } from '@/data/suppliers';
import { describeOptions } from '@/domain/cart';
import { inventoryRows, movementsFromOrders, type InventoryRow } from '@/domain/inventory';
import { formatMoney } from '@/domain/money';
import {
  addWorkingDays,
  checkReceipt,
  nextPurchaseOrderId,
  orderCost,
  orderUnits,
  PO_NOTE_MAX,
  statusAfterReceipt,
  suggestReorders,
  unitsOnOrder,
  MAX_ORDER_UNITS,
  wholesaleCost,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type ReorderSuggestion,
  type Supplier,
} from '@/domain/purchasing';
import { readJson, writeJson } from '@/lib/storage';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { findVariant, loadOrders, persistCatalog } from './mockDb';
import { sendEmails } from './outbox';
import { restockVariant } from './stockAlertsApi';
import { loadMovements, recordMovement } from './stockMovements';

export const PURCHASE_ORDERS_KEY = 'tanelt:mock-db:purchase-orders';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
export const loadPurchaseOrders = (): PurchaseOrder[] => readJson(PURCHASE_ORDERS_KEY, [], isArray) as PurchaseOrder[];
const savePurchaseOrders = (orders: PurchaseOrder[]) => writeJson(PURCHASE_ORDERS_KEY, orders);

const newestFirst = (a: PurchaseOrder, b: PurchaseOrder) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

function supplierNamed(name: string): Supplier {
  const supplier = SUPPLIERS.find((candidate) => candidate.name === name);
  if (!supplier) throw new ApiError('NOT_FOUND', "We couldn't find that maker.");
  return supplier;
}

function rowsFor(supplier: Supplier): InventoryRow[] {
  const products = CATALOG.filter((product) => product.maker === supplier.name);
  return inventoryRows(products, [...loadMovements(), ...movementsFromOrders(loadOrders())], new Date());
}

export interface SupplierOverview {
  supplier: Supplier;
  variants: number;
  /** Variants the reorder rules would order now. */
  toReorder: number;
  openOrders: number;
  unitsOnOrder: number;
}

/** Every maker, with what's on order and what needs ordering. Admins only. */
export function listSuppliers(token: string, options?: RequestOptions): Promise<SupplierOverview[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    const orders = loadPurchaseOrders();
    const onOrder = unitsOnOrder(orders);
    return SUPPLIERS.map((supplier) => {
      const rows = rowsFor(supplier);
      const open = orders.filter((order) => order.supplier === supplier.name && (order.status === 'sent' || order.status === 'partial'));
      return {
        supplier,
        variants: rows.length,
        toReorder: suggestReorders(rows, supplier, onOrder).length,
        openOrders: open.length,
        unitsOnOrder: open.reduce((sum, order) => {
          const units = orderUnits(order);
          return sum + units.ordered - units.received;
        }, 0),
      };
    });
  }, options);
}

export interface SupplierDetail {
  supplier: Supplier;
  /** Every variant the maker makes, with stock and sales. */
  rows: InventoryRow[];
  suggestions: ReorderSuggestion[];
  /** Units on open orders, per variant. */
  onOrder: Record<string, number>;
  /** What the studio pays per unit, per variant. */
  costs: Record<string, number>;
  orders: PurchaseOrder[];
}

export function getSupplier(token: string, name: string, options?: RequestOptions): Promise<SupplierDetail> {
  return simulateRequest(() => {
    requireAdmin(token);
    const supplier = supplierNamed(name);
    const rows = rowsFor(supplier);
    const orders = loadPurchaseOrders();
    const onOrder = unitsOnOrder(orders);
    const costs = Object.fromEntries(
      rows.map((row) => {
        const found = findVariant(row.variantId)!;
        return [row.variantId, wholesaleCost(found.variant.price ?? found.product.price)];
      }),
    );
    return {
      supplier,
      rows,
      suggestions: suggestReorders(rows, supplier, onOrder),
      onOrder: Object.fromEntries(rows.map((row) => [row.variantId, onOrder.get(row.variantId) ?? 0])),
      costs,
      orders: orders.filter((order) => order.supplier === supplier.name).sort(newestFirst),
    };
  }, options);
}

export function listPurchaseOrders(token: string, options?: RequestOptions): Promise<PurchaseOrder[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return loadPurchaseOrders().sort(newestFirst);
  }, options);
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder;
  supplier: Supplier;
  /** Current stock per variant on the order. */
  stock: Record<string, number>;
}

export function getPurchaseOrder(token: string, id: string, options?: RequestOptions): Promise<PurchaseOrderDetail> {
  return simulateRequest(() => {
    requireAdmin(token);
    const order = loadPurchaseOrders().find((candidate) => candidate.id === id);
    if (!order) throw new ApiError('NOT_FOUND', "We couldn't find that purchase order.");
    const stock = Object.fromEntries(order.lines.map((line) => [line.variantId, findVariant(line.variantId)?.variant.stock ?? 0]));
    return { order, supplier: supplierNamed(order.supplier), stock };
  }, options);
}

export interface NewPurchaseOrder {
  supplier: string;
  lines: { variantId: string; quantity: number }[];
  note?: string;
}

/** Saves a draft. Every line must be one of the maker's own variants, once. */
export function createPurchaseOrder(token: string, input: NewPurchaseOrder, options?: RequestOptions): Promise<PurchaseOrder> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const supplier = supplierNamed(input.supplier);
    if (input.lines.length === 0) throw new ApiError('VALIDATION', 'Add at least one item to the order');
    const seen = new Set<string>();
    const lines: PurchaseOrderLine[] = input.lines.map(({ variantId, quantity }) => {
      const found = findVariant(variantId);
      if (!found || found.product.maker !== supplier.name) throw new ApiError('VALIDATION', `${supplier.name} doesn't make that item`);
      if (seen.has(variantId)) throw new ApiError('VALIDATION', 'Each item can only be on the order once');
      seen.add(variantId);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_UNITS) {
