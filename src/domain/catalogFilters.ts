import type { Cents } from './money';
import { priceRange, type Product } from './product';

/*
 * Filtering and sorting for collection pages. The state lives in the URL, so
 * these functions also read and write URLSearchParams; anything unrecognised
 * in a hand-edited URL is dropped rather than breaking the page.
 */

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'rating';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
];

export type PriceBand = 'under-25' | '25-50' | '50-100' | '100-plus';

/** Each band covers [min, max) in cents. */
export const PRICE_BANDS: { value: PriceBand; label: string; min: Cents; max: Cents }[] = [
  { value: 'under-25', label: 'Under $25', min: 0, max: 2500 },
  { value: '25-50', label: '$25 to $50', min: 2500, max: 5000 },
  { value: '50-100', label: '$50 to $100', min: 5000, max: 10000 },
  { value: '100-plus', label: '$100 and over', min: 10000, max: Number.POSITIVE_INFINITY },
];

export const RATING_THRESHOLDS = [4, 4.5] as const;
export type MinRating = (typeof RATING_THRESHOLDS)[number];

export interface CatalogFilters {
  types: string[];
  colors: string[];
  prices: PriceBand[];
  inStock: boolean;
  minRating: MinRating | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: CatalogFilters = {
  types: [],
  colors: [],
  prices: [],
  inStock: false,
  minRating: null,
  sort: 'featured',
};

const PARAM = {
  type: 'type',
  color: 'color',
  price: 'price',
  stock: 'stock',
  rating: 'rating',
  sort: 'sort',
} as const;

/** Every query parameter the filters own. Others, like a search query, are left alone. */
export const FILTER_PARAMS: string[] = Object.values(PARAM);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value);
}

function isPriceBand(value: string): value is PriceBand {
  return PRICE_BANDS.some((band) => band.value === value);
}

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const rating = Number(params.get(PARAM.rating));
  const sort = params.get(PARAM.sort);
  return {
    types: unique(params.getAll(PARAM.type).filter(Boolean)),
    colors: unique(params.getAll(PARAM.color).filter(Boolean)),
    prices: unique(params.getAll(PARAM.price).filter(isPriceBand)),
    inStock: params.get(PARAM.stock) === 'in',
    minRating: RATING_THRESHOLDS.find((threshold) => threshold === rating) ?? null,
    sort: isSortKey(sort) ? sort : 'featured',
  };
}

/** Writes only what differs from the defaults, in a stable order, so equal filters give equal URLs. */
export function serializeFilters(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const type of [...filters.types].sort()) params.append(PARAM.type, type);
  for (const color of [...filters.colors].sort()) params.append(PARAM.color, color);
  for (const band of PRICE_BANDS) if (filters.prices.includes(band.value)) params.append(PARAM.price, band.value);
  if (filters.inStock) params.set(PARAM.stock, 'in');
  if (filters.minRating !== null) params.set(PARAM.rating, String(filters.minRating));
  if (filters.sort !== 'featured') params.set(PARAM.sort, filters.sort);
  return params;
}

/** How many filters narrow the results. Sorting does not count. */
export function activeFilterCount(filters: CatalogFilters): number {
  return (
    filters.types.length +
    filters.colors.length +
    filters.prices.length +
    (filters.inStock ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0)
  );
}

function variantsInColor(product: Product, color: string) {
  return product.variants.filter((variant) => Object.values(variant.options).includes(color));
