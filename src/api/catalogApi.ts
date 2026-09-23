import { CATALOG } from '@/data/catalog';
import { inCollection, isInStock, isListed, type CollectionSlug, type Product } from '@/domain/product';
import { countCoPurchases, recommend } from '@/domain/recommendations';
import { searchCatalog } from '@/domain/search';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { loadOrders } from './mockDb';
import { liveSummary } from './reviewsApi';

export interface ProductQuery {
  /** A department or computed collection. Omit for every product. */
  collection?: CollectionSlug;
  /** Only these product ids, in this order. */
  ids?: string[];
  /** Return at most this many products. */
  limit?: number;
}

/** What shoppers can see: active products only. Drafts and archived products are for the admin. */
function storefront(): Product[] {
  return CATALOG.filter(isListed);
}

function selectProducts({ collection, ids, limit }: ProductQuery): Product[] {
  const CATALOG = storefront();
  let products: Product[];
  if (ids) {
    products = ids.map((id) => CATALOG.find((product) => product.id === id)).filter((product) => product !== undefined);
  } else if (collection) {
    const now = new Date();
    products = CATALOG.filter((product) => inCollection(product, collection, now));
  } else {
    products = CATALOG;
  }
  return limit === undefined ? products : products.slice(0, limit);
}

/** The product with its rating brought up to date with shoppers' own reviews. */
function withLiveRating(product: Product): Product {
  const { average, count } = liveSummary(product);
  return count === product.rating.count ? product : { ...product, rating: { average, count } };
}

export function listProducts(query: ProductQuery = {}, options?: RequestOptions): Promise<Product[]> {
  return simulateRequest(() => selectProducts(query).map(withLiveRating), options);
}

/** In-stock products with the most reviews, as a stand-in for sales figures. */
export function listBestsellers(limit: number, options?: RequestOptions): Promise<Product[]> {
  return simulateRequest(
    () =>
      storefront()
        .filter(isInStock)
        .sort((a, b) => b.rating.count - a.rating.count)
        .slice(0, limit),
    options,
  );
}

export function getProduct(slug: string, options?: RequestOptions): Promise<Product> {
  return simulateRequest(() => {
    const product = storefront().find((candidate) => candidate.slug === slug);
    if (!product) throw new ApiError('NOT_FOUND', "We couldn't find that product. It may have been removed.");
    return withLiveRating(product);
  }, options);
}

export interface SearchResult {
  /** The best matches, up to the limit. */
  items: Product[];
  /** How many products matched in all. */
  total: number;
}

export function searchProducts(query: string, limit?: number, options?: RequestOptions): Promise<SearchResult> {
  return simulateRequest(() => {
    const matches = searchCatalog(storefront(), query);
    return { items: limit === undefined ? matches : matches.slice(0, limit), total: matches.length };
  }, options);
}

/** Products to suggest alongside the given ones: similar, in stock, and often bought with them. */
export function listRecommendations(
  productIds: string[],
  limit = 4,
  options?: RequestOptions,
): Promise<Product[]> {
  return simulateRequest(() => {
    const seeds = productIds
      .map((id) => CATALOG.find((product) => product.id === id))
      .filter((product) => product !== undefined);
    return recommend(seeds, storefront(), { limit, coPurchases: countCoPurchases(loadOrders()) }).map(withLiveRating);
  }, options);
}
