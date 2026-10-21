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

export function addRatings(distribution: Distribution, ratings: Stars[]): Distribution {
  const next = [...distribution] as Distribution;
  for (const rating of ratings) next[rating - 1] = next[rating - 1]! + 1;
  return next;
}

const NAMES = ['Maya R.', 'Jonah P.', 'Priya S.', 'Theo W.', 'Ines M.', 'Sam K.', 'Lou B.', 'Noor A.', 'Wren T.', 'Felix D.', 'Hana O.', 'Cal G.'];

const PRAISE: Record<Department, { title: string; body: string }[]> = {
  home: [
    { title: 'Even nicer in person', body: 'The finish is lovely and it feels properly made. It has quietly become one of my favourite things in the house.' },
    { title: 'Worth the wait', body: 'Arrived well packed and looked exactly like the photos. You can tell it was made by hand, in the best way.' },
    { title: 'A daily pleasure', body: 'I use it every single day. It has held up beautifully and gets compliments whenever friends come round.' },
    { title: 'Lovely gift', body: 'Bought this as a housewarming present and it went down very well. I may have ordered a second one for myself.' },
  ],
  apparel: [
    { title: 'Soft from the first wear', body: 'The fabric is gorgeous and only gets softer in the wash. The cut is relaxed without looking sloppy.' },
    { title: 'My new favourite', body: 'I have worn this on repeat since it arrived. Good weight, lovely colour, and it has kept its shape.' },
    { title: 'Great quality', body: 'You can feel the difference in the fabric. Washes well and has not pilled or faded after a month.' },
    { title: 'Easy to wear', body: 'Works with everything I own. The colour is richer than it looks on screen, which was a nice surprise.' },
  ],
  beauty: [
    { title: 'Gentle and effective', body: 'My skin is sensitive and this has not caused any irritation at all. A little goes a long way.' },
    { title: 'Smells wonderful', body: 'The scent is subtle and natural rather than perfumey. It has become part of my evening routine.' },
    { title: 'Lasts ages', body: 'I expected to run through it quickly but it is lasting far longer than I thought. Really good value.' },
    { title: 'Will repurchase', body: 'Noticeable difference after a couple of weeks. Lovely packaging too, with nothing to throw away.' },
  ],
};

const CRITIQUE = [
  { title: 'Nice, but not perfect', body: 'Good quality overall, though it took a little longer to arrive than I hoped. I would still recommend it.' },
  { title: 'Good, with one quibble', body: 'I like it, but the colour is slightly different from the photos. Not a deal-breaker, just worth knowing.' },
];

/** A handful of written reviews for a product, always the same ones. */
export function seedReviews(product: { id: string; department: Department; rating: { average: number; count: number }; addedAt: string }): Review[] {
  const random = seededRandom(product.id);
  const howMany = Math.min(product.rating.count, 3 + Math.floor(random() * 4));
  const praise = PRAISE[product.department];
  const added = new Date(product.addedAt).getTime();
  const reviews: Review[] = [];
  for (let i = 0; i < howMany; i++) {
    // Mostly praise, with the occasional mixed review for products rated under 4.7.
    const critical = product.rating.average < 4.7 && random() < 0.3;
    const pick = critical ? CRITIQUE[Math.floor(random() * CRITIQUE.length)]! : praise[Math.floor(random() * praise.length)]!;
    const rating: Stars = critical ? (random() < 0.5 ? 3 : 4) : random() < product.rating.average - 4 ? 5 : 4;
    const daysAfter = 3 + Math.floor(random() * 60);
    reviews.push({
      id: `${product.id}-seed-${i}`,
      productId: product.id,
      author: NAMES[Math.floor(random() * NAMES.length)]!,
      rating,
      title: pick.title,
      body: pick.body,
      createdAt: new Date(added + daysAfter * 86_400_000).toISOString(),
      verifiedPurchase: random() < 0.8,
      helpful: Math.floor(random() * 25),
      ...(product.department === 'apparel' && { fit: random() < 0.7 ? 'true' : random() < 0.5 ? 'small' : 'large' }),
    });
  }
  return reviews;
}

export interface ReviewDraft {
  rating: Stars | null;
  title: string;
  body: string;
  fit?: Fit | null;
}

export type ReviewErrors = Partial<Record<'rating' | 'title' | 'body', string>>;

export function validateReview(draft: ReviewDraft): ReviewErrors {
  const errors: ReviewErrors = {};
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!draft.rating) errors.rating = 'Choose a star rating';
  if (title.length < TITLE_LIMITS.min) errors.title = 'Give your review a short title';
  else if (title.length > TITLE_LIMITS.max) errors.title = `Keep the title under ${TITLE_LIMITS.max} characters`;
  if (body.length < BODY_LIMITS.min) errors.body = `Tell us a little more: at least ${BODY_LIMITS.min} characters`;
  else if (body.length > BODY_LIMITS.max) errors.body = `Keep it under ${BODY_LIMITS.max} characters`;
  else if (/https?:\/\/|www\./i.test(`${title} ${body}`)) errors.body = "Reviews can't include links";
  return errors;
}

/** "Ada Lovelace" → "Ada L." */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.` : '';
  return `${parts[0] ?? 'Shopper'}${last}`;
}

export type ReviewSort = 'recent' | 'helpful' | 'highest' | 'lowest';

export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  const compare: Record<ReviewSort, (a: Review, b: Review) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    helpful: (a, b) => b.helpful - a.helpful || b.createdAt.localeCompare(a.createdAt),
    highest: (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt),
    lowest: (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
  };
  return [...reviews].sort(compare[sort]);
}
