import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signUp } from '@/api/authApi';
import { getProduct } from '@/api/catalogApi';
import { placeOrder } from '@/api/ordersApi';
import { listReviews, liveSummary, submitReview } from '@/api/reviewsApi';
import { CATALOG } from '@/data/catalog';
import { makeCartLine } from '@/domain/cart';
import {
  displayName,
  ratingDistribution,
  seedReviews,
  sortReviews,
  summarize,
  validateReview,
  type Review,
} from '@/domain/reviews';
import { SESSION_TOKEN_KEY } from '@/state/AuthProvider';
import { renderRoute } from '@/test/renderRoute';

const PASSWORD = 'slow mornings with tea';
const bySlug = (slug: string) => CATALOG.find((product) => product.slug === slug)!;
const mask = bySlug('rose-clay-mask'); // 4.6 from 233
const tee = bySlug('organic-cotton-tee');

const GOOD = { rating: 5, title: 'Lovely mask', body: 'Gentle on my skin and leaves it soft. I use it every Sunday.' } as const;

async function signedIn() {
  const { token, user } = await signUp({ name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD, remember: true });
  localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
  return { token, user };
}

describe('review rules', () => {
  it.each([
    [4.6, 233],
    [4.8, 412],
    [4.1, 88],
    [5, 3],
    [4.3, 12],
  ])('spreads %s stars over %i reviews without changing the average', (average, count) => {
    const distribution = ratingDistribution(average, count);
    expect(distribution.reduce((total, n) => total + n, 0)).toBe(count);
    expect(distribution.every((n) => n >= 0)).toBe(true);
    expect(summarize(distribution).average).toBeCloseTo(average, 1);
  });

  it('derives the same written reviews every time', () => {
    expect(seedReviews(mask)).toEqual(seedReviews(mask));
    expect(seedReviews(mask).length).toBeGreaterThanOrEqual(3);
    expect(seedReviews(tee).every((review) => review.fit !== undefined)).toBe(true);
    expect(seedReviews(mask).every((review) => review.fit === undefined)).toBe(true);
  });

  it('validates a review', () => {
    expect(validateReview({ rating: null, title: '', body: 'short' })).toEqual({
      rating: 'Choose a star rating',
      title: 'Give your review a short title',
      body: 'Tell us a little more: at least 20 characters',
    });
    expect(validateReview({ ...GOOD, body: 'Read more at https://spam.example about this' }).body).toBe("Reviews can't include links");
    expect(validateReview(GOOD)).toEqual({});
  });

  it('shows names as first name and initial', () => {
    expect(displayName('Ada King Lovelace')).toBe('Ada L.');
    expect(displayName('Cher')).toBe('Cher');
  });

  it('sorts by date, helpfulness and rating', () => {
    const reviews = [
      { id: 'a', rating: 3, helpful: 9, createdAt: '2026-10-01' },
      { id: 'b', rating: 5, helpful: 1, createdAt: '2026-10-03' },
      { id: 'c', rating: 4, helpful: 4, createdAt: '2026-10-02' },
    ] as Review[];
    expect(sortReviews(reviews, 'recent').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortReviews(reviews, 'helpful').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortReviews(reviews, 'highest').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortReviews(reviews, 'lowest').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('reviews server', () => {
  it('requires an account and allows one review per product', async () => {
    await expect(submitReview('nope', mask.id, GOOD)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const { token } = await signedIn();
    await submitReview(token, mask.id, GOOD);
    await expect(submitReview(token, mask.id, GOOD)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('marks a review verified when the account bought the product', async () => {
    const { token } = await signedIn();
    await placeOrder({
      idempotencyKey: 'bought-mask',
      lines: [{ ...makeCartLine(mask, mask.variants[0]!), quantity: 1 }],
      methodId: 'standard',
      address: { email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', line1: '1 Way', line2: '', city: 'Brooklyn', state: 'NY', zip: '11201', phone: '' },
      card: { brand: 'visa', last4: '4242', expMonth: 4, expYear: 2029, name: 'Ada' },
      sessionToken: token,
    });
