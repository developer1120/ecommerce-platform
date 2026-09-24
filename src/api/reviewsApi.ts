import { CATALOG } from '@/data/catalog';
import type { Product } from '@/domain/product';
import {
  addRatings,
  displayName,
  ratingDistribution,
  seedReviews,
  sortReviews,
  summarize,
  validateReview,
  type Fit,
  type RatingSummary,
  type Review,
  type ReviewSort,
  type Stars,
} from '@/domain/reviews';
import { randomHex } from '@/lib/crypto';
import { readJson, writeJson } from '@/lib/storage';
import { userForToken } from './authApi';
import { ApiError, simulateRequest, type RequestOptions } from './client';
import { loadOrders } from './mockDb';

export const REVIEWS_KEY = 'tanelt:mock-db:reviews';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const submitted = (): Review[] => readJson(REVIEWS_KEY, [], isArray) as Review[];

/** Helpful votes on seeded reviews, which aren't stored anywhere else. */
const seedVotes = new Map<string, number>();

function findProduct(productId: string): Product {
  const product = CATALOG.find((candidate) => candidate.id === productId);
  if (!product) throw new ApiError('NOT_FOUND', "We couldn't find that product.");
  return product;
}

function reviewsFor(product: Product): Review[] {
  const seeded = seedReviews(product).map((review) => ({
    ...review,
    helpful: review.helpful + (seedVotes.get(review.id) ?? 0),
  }));
  return [...submitted().filter((review) => review.productId === product.id), ...seeded];
}

/** The catalog's rating plus every shopper review, for cards and pages alike. */
export function liveSummary(product: Pick<Product, 'id' | 'rating'>): RatingSummary {
  const base = ratingDistribution(product.rating.average, product.rating.count);
  const extra = submitted()
    .filter((review) => review.productId === product.id)
    .map((review) => review.rating);
  return summarize(addRatings(base, extra));
}

export interface ReviewQuery {
  sort?: ReviewSort;
  /** Only reviews with this many stars. */
  stars?: Stars;
  /** How many to return, from the start. */
  limit?: number;
}

export interface ReviewPage {
  items: Review[];
  /** Written reviews matching the query, for "show more". */
  total: number;
  summary: RatingSummary;
}

export function listReviews(productId: string, query: ReviewQuery = {}, options?: RequestOptions): Promise<ReviewPage> {
  return simulateRequest(() => {
    const product = findProduct(productId);
    const matching = sortReviews(reviewsFor(product), query.sort ?? 'recent').filter(
      (review) => !query.stars || review.rating === query.stars,
    );
    return {
      items: matching.slice(0, query.limit ?? 5),
      total: matching.length,
      summary: liveSummary(product),
    };
  }, options);
}

export interface ReviewInput {
  rating: Stars;
  title: string;
  body: string;
  fit?: Fit;
}

export function submitReview(token: string, productId: string, input: ReviewInput, options?: RequestOptions): Promise<Review> {
  return simulateRequest(() => {
    const user = userForToken(token);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Sign in to write a review.');
    const product = findProduct(productId);
    const problem = Object.values(validateReview(input))[0];
    if (problem) throw new ApiError('VALIDATION', problem);
    if (submitted().some((review) => review.productId === productId && review.authorId === user.id)) {
      throw new ApiError('CONFLICT', "You've already reviewed this product. Thank you!");
    }
    const verifiedPurchase = loadOrders().some(
      (order) => order.customerId === user.id && order.lines.some((line) => line.productId === productId),
    );
    const review: Review = {
      id: `rev_${randomHex(6)}`,
      productId,
      author: displayName(user.name),
      authorId: user.id,
      rating: input.rating,
      title: input.title.trim(),
      body: input.body.trim(),
      createdAt: new Date().toISOString(),
      verifiedPurchase,
      helpful: 0,
      ...(product.department === 'apparel' && input.fit && { fit: input.fit }),
    };
    writeJson(REVIEWS_KEY, [review, ...submitted()]);
    return review;
  }, options);
}

export function markHelpful(reviewId: string, options?: RequestOptions): Promise<void> {
  return simulateRequest(() => {
    const stored = submitted();
    const index = stored.findIndex((review) => review.id === reviewId);
    if (index >= 0) {
      stored[index] = { ...stored[index]!, helpful: stored[index]!.helpful + 1 };
      writeJson(REVIEWS_KEY, stored);
    } else {
      seedVotes.set(reviewId, (seedVotes.get(reviewId) ?? 0) + 1);
    }
  }, options);
}

/** Forgets votes on seeded reviews. Tests call this between cases. */
export function resetReviewServer(): void {
  seedVotes.clear();
}
