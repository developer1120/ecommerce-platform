import type { Department } from './product';

/*
 * Reviews. The catalog only says how many reviews a product has and their
 * average; the star breakdown and a handful of written reviews are derived
 * from that, deterministically, so the same product always shows the same
 * reviews. Shoppers' own reviews are added on top.
 */

export type Stars = 1 | 2 | 3 | 4 | 5;
export type Fit = 'small' | 'true' | 'large';

export interface Review {
  id: string;
  productId: string;
  /** Shown as first name and initial, e.g. "Ada L." */
  author: string;
  authorId?: string;
  rating: Stars;
  title: string;
  body: string;
  createdAt: string;
  verifiedPurchase: boolean;
  helpful: number;
  /** For clothing: how it fits. */
  fit?: Fit;
}

/** Counts per star, index 0 = one star … index 4 = five stars. */
export type Distribution = [number, number, number, number, number];

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Distribution;
}

export const TITLE_LIMITS = { min: 3, max: 80 };
export const BODY_LIMITS = { min: 20, max: 2000 };

export const FIT_LABELS: Record<Fit, string> = { small: 'Runs small', true: 'True to size', large: 'Runs large' };

/** A tiny seeded PRNG (mulberry32), so derived reviews never change between visits. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Splits `count` reviews over one to five stars so their mean lands on
 * `average` (to one decimal). Reviews skew towards five stars, as real ones do.
 */
export function ratingDistribution(average: number, count: number): Distribution {
  const counts: Distribution = [0, 0, 0, 0, 0];
  if (count <= 0) return counts;
  const target = Math.round(average * count);
  // Start with everyone at the nearest whole star, then nudge single reviews up or down.
  const base = Math.min(5, Math.max(1, Math.round(average)));
  counts[base - 1] = count;
  let total = base * count;
  const order = [5, 4, 3, 2, 1];
  while (total !== target) {
    if (total < target) {
      // Move one review from the lowest occupied star up by one.
      const from = order.slice().reverse().find((star) => star < 5 && counts[star - 1]! > 0)!;
      counts[from - 1]! -= 1;
      counts[from]! += 1;
      total += 1;
    } else {
      const from = order.find((star) => star > 1 && counts[star - 1]! > 0)!;
      counts[from - 1]! -= 1;
      counts[from - 2]! += 1;
      total -= 1;
    }
  }
  // Spread a little: real ratings are rarely all one or two values.
  if (count >= 10 && counts[4] > count * 0.2 && counts[3] > 2) {
    const spread = Math.floor(counts[3] * 0.1);
    counts[3] -= spread * 2;
    counts[4] += spread;
    counts[2] += spread;
  }
  return counts;
}

export function summarize(distribution: Distribution): RatingSummary {
  const count = distribution.reduce((total, n) => total + n, 0);
  const sum = distribution.reduce((total, n, index) => total + n * (index + 1), 0);
  return { count, distribution, average: count === 0 ? 0 : Math.round((sum / count) * 10) / 10 };
}

