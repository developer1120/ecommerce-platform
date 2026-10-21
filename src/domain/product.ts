import { discountPercent, type Cents } from './money';

/** Real departments a product belongs to. "new" and "sale" are collections computed from product data. */
export type Department = 'home' | 'apparel' | 'beauty';
export const DEPARTMENTS: Department[] = ['home', 'apparel', 'beauty'];

export type CollectionSlug = Department | 'new' | 'sale';

/** Soft tint behind a product's illustration; matches the --tint-* tokens. */
export type ArtTint = 'lilac' | 'sage' | 'blush' | 'sand';

/** Products have no photography yet; each one is drawn from a tint and a simple motif. */
export type ArtMotif = 'vessel' | 'cup' | 'fold' | 'stack' | 'jar' | 'bottle' | 'bar' | 'garment' | 'round' | 'flame';

export interface ProductArt {
  tint: ArtTint;
  motif: ArtMotif;
}

export interface OptionValue {
  value: string;
  /** A CSS color for color swatches. */
  swatch?: string;
}

export interface ProductOption {
  name: string;
  values: OptionValue[];
}

export interface Variant {
  id: string;
  sku: string;
  /** Option name to chosen value, e.g. { Color: 'Oat', Size: 'M' }. Empty for single-variant products. */
  options: Record<string, string>;
  stock: number;
  /** Replaces the product price for this variant, e.g. a larger bottle. */
  price?: Cents;
}

/** Only active products are listed in the shop; drafts and archived ones are admin-only. */
export type ProductStatus = 'active' | 'draft' | 'archived';

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** The studio or maker who makes it. */
  maker: string;
  department: Department;
  /** A finer grouping inside the department, e.g. "Tableware". */
  type: string;
  summary: string;
  description: string;
  details: string[];
  price: Cents;
  /** The previous price when the product is on sale. */
  compareAtPrice?: Cents;
  tags: string[];
  rating: { average: number; count: number };
  /** ISO date the product arrived in the shop. */
  addedAt: string;
  art: ProductArt;
  options: ProductOption[];
  variants: Variant[];
  /** Missing means active, as for every product in the original catalog. */
  status?: ProductStatus;
  updatedAt?: string;
}

export function isListed(product: Pick<Product, 'status'>): boolean {
  return (product.status ?? 'active') === 'active';
}

/** At or below this many units a variant shows a low-stock warning. */
export const LOW_STOCK_THRESHOLD = 5;
/** Products added within this many days count as new. */
export const NEW_ARRIVAL_DAYS = 30;

export type StockLevel = 'out' | 'low' | 'in';

export function stockLevel(units: number): StockLevel {
  if (units <= 0) return 'out';
  if (units <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

export function totalStock(product: Product): number {
  return product.variants.reduce((total, variant) => total + Math.max(0, variant.stock), 0);
}

export function isInStock(product: Product): boolean {
  return totalStock(product) > 0;
}

export function isOnSale(product: Product): boolean {
  return product.compareAtPrice !== undefined && product.compareAtPrice > product.price;
}

export function productDiscountPercent(product: Product): number {
  return discountPercent(product.price, product.compareAtPrice);
}

export function variantPrice(product: Product, variant: Variant): Cents {
  return variant.price ?? product.price;
}

/** The cheapest and dearest variant prices, for "From $24" labels. */
export function priceRange(product: Product): { min: Cents; max: Cents } {
  const prices = product.variants.map((variant) => variantPrice(product, variant));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function isNewArrival(product: Product, now: Date): boolean {
  const ageMs = now.getTime() - new Date(product.addedAt).getTime();
  return ageMs >= 0 && ageMs <= NEW_ARRIVAL_DAYS * 24 * 60 * 60 * 1000;
}

/** The variant whose options match the selection exactly, if any. */
export function findVariant(product: Product, selection: Record<string, string>): Variant | undefined {
  return product.variants.find((variant) =>
    product.options.every((option) => variant.options[option.name] === selection[option.name]),
  );
}

/** The first variant that has stock, falling back to the first variant. */
export function defaultVariant(product: Product): Variant {
  const first = product.variants[0];
  if (!first) throw new Error(`Product ${product.id} has no variants`);
  return product.variants.find((variant) => variant.stock > 0) ?? first;
}

export function isDepartment(slug: string | undefined): slug is Department {
  return DEPARTMENTS.includes(slug as Department);
}

export function isCollectionSlug(slug: string | undefined): slug is CollectionSlug {
  return slug === 'new' || slug === 'sale' || isDepartment(slug);
}

export function inCollection(product: Product, collection: CollectionSlug, now: Date): boolean {
  switch (collection) {
    case 'new':
      return isNewArrival(product, now);
    case 'sale':
      return isOnSale(product);
    default:
      return product.department === collection;
  }
}

/** Units in stock for the variant you would get by changing one option of the current selection. */
export function stockIfChosen(
  product: Product,
  selection: Record<string, string>,
  optionName: string,
  value: string,
): number {
  return findVariant(product, { ...selection, [optionName]: value })?.stock ?? 0;
}

/** The swatch color of the selected variant, if one of its options is a color. */
export function selectedSwatch(product: Product, variant: Variant): string | undefined {
  for (const option of product.options) {
    const chosen = option.values.find((value) => value.value === variant.options[option.name]);
    if (chosen?.swatch) return chosen.swatch;
  }
  return undefined;
}
