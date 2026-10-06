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
    expect(await submitReview(token, mask.id, GOOD)).toMatchObject({ verifiedPurchase: true, author: 'Ada L.' });
    expect((await submitReview(token, tee.id, { ...GOOD, title: 'Nice tee' })).verifiedPurchase).toBe(false);
  });

  it('folds shopper reviews into the rating everywhere', async () => {
    const { token } = await signedIn();
    const before = liveSummary(mask);
    await submitReview(token, mask.id, { ...GOOD, rating: 1 });
    expect(liveSummary(mask).count).toBe(before.count + 1);
    expect((await getProduct('rose-clay-mask')).rating.count).toBe(234);
  });

  it('pages and filters written reviews', async () => {
    const all = await listReviews(mask.id, { limit: 2 });
    expect(all.items).toHaveLength(2);
    expect(all.total).toBeGreaterThan(2);
    const fives = await listReviews(mask.id, { stars: 5, limit: 50 });
    expect(fives.items.every((review) => review.rating === 5)).toBe(true);
  });
});

describe('reviews on the product page', () => {
  // The section appears once the product has loaded.
  const reviews = () => screen.findByRole('region', { name: 'Reviews' });
  const reviewsNow = () => screen.getByRole('region', { name: 'Reviews' });

  it('summarises the ratings and links the rating at the top to them', async () => {
    renderRoute('/product/rose-clay-mask');
    const section = await screen.findByRole('region', { name: 'Reviews' });
    expect(await within(section).findByText('4.6')).toBeInTheDocument();
    expect(within(section).getByText('233 ratings')).toBeInTheDocument();
    expect(within(section).getByRole('list', { name: 'Ratings by stars' }).children).toHaveLength(5);
    expect(screen.getByRole('link', { name: /rated 4\.6 out of 5/i })).toHaveAttribute('href', '#reviews');
  });

  it('filters by star level from the bars and clears again', async () => {
    renderRoute('/product/rose-clay-mask');
    await within(await reviews()).findAllByRole('article');
    const fiveStars = within(await reviews()).getByRole('button', { name: /5-star ratings/ });
    await userEvent.click(fiveStars);
    expect(fiveStars).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(within(reviewsNow()).getByText(/written reviews? with 5 stars/)).toBeInTheDocument());
    for (const article of within(await reviews()).getAllByRole('article')) {
      expect(within(article).getByText('5 out of 5 stars')).toBeInTheDocument();
    }
    await userEvent.click(fiveStars);
    expect(fiveStars).toHaveAttribute('aria-pressed', 'false');
  });

  it('counts a helpful vote once per device', async () => {
    renderRoute('/product/rose-clay-mask');
    const [first] = await within(await reviews()).findAllByRole('article');
    const helpful = within(first!).getByRole('button', { name: /helpful/i });
    const before = Number(/\((\d+)\)/.exec(helpful.textContent!)![1]);
    await userEvent.click(helpful);
    await waitFor(() => expect(within(first!).getByRole('button', { name: /helpful/i })).toHaveTextContent(`(${before + 1})`));
    expect(within(first!).getByRole('button', { name: /helpful/i })).toBeDisabled();
  });

  it('invites a guest to sign in to write one', async () => {
    renderRoute('/product/rose-clay-mask');
    expect(await within(await reviews()).findByRole('link', { name: 'Sign in to write a review' })).toHaveAttribute(
      'href',
      '/account/sign-in?next=%2Fproduct%2Frose-clay-mask%23reviews',
    );
  });

  it('lets a signed-in shopper write a review that appears first', async () => {
    await signedIn();
    renderRoute('/product/organic-cotton-tee');
    await userEvent.click(await within(await reviews()).findByRole('button', { name: 'Write a review' }));
    const form = within(await reviews()).getByRole('form', { name: 'Write a review' });

    await userEvent.click(within(form).getByRole('button', { name: 'Post review' }));
    expect(within(form).getByRole('group', { name: 'Your rating' })).toHaveAccessibleDescription('Choose a star rating');

    await userEvent.click(within(form).getByRole('radio', { name: '4 stars, Very good' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Title' }), 'Heavy and soft');
    await userEvent.type(within(form).getByRole('textbox', { name: 'Your review' }), 'Thick cotton that keeps its shape wash after wash.');
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: /how does it fit/i }), 'small');
    await userEvent.click(within(form).getByRole('button', { name: 'Post review' }));

    expect(await screen.findByText('Thanks for your review')).toBeInTheDocument();
    const [newest] = await within(await reviews()).findAllByRole('article');
    expect(newest).toHaveTextContent('Heavy and soft');
    expect(newest).toHaveTextContent('Ada L.');
    expect(newest).toHaveTextContent('Fit: Runs small');
  });

  it('shows five reviews at a time, with more on request', async () => {
    // A product with six written reviews, so there is exactly one more to show.
    const product = CATALOG.find((candidate) => seedReviews(candidate).length > 5)!;
    renderRoute(`/product/${product.slug}`);
    expect(await within(await reviews()).findAllByRole('article')).toHaveLength(5);

    await userEvent.click(within(await reviews()).getByRole('button', { name: 'Show more reviews' }));
    await waitFor(() => expect(within(reviewsNow()).getAllByRole('article')).toHaveLength(6));
    expect(within(reviewsNow()).queryByRole('button', { name: 'Show more reviews' })).not.toBeInTheDocument();
  });
});
