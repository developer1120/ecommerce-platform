import { CATALOG } from '@/data/catalog';
import type { Product } from '@/domain/product';
import { buildProduct, type DraftErrors, type ProductDraft } from '@/domain/productForm';
import { requireAdmin } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { persistCatalog } from './mockDb';
import { restockVariant } from './stockAlertsApi';
import { recordMovement } from './stockMovements';

/** Every product, drafts and archived included, newest edits first. */
export function listAdminProducts(token: string, options?: RequestOptions): Promise<Product[]> {
  return simulateRequest(() => {
    requireAdmin(token);
    return [...CATALOG].sort((a, b) => (b.updatedAt ?? b.addedAt).localeCompare(a.updatedAt ?? a.addedAt));
  }, options);
}

export function getAdminProduct(token: string, id: string, options?: RequestOptions): Promise<Product> {
  return simulateRequest(() => {
    requireAdmin(token);
    const product = CATALOG.find((candidate) => candidate.id === id);
    if (!product) throw new ApiError('NOT_FOUND', "We couldn't find that product.");
    return product;
  }, options);
}

/** A rejected save carries every field problem, so the form can show them all at once. */
export class ProductValidationError extends ApiError {
  readonly fields: DraftErrors;
  constructor(fields: DraftErrors) {
    super('VALIDATION', 'Some fields need attention.');
    this.fields = fields;
  }
}

export interface SaveResult {
  product: Product;
  /** Shoppers emailed because a sold-out option came back. */
  notified: number;
}

/**
 * Creates or updates a product. Stock that rises goes through restocking,
 * so anyone waiting for a sold-out option is emailed.
 */
export function saveProduct(token: string, id: string | null, draft: ProductDraft, options?: RequestOptions): Promise<SaveResult> {
  return simulateRequest(() => {
    const admin = requireAdmin(token);
    const index = id ? CATALOG.findIndex((product) => product.id === id) : -1;
    if (id && index < 0) throw new ApiError('NOT_FOUND', "We couldn't find that product.");
    const existing = index >= 0 ? CATALOG[index]! : null;

    const result = buildProduct(draft, existing, CATALOG, new Date());
    if (result.errors) throw new ProductValidationError(result.errors);
    const product = result.product;

    // Save with the old stock first, then add the difference through restocking.
    const rises: { variantId: string; amount: number }[] = [];
    const toStore: Product = {
      ...product,
      variants: product.variants.map((variant) => {
        const before = existing?.variants.find((candidate) => candidate.id === variant.id)?.stock ?? 0;
        if (existing && variant.stock > before) {
          rises.push({ variantId: variant.id, amount: variant.stock - before });
          return { ...variant, stock: before };
        }
        return variant;
      }),
    };
    if (existing) CATALOG[index] = toStore;
    else CATALOG.unshift(toStore);

    let notified = 0;
    for (const rise of rises) notified += restockVariant(rise.variantId, rise.amount).notified;
    persistCatalog();
    // Log stock changed on the form, so the inventory history adds up.
    for (const variant of product.variants) {
      const before = existing?.variants.find((candidate) => candidate.id === variant.id)?.stock;
      if (before !== undefined && variant.stock !== before) {
        recordMovement({ variantId: variant.id, change: variant.stock - before, reason: 'edited', by: admin.name });
      }
    }
    return { product: CATALOG.find((candidate) => candidate.id === product.id)!, notified };
  }, options);
}
