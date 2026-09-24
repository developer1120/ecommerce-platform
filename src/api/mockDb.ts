import { CATALOG } from '@/data/catalog';
import type { Order } from '@/domain/order';
import type { Product } from '@/domain/product';
import { readJson, writeJson } from '@/lib/storage';

/*
 * The pretend server's state. Stock lives on the catalog objects and drops
 * as orders are placed, for this page load. Orders are kept in localStorage
 * so they survive a reload, standing in for a database.
 */

export const ORDERS_STORAGE_KEY = 'tanelt:mock-db:orders';

const initialStock = new Map(CATALOG.flatMap((product) => product.variants.map((variant) => [variant.id, variant.stock])));

/*
 * The admin tools edit the catalog. Changes are applied to the CATALOG array
 * in place, so every reader sees them, and saved to localStorage so they
 * survive a reload. The shipped catalog is kept to reset to.
 */
export const CATALOG_KEY = 'tanelt:mock-db:catalog';
const shippedCatalog: Product[] = structuredClone(CATALOG);

function isProductList(value: unknown): value is Product[] {
  return (
    Array.isArray(value) &&
    value.every((product) => typeof product?.id === 'string' && Array.isArray(product?.variants) && product.variants.length > 0)
  );
}

function replaceCatalog(products: Product[]): void {
  CATALOG.splice(0, CATALOG.length, ...products);
}

/** Saves the catalog as the admin left it. */
export function persistCatalog(): void {
  writeJson(CATALOG_KEY, CATALOG);
}

// Apply any saved admin changes as soon as the mock server loads.
const savedCatalog = readJson<Product[] | null>(CATALOG_KEY, null, (value): value is Product[] | null => isProductList(value));
if (savedCatalog) replaceCatalog(savedCatalog);

function isOrderList(value: unknown): value is Order[] {
  return Array.isArray(value) && value.every((order) => typeof order === 'object' && order !== null && typeof order.id === 'string');
}

export function loadOrders(): Order[] {
  return readJson(ORDERS_STORAGE_KEY, [], isOrderList);
}

export function saveOrder(order: Order): void {
  writeJson(ORDERS_STORAGE_KEY, [order, ...loadOrders().filter((existing) => existing.id !== order.id)]);
}

export function findOrder(id: string): Order | undefined {
  return loadOrders().find((order) => order.id === id);
}

/** Orders by their idempotency key, so a retried request returns the order already made. */
const placedByKey = new Map<string, string>();

export function rememberIdempotencyKey(key: string, orderId: string): void {
  placedByKey.set(key, orderId);
}

export function orderForIdempotencyKey(key: string): Order | undefined {
  const id = placedByKey.get(key);
  return id ? findOrder(id) : undefined;
}

export function findVariant(variantId: string) {
  for (const product of CATALOG) {
    const variant = product.variants.find((candidate) => candidate.id === variantId);
    if (variant) return { product, variant };
  }
  return undefined;
}

/** Puts stock back as it shipped and forgets placed orders. Tests call this between cases. */
export function resetMockServer(): void {
  replaceCatalog(structuredClone(shippedCatalog));
  for (const product of CATALOG) {
    for (const variant of product.variants) variant.stock = initialStock.get(variant.id) ?? variant.stock;
  }
  placedByKey.clear();
}
