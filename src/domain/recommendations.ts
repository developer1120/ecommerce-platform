import { isInStock, priceRange, type Product } from './product';

/*
 * "You may also like": a simple, explainable similarity score rather than a
 * black box. Products score for sharing a type, department, maker or tags,
 * for a similar price, and for having been bought together before.
 */

export const WEIGHTS = {
  sameType: 4,
  sameMaker: 2,
  sameDepartment: 2,
  sharedTag: 1,
  similarPrice: 1,
  boughtTogether: 3,
} as const;

/** Prices within this fraction of each other count as similar. */
const PRICE_BAND = 0.4;

/** How often each pair of products appeared in the same order: "a|b" → count, with a < b. */
export type CoPurchases = Map<string, number>;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function countCoPurchases(orders: { lines: { productId: string }[] }[]): CoPurchases {
  const counts: CoPurchases = new Map();
  for (const order of orders) {
    const ids = [...new Set(order.lines.map((line) => line.productId))];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i]!, ids[j]!);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function similarity(a: Product, b: Product, coPurchases: CoPurchases = new Map()): number {
  let score = 0;
  if (a.type === b.type) score += WEIGHTS.sameType;
  if (a.department === b.department) score += WEIGHTS.sameDepartment;
  if (a.maker === b.maker) score += WEIGHTS.sameMaker;
  score += a.tags.filter((tag) => b.tags.includes(tag)).length * WEIGHTS.sharedTag;
  const priceA = priceRange(a).min;
  const priceB = priceRange(b).min;
  if (Math.abs(priceA - priceB) <= PRICE_BAND * Math.max(priceA, priceB)) score += WEIGHTS.similarPrice;
  score += (coPurchases.get(pairKey(a.id, b.id)) ?? 0) * WEIGHTS.boughtTogether;
  return score;
}

/**
 * The best in-stock matches for one or more products, leaving out the
 * products themselves and anything in `exclude`. Scores add up across the
 * seeds, so a bag's recommendations suit the whole bag. Ties go to the
 * more reviewed product.
 */
export function recommend(
  seeds: Product[],
  catalog: Product[],
  { limit = 4, exclude = [], coPurchases = new Map() }: { limit?: number; exclude?: string[]; coPurchases?: CoPurchases } = {},
): Product[] {
  const skip = new Set([...seeds.map((seed) => seed.id), ...exclude]);
  return catalog
    .filter((candidate) => !skip.has(candidate.id) && isInStock(candidate))
    .map((candidate) => ({
      candidate,
      score: seeds.reduce((total, seed) => total + similarity(seed, candidate, coPurchases), 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.rating.count - a.candidate.rating.count)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
