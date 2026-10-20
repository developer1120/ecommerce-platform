import { formatMoney } from './money';
import { priceRange, stockLevel, totalStock, type Product } from './product';

/*
 * Side-by-side product comparison. The shopper picks up to four products;
 * the comparison lines up the facts that help choose between them.
 */

export const MAX_COMPARE = 4;
export const COMPARE_STORAGE_KEY = 'tanelt:compare';

/** What the compare tray needs to show an item without loading the product. */
export interface CompareItem {
  id: string;
  slug: string;
  name: string;
  art: Product['art'];
}

export function toCompareItem(product: Pick<Product, 'id' | 'slug' | 'name' | 'art'>): CompareItem {
  return { id: product.id, slug: product.slug, name: product.name, art: product.art };
}

export type ToggleOutcome = 'added' | 'removed' | 'full';

/** Adds the product, or takes it out if it's already there. A full list stays as it is. */
export function toggleCompare(items: CompareItem[], item: CompareItem): { items: CompareItem[]; outcome: ToggleOutcome } {
  if (items.some((existing) => existing.id === item.id)) {
    return { items: items.filter((existing) => existing.id !== item.id), outcome: 'removed' };
  }
  if (items.length >= MAX_COMPARE) return { items, outcome: 'full' };
  return { items: [...items, item], outcome: 'added' };
}

/** "a,b,c" from the address: known ids only, without repeats, at most four. */
export function parseCompareIds(value: string | null): string[] {
  if (!value) return [];
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_COMPARE);
}

export function compareUrl(ids: string[]): string {
  return ids.length ? `/compare?ids=${ids.map(encodeURIComponent).join(',')}` : '/compare';
}

export interface CompareRow {
  label: string;
  /** One entry per product, in column order. */
  values: string[][];
  /** True when every product has the same value, so the row says nothing about the choice. */
  same: boolean;
}

function priceText(product: Product): string {
  const { min, max } = priceRange(product);
  const price = min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
  return product.compareAtPrice ? `${price} (was ${formatMoney(product.compareAtPrice)})` : price;
}

function availability(product: Product): string {
  const stock = totalStock(product);
  const level = stockLevel(stock);
  if (level === 'out') return 'Sold out';
  if (level === 'low') return `Only ${stock} left`;
  return 'In stock';
}

function ratingText(product: Product): string {
  const { average, count } = product.rating;
  if (count === 0) return 'No ratings yet';
  return `${average.toFixed(1)} out of 5 (${count} ${count === 1 ? 'rating' : 'ratings'})`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The comparison rows, in reading order: price first, then what the
 * product is, its options, how available it is, and its details.
 * Option rows cover every option any product has; "—" marks a product
 * without that option.
 */
export function compareRows(products: Product[]): CompareRow[] {
  const optionNames = [...new Set(products.flatMap((product) => product.options.map((option) => option.name)))];
  const rows: { label: string; values: string[][] }[] = [
    { label: 'Price', values: products.map((product) => [priceText(product)]) },
    { label: 'Rating', values: products.map((product) => [ratingText(product)]) },
    { label: 'Maker', values: products.map((product) => [product.maker]) },
    { label: 'Department', values: products.map((product) => [capitalize(product.department)]) },
    { label: 'Type', values: products.map((product) => [product.type]) },
    ...optionNames.map((name) => ({
      label: name,
      values: products.map((product) => {
        const option = product.options.find((candidate) => candidate.name === name);
        return option ? [option.values.map((value) => value.value).join(', ')] : ['—'];
      }),
    })),
    { label: 'Availability', values: products.map((product) => [availability(product)]) },
    { label: 'Details', values: products.map((product) => (product.details.length ? product.details : ['—'])) },
  ];
  return rows.map((row) => ({
    ...row,
    same: products.length > 1 && row.values.every((value) => value.join('\n') === row.values[0]!.join('\n')),
  }));
}

/** Which products stand out: the lowest starting price and the best rating, when there's a clear one. */
export function standouts(products: Product[]): { cheapest: string | null; topRated: string | null } {
  if (products.length < 2) return { cheapest: null, topRated: null };
  const unique = <T,>(values: T[], pick: (best: T) => boolean) => (values.filter(pick).length === 1 ? values.find(pick)! : null);

  const lowest = Math.min(...products.map((product) => priceRange(product).min));
  const cheapest = unique(products, (product) => priceRange(product).min === lowest);

  const rated = products.filter((product) => product.rating.count > 0);
  const best = Math.max(...rated.map((product) => product.rating.average));
  const topRated = rated.length > 1 ? unique(rated, (product) => product.rating.average === best) : null;

  return { cheapest: cheapest?.id ?? null, topRated: topRated?.id ?? null };
}
